import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  enLetras,
  fechaCorta,
  itemsDeTurnos,
  leerEmisor,
  LEYENDA_POR_DEFECTO,
  montoEnLetras,
  nombreArchivo,
  numeroRecibo,
  pesosConCentavos,
} from "./logica";
import { generarPdfRecibo, textoImprimible } from "./pdf";
import type { Recibo, Turno } from "../tipos";

describe("montos en letras", () => {
  it.each([
    [0, "cero"],
    [1, "uno"],
    [15, "quince"],
    [21, "veintiuno"],
    [31, "treinta y uno"],
    [100, "cien"],
    [101, "ciento uno"],
    [500, "quinientos"],
    [1000, "mil"],
    [1001, "mil uno"],
    [21000, "veintiún mil"],
    [25000, "veinticinco mil"],
    [31500, "treinta y un mil quinientos"],
    [100000, "cien mil"],
    [101000, "ciento un mil"],
    [1000000, "un millón"],
    [2500000, "dos millones quinientos mil"],
    [21000000, "veintiún millones"],
    [1234567, "un millón doscientos treinta y cuatro mil quinientos sesenta y siete"],
  ])("%i → %s", (n, texto) => expect(enLetras(n)).toBe(texto));

  it("agrega los centavos", () => {
    expect(montoEnLetras(25000)).toBe("veinticinco mil con 00/100");
    expect(montoEnLetras(12500.5)).toBe("doce mil quinientos con 50/100");
    expect(montoEnLetras(0.07)).toBe("cero con 07/100");
  });
});

describe("formato del recibo", () => {
  it("número, fecha y pesos con centavos", () => {
    expect(numeroRecibo(12)).toBe("00000012");
    expect(fechaCorta("2026-11-05")).toBe("05/11/2026");
    expect(fechaCorta("2026-11-05 10:30:00")).toBe("05/11/2026");
    expect(pesosConCentavos(25000)).toBe("$ 25.000,00");
  });

  it("nombre de archivo válido en Windows", () => {
    expect(nombreArchivo(12, "Ana Pérez")).toBe("Recibo 00000012 - Ana Pérez.pdf");
    expect(nombreArchivo(3, 'a/b\\c:*?"<>|. ..')).toBe("Recibo 00000003 - abc.pdf");
    expect(nombreArchivo(3, "Ana", true)).toBe("Recibo 00000003 - Ana (ANULADO).pdf");
  });

  it("datos del profesional: usa el nombre del saludo y la leyenda por defecto", () => {
    expect(leerEmisor({ nombre_profesional: "Dra. Martínez" })).toMatchObject({ nombre: "Dra. Martínez", leyenda: LEYENDA_POR_DEFECTO });
    expect(leerEmisor({ nombre_profesional: "X", recibo_nombre: "Lic. Y", recibo_leyenda: "" })).toMatchObject({ nombre: "Lic. Y", leyenda: "" });
  });

  it("arma los renglones en orden de fecha, con el cargo de las ausencias", () => {
    const base = { paciente_id: 1, duracion_min: 50, pagado: 1, notas: "privado", serie_id: null, aviso: null, cargo: null };
    const turnos: Turno[] = [
      { ...base, id: 2, inicio: "2026-11-10T10:00", estado: "ausente", monto: 25000, aviso: "sin_aviso", cargo: 12500 },
      { ...base, id: 1, inicio: "2026-11-03T10:00", estado: "realizado", monto: 25000 },
    ];
    expect(itemsDeTurnos(turnos, "Sesión")).toEqual([
      { turno_id: 1, fecha: "2026-11-03", concepto: "Sesión", importe: 25000 },
      { turno_id: 2, fecha: "2026-11-10", concepto: "Sesión (ausencia)", importe: 12500 },
    ]);
  });
});

describe("PDF", () => {
  const recibo: Recibo = {
    id: 1,
    numero: 12,
    fecha: "2026-11-02",
    paciente_id: 1,
    paciente_nombre: "José Ñandú 😀",
    paciente_documento: "30.111.222",
    total: 50000,
    medio_pago: "Transferencia",
    items: [
      { turno_id: 1, fecha: "2026-10-27", concepto: "Sesión de psicoterapia", importe: 25000 },
      { turno_id: 2, fecha: "2026-11-02", concepto: "Sesión de psicoterapia (ausencia)", importe: 25000 },
    ],
    emisor: {
      nombre: "Lic. María Martínez Ψ",
      titulo: "Licenciada en Psicología",
      matricula: "MN 12345",
      cuit: "27-12345678-9",
      domicilio: "Av. Siempreviva 742",
      telefono: "11 1234-5678",
      email: "maria@example.com",
      leyenda: LEYENDA_POR_DEFECTO,
    },
    anulado_en: null,
    motivo_anulacion: null,
    creado_en: "2026-11-02 10:00:00",
  };

  it("quita lo que la fuente del PDF no puede escribir", () => {
    expect(textoImprimible("Ñandú – “ok” 😀 Ψ")).toBe("Ñandú – “ok” ? ?");
  });

  it("genera un PDF de una hoja", async () => {
    const bytes = await generarPdfRecibo(recibo);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Recibo N° 00000012");
  });

  it("con muchas sesiones usa más hojas, y marca los anulados", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ turno_id: i, fecha: "2026-01-01", concepto: "Sesión", importe: 1000 }));
    const bytes = await generarPdfRecibo({ ...recibo, items, total: 60000, anulado_en: "2026-11-03 09:00:00", motivo_anulacion: "error" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
