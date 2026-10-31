import type { DatosExportacion } from "../repositorio";
import { ESTADOS_TURNO } from "../tipos";

export type TipoColumna = "texto" | "numero" | "pesos";

export interface HojaExcel {
  nombre: string;
  columnas: { titulo: string; tipo?: TipoColumna; ancho?: number }[];
  filas: (string | number | null)[][];
}

const etiquetaEstado = Object.fromEntries(ESTADOS_TURNO.map((e) => [e.valor, e.etiqueta]));
const siNo = (v: number) => (v ? "Sí" : "No");
/** "2026-10-31T09:00" → "31/10/2026 09:00" */
const fechaHora = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
/** "2026-10" → "10/2026" */
const mesTexto = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

/** Arma las hojas del Excel: pacientes, turnos y gastos. */
export function hojasExportacion(datos: DatosExportacion): HojaExcel[] {
  return [
    {
      nombre: "Pacientes",
      columnas: [
        { titulo: "Nombre", ancho: 28 },
        { titulo: "Teléfono" },
        { titulo: "Email", ancho: 26 },
        { titulo: "Monto por sesión", tipo: "pesos" },
        { titulo: "Activo", ancho: 8 },
        { titulo: "Notas", ancho: 40 },
      ],
      filas: datos.pacientes.map((p) => [p.nombre, p.telefono, p.email, p.monto_sesion, siNo(p.activo), p.notas]),
    },
    {
      nombre: "Turnos",
      columnas: [
        { titulo: "Fecha y hora", ancho: 18 },
        { titulo: "Paciente", ancho: 28 },
        { titulo: "Duración (min)", tipo: "numero" },
        { titulo: "Estado", ancho: 12 },
        { titulo: "Monto", tipo: "pesos" },
        { titulo: "Pagado", ancho: 8 },
        { titulo: "Notas", ancho: 40 },
      ],
      filas: datos.turnos.map((t) => [
        fechaHora(t.inicio),
        t.paciente_nombre,
        t.duracion_min,
        etiquetaEstado[t.estado] ?? t.estado,
        t.monto,
        siNo(t.pagado),
        t.notas,
      ]),
    },
    {
      nombre: "Gastos",
      columnas: [
        { titulo: "Mes", ancho: 10 },
        { titulo: "Descripción", ancho: 32 },
        { titulo: "Monto", tipo: "pesos" },
        { titulo: "Fijo", ancho: 8 },
      ],
      filas: datos.gastos.map((g) => [mesTexto(g.mes), g.descripcion, g.monto, siNo(g.fijo)]),
    },
  ];
}

/** Nombre sugerido del archivo. */
export function nombreArchivo(mes: string | null, hoy: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return mes
    ? `PsiGestion ${mes}.xlsx`
    : `PsiGestion completo ${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}.xlsx`;
}
