// Recibos de pago: numeración, montos en letras, conceptos y datos del profesional.
// Un recibo es un comprobante simple de que se cobró: no es una factura de ARCA.
// Lleva solo fechas, concepto e importes: nunca notas ni datos clínicos.

import type { Emisor, Turno } from "../tipos";

/** Claves de la tabla configuracion. */
export const CLAVES_EMISOR: Record<keyof Emisor, string> = {
  nombre: "recibo_nombre",
  titulo: "recibo_titulo",
  matricula: "recibo_matricula",
  cuit: "recibo_cuit",
  domicilio: "recibo_domicilio",
  telefono: "recibo_telefono",
  email: "recibo_email",
  leyenda: "recibo_leyenda",
};
export const CLAVE_CONCEPTO = "recibo_concepto";
export const CLAVE_PROXIMO_NUMERO = "recibo_proximo_numero";
export const CLAVE_CARPETA = "recibo_carpeta";
/** Nombre con el que saluda la app; se usa si el recibo no tiene uno propio. */
export const CLAVE_NOMBRE_PROFESIONAL = "nombre_profesional";

export const LEYENDA_POR_DEFECTO = "Documento no válido como factura.";
export const CONCEPTO_POR_DEFECTO = "Sesión de psicoterapia";

export const MEDIOS_PAGO = ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta de débito", "Tarjeta de crédito", "Otro"];

/** Datos del profesional guardados en configuración. */
export function leerEmisor(config: Record<string, string>): Emisor {
  const v = (k: keyof Emisor) => (config[CLAVES_EMISOR[k]] ?? "").trim();
  return {
    nombre: v("nombre") || (config[CLAVE_NOMBRE_PROFESIONAL] ?? "").trim(),
    titulo: v("titulo"),
    matricula: v("matricula"),
    cuit: v("cuit"),
    domicilio: v("domicilio"),
    telefono: v("telefono"),
    email: v("email"),
    leyenda: config[CLAVES_EMISOR.leyenda] === undefined ? LEYENDA_POR_DEFECTO : v("leyenda"),
  };
}

export function leerConcepto(config: Record<string, string>): string {
  return (config[CLAVE_CONCEPTO] ?? "").trim() || CONCEPTO_POR_DEFECTO;
}

/** 12 → "00000012" */
export const numeroRecibo = (n: number) => String(n).padStart(8, "0");

const fmtPesos2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 25000 → "$ 25.000,00" (siempre con centavos, como en un recibo). */
export const pesosConCentavos = (n: number) => fmtPesos2.format(n).replace(/\s/g, " ");

/** "2026-11-05" → "05/11/2026" */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIEZ_A_VEINTINUEVE = [
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** 0 a 999. Con "apocope", el uno final pasa a "un" (antes de "mil" o "millones"). */
function menorAMil(n: number, apocope: boolean): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto: string;
  if (r < 10) resto = UNIDADES[r];
  else if (r < 30) resto = DIEZ_A_VEINTINUEVE[r - 10];
  else resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : "");
  if (apocope) resto = resto.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
  return [CENTENAS[c], resto].filter(Boolean).join(" ");
}

/** 0 a 999.999 */
function menorAMillon(n: number, apocope: boolean): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMiles = miles === 0 ? "" : miles === 1 ? "mil" : `${menorAMil(miles, true)} mil`;
  return [parteMiles, menorAMil(resto, apocope)].filter(Boolean).join(" ");
}

/** Número entero en letras: 25000 → "veinticinco mil". */
export function enLetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "cero";
  if (n >= 1e12) return String(n);
  const millones = Math.floor(n / 1e6);
  const resto = n % 1e6;
  const parteMillones = millones === 0 ? "" : millones === 1 ? "un millón" : `${menorAMillon(millones, true)} millones`;
  return [parteMillones, menorAMillon(resto, false)].filter(Boolean).join(" ");
}

/** 25000.5 → "veinticinco mil con 50/100" */
export function montoEnLetras(pesos: number): string {
  const centavos = Math.round(Math.abs(pesos) * 100);
  const enteros = Math.floor(centavos / 100);
  return `${enLetras(enteros)} con ${String(centavos % 100).padStart(2, "0")}/100`;
}

/** Lo que se cobra por el turno (pesos), o 0 si no se cobra. Igual que importeTurno. */
function importe(t: Pick<Turno, "estado" | "monto" | "cargo">): number {
  if (t.estado === "realizado") return t.monto;
  if (t.estado === "ausente") return t.cargo ?? 0;
  return 0;
}

/** Concepto del renglón: la sesión, o la sesión no asistida si es una ausencia que se cobra. */
export function conceptoDeTurno(t: Pick<Turno, "estado">, base: string): string {
  return t.estado === "ausente" ? `${base} (ausencia)` : base;
}

/** Renglones del recibo a partir de los turnos pagados (en orden de fecha). */
export function itemsDeTurnos(turnos: Turno[], conceptoBase: string) {
  return [...turnos]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((t) => ({ turno_id: t.id, fecha: t.inicio.slice(0, 10), concepto: conceptoDeTurno(t, conceptoBase), importe: importe(t) }));
}

/** "Recibo 00000012 - Ana Pérez.pdf", sin caracteres que Windows no acepta en un nombre de archivo. */
export function nombreArchivo(numero: number, paciente: string, anulado = false): string {
  const limpio = paciente
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "");
  return `Recibo ${numeroRecibo(numero)}${limpio ? ` - ${limpio}` : ""}${anulado ? " (ANULADO)" : ""}.pdf`;
}

/** Qué datos del profesional faltan para emitir. Solo el nombre es obligatorio. */
export function faltaParaEmitir(e: Emisor): string | null {
  return e.nombre ? null : "Antes de emitir recibos completá tu nombre en Configuración → Recibos.";
}
