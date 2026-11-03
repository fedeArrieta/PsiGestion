// Arma los PDF (recibos y reportes) en un hilo aparte.
//
// La ventana de la app corre con el prototipo de Object congelado (freezePrototype en
// tauri.conf.json, una protección contra scripts maliciosos). pdf-lib define sus clases
// asignando métodos como `toString` sobre los prototipos, y con Object.prototype congelado
// eso falla ("Cannot assign to read only property 'toString'"). Un worker tiene su propio
// Object.prototype, sin congelar, así que pdf-lib funciona y la ventana sigue protegida.

import type { PedidoPdf, RespuestaPdf } from "./cliente";

self.onmessage = async (ev: MessageEvent<PedidoPdf>) => {
  const { id } = ev.data;
  try {
    let bytes: Uint8Array;
    if (ev.data.tipo === "recibo") {
      const { generarPdfRecibo } = await import("../recibos/pdf");
      bytes = await generarPdfRecibo(ev.data.recibo, ev.data.ejemplo);
    } else {
      const { generarPdfReporte } = await import("../reportes/pdf");
      bytes = await generarPdfReporte(ev.data.datos);
    }
    const respuesta: RespuestaPdf = { id, bytes };
    (self as unknown as Worker).postMessage(respuesta, [bytes.buffer]);
  } catch (e) {
    const respuesta: RespuestaPdf = { id, error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(respuesta);
  }
};
