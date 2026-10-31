// Las fechas se guardan como texto en hora local ("AAAA-MM-DDTHH:MM"),
// así se pueden comparar y ordenar como strings sin problemas de zona horaria.

const dos = (n: number) => String(n).padStart(2, "0");

export function aIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function aFechaIso(d: Date): string {
  return aIsoLocal(d).slice(0, 10);
}

export function desdeIsoLocal(s: string): Date {
  const [fecha, hora = "00:00"] = s.split("T");
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, h, min);
}

export function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sumarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias, d.getHours(), d.getMinutes());
}

/** Lunes de la semana de la fecha dada, a las 00:00. */
export function inicioDeSemana(d: Date): Date {
  const dia = inicioDelDia(d);
  const desdeLunes = (dia.getDay() + 6) % 7;
  return sumarDias(dia, -desdeLunes);
}

export function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Minutos transcurridos desde la medianoche. */
export function minutosDelDia(iso: string): number {
  const d = desdeIsoLocal(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function horaTexto(iso: string): string {
  return iso.slice(11, 16);
}

const fmtDia = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric" });
const fmtDiaLargo = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtMes = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });

export const textoDia = (d: Date) => fmtDia.format(d);
export const textoDiaLargo = (d: Date) => fmtDiaLargo.format(d);

export function textoSemana(lunes: Date): string {
  const domingo = sumarDias(lunes, 6);
  return `${fmtMes.format(lunes)} al ${fmtMes.format(domingo)} de ${domingo.getFullYear()}`;
}
