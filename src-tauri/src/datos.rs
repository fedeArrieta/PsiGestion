//! Comandos para cuidar los datos: transacciones, copias de seguridad y restauración.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::base::ARCHIVO_DB;

/// La conexión que abre la interfaz (ver src/db.ts).
pub const URL_DB: &str = "sqlite:psigestion.db";
/// Si existe al iniciar, contiene la ruta de una copia para restaurar antes de abrir la base.
const ARCHIVO_RESTAURAR: &str = "restaurar-pendiente.txt";
const PREFIJO_COPIA: &str = "psigestion-";
/// Copia de seguridad.json que acompaña a las copias.
const ARCHIVO_LLAVE: &str = "psigestion-llave.json";

/// Resultado de la última restauración, para mostrarlo una vez en la interfaz.
#[derive(Default)]
pub struct EstadoRestauracion(pub Mutex<Option<String>>);

/// tauri-plugin-sql guarda la base en la carpeta de configuración de la app
/// (%APPDATA%\com.psigestion.app en Windows).
fn carpeta_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// ---------- Transacciones ----------

#[derive(Deserialize)]
pub struct Sentencia {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

/// Ejecuta varias sentencias en una sola transacción: se guardan todas o ninguna.
/// Hace falta porque el plugin usa un pool de conexiones y un BEGIN enviado
/// desde la interfaz puede caer en una conexión distinta a la del UPDATE siguiente.
#[tauri::command]
pub async fn ejecutar_transaccion(
    instancias: State<'_, DbInstances>,
    sentencias: Vec<Sentencia>,
) -> Result<(), String> {
    let pools = instancias.0.read().await;
    let pool = match pools.get(URL_DB) {
        Some(DbPool::Sqlite(pool)) => pool,
        #[allow(unreachable_patterns)]
        _ => return Err("La base de datos no está abierta.".into()),
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for s in &sentencias {
        let mut consulta = sqlx::query(&s.sql);
        // Mismo criterio que tauri-plugin-sql para convertir los valores.
        for v in &s.params {
            consulta = match v {
                Value::Null => consulta.bind(None::<String>),
                Value::String(t) => consulta.bind(t.clone()),
                Value::Number(n) => consulta.bind(n.as_f64().unwrap_or_default()),
                Value::Bool(b) => consulta.bind(*b as i64),
                otro => consulta.bind(otro.to_string()),
            };
        }
        consulta.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

// ---------- Copias de seguridad ----------

#[derive(Serialize)]
pub struct Copia {
    nombre: String,
    ruta: String,
    bytes: u64,
    /// Milisegundos desde 1970.
    modificada: u64,
    /// false para las copias hechas antes de activar el cifrado.
    cifrada: bool,
}

/// Carpeta sugerida para las copias: Documentos\PsiGestion\Copias.
#[tauri::command]
pub fn carpeta_copias_sugerida<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| carpeta_app(&app))
        .map_err(|e| e.to_string())?;
    Ok(base.join("PsiGestion").join("Copias").to_string_lossy().into_owned())
}

/// Crea la carpeta de copias si no existe y devuelve la ruta completa para una copia nueva.
/// También deja ahí una copia de `seguridad.json`: sin ella las copias cifradas no se
/// pueden abrir en otra computadora. Está protegida por la contraseña y la clave de recuperación.
#[tauri::command]
pub fn preparar_copia<R: Runtime>(app: AppHandle<R>, carpeta: String, nombre: String) -> Result<String, String> {
    validar_nombre(&nombre)?;
    let carpeta = PathBuf::from(carpeta);
    fs::create_dir_all(&carpeta).map_err(|e| format!("No se pudo crear la carpeta de copias: {e}"))?;
    let ruta = carpeta.join(&nombre);
    if ruta.exists() {
        return Err("Ya existe una copia con ese nombre.".into());
    }
    let seguridad = carpeta_app(&app)?.join(crate::seguridad::ARCHIVO);
    if seguridad.exists() {
        fs::copy(&seguridad, carpeta.join(ARCHIVO_LLAVE)).map_err(|e| e.to_string())?;
    }
    Ok(ruta.to_string_lossy().into_owned())
}

/// Copias que hay en la carpeta, de la más nueva a la más vieja.
#[tauri::command]
pub fn listar_copias(carpeta: String) -> Result<Vec<Copia>, String> {
    let carpeta = PathBuf::from(carpeta);
    if !carpeta.exists() {
        return Ok(vec![]);
    }
    let mut copias = vec![];
    for entrada in fs::read_dir(&carpeta).map_err(|e| e.to_string())? {
        let entrada = entrada.map_err(|e| e.to_string())?;
        let nombre = entrada.file_name().to_string_lossy().into_owned();
        if validar_nombre(&nombre).is_err() {
            continue;
        }
        let meta = entrada.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file() {
            continue;
        }
        let modificada = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        copias.push(Copia {
            nombre,
            ruta: entrada.path().to_string_lossy().into_owned(),
            bytes: meta.len(),
            modificada,
            cifrada: !es_sqlite(&entrada.path()),
        });
    }
    copias.sort_by(|a, b| b.nombre.cmp(&a.nombre));
    Ok(copias)
}

#[tauri::command]
pub fn borrar_copia(ruta: String) -> Result<(), String> {
    let ruta = PathBuf::from(ruta);
    let nombre = ruta.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    validar_nombre(&nombre)?;
    fs::remove_file(&ruta).map_err(|e| e.to_string())
}

/// Solo se manejan archivos con el formato de nombre de las copias de la app,
/// para no tocar nunca otros archivos de la carpeta.
fn validar_nombre(nombre: &str) -> Result<(), String> {
    let valido = nombre.starts_with(PREFIJO_COPIA)
        && nombre.ends_with(".db")
        && nombre != ARCHIVO_DB
        && nombre.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if valido { Ok(()) } else { Err(format!("\"{nombre}\" no es una copia de PsiGestion.")) }
}

/// true si el archivo es una base SQLite sin cifrar.
pub fn es_sqlite(ruta: &Path) -> bool {
    let mut cabecera = [0u8; 16];
    fs::File::open(ruta)
        .and_then(|mut f| f.read_exact(&mut cabecera))
        .map(|_| &cabecera == b"SQLite format 3\0")
        .unwrap_or(false)
}

// ---------- Restauración ----------

/// Deja la copia marcada para restaurar y reinicia la app. La base se reemplaza
/// al iniciar, antes de abrirla, para no pisar un archivo en uso.
#[tauri::command]
pub fn restaurar_copia<R: Runtime>(app: AppHandle<R>, ruta: String) -> Result<(), String> {
    let origen = PathBuf::from(&ruta);
    let nombre = origen.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    validar_nombre(&nombre)?;
    if !es_sqlite(&origen) {
        return Err("El archivo no es una copia válida.".into());
    }
    let carpeta = carpeta_app(&app)?;
    fs::write(carpeta.join(ARCHIVO_RESTAURAR), &ruta).map_err(|e| e.to_string())?;
    app.restart();
}

/// Se llama al iniciar la app. Si hay una restauración pendiente, reemplaza la base.
pub fn aplicar_restauracion_pendiente<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let carpeta = carpeta_app(app).ok()?;
    let marca = carpeta.join(ARCHIVO_RESTAURAR);
    let ruta = fs::read_to_string(&marca).ok()?;
    // Se borra primero para no quedar en un bucle si algo falla.
    let _ = fs::remove_file(&marca);
    let origen = PathBuf::from(ruta.trim());
    let resultado = reemplazar_base(&carpeta, &origen);
    Some(match resultado {
        Ok(()) => format!("ok:{}", origen.file_name().unwrap_or_default().to_string_lossy()),
        Err(e) => format!("error:{e}"),
    })
}

fn reemplazar_base(carpeta: &Path, origen: &Path) -> Result<(), String> {
    if !es_sqlite(origen) {
        return Err("la copia no existe o no es válida".into());
    }
    let destino = carpeta.join(ARCHIVO_DB);
    let temporal = carpeta.join(format!("{ARCHIVO_DB}.restaurando"));
    fs::copy(origen, &temporal).map_err(|e| e.to_string())?;
    for extra in ["-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(carpeta.join(format!("{ARCHIVO_DB}{extra}")));
    }
    fs::rename(&temporal, &destino).map_err(|e| e.to_string())
}

/// Devuelve (una sola vez) el resultado de la restauración hecha al iniciar:
/// "ok:<archivo>" o "error:<motivo>", o null si no hubo ninguna.
#[tauri::command]
pub fn resultado_restauracion(estado: State<'_, EstadoRestauracion>) -> Option<String> {
    estado.0.lock().ok()?.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_acepta_nombres_de_copias() {
        assert!(validar_nombre("psigestion-auto-2026-10-31_20-15-03.db").is_ok());
        assert!(validar_nombre("psigestion.db").is_err());
        assert!(validar_nombre("otro.db").is_err());
        assert!(validar_nombre("psigestion-x.txt").is_err());
        assert!(validar_nombre("psigestion-..\\..\\x.db").is_err());
    }

    #[test]
    fn reemplaza_la_base_y_borra_los_archivos_auxiliares() {
        let carpeta = std::env::temp_dir().join(format!("psigestion-prueba-{}", std::process::id()));
        fs::create_dir_all(&carpeta).unwrap();
        let copia = carpeta.join("psigestion-manual-2026-10-31_10-00-00.db");
        fs::write(&copia, b"SQLite format 3\0copia").unwrap();
        fs::write(carpeta.join(ARCHIVO_DB), b"SQLite format 3\0actual").unwrap();
        fs::write(carpeta.join("psigestion.db-wal"), b"wal").unwrap();

        reemplazar_base(&carpeta, &copia).unwrap();
        assert_eq!(fs::read(carpeta.join(ARCHIVO_DB)).unwrap(), b"SQLite format 3\0copia");
        assert!(!carpeta.join("psigestion.db-wal").exists());

        // Un archivo que no es SQLite no reemplaza nada.
        let falsa = carpeta.join("psigestion-manual-2026-10-31_11-00-00.db");
        fs::write(&falsa, b"no soy una base").unwrap();
        assert!(reemplazar_base(&carpeta, &falsa).is_err());
        assert_eq!(fs::read(carpeta.join(ARCHIVO_DB)).unwrap(), b"SQLite format 3\0copia");
        fs::remove_dir_all(&carpeta).unwrap();
    }
}
