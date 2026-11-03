// Pide los PDF al worker (ver worker.ts: pdf-lib no funciona en la ventana principal).

import type { DatosPdfReporte } from "../reportes/pdf";
import type { Recibo } from "../tipos";

export type PedidoPdf =
  | { id: number; tipo: "recibo"; recibo: Recibo; ejemplo: boolean }
  | { id: number; tipo: "reporte"; datos: DatosPdfReporte };

export type RespuestaPdf = { id: number; bytes: Uint8Array; error?: undefined } | { id: number; error: string; bytes?: undefined };

type Pendiente = { resolver: (b: Uint8Array) => void; rechazar: (e: Error) => void };

let worker: Worker | null = null;
let siguienteId = 1;
const pendientes = new Map<number, Pendiente>();

function obtenerWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (ev: MessageEvent<RespuestaPdf>) => {
    const p = pendientes.get(ev.data.id);
    if (!p) return;
    pendientes.delete(ev.data.id);
    if (ev.data.error !== undefined) p.rechazar(new Error(ev.data.error));
    else p.resolver(ev.data.bytes);
  };
  w.onerror = (ev) => {
    // El worker no se pudo cargar o falló sin responder: se cancela todo lo pendiente.
    ev.preventDefault();
    const error = new Error(`No se pudo generar el PDF: ${ev.message || "error al iniciar el generador"}`);
    for (const p of pendientes.values()) p.rechazar(error);
    pendientes.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

type SinId<T> = T extends unknown ? Omit<T, "id"> : never;

function pedir(pedido: SinId<PedidoPdf>): Promise<Uint8Array> {
  const id = siguienteId++;
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar });
    obtenerWorker().postMessage({ ...pedido, id });
  });
}

export const pdfRecibo = (recibo: Recibo, ejemplo = false) => pedir({ tipo: "recibo", recibo, ejemplo });

export const pdfReporte = (datos: DatosPdfReporte) => pedir({ tipo: "reporte", datos });
