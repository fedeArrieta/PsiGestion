import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { obtenerDb } from "../db";
import { leerConfiguracion, type DatosReporte } from "../repositorio";
import { leerEmisor } from "../recibos/logica";
import { hojasReporte, nombreArchivoReporte, type MesReporte, type Periodo, type TotalesReporte } from "./logica";

const conExtension = (ruta: string, ext: string) => (ruta.toLowerCase().endsWith(`.${ext}`) ? ruta : `${ruta}.${ext}`);

/** Pide dónde guardar y genera el PDF. Devuelve la ruta, o null si se canceló. */
export async function exportarPdfReporte(periodo: Periodo, meses: MesReporte[], totales: TotalesReporte): Promise<string | null> {
  const elegida = await save({
    title: "Guardar reporte en PDF",
    defaultPath: nombreArchivoReporte(periodo, "pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!elegida) return null;
  const ruta = conExtension(elegida, "pdf");
  const emisor = leerEmisor(await leerConfiguracion(await obtenerDb()));
  // pdf-lib se carga recién acá, así no demora el inicio de la app.
  const { generarPdfReporte } = await import("./pdf");
  const contenido = await generarPdfReporte({ periodo, meses, totales, emisor, generado: new Date() });
  await invoke("guardar_pdf", { ruta, contenido: Array.from(contenido) });
  return ruta;
}

/** Pide dónde guardar y genera el Excel. Devuelve la ruta, o null si se canceló. */
export async function exportarExcelReporte(
  periodo: Periodo,
  meses: MesReporte[],
  totales: TotalesReporte,
  datos: DatosReporte,
): Promise<string | null> {
  const elegida = await save({
    title: "Guardar reporte en Excel",
    defaultPath: nombreArchivoReporte(periodo, "xlsx"),
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!elegida) return null;
  const ruta = conExtension(elegida, "xlsx");
  await invoke("exportar_excel", { ruta, hojas: hojasReporte(periodo, meses, totales, datos) });
  return ruta;
}

/** Abre el archivo con el programa predeterminado o muestra la carpeta. */
export async function abrirArchivo(ruta: string, enCarpeta: boolean): Promise<void> {
  await invoke("abrir_recibo", { ruta, enCarpeta });
}
