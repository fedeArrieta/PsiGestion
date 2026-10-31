//! Registro de errores en archivos, para poder diagnosticar problemas.
//! Nunca se registran datos de pacientes: solo la operación y el tipo de error.

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// Hasta 5 archivos de 1 MB en %LOCALAPPDATA%\com.psigestion.app\logs.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .targets([Target::new(TargetKind::LogDir { file_name: Some("psigestion".into()) })])
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .max_file_size(1024 * 1024)
        .level(log::LevelFilter::Info)
        // Las librerías solo registran advertencias, para no llenar el archivo de consultas.
        .level_for("sqlx", log::LevelFilter::Warn)
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .build()
}

/// Abre la carpeta de registros en el Explorador de Windows.
#[tauri::command]
pub fn abrir_carpeta_registros<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let carpeta = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let programa = if cfg!(windows) { "explorer" } else { "xdg-open" };
    std::process::Command::new(programa)
        .arg(&carpeta)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))
}
