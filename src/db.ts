import Database from "@tauri-apps/plugin-sql";

// La base vive en la carpeta de datos de la app (%APPDATA%\com.psigestion.app en Windows).
// Las tablas se crean con las migraciones de src-tauri/migrations.
let conexion: Promise<Database> | null = null;

export function obtenerDb(): Promise<Database> {
  if (!conexion) {
    conexion = Database.load("sqlite:psigestion.db");
  }
  return conexion;
}
