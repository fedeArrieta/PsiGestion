// Arma el PDF del recibo con pdf-lib, sin servicios externos.
// Usa las fuentes estándar del PDF (Helvetica), que traen las letras del español.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Recibo } from "../tipos";
import { fechaCorta, montoEnLetras, numeroRecibo, pesosConCentavos } from "./logica";

// Colores de la marca (docs: tablero de marca).
const SALVIA = rgb(0x52 / 255, 0x7c / 255, 0x70 / 255);
const GRAFITO = rgb(0x25 / 255, 0x2b / 255, 0x2a / 255);
const GRIS = rgb(0.42, 0.46, 0.45);
const LINEA = rgb(0.8, 0.83, 0.82);
const ARENA = rgb(0xe8 / 255, 0xe4 / 255, 0xd9 / 255);
const ROJO = rgb(0.75, 0.2, 0.2);

const ANCHO = 595.28; // A4
const ALTO = 841.89;
const MARGEN = 50;

// Caracteres extra de WinAnsi (la codificación de las fuentes estándar) fuera de Latin-1.
const EXTRA_WINANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Deja solo lo que la fuente estándar puede escribir (quita emojis, letras griegas, etc.). */
export function textoImprimible(s: string): string {
  let r = "";
  for (const c of s.replace(/\r?\n|\t/g, " ")) {
    const code = c.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA_WINANSI.has(c)) r += c;
    else {
      const sinTilde = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      r += /^[\x20-\x7e]$/.test(sinTilde) ? sinTilde : "?";
    }
  }
  return r;
}

/** Corta un texto en renglones que entren en "ancho". */
export function cortarEnRenglones(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = textoImprimible(texto).split(" ").filter(Boolean);
  const renglones: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && fuente.widthOfTextAtSize(prueba, tam) > ancho) {
      renglones.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) renglones.push(actual);
  return renglones;
}

interface Fuentes {
  normal: PDFFont;
  negrita: PDFFont;
}

function escribir(pagina: PDFPage, texto: string, x: number, y: number, tam: number, fuente: PDFFont, color = GRAFITO) {
  pagina.drawText(textoImprimible(texto), { x, y, size: tam, font: fuente, color });
}

function escribirDerecha(pagina: PDFPage, texto: string, xDerecha: number, y: number, tam: number, fuente: PDFFont, color = GRAFITO) {
  const t = textoImprimible(texto);
  pagina.drawText(t, { x: xDerecha - fuente.widthOfTextAtSize(t, tam), y, size: tam, font: fuente, color });
}

/** Encabezado de cada hoja: profesional a la izquierda, número y fecha a la derecha. Devuelve dónde sigue. */
function encabezado(pagina: PDFPage, r: Recibo, f: Fuentes): number {
  const e = r.emisor;
  const derecha = ANCHO - MARGEN;
  pagina.drawRectangle({ x: 0, y: ALTO - 8, width: ANCHO, height: 8, color: SALVIA });

  let y = ALTO - MARGEN - 10;
  const anchoIzq = 300;
  for (const renglon of cortarEnRenglones(e.nombre, f.negrita, 17, anchoIzq)) {
    escribir(pagina, renglon, MARGEN, y, 17, f.negrita);
    y -= 20;
  }
  const lineas = [
    e.titulo,
    [e.matricula && `Matrícula ${e.matricula}`, e.cuit && `CUIT ${e.cuit}`].filter(Boolean).join(" · "),
    e.domicilio,
    [e.telefono && `Tel. ${e.telefono}`, e.email].filter(Boolean).join(" · "),
  ].filter(Boolean);
  for (const l of lineas) {
    for (const renglon of cortarEnRenglones(l, f.normal, 9.5, anchoIzq)) {
      escribir(pagina, renglon, MARGEN, y, 9.5, f.normal, GRIS);
      y -= 13;
    }
  }

  let yd = ALTO - MARGEN - 12;
  escribirDerecha(pagina, "RECIBO", derecha, yd, 22, f.negrita, SALVIA);
  yd -= 20;
  escribirDerecha(pagina, `N° ${numeroRecibo(r.numero)}`, derecha, yd, 12, f.negrita);
  yd -= 16;
  escribirDerecha(pagina, `Fecha: ${fechaCorta(r.fecha)}`, derecha, yd, 10, f.normal);

  y = Math.min(y, yd) - 14;
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: derecha, y }, thickness: 1, color: SALVIA });
  return y - 26;
}

function cabeceraTabla(pagina: PDFPage, y: number, f: Fuentes): number {
  const derecha = ANCHO - MARGEN;
  pagina.drawRectangle({ x: MARGEN, y: y - 6, width: derecha - MARGEN, height: 20, color: ARENA });
  escribir(pagina, "Fecha", MARGEN + 8, y, 9.5, f.negrita);
  escribir(pagina, "Concepto", MARGEN + 90, y, 9.5, f.negrita);
  escribirDerecha(pagina, "Importe", derecha - 8, y, 9.5, f.negrita);
  return y - 22;
}

function marcaDeAgua(pagina: PDFPage, f: Fuentes, texto: string) {
  const tam = 110;
  const ancho = f.negrita.widthOfTextAtSize(texto, tam);
  // Centrado en diagonal (45°).
  const d = ancho / 2 / Math.SQRT2;
  pagina.drawText(texto, {
    x: ANCHO / 2 - d + tam * 0.25,
    y: ALTO / 2 - d - tam * 0.25,
    size: tam,
    font: f.negrita,
    color: ROJO,
    opacity: 0.18,
    rotate: degrees(45),
  });
}

const RENGLON = 18;
const ALTO_PIE = 150; // lugar para total, firma y leyenda en la última hoja

/** Genera el PDF del recibo. "ejemplo" agrega la marca EJEMPLO (vista previa desde Configuración). */
export async function generarPdfRecibo(r: Recibo, ejemplo = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo N° ${numeroRecibo(r.numero)}`);
  pdf.setAuthor(textoImprimible(r.emisor.nombre));
  pdf.setSubject(`Recibo de pago - ${textoImprimible(r.paciente_nombre)}`);
  pdf.setCreator("PsiGestion");
  pdf.setProducer("PsiGestion");
  const fechaCreacion = new Date(`${r.creado_en.replace(" ", "T")}`);
  if (!Number.isNaN(fechaCreacion.getTime())) pdf.setCreationDate(fechaCreacion);
  const f: Fuentes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const derecha = ANCHO - MARGEN;
  const anchoConcepto = derecha - 8 - 90 - (MARGEN + 90);

  // Renglones de la tabla ya cortados, para saber cuántas hojas hacen falta.
  const filas = r.items.map((it) => ({ it, renglones: cortarEnRenglones(it.concepto, f.normal, 10, anchoConcepto) }));

  const paginas: PDFPage[] = [];
  let pagina = pdf.addPage([ANCHO, ALTO]);
  paginas.push(pagina);
  let y = encabezado(pagina, r, f);

  // Quién paga y cuánto.
  escribir(pagina, "Recibí de", MARGEN, y, 10, f.normal, GRIS);
  escribir(pagina, r.paciente_nombre, MARGEN + 84, y, 12, f.negrita);
  y -= 18;
  if (r.paciente_documento) {
    escribir(pagina, "DNI / CUIT", MARGEN, y, 10, f.normal, GRIS);
    escribir(pagina, r.paciente_documento, MARGEN + 84, y, 10, f.normal);
    y -= 18;
  }
  escribir(pagina, "La suma de", MARGEN, y, 10, f.normal, GRIS);
  const enLetras = `pesos ${montoEnLetras(r.total)} (${pesosConCentavos(r.total)})`;
  for (const renglon of cortarEnRenglones(enLetras, f.normal, 10, derecha - MARGEN - 70)) {
    escribir(pagina, renglon, MARGEN + 84, y, 10, f.normal);
    y -= 14;
  }
  y -= 4;
  if (r.medio_pago) {
    escribir(pagina, "Forma de pago", MARGEN, y, 10, f.normal, GRIS);
    escribir(pagina, r.medio_pago, MARGEN + 84, y, 10, f.normal);
    y -= 18;
  }
  escribir(pagina, "En concepto de", MARGEN, y, 10, f.normal, GRIS);
  y -= 22;

  y = cabeceraTabla(pagina, y, f);
  for (const { it, renglones } of filas) {
    const alto = renglones.length * 13 + (RENGLON - 13);
    if (y - alto < MARGEN + 40) {
      pagina = pdf.addPage([ANCHO, ALTO]);
      paginas.push(pagina);
      y = cabeceraTabla(pagina, encabezado(pagina, r, f), f);
    }
    escribir(pagina, fechaCorta(it.fecha), MARGEN + 8, y, 10, f.normal);
    renglones.forEach((renglon, i) => escribir(pagina, renglon, MARGEN + 90, y - i * 13, 10, f.normal));
    escribirDerecha(pagina, pesosConCentavos(it.importe), derecha - 8, y, 10, f.normal);
    y -= alto;
    pagina.drawLine({ start: { x: MARGEN, y: y + 12 }, end: { x: derecha, y: y + 12 }, thickness: 0.5, color: LINEA });
  }

  // Total, firma y leyenda (en una hoja nueva si no entran).
  if (y < MARGEN + ALTO_PIE) {
    pagina = pdf.addPage([ANCHO, ALTO]);
    paginas.push(pagina);
    y = encabezado(pagina, r, f);
  }
  y -= 4;
  escribir(pagina, "TOTAL", derecha - 200, y, 12, f.negrita);
  escribirDerecha(pagina, pesosConCentavos(r.total), derecha - 8, y, 12, f.negrita, SALVIA);

  const yFirma = Math.max(MARGEN + 84, y - 90);
  pagina.drawLine({ start: { x: derecha - 200, y: yFirma }, end: { x: derecha, y: yFirma }, thickness: 0.7, color: GRAFITO });
  const aclaracion = cortarEnRenglones(r.emisor.nombre, f.normal, 9, 200)[0] ?? "";
  escribirDerecha(pagina, aclaracion, derecha - (200 - f.normal.widthOfTextAtSize(aclaracion, 9)) / 2, yFirma - 13, 9, f.normal);
  escribirDerecha(pagina, "Firma y aclaración", derecha - (200 - f.normal.widthOfTextAtSize("Firma y aclaración", 8)) / 2, yFirma - 25, 8, f.normal, GRIS);

  if (r.emisor.leyenda) {
    let yl = MARGEN + 12;
    for (const renglon of cortarEnRenglones(r.emisor.leyenda, f.normal, 8.5, derecha - MARGEN).slice(0, 3)) {
      escribir(pagina, renglon, MARGEN, yl, 8.5, f.normal, GRIS);
      yl -= 11;
    }
  }

  // Si hay más de una hoja, numerarlas (el encabezado se dibujó antes de saber el total).
  if (paginas.length > 1) {
    paginas.forEach((p, i) => escribirDerecha(p, `Hoja ${i + 1} de ${paginas.length}`, derecha, MARGEN - 20, 8, f.normal, GRIS));
  }

  if (r.anulado_en) {
    for (const p of paginas) marcaDeAgua(p, f, "ANULADO");
    const motivo = r.motivo_anulacion ? `: ${r.motivo_anulacion}` : "";
    paginas[0].drawText(textoImprimible(`Anulado el ${fechaCorta(r.anulado_en)}${motivo}`), {
      x: MARGEN,
      y: ALTO - 30,
      size: 10,
      font: f.negrita,
      color: ROJO,
    });
  }

  if (ejemplo) for (const p of paginas) marcaDeAgua(p, f, "EJEMPLO");

  return pdf.save();
}
