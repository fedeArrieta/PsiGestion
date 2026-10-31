import { desdeIsoLocal } from "../fechas";
import type { Turno } from "../tipos";

type Intervalo = Pick<Turno, "inicio" | "duracion_min">;

function rango(t: Intervalo): [number, number] {
  const ini = desdeIsoLocal(t.inicio).getTime();
  return [ini, ini + t.duracion_min * 60_000];
}

export function seSuperponen(a: Intervalo, b: Intervalo): boolean {
  const [ai, af] = rango(a);
  const [bi, bf] = rango(b);
  return ai < bf && bi < af;
}

/** Turnos activos (no cancelados) que se pisan con el turno dado, sin contarse a sí mismo. */
export function turnosSuperpuestos<T extends Turno>(
  turno: Intervalo & { id?: number },
  existentes: T[],
): T[] {
  return existentes.filter(
    (t) => t.id !== turno.id && t.estado !== "cancelado" && seSuperponen(turno, t),
  );
}

/**
 * Reparte los turnos de un mismo día en columnas para que los que se pisan
 * se muestren uno al lado del otro. Devuelve la columna de cada turno y
 * cuántas columnas tiene su grupo.
 */
export function distribuirEnColumnas<T extends Turno>(
  turnos: T[],
): { turno: T; columna: number; columnas: number }[] {
  const ordenados = [...turnos].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id);
  const resultado: { turno: T; columna: number; columnas: number }[] = [];
  let grupo: { turno: T; columna: number; columnas: number }[] = [];
  let finGrupo = -Infinity;
  let finColumnas: number[] = [];

  const cerrarGrupo = () => {
    const columnas = finColumnas.length;
    grupo.forEach((g) => (g.columnas = columnas));
    resultado.push(...grupo);
    grupo = [];
    finColumnas = [];
  };

  for (const turno of ordenados) {
    const [ini, fin] = rango(turno);
    if (ini >= finGrupo && grupo.length) cerrarGrupo();
    let columna = finColumnas.findIndex((f) => f <= ini);
    if (columna === -1) {
      columna = finColumnas.length;
      finColumnas.push(fin);
    } else {
      finColumnas[columna] = fin;
    }
    grupo.push({ turno, columna, columnas: 0 });
    finGrupo = Math.max(finGrupo, fin);
  }
  if (grupo.length) cerrarGrupo();
  return resultado;
}
