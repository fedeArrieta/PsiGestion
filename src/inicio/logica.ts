import type { Turno } from "../tipos";
import { aFechaIso, desdeIsoLocal, sumarDias } from "../fechas";

/** Iniciales para el avatar: "María José González" → "MG". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primera = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primera + ultima).toUpperCase();
}

/** Variación porcentual redondeada; null si no hay con qué comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export type TonoEstado = "ok" | "pendiente" | "pago" | "atencion" | "apagado";

/**
 * Color de un turno según el sistema visual: verde agendado/confirmado, naranja realizado
 * y pendiente de cobro, azul pagado, rojo ausente (requiere atención), gris cancelado.
 */
export function tonoTurno(t: Pick<Turno, "estado" | "pagado">): { tono: TonoEstado; etiqueta: string } {
  switch (t.estado) {
    case "programado":
      return { tono: "ok", etiqueta: "Confirmado" };
    case "realizado":
      return t.pagado ? { tono: "pago", etiqueta: "Pagado" } : { tono: "pendiente", etiqueta: "Pendiente de cobro" };
    case "ausente":
      return { tono: "atencion", etiqueta: "Ausente" };
    default:
      return { tono: "apagado", etiqueta: "Cancelado" };
  }
}

const fmtDia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short" });

/** "Hoy", "Mañana" o "viernes 6 nov." */
export function textoCuando(inicio: string, hoy: Date): string {
  const fecha = inicio.slice(0, 10);
  if (fecha === aFechaIso(hoy)) return "Hoy";
  if (fecha === aFechaIso(sumarDias(hoy, 1))) return "Mañana";
  return fmtDia.format(desdeIsoLocal(inicio));
}

/** Saludo según la hora del día. */
export function saludoDelMomento(ahora: Date): string {
  const h = ahora.getHours();
  if (h < 6) return "Que tengas una buena noche";
  if (h < 13) return "Que tengas un excelente día";
  if (h < 20) return "Que tengas una linda tarde";
  return "Que tengas una buena noche";
}

/** Suma de lo realizado (cobrado o no) en una lista de turnos. */
export function sumaRealizada(turnos: Pick<Turno, "estado" | "monto">[]): number {
  return turnos.reduce((acc, t) => (t.estado === "realizado" ? acc + t.monto : acc), 0);
}

/**
 * Mismo tramo del mes anterior, para comparar ingresos de forma justa a mitad de mes:
 * del 1 al día de hoy (o al último día si el mes anterior es más corto). Fechas AAAA-MM-DD,
 * "hasta" excluido.
 */
export function tramoMesAnterior(hoy: Date): { desde: string; hasta: string } {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() - 1, Math.min(hoy.getDate(), ultimoDia) + 1);
  return { desde: aFechaIso(desde), hasta: aFechaIso(hasta) };
}
