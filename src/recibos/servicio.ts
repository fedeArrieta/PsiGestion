import { invoke } from "@tauri-apps/api/core";
import { obtenerDb } from "../db";
import { pdfRecibo } from "../pdf/cliente";
import { guardarConfiguracion, leerConfiguracion } from "../repositorio";
import type { Recibo } from "../tipos";
import { CLAVE_CARPETA, nombreArchivo } from "./logica";

/** Carpeta donde se guardan los PDF (la configurada o Documentos\PsiGestion\Recibos). */
export async function carpetaRecibos(): Promise<string> {
  const config = await leerConfiguracion(await obtenerDb());
  return config[CLAVE_CARPETA] || (await invoke<string>("carpeta_recibos_sugerida"));
}

export async function elegirCarpetaRecibos(carpeta: string | null): Promise<void> {
  await guardarConfiguracion(await obtenerDb(), CLAVE_CARPETA, carpeta);
}

/** Genera el PDF del recibo y lo guarda en la carpeta de recibos. Devuelve la ruta. */
export async function guardarPdf(recibo: Recibo, ejemplo = false): Promise<string> {
  // El PDF se arma en un worker (ver src/pdf/worker.ts), que carga pdf-lib recién al usarlo.
  const contenido = await pdfRecibo(recibo, ejemplo);
  return invoke<string>("guardar_recibo", {
    carpeta: await carpetaRecibos(),
    nombre: ejemplo ? "Recibo de ejemplo.pdf" : nombreArchivo(recibo.numero, recibo.paciente_nombre, Boolean(recibo.anulado_en)),
    contenido: Array.from(contenido),
  });
}

/** Abre el PDF con el programa predeterminado (o la carpeta, con el archivo marcado). */
export async function abrirPdf(ruta: string, enCarpeta = false): Promise<void> {
  await invoke("abrir_recibo", { ruta, enCarpeta });
}

/** Genera el PDF (por si se borró o cambió la carpeta) y lo abre. */
export async function verPdf(recibo: Recibo, ejemplo = false): Promise<string> {
  const ruta = await guardarPdf(recibo, ejemplo);
  await abrirPdf(ruta);
  return ruta;
}
