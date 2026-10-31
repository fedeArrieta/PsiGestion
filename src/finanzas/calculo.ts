import type { ResumenMes } from "../tipos";

export interface Meta {
  titulo: string;
  /** Monto a alcanzar con sesiones. */
  monto: number;
  /** Ya ganado con sesiones realizadas. */
  realizado: number;
  /** Lo que sumarían los turnos programados del mes. */
  programado: number;
  /** Lo que falta después de contar realizadas y programadas. */
  faltante: number;
  /** Sesiones totales del mes para llegar, al precio promedio. null si no hay precio de referencia. */
  sesionesNecesarias: number | null;
  /** Sesiones extra a agendar (además de las programadas). null si no hay precio de referencia. */
  sesionesAdicionales: number | null;
  cumplida: boolean;
}

function calcularMeta(titulo: string, monto: number, r: ResumenMes): Meta {
  const faltante = Math.max(0, monto - r.facturado - r.programado);
  const hayPrecio = r.precio_promedio > 0;
  return {
    titulo,
    monto,
    realizado: r.facturado,
    programado: r.programado,
    faltante,
    sesionesNecesarias: hayPrecio ? Math.ceil(monto / r.precio_promedio) : monto > 0 ? null : 0,
    sesionesAdicionales: hayPrecio ? Math.ceil(faltante / r.precio_promedio) : faltante > 0 ? null : 0,
    cumplida: r.facturado >= monto,
  };
}

/**
 * Dos metas: cubrir los gastos del mes, y cubrir gastos más el objetivo
 * (el objetivo es lo que se quiere ganar después de pagar los gastos).
 */
export function calcularMetas(r: ResumenMes, objetivo: number | null): Meta[] {
  const metas = [calcularMeta("Cubrir los gastos", r.gastos, r)];
  if (objetivo != null && objetivo > 0) {
    metas.push(calcularMeta("Gastos + objetivo", r.gastos + objetivo, r));
  }
  return metas;
}

// ---------- Meses (AAAA-MM) ----------

export function mesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  return mesDe(new Date(a, m - 1 + n, 1));
}

const fmtMes = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

export function textoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const t = fmtMes.format(new Date(a, m - 1, 1));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
