import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { Db, Sentencia } from "./repositorio";

// La base cifrada la abre Rust al desbloquear la app (src-tauri/src/base.rs) y la
// registra en el plugin con este nombre. Acá solo se usa esa conexión ya abierta.
const URL_DB = "sqlite:psigestion.db";
let conexion: Db | null = null;

export async function obtenerDb(): Promise<Db> {
  if (!conexion) {
    const base = Database.get(URL_DB);
    conexion = {
      select: <T,>(sql: string, params?: unknown[]) => base.select<T>(sql, params),
      execute: (sql: string, params?: unknown[]) => base.execute(sql, params),
      // El plugin usa varias conexiones, así que un BEGIN desde acá no sirve: lo hace Rust.
      transaccion: (sentencias: Sentencia[]) => invoke<void>("ejecutar_transaccion", { sentencias }),
    };
  }
  return conexion;
}
