import { describe, expect, it } from "vitest";
import { iniciales, saludoDelMomento, sumaRealizada, textoCuando, tonoTurno, tramoMesAnterior, variacion } from "./logica";

describe("inicio", () => {
  it("arma iniciales", () => {
    expect(iniciales("María José González")).toBe("MG");
    expect(iniciales("  ana ")).toBe("A");
    expect(iniciales("")).toBe("?");
  });

  it("calcula la variación", () => {
    expect(variacion(112, 100)).toBe(12);
    expect(variacion(50, 100)).toBe(-50);
    expect(variacion(10, 0)).toBeNull();
  });

  it("asigna el color de cada estado", () => {
    expect(tonoTurno({ estado: "programado", pagado: 0 }).tono).toBe("ok");
    expect(tonoTurno({ estado: "realizado", pagado: 0 }).tono).toBe("pendiente");
    expect(tonoTurno({ estado: "realizado", pagado: 1 }).tono).toBe("pago");
    expect(tonoTurno({ estado: "ausente", pagado: 0 }).tono).toBe("atencion");
    expect(tonoTurno({ estado: "cancelado", pagado: 0 }).tono).toBe("apagado");
  });

  it("dice cuándo es un turno", () => {
    const hoy = new Date(2026, 10, 3, 10, 0);
    expect(textoCuando("2026-11-03T15:00", hoy)).toBe("Hoy");
    expect(textoCuando("2026-11-04T09:00", hoy)).toBe("Mañana");
    expect(textoCuando("2026-11-06T09:00", hoy)).toMatch(/viernes/);
  });

  it("saluda según la hora", () => {
    expect(saludoDelMomento(new Date(2026, 0, 1, 9))).toMatch(/día/);
    expect(saludoDelMomento(new Date(2026, 0, 1, 16))).toMatch(/tarde/);
    expect(saludoDelMomento(new Date(2026, 0, 1, 22))).toMatch(/noche/);
  });

  it("suma solo lo realizado", () => {
    expect(
      sumaRealizada([
        { estado: "realizado", monto: 100 },
        { estado: "programado", monto: 50 },
        { estado: "realizado", monto: 20 },
      ]),
    ).toBe(120);
  });

  it("toma el mismo tramo del mes anterior", () => {
    expect(tramoMesAnterior(new Date(2026, 10, 15))).toEqual({ desde: "2026-10-01", hasta: "2026-10-16" });
    // 31 de marzo: febrero tiene 28 días.
    expect(tramoMesAnterior(new Date(2026, 2, 31))).toEqual({ desde: "2026-02-01", hasta: "2026-03-01" });
    expect(tramoMesAnterior(new Date(2026, 0, 10))).toEqual({ desde: "2025-12-01", hasta: "2025-12-11" });
  });
});
