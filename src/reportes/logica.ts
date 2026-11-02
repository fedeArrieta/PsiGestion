// Cálculos de los reportes: todo sale de los datos mes a mes (src/repositorio.ts → datosReporte).
// No se usan notas ni datos clínicos.

import type { DatosMesReporte, DatosReporte } from "../repositorio";
import type { HojaExcel } from "../exportar/logica";
import { fechaCorta, numeroRecibo } from "../recibos/logica";
import { mesDe, sumarMeses } from "../finanzas/calculo";

export interface Periodo {
  /** AAAA-MM */
  desde: string;
  hasta: string;
  titulo: string;
}

/** Mes con los valores derivados que se grafican. */
export interface MesReporte extends DatosMesReporte {
  /** Sesiones realizadas + ausencias cobradas. */
  ingresos: number;
  /** Ingresos menos gastos: la ganancia neta del mes. */
  resultado: number;
  /** Ganado y todavía no cobrado. */
  pendiente: number;
  objetivo: number | null;
  /** null si el mes no tiene objetivo o todavía está en curso. */
  cumplido: boolean | null;
  /** Ausencias sobre turnos a los que se esperaba al paciente (realizados + ausencias). null si no hubo. */
  tasa_ausencias: number | null;
  en_curso: boolean;
}

export interface TotalesReporte {
  ingresos: number;
  ingresos_ausencias: number;
  cobrado: number;
  gastos: number;
  resultado: number;
  sesiones_realizadas: number;
  ausencias: number;
  ausencias_sin_aviso: number;
  cancelados: number;
  tasa_ausencias: number | null;
  pacientes_periodo: number;
  pacientes_nuevos: number;
  /** Promedio de pacientes activos por mes (sin contar meses vacíos al inicio). */
  promedio_pacientes: number;
  meses_con_objetivo: number;
  meses_cumplidos: number;
  recibos: number;
  recibos_cantidad: number;
}

/** Suma exacta de pesos (los montos tienen a lo sumo dos decimales). */
const sumar = (valores: number[]) => valores.reduce((a, v) => a + Math.round(v * 100), 0) / 100;

const tasa = (ausencias: number, realizadas: number) => (ausencias + realizadas > 0 ? ausencias / (ausencias + realizadas) : null);

/** Los períodos que se ofrecen: últimos 12 meses y cada año con datos (más el actual). */
export function periodosDisponibles(hoy: Date, primerMes: string | null): Periodo[] {
  const actual = mesDe(hoy);
  const r: Periodo[] = [{ desde: sumarMeses(actual, -11), hasta: actual, titulo: "Últimos 12 meses" }];
  const anioActual = hoy.getFullYear();
  const primero = primerMes ? Math.min(Number(primerMes.slice(0, 4)), anioActual) : anioActual;
  for (let a = anioActual; a >= primero; a--) {
    r.push({ desde: `${a}-01`, hasta: a === anioActual ? actual : `${a}-12`, titulo: `Año ${a}` });
  }
  return r;
}

export function mesesDelReporte(d: DatosReporte, hoy: Date): MesReporte[] {
  const actual = mesDe(hoy);
  return d.meses.map((m) => {
    const ingresos = sumar([m.ingresos_sesiones, m.ingresos_ausencias]);
    const resultado = sumar([ingresos, -m.gastos]);
    const objetivo = d.objetivos[m.mes] ?? null;
    const en_curso = m.mes === actual;
    return {
      ...m,
      ingresos,
      resultado,
      pendiente: Math.max(0, sumar([ingresos, -m.cobrado])),
      objetivo,
      cumplido: objetivo == null || objetivo <= 0 || en_curso ? null : resultado >= objetivo,
      tasa_ausencias: tasa(m.ausencias, m.sesiones_realizadas),
      en_curso,
    };
  });
}

export function totalesDelReporte(meses: MesReporte[], d: DatosReporte): TotalesReporte {
  const s = (c: keyof MesReporte) => sumar(meses.map((m) => Number(m[c] ?? 0)));
  const ausencias = s("ausencias");
  const realizadas = s("sesiones_realizadas");
  // Para el promedio de pacientes se saltean los meses del principio sin actividad (la app recién empezaba).
  const primero = meses.findIndex((m) => m.sesiones_realizadas > 0 || m.ausencias > 0);
  const conActividad = primero < 0 ? [] : meses.slice(primero);
  const conObjetivo = meses.filter((m) => m.cumplido !== null);
  return {
    ingresos: s("ingresos"),
    ingresos_ausencias: s("ingresos_ausencias"),
    cobrado: s("cobrado"),
    gastos: s("gastos"),
    resultado: s("resultado"),
    sesiones_realizadas: realizadas,
    ausencias,
    ausencias_sin_aviso: s("ausencias_sin_aviso"),
    cancelados: s("cancelados"),
    tasa_ausencias: tasa(ausencias, realizadas),
    pacientes_periodo: d.pacientes_periodo,
    pacientes_nuevos: s("pacientes_nuevos"),
    promedio_pacientes: conActividad.length
      ? Math.round((conActividad.reduce((a, m) => a + m.pacientes_activos, 0) / conActividad.length) * 10) / 10
      : 0,
    meses_con_objetivo: conObjetivo.length,
    meses_cumplidos: conObjetivo.filter((m) => m.cumplido).length,
    recibos: s("recibos"),
    recibos_cantidad: s("recibos_cantidad"),
  };
}

const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-03" → "mar" (o "mar 26" si se pide el año). */
export function mesCorto(mes: string, conAnio = false): string {
  const n = NOMBRES_MES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return conAnio ? `${n} ${mes.slice(2, 4)}` : n;
}

/** Etiquetas del eje: el año va solo en el primer mes y en cada enero, si el período cruza años. */
export function etiquetasEje(meses: string[]): string[] {
  const cruza = new Set(meses.map((m) => m.slice(0, 4))).size > 1;
  return meses.map((m, i) => mesCorto(m, cruza && (i === 0 || m.endsWith("-01"))));
}

/** "2026-03" → "03/2026" */
export const mesNumerico = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export const porcentaje = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`.replace(".", ","));

/** Hojas del Excel para el contador: resumen mensual, gastos y recibos del período. Sin datos clínicos. */
export function hojasReporte(periodo: Periodo, meses: MesReporte[], totales: TotalesReporte, d: DatosReporte): HojaExcel[] {
  const filaMes = (m: MesReporte) => [
    mesNumerico(m.mes) + (m.en_curso ? " (en curso)" : ""),
    m.sesiones_realizadas,
    m.ingresos_sesiones,
    m.ingresos_ausencias,
    m.ingresos,
    m.cobrado,
    m.pendiente,
    m.gastos,
    m.resultado,
    m.objetivo,
    m.cumplido == null ? null : m.cumplido ? "Sí" : "No",
    m.recibos,
    m.ausencias,
    m.ausencias_sin_aviso,
    m.tasa_ausencias,
    m.cancelados,
    m.pacientes_activos,
    m.pacientes_nuevos,
  ];
  return [
    {
      nombre: "Resumen mensual",
      columnas: [
        { titulo: "Mes", ancho: 18 },
        { titulo: "Sesiones realizadas", tipo: "numero" },
        { titulo: "Ingresos por sesiones", tipo: "pesos", ancho: 20 },
        { titulo: "Cobro por ausencias", tipo: "pesos", ancho: 20 },
        { titulo: "Ingresos totales", tipo: "pesos", ancho: 18 },
        { titulo: "Cobrado", tipo: "pesos" },
        { titulo: "Pendiente de cobro", tipo: "pesos", ancho: 18 },
        { titulo: "Gastos", tipo: "pesos" },
        { titulo: "Ganancia neta", tipo: "pesos" },
        { titulo: "Objetivo", tipo: "pesos" },
        { titulo: "Objetivo cumplido", ancho: 12 },
        { titulo: "Recibos emitidos", tipo: "pesos", ancho: 18 },
        { titulo: "Ausencias", tipo: "numero" },
        { titulo: "Ausencias sin aviso", tipo: "numero" },
        { titulo: "Tasa de ausencias", tipo: "porcentaje" },
        { titulo: "Cancelados", tipo: "numero" },
        { titulo: "Pacientes activos", tipo: "numero" },
        { titulo: "Pacientes nuevos", tipo: "numero" },
      ],
      filas: [
        ...meses.map(filaMes),
        [
          `Total ${periodo.titulo.toLowerCase()}`,
          totales.sesiones_realizadas,
          sumar(meses.map((m) => m.ingresos_sesiones)),
          totales.ingresos_ausencias,
          totales.ingresos,
          totales.cobrado,
          sumar(meses.map((m) => m.pendiente)),
          totales.gastos,
          totales.resultado,
          null,
          totales.meses_con_objetivo ? `${totales.meses_cumplidos} de ${totales.meses_con_objetivo}` : null,
          totales.recibos,
          totales.ausencias,
          totales.ausencias_sin_aviso,
          totales.tasa_ausencias,
          totales.cancelados,
          totales.pacientes_periodo,
          totales.pacientes_nuevos,
        ],
      ],
    },
    {
      nombre: "Gastos",
      columnas: [
        { titulo: "Mes", ancho: 10 },
        { titulo: "Descripción", ancho: 32 },
        { titulo: "Monto", tipo: "pesos" },
        { titulo: "Fijo", ancho: 8 },
      ],
      filas: d.gastos.map((g) => [mesNumerico(g.mes), g.descripcion, g.monto, g.fijo ? "Sí" : "No"]),
    },
    {
      nombre: "Recibos",
      columnas: [
        { titulo: "Número", ancho: 12 },
        { titulo: "Fecha", ancho: 12 },
        { titulo: "Paciente", ancho: 28 },
        { titulo: "DNI / CUIT", ancho: 16 },
        { titulo: "Forma de pago", ancho: 18 },
        { titulo: "Total", tipo: "pesos" },
        { titulo: "Estado", ancho: 30 },
      ],
      filas: d.recibos.map((r) => [
        numeroRecibo(r.numero),
        fechaCorta(r.fecha),
        r.paciente_nombre,
        r.paciente_documento,
        r.medio_pago,
        r.total,
        r.anulado_en ? `Anulado el ${fechaCorta(r.anulado_en)}` : "Vigente",
      ]),
    },
  ];
}

/** "PsiGestion reporte 2026-01 a 2026-10.pdf" */
export function nombreArchivoReporte(periodo: Periodo, extension: "pdf" | "xlsx"): string {
  const rango = periodo.desde === periodo.hasta ? periodo.desde : `${periodo.desde} a ${periodo.hasta}`;
  return `PsiGestion reporte ${rango}.${extension}`;
}

/** Escala "linda" para el eje: máximo redondeado y marcas intermedias. */
export function escalaEje(maximo: number, minimo = 0, marcas = 4): { min: number; max: number; pasos: number[] } {
  const rango = maximo - Math.min(minimo, 0) || 1;
  const bruto = rango / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = ([1, 2, 2.5, 5, 10].find((f) => f * potencia >= bruto) ?? 10) * potencia;
  const min = minimo < 0 ? -Math.ceil(-minimo / paso) * paso : 0;
  const max = Math.max(Math.ceil(maximo / paso) * paso, paso);
  const pasos: number[] = [];
  for (let v = min; v <= max + paso / 2; v += paso) pasos.push(Math.round(v * 100) / 100);
  return { min, max, pasos };
}

/** Montos abreviados para los ejes: 1.250.000 → "$1,3 M", 85.000 → "$85 mil". */
export function pesosCorto(n: number): string {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const fmt = (v: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v);
  if (a >= 1_000_000) return `${s}$${fmt(a / 1_000_000)} M`;
  if (a >= 1_000) return `${s}$${fmt(a / 1_000)} mil`;
  return `${s}$${fmt(a)}`;
}
