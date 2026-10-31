import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { obtenerDb } from "../db";
import { datosParaExportar } from "../repositorio";
import { hojasExportacion, nombreArchivo } from "./logica";

/** Pide dónde guardar y exporta. Devuelve la ruta, o null si se canceló. */
export async function exportarExcel(mes: string | null): Promise<string | null> {
  const ruta = await save({
    title: "Exportar a Excel",
    defaultPath: nombreArchivo(mes, new Date()),
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!ruta) return null;
  const datos = await datosParaExportar(await obtenerDb(), mes);
  const final = ruta.toLowerCase().endsWith(".xlsx") ? ruta : `${ruta}.xlsx`;
  await invoke("exportar_excel", { ruta: final, hojas: hojasExportacion(datos) });
  return final;
}
