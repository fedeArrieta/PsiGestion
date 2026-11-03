mod actualizar;
mod base;
mod datos;
mod exportar;
mod recibos;
mod registro;
mod seguridad;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Si algo falla en Rust, que quede en el registro (dónde y por qué) para poder arreglarlo.
    std::panic::set_hook(Box::new(|info| {
        log::error!("falla interna: {info}");
        log::logger().flush();
    }));
    tauri::Builder::default()
        .plugin(registro::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Recordatorios: abre wa.me o mailto: con el navegador o el correo (permiso acotado en capabilities).
        .plugin(tauri_plugin_opener::init())
        // Sin migraciones acá: la base cifrada la abre Rust al desbloquear (ver base.rs).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Antes de abrir la base, aplicar una restauración pendiente.
            let resultado = datos::aplicar_restauracion_pendiente(app.handle());
            log::info!("PsiGestion {} iniciada", app.package_info().version);
            if let Some(r) = &resultado {
                log::info!("restauración al iniciar: {}", if r.starts_with("ok:") { "correcta" } else { r.as_str() });
            }
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
            registro::abrir_carpeta_registros,
            exportar::exportar_excel,
            exportar::guardar_pdf,
            recibos::carpeta_recibos_sugerida,
            recibos::guardar_recibo,
            recibos::abrir_recibo,
            actualizar::instalar_actualizacion,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar PsiGestion");
}
