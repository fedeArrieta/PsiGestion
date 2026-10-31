// Reglas de las copias de seguridad, sin acceso a archivos para poder probarlas.

export type TipoCopia = "auto" | "manual" | "previa";

export interface ArchivoCopia {
  nombre: string;
  ruta: string;
  bytes: number;
  /** Milisegundos desde 1970. */
  modificada: number;
  /** false para las copias hechas antes de activar el cifrado. */
  cifrada: boolean;
}

/** Cada cuánto se hace la copia automática. */
export const HORAS_ENTRE_COPIAS = 24;
/** A partir de cuántos días sin copia se muestra un aviso. */
export const DIAS_AVISO = 7;
export const CONSERVAR_POR_DEFECTO = 30;

const dos = (n: number) => String(n).padStart(2, "0");

/** psigestion-auto-2026-10-31_20-15-03.db */
export function nombreCopia(tipo: TipoCopia, d: Date): string {
  const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  const hora = `${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}`;
  return `psigestion-${tipo}-${fecha}_${hora}.db`;
}

const PATRON = /^psigestion-(auto|manual|previa)-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.db$/;

export function leerNombreCopia(nombre: string): { tipo: TipoCopia; fecha: Date } | null {
  const m = PATRON.exec(nombre);
  if (!m) return null;
  const [a, mes, d, h, min, s] = m.slice(2).map(Number);
  return { tipo: m[1] as TipoCopia, fecha: new Date(a, mes - 1, d, h, min, s) };
}

export const TEXTO_TIPO: Record<TipoCopia, string> = {
  auto: "Automática",
  manual: "Manual",
  previa: "Antes de restaurar",
};

/** Las copias automáticas que sobran, de las más viejas. Las manuales nunca se borran solas. */
export function copiasABorrar(copias: ArchivoCopia[], conservar: number): ArchivoCopia[] {
  const automaticas = copias
    .filter((c) => leerNombreCopia(c.nombre)?.tipo === "auto")
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
  return automaticas.slice(Math.max(1, conservar));
}

/** Hace falta si pasó el plazo o si todavía no hay ninguna copia cifrada (recién activado el cifrado). */
export function necesitaCopiaAutomatica(ultima: Date | null, ahora: Date, hayCopiaCifrada = true): boolean {
  return !ultima || !hayCopiaCifrada || ahora.getTime() - ultima.getTime() >= HORAS_ENTRE_COPIAS * 3600_000;
}

/** Días enteros desde la última copia, o null si nunca se hizo. */
export function diasSinCopia(ultima: Date | null, ahora: Date): number | null {
  return ultima ? Math.floor((ahora.getTime() - ultima.getTime()) / 86_400_000) : null;
}

export function copiaAtrasada(ultima: Date | null, ahora: Date): boolean {
  const dias = diasSinCopia(ultima, ahora);
  return dias === null || dias >= DIAS_AVISO;
}

export function tamanoTexto(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
