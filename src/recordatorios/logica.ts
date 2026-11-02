// Lógica pura de los recordatorios de turnos (sin Tauri, para poder probarla).
//
// El mensaje se arma con una plantilla que solo admite datos del turno (nombre del
// paciente, día y hora) y el nombre del profesional: nunca notas ni datos clínicos.

import { desdeIsoLocal, horaTexto, inicioDelDia, mismoDia, sumarDias } from "../fechas";

export const CLAVE_MENSAJE = "recordatorio_mensaje";
export const CLAVE_ASUNTO = "recordatorio_asunto";

export const MENSAJE_POR_DEFECTO =
  "Hola {nombre}, te recuerdo tu turno {dia} a las {hora} hs. Si no podés venir, por favor avisame. Saludos, {profesional}";
export const ASUNTO_POR_DEFECTO = "Recordatorio de turno: {fecha} a las {hora} hs";

/** Datos que se pueden usar en el mensaje. */
export const VARIABLES: { clave: string; descripcion: string }[] = [
  { clave: "nombre", descripcion: "Primer nombre del paciente" },
  { clave: "dia", descripcion: "\"mañana, martes 3 de noviembre\"" },
  { clave: "fecha", descripcion: "\"martes 3 de noviembre\"" },
  { clave: "hora", descripcion: "Hora del turno, ej. 15:00" },
  { clave: "profesional", descripcion: "Tu nombre, como en Inicio" },
];

export interface PlantillaRecordatorio {
  mensaje: string;
  asunto: string;
}

export interface TurnoParaRecordatorio {
  id: number;
  paciente_id: number;
  inicio: string;
  duracion_min: number;
  /** Cuándo se envió el recordatorio (AAAA-MM-DDTHH:MM); null = no se envió. */
  recordatorio_en: string | null;
  paciente_nombre: string;
  telefono: string | null;
  email: string | null;
}

export function leerPlantilla(config: Record<string, string>): PlantillaRecordatorio {
  return {
    mensaje: config[CLAVE_MENSAJE]?.trim() || MENSAJE_POR_DEFECTO,
    asunto: config[CLAVE_ASUNTO]?.trim() || ASUNTO_POR_DEFECTO,
  };
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });

/** "martes 3 de noviembre" */
export const textoFecha = (d: Date) => fmtFecha.format(d).replace(",", "");

/** "hoy, martes 3…", "mañana, martes 3…" o "el martes 3…", según el día de hoy. */
export function textoDia(turno: Date, hoy: Date): string {
  const fecha = textoFecha(turno);
  if (mismoDia(turno, hoy)) return `hoy, ${fecha}`;
  if (mismoDia(turno, sumarDias(inicioDelDia(hoy), 1))) return `mañana, ${fecha}`;
  return `el ${fecha}`;
}

export interface DatosMensaje {
  pacienteNombre: string;
  /** AAAA-MM-DDTHH:MM */
  inicio: string;
  profesional: string;
  hoy: Date;
}

/** Reemplaza {nombre}, {dia}, {fecha}, {hora} y {profesional}. Las variables desconocidas quedan como están. */
export function completarPlantilla(plantilla: string, d: DatosMensaje): string {
  const turno = desdeIsoLocal(d.inicio);
  const valores: Record<string, string> = {
    nombre: primerNombre(d.pacienteNombre),
    dia: textoDia(turno, d.hoy),
    fecha: textoFecha(turno),
    hora: horaTexto(d.inicio),
    profesional: d.profesional.trim(),
  };
  return (
    plantilla
      .replace(/\{(\w+)\}/g, (todo, clave: string) => valores[clave.toLowerCase()] ?? todo)
      // Si falta el nombre del profesional no queda "Saludos, " colgando.
      .replace(/[ \t]+$/gm, "")
      .replace(/[,;:]+$/, "")
      .trim()
  );
}

/**
 * Teléfono en el formato que pide WhatsApp (código de país y número, solo dígitos).
 * Los números argentinos se pasan a celular internacional: 54 9 + característica + número,
 * sin el 0 ni el 15. Los que empiezan con + u 00 se toman como internacionales.
 * Devuelve null si no alcanza para armar un número (por ejemplo, falta la característica).
 */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const limpio = telefono.trim();
  let digitos = limpio.replace(/\D/g, "");
  const internacional = limpio.startsWith("+") || digitos.startsWith("00");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (internacional || (digitos.startsWith("54") && digitos.length >= 12)) {
    if (!digitos.startsWith("54")) return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
    let nacional = digitos.slice(2);
    if (nacional.startsWith("9")) nacional = nacional.slice(1);
    return celularArgentino(sinCeroNiQuince(nacional));
  }
  return celularArgentino(sinCeroNiQuince(digitos));
}

/** Las características argentinas empiezan con 11, 2 o 3; con 10 dígitos en total. */
function celularArgentino(nacional: string): string | null {
  return /^(11|2|3)\d+$/.test(nacional) && nacional.length === 10 ? `549${nacional}` : null;
}

/** Saca el 0 de la característica y el 15 del celular (ej. 011 15 1234-5678 → 1112345678). */
function sinCeroNiQuince(numero: string): string {
  let n = numero.startsWith("0") ? numero.slice(1) : numero;
  if (n.length === 12) {
    // La característica tiene 2, 3 o 4 dígitos; el 15 va justo después.
    for (const largo of [2, 3, 4]) {
      if (n.slice(largo, largo + 2) === "15") {
        n = n.slice(0, largo) + n.slice(largo + 2);
        break;
      }
    }
  }
  return n;
}

export function emailValido(email: string | null | undefined): boolean {
  return !!email && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(email.trim());
}

export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
}

export function enlaceMail(email: string, asunto: string, mensaje: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
}
