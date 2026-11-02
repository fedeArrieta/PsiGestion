// Lógica pura de los turnos recurrentes (series) y de los feriados y vacaciones.
// Todas las fechas son texto AAAA-MM-DD en hora local.

import { aFechaIso, desdeIsoLocal, sumarDias } from "../fechas";

/** Hasta cuántas semanas adelante se generan los turnos de una serie. */
export const HORIZONTE_SEMANAS = 26;

export interface PatronSerie {
  /** Primera fecha del patrón: define el día de la semana y el arranque de la frecuencia. */
  desde: string;
  frecuencia_semanas: number;
  /** Última fecha posible (inclusive); null = sin fin. */
  hasta: string | null;
}

export interface Periodo {
  desde: string;
  hasta: string;
  descripcion: string;
}

const aFecha = (f: string) => desdeIsoLocal(`${f}T00:00`);

export function sumarDiasFecha(fecha: string, dias: number): string {
  return aFechaIso(sumarDias(aFecha(fecha), dias));
}

/** Diferencia en días entre dos fechas (b - a). */
function diasEntre(a: string, b: string): number {
  // Se redondea porque un cambio de horario puede correr la diferencia una hora.
  return Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);
}

/** Fecha límite de generación a partir de hoy. */
export function horizonte(hoy: string): string {
  return sumarDiasFecha(hoy, HORIZONTE_SEMANAS * 7);
}

/** Fechas del patrón dentro de [rangoDesde, rangoHasta], ambos inclusive. */
export function fechasDeSerie(patron: PatronSerie, rangoDesde: string, rangoHasta: string): string[] {
  const paso = 7 * Math.max(1, Math.floor(patron.frecuencia_semanas));
  const fin = patron.hasta && patron.hasta < rangoHasta ? patron.hasta : rangoHasta;
  let fecha = patron.desde;
  if (rangoDesde > fecha) {
    const saltos = Math.ceil(diasEntre(patron.desde, rangoDesde) / paso);
    fecha = sumarDiasFecha(patron.desde, saltos * paso);
  }
  const fechas: string[] = [];
  while (fecha <= fin) {
    fechas.push(fecha);
    fecha = sumarDiasFecha(fecha, paso);
  }
  return fechas;
}

/** El feriado o las vacaciones que caen en esa fecha, si hay. */
export function periodoDe<T extends Periodo>(fecha: string, periodos: T[]): T | undefined {
  return periodos.find((p) => p.desde <= fecha && fecha <= p.hasta);
}

/** Separa las fechas del patrón entre las que se agendan y las que caen en feriados o vacaciones. */
export function repartirFechas(fechas: string[], periodos: Periodo[]) {
  const agendar: string[] = [];
  const salteadas: { fecha: string; motivo: string }[] = [];
  for (const fecha of fechas) {
    const p = periodoDe(fecha, periodos);
    if (p) salteadas.push({ fecha, motivo: p.descripcion });
    else agendar.push(fecha);
  }
  return { agendar, salteadas };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** "Todos los martes a las 10:00", "Martes por medio a las 10:00", "Cada 3 semanas, los martes…". */
export function textoSerie(serie: { desde: string; hora: string; frecuencia_semanas: number }): string {
  const n = aFecha(serie.desde).getDay();
  const hora = `a las ${serie.hora}`;
  if (serie.frecuencia_semanas === 1) return `Todos los ${DIAS_PLURAL[n]} ${hora}`;
  if (serie.frecuencia_semanas === 2) return `${DIAS[n][0].toUpperCase()}${DIAS[n].slice(1)} por medio ${hora}`;
  return `Cada ${serie.frecuencia_semanas} semanas, los ${DIAS_PLURAL[n]} ${hora}`;
}

export const FRECUENCIAS = [
  { valor: 1, etiqueta: "Todas las semanas" },
  { valor: 2, etiqueta: "Cada 2 semanas" },
  { valor: 3, etiqueta: "Cada 3 semanas" },
  { valor: 4, etiqueta: "Cada 4 semanas" },
];

// ---------- Feriados nacionales de Argentina ----------

/** Domingo de Pascua (algoritmo de Gauss/Meeus para el calendario gregoriano). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Feriados trasladables (Ley 27.399): si caen martes o miércoles pasan al lunes
 * anterior; jueves o viernes, al lunes siguiente. El 17 de junio solo se mueve
 * si cae miércoles (al lunes anterior), jueves o viernes (al lunes siguiente).
 */
function trasladar(fecha: string, esGuemes = false): string {
  const dia = aFecha(fecha).getDay();
  if (dia === 2 && !esGuemes) return sumarDiasFecha(fecha, -1);
  if (dia === 3) return sumarDiasFecha(fecha, -2);
  if (dia === 4) return sumarDiasFecha(fecha, 4);
  if (dia === 5) return sumarDiasFecha(fecha, 3);
  return fecha;
}

/**
 * Feriados nacionales del año según la ley. No incluye los días no laborables
 * ni los "feriados puente", que se fijan por decreto cada año.
 */
export function feriadosNacionales(anio: number): Periodo[] {
  const f = (mes: number, dia: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const pascua = domingoDePascua(anio);
  const lista: [string, string][] = [
    [f(1, 1), "Año Nuevo"],
    [sumarDiasFecha(pascua, -48), "Carnaval"],
    [sumarDiasFecha(pascua, -47), "Carnaval"],
    [f(3, 24), "Día de la Memoria por la Verdad y la Justicia"],
    [f(4, 2), "Día del Veterano y de los Caídos en Malvinas"],
    [sumarDiasFecha(pascua, -2), "Viernes Santo"],
    [f(5, 1), "Día del Trabajador"],
    [f(5, 25), "Revolución de Mayo"],
    [trasladar(f(6, 17), true), "Paso a la Inmortalidad de Güemes"],
    [f(6, 20), "Paso a la Inmortalidad de Belgrano"],
    [f(7, 9), "Día de la Independencia"],
    [trasladar(f(8, 17)), "Paso a la Inmortalidad de San Martín"],
    [trasladar(f(10, 12)), "Día del Respeto a la Diversidad Cultural"],
    [trasladar(f(11, 20)), "Día de la Soberanía Nacional"],
    [f(12, 8), "Inmaculada Concepción de María"],
    [f(12, 25), "Navidad"],
  ];
  return lista
    .map(([fecha, descripcion]) => ({ desde: fecha, hasta: fecha, descripcion }))
    .sort((a, b) => a.desde.localeCompare(b.desde));
}
