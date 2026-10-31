mod base;
mod datos;
mod seguridad;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Sin migraciones acá: la base cifrada la abre Rust al desbloquear (ver base.rs).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Antes de abrir la base, aplicar una restauración pendiente.
            let resultado = datos::aplicar_restauracion_pendiente(app.handle());
            app.manage(datos::EstadoRestauracion(std::sync::Mutex::new(resultado)));
            app.manage(seguridad::EstadoSeguridad::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            datos::ejecutar_transaccion,
            datos::carpeta_copias_sugerida,
            datos::preparar_copia,
            datos::listar_copias,
            datos::borrar_copia,
            datos::restaurar_copia,
            datos::resultado_restauracion,
            seguridad::estado_seguridad,
            seguridad::configurar_contrasena,
            seguridad::desbloquear,
            seguridad::recuperar_acceso,
            seguridad::cambiar_contrasena,
            seguridad::nueva_recuperacion,
            seguridad::bloquear,
            seguridad::importar_llave,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar PsiGestion");
}
