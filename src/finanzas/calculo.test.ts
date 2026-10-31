import { describe, expect, it } from "vitest";
import type { ResumenMes } from "../tipos";
import { calcularMetas, sumarMeses, textoMes } from "./calculo";

const resumen = (r: Partial<ResumenMes>): ResumenMes => ({
  facturado: 0,
  cobrado: 0,
  sesiones_realizadas: 0,
  programado: 0,
  sesiones_programadas: 0,
  gastos: 0,
  precio_promedio: 0,
  ...r,
});

describe("calcularMetas", () => {
  it("calcula sesiones necesarias y adicionales para gastos y objetivo", () => {
    // Gastos 300.000, objetivo 700.000, sesión promedio 25.000.
    // Realizadas 100.000 (4) y programadas 150.000 (6).
    const r = resumen({ gastos: 300_000, facturado: 100_000, programado: 150_000, precio_promedio: 25_000 });
    const [gastos, total] = calcularMetas(r, 700_000);

    expect(gastos).toMatchObject({ monto: 300_000, faltante: 50_000, sesionesNecesarias: 12, sesionesAdicionales: 2 });
    expect(gastos.cumplida).toBe(false);
    expect(total).toMatchObject({ monto: 1_000_000, faltante: 750_000, sesionesNecesarias: 40, sesionesAdicionales: 30 });
  });

  it("redondea hacia arriba: una sesión parcial cuenta como una entera", () => {
    const [m] = calcularMetas(resumen({ gastos: 26_000, precio_promedio: 25_000 }), null);
    expect(m.sesionesNecesarias).toBe(2);
  });

  it("sin objetivo solo hay meta de gastos; con lo realizado alcanza, queda cumplida", () => {
    const metas = calcularMetas(resumen({ gastos: 50_000, facturado: 60_000, precio_promedio: 20_000 }), null);
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ cumplida: true, faltante: 0, sesionesAdicionales: 0 });
  });

  it("sin precio de referencia no inventa sesiones", () => {
    const [m] = calcularMetas(resumen({ gastos: 100_000 }), null);
    expect(m.sesionesNecesarias).toBeNull();
    expect(m.sesionesAdicionales).toBeNull();
  });

  it("sin gastos ni objetivo no hace falta nada", () => {
    const [m] = calcularMetas(resumen({}), 0);
    expect(m).toMatchObject({ monto: 0, sesionesNecesarias: 0, sesionesAdicionales: 0, cumplida: true });
  });
});

describe("meses", () => {
  it("suma y resta meses cruzando de año", () => {
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });

  it("muestra el mes en español", () => {
    expect(textoMes("2026-11")).toBe("Noviembre de 2026");
  });
});
