//! Apertura de la base cifrada (SQLCipher).
//!
//! La base se abre desde Rust, con la clave de datos, recién cuando se desbloquea
//! la app. El pool se registra en tauri-plugin-sql con el mismo nombre que usa la
//! interfaz ("sqlite:psigestion.db"), así las consultas siguen pasando por el plugin.

use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use sqlx::migrate::{Migration, MigrationType, Migrator};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{ConnectOptions, Connection, Executor};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::datos::{es_sqlite, URL_DB};

pub const ARCHIVO_DB: &str = "psigestion.db";

/// Migraciones de la base. Nunca modificar una ya publicada: agregar una nueva con la versión siguiente.
/// Se registran igual que lo hacía tauri-plugin-sql, para que las bases existentes las reconozcan.
const MIGRACIONES: &[(i64, &str, &str)] = &[
    (1, "crear_pacientes_y_turnos", include_str!("../migrations/0001_pacientes_y_turnos.sql")),
    (2, "crear_gastos_y_objetivos", include_str!("../migrations/0002_gastos_y_objetivos.sql")),
    (3, "crear_configuracion", include_str!("../migrations/0003_configuracion.sql")),
];

fn migrador() -> Migrator {
    let migraciones = MIGRACIONES
        .iter()
        .map(|(v, d, sql)| Migration::new(*v, (*d).into(), MigrationType::ReversibleUp, (*sql).into(), false))
        .collect::<Vec<_>>();
    Migrator {
        migrations: migraciones.into(),
        ..Migrator::DEFAULT
    }
}

pub fn ruta_db<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(ARCHIVO_DB))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Valor para `PRAGMA key`: la clave en crudo, sin derivarla otra vez (ya viene de Argon2).
fn valor_clave(clave: &[u8; 32]) -> String {
    format!("\"x'{}'\"", hex(clave))
}

fn opciones(ruta: &Path, clave: &[u8; 32]) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(ruta)
        .pragma("key", valor_clave(clave))
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
}

/// Si la base existe sin cifrar (de una versión anterior o de una copia vieja), la cifra con la clave.
pub async fn cifrar_si_hace_falta(ruta: &Path, clave: &[u8; 32]) -> Result<bool, String> {
    if !ruta.exists() || !es_sqlite(ruta) {
        return Ok(false);
    }
    let temporal = ruta.with_extension("db.cifrando");
    let _ = fs::remove_file(&temporal);
    {
        let mut plana = SqliteConnectOptions::from_str("sqlite:")
            .map_err(|e| e.to_string())?
            .filename(ruta)
            // Sin esto el ATTACH no puede crear el archivo cifrado nuevo.
            .create_if_missing(true)
            .connect()
            .await
            .map_err(|e| format!("No se pudo abrir la base para cifrarla: {e}"))?;
        let destino = temporal.to_string_lossy().replace('\'', "''");
        let pasos = [
            format!("ATTACH DATABASE '{destino}' AS cifrada KEY {}", valor_clave(clave)),
            "SELECT sqlcipher_export('cifrada')".to_string(),
            "DETACH DATABASE cifrada".to_string(),
        ];
        for paso in pasos {
            plana.execute(paso.as_str()).await.map_err(|e| format!("No se pudo cifrar la base: {e}"))?;
        }
        plana.close().await.map_err(|e| e.to_string())?;
    }
    let carpeta = ruta.parent().ok_or("Ruta de la base inválida.")?;
    for extra in ["-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(carpeta.join(format!("{ARCHIVO_DB}{extra}")));
    }
    fs::rename(&temporal, ruta).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Abre la base con la clave, aplica las migraciones y la deja disponible para la interfaz.
pub async fn abrir<R: Runtime>(app: &AppHandle<R>, clave: &[u8; 32]) -> Result<(), String> {
    abrir_base(app, clave).await.inspect_err(|e| log::error!("abrir la base: {e}"))
}

async fn abrir_base<R: Runtime>(app: &AppHandle<R>, clave: &[u8; 32]) -> Result<(), String> {
    let ruta = ruta_db(app)?;
    if let Some(carpeta) = ruta.parent() {
        fs::create_dir_all(carpeta).map_err(|e| e.to_string())?;
    }
    if cifrar_si_hace_falta(&ruta, clave).await? {
        log::info!("se cifró una base que estaba sin cifrar");
    }
    let pool = SqlitePoolOptions::new()
        .connect_with(opciones(&ruta, clave))
        .await
        .map_err(|e| format!("No se pudo abrir la base de datos: {e}"))?;
    // Una consulta real: con una clave equivocada SQLCipher falla acá.
    pool.execute("SELECT count(*) FROM sqlite_master")
        .await
        .map_err(|_| "La base de datos no se pudo descifrar con esta clave.".to_string())?;
    migrador().run(&pool).await.map_err(|e| format!("No se pudo actualizar la base de datos: {e}"))?;
    let instancias = app.state::<DbInstances>();
    let anterior = instancias.0.write().await.insert(URL_DB.into(), DbPool::Sqlite(pool));
    if let Some(anterior) = anterior {
        cerrar_pool(anterior).await;
    }
    Ok(())
}

/// Cierra la base al bloquear la app.
pub async fn cerrar<R: Runtime>(app: &AppHandle<R>) {
    let instancias = app.state::<DbInstances>();
    let pool = instancias.0.write().await.remove(URL_DB);
    if let Some(pool) = pool {
        cerrar_pool(pool).await;
    }
}

async fn cerrar_pool(pool: DbPool) {
    #[allow(irrefutable_let_patterns)]
    if let DbPool::Sqlite(p) = pool {
        p.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn carpeta_temporal(nombre: &str) -> PathBuf {
        let c = std::env::temp_dir().join(format!("psigestion-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&c);
        fs::create_dir_all(&c).unwrap();
        c
    }

    #[tokio::test]
    async fn cifra_una_base_existente_y_la_abre_con_la_clave() {
        let carpeta = carpeta_temporal("cifrado");
        let ruta = carpeta.join(ARCHIVO_DB);
        {
            let mut c = SqliteConnectOptions::new().filename(&ruta).create_if_missing(true).connect().await.unwrap();
            c.execute("CREATE TABLE pacientes (nombre TEXT); INSERT INTO pacientes VALUES ('Ana')").await.unwrap();
            c.close().await.unwrap();
        }
        let clave = [9u8; 32];
        assert!(cifrar_si_hace_falta(&ruta, &clave).await.unwrap());
        assert!(!es_sqlite(&ruta), "el archivo tiene que quedar ilegible");
        assert!(!cifrar_si_hace_falta(&ruta, &clave).await.unwrap());

        let mut c = opciones(&ruta, &clave).connect().await.unwrap();
        let (nombre,): (String,) = sqlx::query_as("SELECT nombre FROM pacientes").fetch_one(&mut c).await.unwrap();
        assert_eq!(nombre, "Ana");

        // Las copias con VACUUM INTO quedan cifradas con la misma clave.
        let copia = carpeta.join("copia.db");
        sqlx::query("VACUUM INTO ?1").bind(copia.to_string_lossy().to_string()).execute(&mut c).await.unwrap();
        c.close().await.unwrap();
        assert!(!es_sqlite(&copia));
        let mut c = opciones(&copia, &clave).connect().await.unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM pacientes").fetch_one(&mut c).await.unwrap();
        assert_eq!(n, 1);
        c.close().await.unwrap();

        // Con otra clave no se puede leer.
        let otra = opciones(&ruta, &[1u8; 32]).connect().await;
        let falla = match otra {
            Err(_) => true,
            Ok(mut c) => c.execute("SELECT count(*) FROM sqlite_master").await.is_err(),
        };
        assert!(falla);
        fs::remove_dir_all(&carpeta).unwrap();
    }

    #[test]
    fn las_migraciones_estan_en_orden() {
        let versiones: Vec<i64> = MIGRACIONES.iter().map(|m| m.0).collect();
        assert_eq!(versiones, (1..=MIGRACIONES.len() as i64).collect::<Vec<_>>());
    }
}
