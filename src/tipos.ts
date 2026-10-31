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
