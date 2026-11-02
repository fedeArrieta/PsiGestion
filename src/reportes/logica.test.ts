import { describe, expect, it } from "vitest";
import type { DatosMesReporte, DatosReporte } from "../repositorio";
import {
  escalaEje,
  etiquetasEje,
  hojasReporte,
  mesCorto,
  mesesDelReporte,
  nombreArchivoReporte,
  periodosDisponibles,
  pesosCorto,
  porcentaje,
  totalesDelReporte,
} from "./logica";

const vacio = (mes: string): DatosMesReporte => ({
  mes,
  sesiones_realizadas: 0,
  ingresos_sesiones: 0,
  ingresos_ausencias: 0,
  cobrado: 0,
  ausencias: 0,
  ausencias_sin_aviso: 0,
  cancelados: 0,
  gastos: 0,
  pacientes_activos: 0,
  pacientes_nuevos: 0,
  recibos: 0,
  recibos_cantidad: 0,
});

const datos: DatosReporte = {
  meses: [
    vacio("2026-08"),
    {
      ...vacio("2026-09"),
      sesiones_realizadas: 10,
      ingresos_sesiones: 250000.1,
      ingresos_ausencias: 12500.2,
      cobrado: 200000,
      ausencias: 2,
      ausencias_sin_aviso: 1,
      gastos: 100000.3,
      pacientes_activos: 4,
      pacientes_nuevos: 4,
      recibos: 100000,
      recibos_cantidad: 2,
    },
    { ...vacio("2026-10"), sesiones_realizadas: 6, ingresos_sesiones: 150000, cobrado: 150000, gastos: 200000, pacientes_activos: 2 },
    { ...vacio("2026-11"), sesiones_realizadas: 1, ingresos_sesiones: 25000, pacientes_activos: 1 },
  ],
  objetivos: { "2026-08": null, "2026-09": 100000, "2026-10": 100000, "2026-11": 100000 },
  pacientes_periodo: 4,
  gastos: [],
  recibos: [],
};

const hoy = new Date(2026, 10, 2);

describe("reportes", () => {
  it("calcula ingresos, ganancia neta, objetivo y tasa de ausencias sin errores de redondeo", () => {
    const meses = mesesDelReporte(datos, hoy);
    expect(meses[1]).toMatchObject({
      ingresos: 262500.3,
      resultado: 162500,
      pendiente: 62500.3,
      cumplido: true,
      tasa_ausencias: 2 / 12,
      en_curso: false,
    });
    expect(meses[0]).toMatchObject({ cumplido: null, tasa_ausencias: null });
    expect(meses[2]).toMatchObject({ resultado: -50000, cumplido: false });
    expect(meses[3]).toMatchObject({ en_curso: true, cumplido: null });
  });

  it("los totales no cuentan el mes en curso para el objetivo y saltean meses vacíos del principio", () => {
    const meses = mesesDelReporte(datos, hoy);
    const t = totalesDelReporte(meses, datos);
    expect(t).toMatchObject({
      ingresos: 437500.3,
      gastos: 300000.3,
      resultado: 137500,
      sesiones_realizadas: 17,
      ausencias: 2,
      meses_con_objetivo: 2,
      meses_cumplidos: 1,
      pacientes_periodo: 4,
      pacientes_nuevos: 4,
      promedio_pacientes: 2.3,
      recibos_cantidad: 2,
    });
    expect(t.tasa_ausencias).toBeCloseTo(2 / 19);
  });

  it("ofrece los últimos 12 meses y un período por año con datos", () => {
    const p = periodosDisponibles(hoy, "2025-03");
    expect(p.map((x) => x.titulo)).toEqual(["Últimos 12 meses", "Año 2026", "Año 2025"]);
    expect(p[0]).toMatchObject({ desde: "2025-12", hasta: "2026-11" });
    expect(p[1]).toMatchObject({ desde: "2026-01", hasta: "2026-11" });
    expect(p[2]).toMatchObject({ desde: "2025-01", hasta: "2025-12" });
    expect(periodosDisponibles(hoy, null)).toHaveLength(2);
  });

  it("arma el Excel para el contador con resumen, gastos y recibos, sin notas", () => {
    const meses = mesesDelReporte(datos, hoy);
    const periodo = periodosDisponibles(hoy, null)[1];
    const hojas = hojasReporte(periodo, meses, totalesDelReporte(meses, datos), datos);
    expect(hojas.map((h) => h.nombre)).toEqual(["Resumen mensual", "Gastos", "Recibos"]);
    const resumen = hojas[0];
    expect(resumen.filas).toHaveLength(5); // 4 meses + total
    expect(resumen.filas[1][0]).toBe("09/2026");
    expect(resumen.filas[3][0]).toBe("11/2026 (en curso)");
    expect(resumen.filas[4][0]).toBe("Total año 2026");
    expect(resumen.columnas.find((c) => c.titulo === "Tasa de ausencias")?.tipo).toBe("porcentaje");
    expect(JSON.stringify(hojas).toLowerCase()).not.toContain("nota");
  });

  it("formatos para ejes y nombres", () => {
    expect(escalaEje(263000)).toEqual({ min: 0, max: 300000, pasos: [0, 100000, 200000, 300000] });
    expect(escalaEje(100, -30).min).toBe(-50);
    expect(escalaEje(0).max).toBeGreaterThan(0);
    expect(pesosCorto(1_250_000)).toBe("$1,3 M");
    expect(pesosCorto(85_000)).toBe("$85 mil");
    expect(pesosCorto(-50_000)).toBe("-$50 mil");
    expect(porcentaje(2 / 12)).toBe("16,7%");
    expect(porcentaje(null)).toBe("—");
    expect(mesCorto("2026-03")).toBe("mar");
    expect(mesCorto("2026-03", true)).toBe("mar 26");
    expect(etiquetasEje(["2025-12", "2026-01", "2026-02"])).toEqual(["dic 25", "ene 26", "feb"]);
    expect(etiquetasEje(["2026-01", "2026-02"])).toEqual(["ene", "feb"]);
    expect(escalaEje(0.17, 0, 4).pasos).toEqual([0, 0.05, 0.1, 0.15, 0.2]);
    expect(nombreArchivoReporte({ desde: "2026-01", hasta: "2026-11", titulo: "" }, "pdf")).toBe(
      "PsiGestion reporte 2026-01 a 2026-11.pdf",
    );
  });
});
