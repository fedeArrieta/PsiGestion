mod datos;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Migraciones de la base de datos local (SQLite).
/// Nunca modificar una migración ya publicada: agregar una nueva con la versión siguiente.
fn migraciones() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "crear_pacientes_y_turnos",
            sql: include_str!("../migrations/0001_pacientes_y_turnos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "crear_gastos_y_objetivos",
            sql: include_str!("../migrations/0002_gastos_y_objetivos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "crear_configuracion",
            sql: include_str!("../migrations/0003_configuracion.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(datos::URL_DB, migraciones())
                .build(),
        )
        .setup(|app| {
            // Antes de que la interfaz abra la base, aplicar una restauración pendiente.
            let resultado = datos::aplicar_restauracion_pendiente(app.handle());
            app.manage(datos::EstadoRestauracion(std::sync::Mutex::new(resultado)));
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
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar PsiGestion");
}
