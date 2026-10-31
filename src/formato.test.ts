import { describe, expect, it } from "vitest";
import { leerMonto, montoEditable } from "./formato";

describe("leerMonto", () => {
  it.each([
    ["", 0],
    ["25000", 25000],
    ["25.000", 25000],
    ["1.250.000", 1250000],
    ["$ 25.000", 25000],
    ["25.000,50", 25000.5],
    ["25000,5", 25000.5],
    ["25000.5", 25000.5],
  ])("%s → %d", (texto, esperado) => {
    expect(leerMonto(texto)).toBe(esperado);
  });

  it("rechaza texto que no es un número", () => {
    expect(leerMonto("abc")).toBeNaN();
    expect(leerMonto("-100")).toBeNaN();
  });

  it("ida y vuelta con montoEditable", () => {
    expect(leerMonto(montoEditable(1250000))).toBe(1250000);
    expect(montoEditable(0)).toBe("");
  });
});
