const fmtPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const pesos = (n: number) => fmtPesos.format(n);

/**
 * Interpreta un monto escrito a mano: "25000", "25.000", "$ 25.000,50", "25000.5".
 * Devuelve NaN si no es un número válido. Texto vacío es 0.
 */
export function leerMonto(texto: string): number {
  let s = texto.replace(/[\s$]/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Monto para mostrar en un campo editable, sin símbolo: 25000 → "25.000". */
export function montoEditable(n: number): string {
  return n ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n) : "";
}
