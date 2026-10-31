import { describe, expect, it } from "vitest";
import { aIsoLocal, desdeIsoLocal, inicioDeSemana, minutosDelDia, sumarDias } from "./fechas";

describe("fechas", () => {
  it("convierte ida y vuelta a texto local", () => {
    const d = new Date(2026, 10, 3, 9, 5);
    expect(aIsoLocal(d)).toBe("2026-11-03T09:05");
    expect(desdeIsoLocal("2026-11-03T09:05").getTime()).toBe(d.getTime());
  });

  it("la semana empieza el lunes", () => {
    // 1 de noviembre de 2026 es domingo
    expect(aIsoLocal(inicioDeSemana(new Date(2026, 10, 1, 15)))).toBe("2026-10-26T00:00");
    expect(aIsoLocal(inicioDeSemana(new Date(2026, 10, 2)))).toBe("2026-11-02T00:00");
  });

  it("suma días cruzando de mes", () => {
    expect(aIsoLocal(sumarDias(new Date(2026, 9, 30), 3))).toBe("2026-11-02T00:00");
  });

  it("calcula los minutos del día", () => {
    expect(minutosDelDia("2026-11-03T14:30")).toBe(870);
  });
});
