//! Contraseña de la app.
//!
//! Al configurar la contraseña se genera una clave de datos aleatoria de 32 bytes.
//! Esa clave se guarda cifrada dos veces en `seguridad.json`: una con una clave
//! derivada de la contraseña y otra con una derivada de la clave de recuperación
//! (Argon2id + XChaCha20-Poly1305). Desbloquear es poder descifrar la clave de datos:
//! si la contraseña es incorrecta, el cifrado autenticado falla.
//! La clave de datos queda en memoria solo mientras la app está desbloqueada.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};
use zeroize::{Zeroize, Zeroizing};

pub const ARCHIVO: &str = "seguridad.json";
const LARGO_MINIMO: usize = 8;
/// Alfabeto de la clave de recuperación: sin 0/O ni 1/I/L para que no se confundan al copiarla.
const ALFABETO: &[u8; 31] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

#[derive(Serialize, Deserialize, Clone)]
struct Envoltura {
    sal: String,
    nonce: String,
    cifrado: String,
}

#[derive(Serialize, Deserialize)]
struct Archivo {
    version: u32,
    por_contrasena: Envoltura,
    por_recuperacion: Envoltura,
}

#[derive(Default)]
pub struct EstadoSeguridad {
    clave_datos: Mutex<Option<Zeroizing<[u8; 32]>>>,
}

impl EstadoSeguridad {
    pub fn desbloqueada(&self) -> bool {
        self.clave_datos.lock().map(|c| c.is_some()).unwrap_or(false)
    }
}

fn ruta_archivo<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(ARCHIVO))
}

fn leer(ruta: &Path) -> Result<Option<Archivo>, String> {
    match fs::read_to_string(ruta) {
        Ok(t) => serde_json::from_str(&t).map(Some).map_err(|_| "El archivo de seguridad está dañado.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn escribir(ruta: &Path, archivo: &Archivo) -> Result<(), String> {
    if let Some(carpeta) = ruta.parent() {
        fs::create_dir_all(carpeta).map_err(|e| e.to_string())?;
    }
    let temporal = ruta.with_extension("json.tmp");
    let texto = serde_json::to_string_pretty(archivo).map_err(|e| e.to_string())?;
    fs::write(&temporal, texto).map_err(|e| e.to_string())?;
    fs::rename(&temporal, ruta).map_err(|e| e.to_string())
}

// ---------- Criptografía ----------

fn aleatorio<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    rand::thread_rng().fill_bytes(&mut b);
    b
}

fn derivar(secreto: &[u8], sal: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    // Argon2id con 64 MiB y 3 pasadas: tarda una fracción de segundo y encarece adivinar.
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut clave = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(secreto, sal, clave.as_mut())
        .map_err(|e| e.to_string())?;
    Ok(clave)
}

fn envolver(clave_datos: &[u8; 32], secreto: &[u8]) -> Result<Envoltura, String> {
    let sal = aleatorio::<16>();
    let nonce = aleatorio::<24>();
    let kek = derivar(secreto, &sal)?;
    let cifrado = XChaCha20Poly1305::new(kek.as_ref().into())
        .encrypt(XNonce::from_slice(&nonce), clave_datos.as_slice())
        .map_err(|_| "No se pudo cifrar la clave.".to_string())?;
    Ok(Envoltura { sal: hex(&sal), nonce: hex(&nonce), cifrado: hex(&cifrado) })
}

/// None si el secreto no es el correcto.
fn desenvolver(envoltura: &Envoltura, secreto: &[u8]) -> Result<Option<Zeroizing<[u8; 32]>>, String> {
    let sal = desde_hex(&envoltura.sal)?;
    let nonce = desde_hex(&envoltura.nonce)?;
    let cifrado = desde_hex(&envoltura.cifrado)?;
    if nonce.len() != 24 {
        return Err("El archivo de seguridad está dañado.".into());
    }
    let kek = derivar(secreto, &sal)?;
    let Ok(mut plano) = XChaCha20Poly1305::new(kek.as_ref().into()).decrypt(XNonce::from_slice(&nonce), cifrado.as_slice())
    else {
        return Ok(None);
    };
    if plano.len() != 32 {
        plano.zeroize();
        return Err("El archivo de seguridad está dañado.".into());
    }
    let mut clave = Zeroizing::new([0u8; 32]);
    clave.copy_from_slice(&plano);
    plano.zeroize();
    Ok(Some(clave))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn desde_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("El archivo de seguridad está dañado.".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "El archivo de seguridad está dañado.".to_string()))
        .collect()
}

/// 32 caracteres en 8 grupos de 4: ABCD-EFGH-...
fn nueva_clave_recuperacion() -> String {
    let bytes = aleatorio::<32>();
    let letras: String = bytes.iter().map(|b| ALFABETO[(*b % 31) as usize] as char).collect();
    letras.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
}

/// Mayúsculas y sin guiones ni espacios, para que no importe cómo se escriba.
fn normalizar_recuperacion(clave: &str) -> String {
    clave.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect()
}

fn validar_contrasena(contrasena: &str) -> Result<(), String> {
    if contrasena.chars().count() < LARGO_MINIMO {
        return Err(format!("La contraseña tiene que tener al menos {LARGO_MINIMO} caracteres."));
    }
    Ok(())
}

fn guardar_clave(estado: &EstadoSeguridad, clave: Zeroizing<[u8; 32]>) {
    if let Ok(mut c) = estado.clave_datos.lock() {
        *c = Some(clave);
    }
}

/// Espera tras un intento fallido para que probar contraseñas sea lento.
async fn demora_por_error() {
    tokio::time::sleep(Duration::from_secs(1)).await;
}

// ---------- Comandos ----------

/// "sin_configurar", "falta_llave", "bloqueada" o "desbloqueada".
/// "falta_llave": hay una base cifrada pero no el archivo de seguridad (por ejemplo, en una
/// computadora nueva); hay que traer `psigestion-llave.json` desde la carpeta de copias.
#[tauri::command]
pub fn estado_seguridad<R: Runtime>(app: AppHandle<R>, estado: State<'_, EstadoSeguridad>) -> Result<String, String> {
    if leer(&ruta_archivo(&app)?)?.is_none() {
        let db = crate::base::ruta_db(&app)?;
        let cifrada = db.exists() && !crate::datos::es_sqlite(&db);
        return Ok(if cifrada { "falta_llave" } else { "sin_configurar" }.into());
    }
    Ok(if estado.desbloqueada() { "desbloqueada" } else { "bloqueada" }.into())
}

/// Configura la contraseña por primera vez. Devuelve la clave de recuperación, que se muestra una sola vez.
#[tauri::command]
pub async fn configurar_contrasena<R: Runtime>(
    app: AppHandle<R>,
    estado: State<'_, EstadoSeguridad>,
    contrasena: String,
) -> Result<String, String> {
    let ruta = ruta_archivo(&app)?;
    if leer(&ruta)?.is_some() {
        return Err("La contraseña ya está configurada.".into());
    }
    validar_contrasena(&contrasena)?;
    let clave_datos = Zeroizing::new(aleatorio::<32>());
    let recuperacion = nueva_clave_recuperacion();
    let archivo = Archivo {
        version: 1,
        por_contrasena: envolver(&clave_datos, contrasena.as_bytes())?,
        por_recuperacion: envolver(&clave_datos, normalizar_recuperacion(&recuperacion).as_bytes())?,
    };
    // Primero se abre (y se cifra, si ya había datos) la base; recién después se guarda el archivo.
    crate::base::abrir(&app, &clave_datos).await?;
    escribir(&ruta, &archivo)?;
    guardar_clave(&estado, clave_datos);
    Ok(recuperacion)
}

#[tauri::command]
pub async fn desbloquear<R: Runtime>(
    app: AppHandle<R>,
    estado: State<'_, EstadoSeguridad>,
    contrasena: String,
) -> Result<bool, String> {
    let archivo = leer(&ruta_archivo(&app)?)?.ok_or("La contraseña no está configurada.")?;
    match desenvolver(&archivo.por_contrasena, contrasena.as_bytes())? {
        Some(clave) => {
            crate::base::abrir(&app, &clave).await?;
            guardar_clave(&estado, clave);
            Ok(true)
        }
        None => {
            demora_por_error().await;
            Ok(false)
        }
    }
}

/// Entra con la clave de recuperación y pone una contraseña nueva.
#[tauri::command]
pub async fn recuperar_acceso<R: Runtime>(
    app: AppHandle<R>,
    estado: State<'_, EstadoSeguridad>,
    clave_recuperacion: String,
    nueva_contrasena: String,
) -> Result<bool, String> {
    validar_contrasena(&nueva_contrasena)?;
    let ruta = ruta_archivo(&app)?;
    let mut archivo = leer(&ruta)?.ok_or("La contraseña no está configurada.")?;
    let Some(clave) = desenvolver(&archivo.por_recuperacion, normalizar_recuperacion(&clave_recuperacion).as_bytes())?
    else {
        demora_por_error().await;
        return Ok(false);
    };
    archivo.por_contrasena = envolver(&clave, nueva_contrasena.as_bytes())?;
    crate::base::abrir(&app, &clave).await?;
    escribir(&ruta, &archivo)?;
    guardar_clave(&estado, clave);
    Ok(true)
}

#[tauri::command]
pub async fn cambiar_contrasena<R: Runtime>(
    app: AppHandle<R>,
    actual: String,
    nueva: String,
) -> Result<bool, String> {
    validar_contrasena(&nueva)?;
    let ruta = ruta_archivo(&app)?;
    let mut archivo = leer(&ruta)?.ok_or("La contraseña no está configurada.")?;
    let Some(clave) = desenvolver(&archivo.por_contrasena, actual.as_bytes())? else {
        demora_por_error().await;
        return Ok(false);
    };
    archivo.por_contrasena = envolver(&clave, nueva.as_bytes())?;
    escribir(&ruta, &archivo)?;
    Ok(true)
}

/// Genera una clave de recuperación nueva (la anterior deja de servir). Pide la contraseña actual.
#[tauri::command]
pub async fn nueva_recuperacion<R: Runtime>(app: AppHandle<R>, contrasena: String) -> Result<Option<String>, String> {
    let ruta = ruta_archivo(&app)?;
    let mut archivo = leer(&ruta)?.ok_or("La contraseña no está configurada.")?;
    let Some(clave) = desenvolver(&archivo.por_contrasena, contrasena.as_bytes())? else {
        demora_por_error().await;
        return Ok(None);
    };
    let recuperacion = nueva_clave_recuperacion();
    archivo.por_recuperacion = envolver(&clave, normalizar_recuperacion(&recuperacion).as_bytes())?;
    escribir(&ruta, &archivo)?;
    Ok(Some(recuperacion))
}

/// Trae el archivo de seguridad desde una copia (psigestion-llave.json), cuando falta.
#[tauri::command]
pub fn importar_llave<R: Runtime>(app: AppHandle<R>, ruta: String) -> Result<(), String> {
    let destino = ruta_archivo(&app)?;
    if leer(&destino)?.is_some() {
        return Err("Ya hay una contraseña configurada.".into());
    }
    let archivo = leer(Path::new(&ruta))?.ok_or("No se encontró el archivo.")?;
    escribir(&destino, &archivo)
}

/// Cierra la base y borra la clave de la memoria.
#[tauri::command]
pub async fn bloquear<R: Runtime>(app: AppHandle<R>, estado: State<'_, EstadoSeguridad>) -> Result<(), String> {
    crate::base::cerrar(&app).await;
    if let Ok(mut c) = estado.clave_datos.lock() {
        *c = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envuelve_y_desenvuelve_la_clave() {
        let clave = [7u8; 32];
        let e = envolver(&clave, b"una clave larga").unwrap();
        assert_eq!(*desenvolver(&e, b"una clave larga").unwrap().unwrap(), clave);
        assert!(desenvolver(&e, b"otra clave larga").unwrap().is_none());
    }

    #[test]
    fn la_recuperacion_no_depende_del_formato() {
        let r = nueva_clave_recuperacion();
        assert_eq!(r.len(), 32 + 7);
        assert!(r.chars().all(|c| c == '-' || ALFABETO.contains(&(c as u8))));
        let clave = [3u8; 32];
        let e = envolver(&clave, normalizar_recuperacion(&r).as_bytes()).unwrap();
        let escrita = r.to_lowercase().replace('-', " ");
        assert_eq!(*desenvolver(&e, normalizar_recuperacion(&escrita).as_bytes()).unwrap().unwrap(), clave);
    }

    #[test]
    fn exige_un_largo_minimo() {
        assert!(validar_contrasena("corta").is_err());
        assert!(validar_contrasena("suficiente").is_ok());
    }
}
