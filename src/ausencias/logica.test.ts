import { describe, expect, it } from "vitest";
import {
  cargoSugerido,
  desdeOpcion,
  etiquetaEstado,
  importeTurno,
  leerPolitica,
  liberaHorario,
  opcionDe,
  OPCIONES_ESTADO,
  POLITICA_POR_DEFECTO,
} from "./logica";

describe("ausencias", () => {
  it("lee la política guardada y usa los valores por defecto si falta o es inválida", () => {
    expect(leerPolitica({})).toEqual(POLITICA_POR_DEFECTO);
    expect(leerPolitica({ ausencia_sin_aviso_pct: "50", ausencia_con_aviso_pct: "25" })).toEqual({
      sinAvisoPct: 50,
      conAvisoPct: 25,
    });
    expect(leerPolitica({ ausencia_sin_aviso_pct: "abc", ausencia_con_aviso_pct: "150" })).toEqual(POLITICA_POR_DEFECTO);
  });

  it("propone el cargo según el tipo de ausencia", () => {
    const p = { sinAvisoPct: 100, conAvisoPct: 50 };
    expect(cargoSugerido(25000, "sin_aviso", p)).toBe(25000);
    expect(cargoSugerido(25000.5, "con_aviso", p)).toBe(12500.25);
    expect(cargoSugerido(25000, "con_aviso", { sinAvisoPct: 100, conAvisoPct: 0 })).toBeNull();
    expect(cargoSugerido(0, "sin_aviso", p)).toBeNull();
  });

  it("calcula lo que se debe por cada turno", () => {
    expect(importeTurno({ estado: "realizado", monto: 100, cargo: null })).toBe(100);
    expect(importeTurno({ estado: "ausente", monto: 100, cargo: 40 })).toBe(40);
    expect(importeTurno({ estado: "ausente", monto: 100, cargo: null })).toBe(0);
    expect(importeTurno({ estado: "cancelado", monto: 100, cargo: null })).toBe(0);
    expect(importeTurno({ estado: "programado", monto: 100, cargo: null })).toBe(0);
  });

  it("los cancelados y las ausencias avisadas liberan el horario", () => {
    expect(liberaHorario({ estado: "cancelado", aviso: null })).toBe(true);
    expect(liberaHorario({ estado: "ausente", aviso: "con_aviso" })).toBe(true);
    expect(liberaHorario({ estado: "ausente", aviso: "sin_aviso" })).toBe(false);
    expect(liberaHorario({ estado: "realizado", aviso: null })).toBe(false);
  });

  it("las opciones del selector ida y vuelta", () => {
    for (const { valor } of OPCIONES_ESTADO) expect(opcionDe(desdeOpcion(valor))).toBe(valor);
    expect(etiquetaEstado({ estado: "ausente", aviso: null })).toBe("Ausente sin aviso");
    expect(etiquetaEstado({ estado: "ausente", aviso: "con_aviso" })).toBe("Ausente con aviso");
    expect(etiquetaEstado({ estado: "realizado", aviso: null })).toBe("Realizado");
  });
});
