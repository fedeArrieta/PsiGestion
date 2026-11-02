import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Channel, invoke } from "@tauri-apps/api/core";
import { obtenerDb } from "../db";
import { guardarConfiguracion, leerConfiguracion } from "../repositorio";
import { hacerCopia } from "../copias/servicio";
import { debeAvisar, leerPreferencias, POSPONER_HORAS, type PreferenciasActualizacion } from "./logica";
import changelog from "../../CHANGELOG.md?raw";

export { changelog };

export const versionInstalada = () => getVersion();

export async function leerPreferenciasActualizacion(): Promise<PreferenciasActualizacion> {
  return leerPreferencias(await leerConfiguracion(await obtenerDb()));
}

export async function guardarBusquedaAutomatica(activa: boolean): Promise<void> {
  await guardarConfiguracion(await obtenerDb(), "actualizacion_automatica", activa ? "1" : "0");
}

/**
 * Consulta si hay una versión nueva. Solo pide el número de la última versión publicada en GitHub;
 * no envía datos de pacientes ni de uso. Devuelve null si no hay nada que avisar.
 * En la búsqueda automática, un error (por ejemplo, sin internet) se ignora en silencio.
 */
export async function buscarActualizacion(manual: boolean): Promise<Update | null> {
  const pref = await leerPreferenciasActualizacion();
  if (!manual && !pref.automatica) return null;
  let update: Update | null;
  try {
    update = await check({ timeout: 30000 });
  } catch (e) {
    if (manual) throw e;
    return null;
  }
  if (!update) return null;
  return debeAvisar(update.version, update.currentVersion, pref, Date.now(), manual) ? update : null;
}

export async function posponerAviso(): Promise<void> {
  const hasta = Date.now() + POSPONER_HORAS * 3600 * 1000;
  await guardarConfiguracion(await obtenerDb(), "actualizacion_posponer_hasta", String(hasta));
}

export async function omitirVersion(version: string): Promise<void> {
  await guardarConfiguracion(await obtenerDb(), "actualizacion_omitida", version);
}

type ProgresoInstalacion =
  | { evento: "inicio"; datos: { total: number | null } }
  | { evento: "avance"; datos: { bytes: number } }
  | { evento: "instalando" };

/**
 * Hace una copia de seguridad, descarga e instala la versión nueva. La descarga (con verificación
 * de firma) y el cierre de la app los hace Rust (src-tauri/src/actualizar.rs): cierra la base,
 * lanza el instalador y termina el proceso en el acto, así el instalador nunca encuentra la app abierta.
 */
export async function instalarActualizacion(_update: Update, onProgreso: (porcentaje: number | null) => void) {
  await hacerCopia("previa");
  let total = 0;
  let bajado = 0;
  const progreso = new Channel<ProgresoInstalacion>();
  progreso.onmessage = (m) => {
    if (m.evento === "inicio") total = m.datos.total ?? 0;
    if (m.evento === "avance") {
      bajado += m.datos.bytes;
      onProgreso(total ? Math.min(100, Math.round((bajado / total) * 100)) : null);
    }
  };
  await invoke("instalar_actualizacion", { progreso });
}

export async function leerVersionVista(): Promise<string | null> {
  return (await leerConfiguracion(await obtenerDb())).version_vista ?? null;
}

export async function marcarNovedadesVistas(version: string): Promise<void> {
  await guardarConfiguracion(await obtenerDb(), "version_vista", version);
}
