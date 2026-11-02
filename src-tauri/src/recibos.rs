//! Recibos de pago en PDF: el PDF lo arma la interfaz (src/recibos/pdf.ts); acá solo
//! se guarda en la carpeta de recibos y se abre con el programa de PDF de Windows.

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

/// Carpeta sugerida para los recibos: Documentos\PsiGestion\Recibos.
#[tauri::command]
pub fn carpeta_recibos_sugerida<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    Ok(base.join("PsiGestion").join("Recibos").to_string_lossy().into_owned())
}

/// Nombre de archivo simple, sin carpetas, terminado en .pdf.
fn validar_nombre(nombre: &str) -> Result<(), String> {
    let prohibidos = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    let valido = nombre.to_lowercase().ends_with(".pdf")
        && !nombre.starts_with('.')
        && nombre.len() <= 200
        && !nombre.contains("..")
        && !nombre.chars().any(|c| c.is_control() || prohibidos.contains(&c));
    if valido { Ok(()) } else { Err(format!("\"{nombre}\" no es un nombre de recibo válido.")) }
}

/// Solo se abren PDF (recibos y reportes) y planillas de Excel (reportes).
fn es_documento(ruta: &Path) -> bool {
    ruta.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf") || e.eq_ignore_ascii_case("xlsx"))
}

/// Guarda el PDF en la carpeta (la crea si hace falta) y devuelve la ruta completa.
/// Si ya existe un archivo con ese nombre, lo reemplaza: es el mismo recibo generado otra vez.
#[tauri::command]
pub fn guardar_recibo(carpeta: String, nombre: String, contenido: Vec<u8>) -> Result<String, String> {
    validar_nombre(&nombre)?;
    if !contenido.starts_with(b"%PDF-") {
        return Err("El contenido no es un PDF.".into());
    }
    let carpeta = PathBuf::from(carpeta);
    if !carpeta.is_absolute() {
        return Err("La carpeta de recibos no es válida.".into());
    }
    fs::create_dir_all(&carpeta).map_err(|e| format!("No se pudo crear la carpeta de recibos: {e}"))?;
    let ruta = carpeta.join(&nombre);
    fs::write(&ruta, &contenido).map_err(|e| {
        log::error!("guardar_recibo: {e}");
        format!("No se pudo guardar el recibo: {e}")
    })?;
    Ok(ruta.to_string_lossy().into_owned())
}

/// Abre el PDF (o el Excel de un reporte) con el programa predeterminado, o muestra la carpeta con el archivo elegido.
#[tauri::command]
pub fn abrir_recibo(ruta: String, en_carpeta: bool) -> Result<(), String> {
    let ruta = PathBuf::from(ruta);
    if !es_documento(&ruta) || !ruta.is_file() {
        return Err("No se encontró el archivo.".into());
    }
    let resultado = if cfg!(windows) {
        let mut comando = std::process::Command::new("explorer");
        if en_carpeta {
            let mut arg = std::ffi::OsString::from("/select,");
            arg.push(ruta.as_os_str());
            comando.arg(arg);
        } else {
            comando.arg(&ruta);
        }
        comando.spawn()
    } else {
        let destino = if en_carpeta { ruta.parent().unwrap_or(&ruta).to_path_buf() } else { ruta.clone() };
        std::process::Command::new("xdg-open").arg(destino).spawn()
    };
    resultado.map(|_| ()).map_err(|e| format!("No se pudo abrir el archivo: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn nombres() {
        assert!(validar_nombre("Recibo 00000012 - Ana Pérez.pdf").is_ok());
        assert!(validar_nombre("..\\otro.pdf").is_err());
        assert!(validar_nombre("C:/x.pdf").is_err());
        assert!(validar_nombre("recibo.exe").is_err());
        assert!(validar_nombre(".pdf").is_err());
    }
}
