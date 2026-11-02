// Reporte en PDF para el contador, armado con pdf-lib (sin servicios externos).
// Lleva solo números del período: nunca notas ni datos clínicos.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Emisor } from "../tipos";
import { pesos } from "../formato";
import { cortarEnRenglones, textoImprimible } from "../recibos/pdf";
import { escalaEje, etiquetasEje, mesNumerico, pesosCorto, porcentaje, type MesReporte, type Periodo, type TotalesReporte } from "./logica";

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const SALVIA = hex("#527c70");
const GRAFITO = hex("#252b2a");
const GRIS = rgb(0.42, 0.46, 0.45);
const LINEA = rgb(0.86, 0.88, 0.87);
const ARENA = hex("#e8e4d9");
// Colores de las series (validados para daltonismo; ver src/App.css, --serie-*).
const INGRESOS = hex("#008471");
const GASTOS = hex("#c47a3f");
const OBJETIVO = hex("#252b2a");

const ANCHO = 841.89; // A4 apaisado
const ALTO = 595.28;
const MARGEN = 40;

interface Fuentes {
  normal: PDFFont;
  negrita: PDFFont;
}

export interface DatosPdfReporte {
  periodo: Periodo;
  meses: MesReporte[];
  totales: TotalesReporte;
  emisor: Emisor;
  generado: Date;
}

function texto(p: PDFPage, s: string, x: number, y: number, tam: number, f: PDFFont, color = GRAFITO) {
  p.drawText(textoImprimible(s), { x, y, size: tam, font: f, color });
}

function textoDerecha(p: PDFPage, s: string, x: number, y: number, tam: number, f: PDFFont, color = GRAFITO) {
  const t = textoImprimible(s);
  p.drawText(t, { x: x - f.widthOfTextAtSize(t, tam), y, size: tam, font: f, color });
}

function textoCentro(p: PDFPage, s: string, x: number, y: number, tam: number, f: PDFFont, color = GRAFITO) {
  const t = textoImprimible(s);
  p.drawText(t, { x: x - f.widthOfTextAtSize(t, tam) / 2, y, size: tam, font: f, color });
}

const dos = (n: number) => String(n).padStart(2, "0");
const fechaHoy = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;

function encabezado(p: PDFPage, d: DatosPdfReporte, f: Fuentes): number {
  p.drawRectangle({ x: 0, y: ALTO - 6, width: ANCHO, height: 6, color: SALVIA });
  let y = ALTO - MARGEN;
  texto(p, "Reporte de ingresos y gastos", MARGEN, y, 18, f.negrita);
  textoDerecha(p, d.periodo.titulo, ANCHO - MARGEN, y, 13, f.negrita, SALVIA);
  y -= 16;
  const e = d.emisor;
  const quien = [e.nombre, e.matricula && `Matrícula ${e.matricula}`, e.cuit && `CUIT ${e.cuit}`].filter(Boolean).join(" · ");
  texto(p, quien || "PsiGestion", MARGEN, y, 9.5, f.normal, GRIS);
  textoDerecha(
    p,
    `${mesNumerico(d.periodo.desde)} a ${mesNumerico(d.periodo.hasta)} · generado el ${fechaHoy(d.generado)}`,
    ANCHO - MARGEN,
    y,
    9.5,
    f.normal,
    GRIS,
  );
  y -= 10;
  p.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.8, color: SALVIA });
  return y - 18;
}

function indicadores(p: PDFPage, y: number, t: TotalesReporte, f: Fuentes): number {
  const items: [string, string, string][] = [
    ["Ingresos", pesos(t.ingresos), `${t.sesiones_realizadas} sesiones realizadas`],
    ["Gastos", pesos(t.gastos), "Del período"],
    ["Ganancia neta", pesos(t.resultado), "Ingresos menos gastos"],
    ["Cobrado", pesos(t.cobrado), t.ingresos > t.cobrado ? `Falta cobrar ${pesos(t.ingresos - t.cobrado)}` : "Todo cobrado"],
    ["Ausencias", porcentaje(t.tasa_ausencias), `${t.ausencias} ausencias (${t.ausencias_sin_aviso} sin aviso)`],
    ["Pacientes", String(t.pacientes_periodo), `${t.pacientes_nuevos} nuevos en el período`],
  ];
  const gap = 8;
  const ancho = (ANCHO - 2 * MARGEN - gap * (items.length - 1)) / items.length;
  const alto = 52;
  items.forEach(([titulo, valor, detalle], i) => {
    const x = MARGEN + i * (ancho + gap);
    p.drawRectangle({ x, y: y - alto, width: ancho, height: alto, color: hex("#f7f5f0"), borderColor: LINEA, borderWidth: 0.6 });
    texto(p, titulo, x + 8, y - 14, 8.5, f.normal, GRIS);
    texto(p, valor, x + 8, y - 31, 13, f.negrita);
    texto(p, detalle.length > 34 ? `${detalle.slice(0, 33)}…` : detalle, x + 8, y - 44, 7.5, f.normal, GRIS);
  });
  return y - alto - 22;
}

interface Caja {
  x: number;
  y: number; // borde inferior
  ancho: number;
  alto: number;
}

/** Ejes y grilla; devuelve la función que pasa un valor a la coordenada Y. */
function ejes(p: PDFPage, c: Caja, min: number, max: number, pasos: number[], f: Fuentes) {
  const aY = (v: number) => c.y + ((v - min) / (max - min)) * c.alto;
  for (const v of pasos) {
    const y = aY(v);
    p.drawLine({ start: { x: c.x, y }, end: { x: c.x + c.ancho, y }, thickness: v === 0 ? 0.8 : 0.4, color: v === 0 ? GRIS : LINEA });
    textoDerecha(p, pesosCorto(v), c.x - 4, y - 2.5, 7, f.normal, GRIS);
  }
  return aY;
}

function etiquetasMeses(p: PDFPage, c: Caja, meses: MesReporte[], f: Fuentes) {
  const banda = c.ancho / meses.length;
  etiquetasEje(meses.map((m) => m.mes)).forEach((e, i) => textoCentro(p, e, c.x + banda * (i + 0.5), c.y - 12, 7, f.normal, GRIS));
}

function leyenda(p: PDFPage, x: number, y: number, items: [string, ReturnType<typeof rgb>, "barra" | "linea"][], f: Fuentes) {
  for (const [nombre, color, forma] of items) {
    if (forma === "barra") p.drawRectangle({ x, y: y - 1, width: 8, height: 8, color });
    else p.drawLine({ start: { x, y: y + 3 }, end: { x: x + 12, y: y + 3 }, thickness: 1.5, color, dashArray: [3, 2] });
    texto(p, nombre, x + 14, y, 8, f.normal);
    x += 22 + f.normal.widthOfTextAtSize(nombre, 8);
  }
}

function graficoIngresosGastos(p: PDFPage, c: Caja, meses: MesReporte[], f: Fuentes) {
  texto(p, "Ingresos y gastos por mes", c.x - 34, c.y + c.alto + 30, 11, f.negrita);
  leyenda(p, c.x - 34, c.y + c.alto + 14, [["Ingresos", INGRESOS, "barra"], ["Gastos", GASTOS, "barra"]], f);
  const maximo = Math.max(1, ...meses.flatMap((m) => [m.ingresos, m.gastos]));
  const { min, max, pasos } = escalaEje(maximo);
  const aY = ejes(p, c, min, max, pasos, f);
  const banda = c.ancho / meses.length;
  const barra = Math.min(14, (banda - 6) / 2);
  meses.forEach((m, i) => {
    const centro = c.x + banda * (i + 0.5);
    const hI = aY(m.ingresos) - aY(0);
    const hG = aY(m.gastos) - aY(0);
    const opacity = m.en_curso ? 0.45 : 1;
    if (hI > 0) p.drawRectangle({ x: centro - barra - 1, y: aY(0), width: barra, height: hI, color: INGRESOS, opacity });
    if (hG > 0) p.drawRectangle({ x: centro + 1, y: aY(0), width: barra, height: hG, color: GASTOS, opacity });
  });
  etiquetasMeses(p, c, meses, f);
}

function graficoObjetivo(p: PDFPage, c: Caja, meses: MesReporte[], f: Fuentes) {
  texto(p, "Ganancia neta y objetivo mensual", c.x - 34, c.y + c.alto + 30, 11, f.negrita);
  leyenda(p, c.x - 34, c.y + c.alto + 14, [["Ganancia neta", INGRESOS, "barra"], ["Objetivo", OBJETIVO, "linea"]], f);
  const valores = meses.flatMap((m) => [m.resultado, m.objetivo ?? 0]);
  const { min, max, pasos } = escalaEje(Math.max(1, ...valores), Math.min(0, ...valores));
  const aY = ejes(p, c, min, max, pasos, f);
  const banda = c.ancho / meses.length;
  const barra = Math.min(22, banda - 8);
  meses.forEach((m, i) => {
    const centro = c.x + banda * (i + 0.5);
    const y0 = aY(0);
    const y1 = aY(m.resultado);
    if (y1 !== y0)
      p.drawRectangle({
        x: centro - barra / 2,
        y: Math.min(y0, y1),
        width: barra,
        height: Math.abs(y1 - y0),
        color: INGRESOS,
        opacity: m.en_curso ? 0.45 : 1,
      });
    if (m.objetivo != null && m.objetivo > 0) {
      const yo = aY(m.objetivo);
      p.drawLine({
        start: { x: centro - banda / 2 + 2, y: yo },
        end: { x: centro + banda / 2 - 2, y: yo },
        thickness: 1.5,
        color: OBJETIVO,
        dashArray: [3, 2],
      });
    }
  });
  etiquetasMeses(p, c, meses, f);
}

const COLUMNAS: { titulo: string; ancho: number; valor: (m: MesReporte) => string }[] = [
  { titulo: "Mes", ancho: 70, valor: (m) => mesNumerico(m.mes) + (m.en_curso ? " *" : "") },
  { titulo: "Sesiones", ancho: 48, valor: (m) => String(m.sesiones_realizadas) },
  { titulo: "Ingresos", ancho: 78, valor: (m) => pesos(m.ingresos) },
  { titulo: "Por ausencias", ancho: 70, valor: (m) => pesos(m.ingresos_ausencias) },
  { titulo: "Cobrado", ancho: 76, valor: (m) => pesos(m.cobrado) },
  { titulo: "Gastos", ancho: 76, valor: (m) => pesos(m.gastos) },
  { titulo: "Ganancia neta", ancho: 80, valor: (m) => pesos(m.resultado) },
  { titulo: "Objetivo", ancho: 76, valor: (m) => (m.objetivo ? pesos(m.objetivo) : "—") },
  { titulo: "Cumplido", ancho: 50, valor: (m) => (m.cumplido == null ? "—" : m.cumplido ? "Sí" : "No") },
  { titulo: "Ausencias", ancho: 72, valor: (m) => (m.ausencias ? `${m.ausencias} (${porcentaje(m.tasa_ausencias)})` : "0") },
  { titulo: "Pacientes", ancho: 60, valor: (m) => (m.pacientes_nuevos ? `${m.pacientes_activos} (+${m.pacientes_nuevos})` : String(m.pacientes_activos)) },
];

function cabeceraTabla(p: PDFPage, y: number, f: Fuentes): number {
  const total = COLUMNAS.reduce((a, c) => a + c.ancho, 0);
  p.drawRectangle({ x: MARGEN, y: y - 6, width: total, height: 20, color: ARENA });
  let x = MARGEN;
  COLUMNAS.forEach((c, i) => {
    if (i === 0) texto(p, c.titulo, x + 6, y, 8.5, f.negrita);
    else textoDerecha(p, c.titulo, x + c.ancho - 6, y, 8.5, f.negrita);
    x += c.ancho;
  });
  return y - 20;
}

function filaTabla(p: PDFPage, y: number, valores: string[], f: PDFFont) {
  let x = MARGEN;
  COLUMNAS.forEach((c, i) => {
    if (i === 0) texto(p, valores[i], x + 6, y, 8.5, f);
    else textoDerecha(p, valores[i], x + c.ancho - 6, y, 8.5, f);
    x += c.ancho;
  });
}

export async function generarPdfReporte(d: DatosPdfReporte): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Reporte de ingresos y gastos - ${d.periodo.titulo}`);
  if (d.emisor.nombre) pdf.setAuthor(textoImprimible(d.emisor.nombre));
  pdf.setCreator("PsiGestion");
  pdf.setProducer("PsiGestion");
  pdf.setCreationDate(d.generado);
  const f: Fuentes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const paginas: PDFPage[] = [];

  // Hoja 1: indicadores y gráficos.
  let p = pdf.addPage([ANCHO, ALTO]);
  paginas.push(p);
  let y = encabezado(p, d, f);
  y = indicadores(p, y, d.totales, f);
  const anchoGrafico = (ANCHO - 2 * MARGEN - 40 - 34 * 2) / 2;
  const altoGrafico = y - 40 - MARGEN - 30;
  const base = MARGEN + 30;
  graficoIngresosGastos(p, { x: MARGEN + 34, y: base, ancho: anchoGrafico, alto: altoGrafico }, d.meses, f);
  graficoObjetivo(p, { x: MARGEN + 34 * 2 + 40 + anchoGrafico, y: base, ancho: anchoGrafico, alto: altoGrafico }, d.meses, f);

  // Hoja 2 en adelante: detalle mes a mes.
  const nuevaHoja = () => {
    p = pdf.addPage([ANCHO, ALTO]);
    paginas.push(p);
    const yy = encabezado(p, d, f);
    texto(p, "Detalle mes a mes", MARGEN, yy, 11, f.negrita);
    return cabeceraTabla(p, yy - 22, f);
  };
  y = nuevaHoja();
  const anchoTabla = COLUMNAS.reduce((a, c) => a + c.ancho, 0);
  for (const m of d.meses) {
    if (y < MARGEN + 70) y = nuevaHoja();
    filaTabla(p, y, COLUMNAS.map((c) => c.valor(m)), f.normal);
    p.drawLine({ start: { x: MARGEN, y: y - 6 }, end: { x: MARGEN + anchoTabla, y: y - 6 }, thickness: 0.4, color: LINEA });
    y -= 18;
  }
  const t = d.totales;
  filaTabla(
    p,
    y,
    [
      "Total",
      String(t.sesiones_realizadas),
      pesos(t.ingresos),
      pesos(t.ingresos_ausencias),
      pesos(t.cobrado),
      pesos(t.gastos),
      pesos(t.resultado),
      "",
      t.meses_con_objetivo ? `${t.meses_cumplidos} de ${t.meses_con_objetivo}` : "—",
      `${t.ausencias} (${porcentaje(t.tasa_ausencias)})`,
      String(t.pacientes_periodo),
    ],
    f.negrita,
  );
  y -= 28;

  const notas = [
    "Ingresos: sesiones realizadas más lo que se cobra por ausencias, cobrado o no. Cobrado: la parte de esos ingresos que ya se pagó.",
    "Ganancia neta: ingresos menos gastos del mes. El objetivo es la ganancia neta que se quiere lograr en el mes.",
    "Ausencias: porcentaje sobre los turnos a los que se esperaba al paciente (realizados y ausencias). Pacientes: con al menos una sesión realizada en el mes (entre paréntesis, los nuevos).",
    d.meses.some((m) => m.en_curso) ? "* Mes en curso (más claro en los gráficos): los números todavía pueden cambiar." : "",
    `Recibos emitidos en el período: ${t.recibos_cantidad} por ${pesos(t.recibos)}. Este reporte no incluye notas ni datos clínicos y no es un comprobante fiscal.`,
  ].filter(Boolean);
  for (const renglon of notas.flatMap((n) => cortarEnRenglones(n, f.normal, 7.5, ANCHO - 2 * MARGEN))) {
    if (y < MARGEN + 10) y = nuevaHoja();
    texto(p, renglon, MARGEN, y, 7.5, f.normal, GRIS);
    y -= 11;
  }

  paginas.forEach((pg, i) =>
    textoDerecha(pg, `Hoja ${i + 1} de ${paginas.length}`, ANCHO - MARGEN, MARGEN - 22, 7.5, f.normal, GRIS),
  );
  return pdf.save();
}
