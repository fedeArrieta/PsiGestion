import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { Db, Sentencia } from "./repositorio";

// La base vive en la carpeta de la app (%APPDATA%\com.psigestion.app en Windows).
// Las tablas se crean con las migraciones de src-tauri/migrations.
// El plugin activa las claves foráneas (PRAGMA foreign_keys = ON) en cada conexión.
let conexion: Promise<Db> | null = null;

export function obtenerDb(): Promise<Db> {
  if (!conexion) {
    conexion = Database.load("sqlite:psigestion.db").then((base) => ({
      select: <T,>(sql: string, params?: unknown[]) => base.select<T>(sql, params),
      execute: (sql: string, params?: unknown[]) => base.execute(sql, params),
      // El plugin usa varias conexiones, así que un BEGIN desde acá no sirve: lo hace Rust.
      transaccion: (sentencias: Sentencia[]) => invoke<void>("ejecutar_transaccion", { sentencias }),
    }));
  }
  return conexion;
}
