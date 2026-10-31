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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:psigestion.db", migraciones())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error al iniciar PsiGestion");
}
