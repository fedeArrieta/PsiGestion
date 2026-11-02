import { describe, expect, it } from "vitest";
import { domingoDePascua, feriadosNacionales, fechasDeSerie, horizonte, repartirFechas, textoSerie } from "./series";

describe("series", () => {
  it("genera las fechas semanales dentro del rango", () => {
    const p = { desde: "2026-11-03", frecuencia_semanas: 1, hasta: null };
    expect(fechasDeSerie(p, "2026-11-03", "2026-11-24")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  });

  it("respeta la frecuencia aunque el rango empiece más tarde", () => {
    const p = { desde: "2026-11-03", frecuencia_semanas: 2, hasta: null };
    // 2026-11-10 no toca (semana por medio); la siguiente es 17.
    expect(fechasDeSerie(p, "2026-11-05", "2026-12-01")).toEqual(["2026-11-17", "2026-12-01"]);
  });

  it("corta en la fecha de fin y atraviesa cambios de mes y año", () => {
    const p = { desde: "2026-12-22", frecuencia_semanas: 1, hasta: "2027-01-12" };
    expect(fechasDeSerie(p, "2026-12-01", "2027-03-01")).toEqual(["2026-12-22", "2026-12-29", "2027-01-05", "2027-01-12"]);
  });

  it("saltea feriados y vacaciones", () => {
    const r = repartirFechas(["2026-12-22", "2026-12-29", "2027-01-05", "2027-01-12"], [
      { desde: "2027-01-01", hasta: "2027-01-10", descripcion: "Vacaciones" },
    ]);
    expect(r.agendar).toEqual(["2026-12-22", "2026-12-29", "2027-01-12"]);
    expect(r.salteadas).toEqual([{ fecha: "2027-01-05", motivo: "Vacaciones" }]);
  });

  it("horizonte de 26 semanas", () => {
    expect(horizonte("2026-11-02")).toBe("2027-05-03");
  });

  it("describe la serie en palabras", () => {
    expect(textoSerie({ desde: "2026-11-03", hora: "10:00", frecuencia_semanas: 1 })).toBe("Todos los martes a las 10:00");
    expect(textoSerie({ desde: "2026-11-07", hora: "09:00", frecuencia_semanas: 2 })).toBe("Sábado por medio a las 09:00");
    expect(textoSerie({ desde: "2026-11-02", hora: "18:30", frecuencia_semanas: 3 })).toBe(
      "Cada 3 semanas, los lunes a las 18:30",
    );
  });

  it("calcula Pascua", () => {
    expect(domingoDePascua(2025)).toBe("2025-04-20");
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    expect(domingoDePascua(2027)).toBe("2027-03-28");
  });

  it("arma los feriados nacionales con carnaval, Semana Santa y traslados", () => {
    const f = feriadosNacionales(2026).map((x) => `${x.desde} ${x.descripcion}`);
    expect(f).toContain("2026-02-16 Carnaval");
    expect(f).toContain("2026-02-17 Carnaval");
    expect(f).toContain("2026-04-03 Viernes Santo");
    // 17/8/2026 es lunes: queda. 12/10/2026 es lunes: queda. 20/11/2026 es viernes: pasa al 23.
    expect(f).toContain("2026-08-17 Paso a la Inmortalidad de San Martín");
    expect(f).toContain("2026-11-23 Día de la Soberanía Nacional");
    // 17/6/2026 es miércoles: pasa al lunes 15.
    expect(f).toContain("2026-06-15 Paso a la Inmortalidad de Güemes");
    expect(f).toHaveLength(16);
  });
});
