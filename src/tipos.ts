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
  /** Serie (turno recurrente) a la que pertenece, si hay. */
  serie_id: number | null;
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

/** Turno recurrente: el patrón con el que se generan los turnos. */
export interface Serie {
  id: number;
  paciente_id: number;
  /** AAAA-MM-DD: primera fecha; define el día de la semana. */
  desde: string;
  /** HH:MM */
  hora: string;
  duracion_min: number;
  frecuencia_semanas: number;
  /** AAAA-MM-DD inclusive; null = sin fin. */
  hasta: string | null;
  generada_hasta: string;
  notas: string | null;
}

/** Feriado o vacaciones: días en los que no se agendan turnos de las series. */
export interface NoLaborable {
  id: number;
  desde: string;
  hasta: string;
  descripcion: string;
  tipo: "feriado" | "vacaciones";
}

/** Una parte de la nota clínica (por ejemplo "Observaciones"). */
export interface SeccionNota {
  titulo: string;
  texto: string;
}

/** Nota clínica de una sesión, con la evolución del paciente. */
export interface NotaClinica {
  id: number;
  paciente_id: number;
  paciente_nombre: string;
  /** Sesión a la que corresponde, si hay. */
  turno_id: number | null;
  /** Inicio de esa sesión (AAAA-MM-DDTHH:MM), si el turno existe. */
  turno_inicio: string | null;
  /** AAAA-MM-DD */
  fecha: string;
  plantilla: string;
  secciones: SeccionNota[];
  creado_en: string;
  modificado_en: string;
}

/** Cómo estaba una nota antes de un cambio. */
export interface VersionNota {
  id: number;
  nota_id: number;
  fecha: string;
  plantilla: string;
  secciones: SeccionNota[];
  guardada_en: string;
}
