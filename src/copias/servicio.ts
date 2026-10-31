import { invoke } from "@tauri-apps/api/core";
import { obtenerDb } from "../db";
import { copiarBaseA, guardarConfiguracion, leerConfiguracion } from "../repositorio";
import {
  CONSERVAR_POR_DEFECTO,
  copiasABorrar,
  necesitaCopiaAutomatica,
  nombreCopia,
  type ArchivoCopia,
  type TipoCopia,
} from "./logica";

export interface ConfigCopias {
  carpeta: string;
  conservar: number;
  /** Última copia automática o manual que salió bien. */
  ultima: Date | null;
  /** Motivo por el que falló la última copia automática, si falló. */
  error: string | null;
}

export async function leerConfigCopias(): Promise<ConfigCopias> {
  const config = await leerConfiguracion(await obtenerDb());
  const conservar = Number(config.copias_conservar);
  return {
    carpeta: config.copias_carpeta || (await invoke<string>("carpeta_copias_sugerida")),
    conservar: conservar > 0 ? conservar : CONSERVAR_POR_DEFECTO,
    ultima: config.copias_ultima ? new Date(config.copias_ultima) : null,
    error: config.copias_error || null,
  };
}

export async function guardarCarpeta(carpeta: string) {
  await guardarConfiguracion(await obtenerDb(), "copias_carpeta", carpeta);
}

export async function guardarConservar(cantidad: number) {
  await guardarConfiguracion(await obtenerDb(), "copias_conservar", String(Math.max(1, Math.round(cantidad))));
}

export function listarCopias(carpeta: string): Promise<ArchivoCopia[]> {
  return invoke<ArchivoCopia[]>("listar_copias", { carpeta });
}

/** Hace una copia en la carpeta configurada y borra las automáticas que sobran. */
export async function hacerCopia(tipo: TipoCopia): Promise<string> {
  const db = await obtenerDb();
  const config = await leerConfigCopias();
  const ahora = new Date();
  const ruta = await invoke<string>("preparar_copia", { carpeta: config.carpeta, nombre: nombreCopia(tipo, ahora) });
  await copiarBaseA(db, ruta);
  if (tipo !== "previa") {
    await guardarConfiguracion(db, "copias_ultima", ahora.toISOString());
    await guardarConfiguracion(db, "copias_error", null);
  }
  for (const vieja of copiasABorrar(await listarCopias(config.carpeta), config.conservar)) {
    await invoke("borrar_copia", { ruta: vieja.ruta }).catch(() => {});
  }
  return ruta;
}

/** Copia automática si pasaron 24 horas desde la última. Si falla, guarda el motivo para avisar. */
export async function copiaAutomaticaSiCorresponde(): Promise<void> {
  const config = await leerConfigCopias();
  if (!necesitaCopiaAutomatica(config.ultima, new Date())) return;
  try {
    await hacerCopia("auto");
  } catch (e) {
    await guardarConfiguracion(await obtenerDb(), "copias_error", e instanceof Error ? e.message : String(e));
  }
}

/** Guarda el estado actual como copia "antes de restaurar" y reinicia la app con la copia elegida. */
export async function restaurarCopia(ruta: string): Promise<void> {
  await hacerCopia("previa");
  await invoke("restaurar_copia", { ruta });
}

/** Resultado de una restauración hecha al iniciar, o null. */
export async function resultadoRestauracion(): Promise<{ ok: boolean; detalle: string } | null> {
  const r = await invoke<string | null>("resultado_restauracion");
  if (!r) return null;
  const ok = r.startsWith("ok:");
  return { ok, detalle: r.slice(r.indexOf(":") + 1) };
}
