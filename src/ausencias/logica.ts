import type { AvisoAusencia, EstadoTurno, Turno } from "../tipos";

/**
 * Política de cobro de las ausencias: qué porcentaje del valor de la sesión se
 * propone cobrar cuando el paciente falta. Es solo la sugerencia inicial: en
 * cada turno se puede decidir cobrar o no, y cuánto.
 */
export interface PoliticaAusencias {
  /** 0 a 100. */
  sinAvisoPct: number;
  /** 0 a 100. */
  conAvisoPct: number;
}

export const POLITICA_POR_DEFECTO: PoliticaAusencias = { sinAvisoPct: 100, conAvisoPct: 0 };

export const CLAVE_SIN_AVISO = "ausencia_sin_aviso_pct";
export const CLAVE_CON_AVISO = "ausencia_con_aviso_pct";

function porcentaje(valor: string | undefined, porDefecto: number): number {
  if (valor === undefined || valor.trim() === "") return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : porDefecto;
}

/** Lee la política desde la configuración guardada (claves → valores). */
export function leerPolitica(config: Record<string, string>): PoliticaAusencias {
  return {
    sinAvisoPct: porcentaje(config[CLAVE_SIN_AVISO], POLITICA_POR_DEFECTO.sinAvisoPct),
    conAvisoPct: porcentaje(config[CLAVE_CON_AVISO], POLITICA_POR_DEFECTO.conAvisoPct),
  };
}

/** Lo que se propone cobrar por una ausencia, en pesos. null = no se cobra. */
export function cargoSugerido(monto: number, aviso: AvisoAusencia, p: PoliticaAusencias): number | null {
  const pct = aviso === "sin_aviso" ? p.sinAvisoPct : p.conAvisoPct;
  if (!(pct > 0) || !(monto > 0)) return null;
  return Math.round(monto * pct) / 100;
}

/**
 * Lo que el paciente debe por este turno, en pesos: la sesión realizada, o el
 * cargo de una ausencia que se decidió cobrar. Programados y cancelados: 0.
 */
export function importeTurno(t: Pick<Turno, "estado" | "monto" | "cargo">): number {
  if (t.estado === "realizado") return t.monto;
  if (t.estado === "ausente") return t.cargo ?? 0;
  return 0;
}

/** Si el turno genera algo para cobrar (y por lo tanto tiene sentido marcarlo pagado). */
export const seCobra = (t: Pick<Turno, "estado" | "monto" | "cargo">) =>
  t.estado === "realizado" || (t.estado === "ausente" && t.cargo != null);

/**
 * Si el horario queda libre para otro paciente: turnos cancelados y ausencias
 * avisadas (el paciente avisó que no venía). Una ausencia sin aviso ocupó el horario.
 */
export const liberaHorario = (t: Pick<Turno, "estado" | "aviso">) =>
  t.estado === "cancelado" || (t.estado === "ausente" && t.aviso === "con_aviso");

/** Opciones del selector de estado: las ausencias se separan según el aviso. */
export type OpcionEstado = "programado" | "realizado" | "ausente_con_aviso" | "ausente_sin_aviso" | "cancelado";

export const OPCIONES_ESTADO: { valor: OpcionEstado; etiqueta: string }[] = [
  { valor: "programado", etiqueta: "Programado" },
  { valor: "realizado", etiqueta: "Realizado" },
  { valor: "ausente_con_aviso", etiqueta: "Ausente con aviso" },
  { valor: "ausente_sin_aviso", etiqueta: "Ausente sin aviso" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

export function opcionDe(t: Pick<Turno, "estado" | "aviso">): OpcionEstado {
  if (t.estado === "ausente") return t.aviso === "con_aviso" ? "ausente_con_aviso" : "ausente_sin_aviso";
  return t.estado;
}

export function desdeOpcion(o: OpcionEstado): { estado: EstadoTurno; aviso: AvisoAusencia | null } {
  if (o === "ausente_con_aviso") return { estado: "ausente", aviso: "con_aviso" };
  if (o === "ausente_sin_aviso") return { estado: "ausente", aviso: "sin_aviso" };
  return { estado: o, aviso: null };
}

const ETIQUETAS: Record<OpcionEstado, string> = Object.fromEntries(
  OPCIONES_ESTADO.map((o) => [o.valor, o.etiqueta]),
) as Record<OpcionEstado, string>;

/** "Realizado", "Ausente sin aviso", "Cancelado"… */
export const etiquetaEstado = (t: Pick<Turno, "estado" | "aviso">) => ETIQUETAS[opcionDe(t)];
