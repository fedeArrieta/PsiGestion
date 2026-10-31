export type EstadoTurno = "programado" | "realizado" | "cancelado" | "ausente";

export const ESTADOS_TURNO: { valor: EstadoTurno; etiqueta: string }[] = [
  { valor: "programado", etiqueta: "Programado" },
  { valor: "realizado", etiqueta: "Realizado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
  { valor: "ausente", etiqueta: "Ausente" },
];

export interface Paciente {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  monto_sesion: number;
  notas: string | null;
  activo: number;
}

export interface PacienteConResumen extends Paciente {
  sesiones_realizadas: number;
  saldo_pendiente: number;
  ultima_sesion: string | null;
}

export interface Turno {
  id: number;
  paciente_id: number;
  /** Fecha y hora local: AAAA-MM-DDTHH:MM */
  inicio: string;
  duracion_min: number;
  estado: EstadoTurno;
  monto: number;
  pagado: number;
  notas: string | null;
}

export interface TurnoConPaciente extends Turno {
  paciente_nombre: string;
}

export interface Gasto {
  id: number;
  /** AAAA-MM */
  mes: string;
  descripcion: string;
  monto: number;
  fijo: number;
}

/** Números del mes que salen de la agenda y los gastos. */
export interface ResumenMes {
  /** Suma de sesiones realizadas (lo ganado, cobrado o no). */
  facturado: number;
  /** Parte de lo facturado que ya se cobró. */
  cobrado: number;
  sesiones_realizadas: number;
  /** Suma de turnos programados que todavía no ocurrieron o no se marcaron. */
  programado: number;
  sesiones_programadas: number;
  gastos: number;
  /** Valor promedio de una sesión, para estimar cuántas faltan. 0 si no hay datos. */
  precio_promedio: number;
}
