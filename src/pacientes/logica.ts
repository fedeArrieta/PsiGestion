import { desdeIsoLocal } from "../fechas";
import type { Turno } from "../tipos";

/**
 * Turnos de la ficha: primero los que vienen, del más próximo al más lejano
 * (incluye el que está en curso), y después los anteriores, del más reciente al más viejo.
 */
export function ordenarTurnosFicha<T extends Pick<Turno, "id" | "inicio" | "duracion_min">>(
  turnos: T[],
  ahora: Date,
): { proximos: T[]; anteriores: T[] } {
  const fin = (t: T) => desdeIsoLocal(t.inicio).getTime() + t.duracion_min * 60_000;
  const proximos = turnos.filter((t) => fin(t) > ahora.getTime());
  const anteriores = turnos.filter((t) => fin(t) <= ahora.getTime());
  proximos.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id);
  anteriores.sort((a, b) => b.inicio.localeCompare(a.inicio) || b.id - a.id);
  return { proximos, anteriores };
}
