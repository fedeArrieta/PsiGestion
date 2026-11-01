// Aviso "Se eliminó … Deshacer" que aparece unos segundos después de borrar algo,
// y aviso de que los datos cambiaron, para que las pantallas abiertas se recarguen.

export interface OfertaDeshacer {
  texto: string;
  papeleraId: number;
}

type Oyente = (oferta: OfertaDeshacer) => void;
const oyentes = new Set<Oyente>();

export function ofrecerDeshacer(texto: string, papeleraId: number | null) {
  if (papeleraId == null) return;
  oyentes.forEach((o) => o({ texto, papeleraId }));
}

export function alOfrecerDeshacer(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

const EVENTO_DATOS = "psigestion:datos-cambiados";

/** Avisa que se restauró algo, para que la agenda y las finanzas se actualicen. */
export function avisarDatosCambiados() {
  window.dispatchEvent(new Event(EVENTO_DATOS));
}

export function alCambiarDatos(fn: () => void): () => void {
  window.addEventListener(EVENTO_DATOS, fn);
  return () => window.removeEventListener(EVENTO_DATOS, fn);
}
