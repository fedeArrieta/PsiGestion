import { describe, expect, it } from "vitest";
import {
  compararVersiones,
  debeAvisar,
  hayNovedadesSinVer,
  leerNovedades,
  leerPreferencias,
  novedadesEntre,
  POSPONER_HORAS,
} from "./logica";
import changelog from "../../CHANGELOG.md?raw";

const sinPreferencias = leerPreferencias({});
const ahora = Date.UTC(2026, 10, 1, 12);

describe("compararVersiones", () => {
  it("ordena por número, no por texto", () => {
    expect(compararVersiones("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compararVersiones("v0.2.0", "0.2.0")).toBe(0);
    expect(compararVersiones("0.2.0", "0.2.1")).toBeLessThan(0);
    expect(compararVersiones("1.0", "0.9.9")).toBeGreaterThan(0);
  });
});

describe("debeAvisar", () => {
  it("avisa solo si la versión disponible es más nueva", () => {
    expect(debeAvisar("0.3.0", "0.2.0", sinPreferencias, ahora)).toBe(true);
    expect(debeAvisar("0.2.0", "0.2.0", sinPreferencias, ahora)).toBe(false);
    expect(debeAvisar("0.1.0", "0.2.0", sinPreferencias, ahora, true)).toBe(false);
  });

  it("respeta 'Omitir esta versión' hasta que salga una más nueva", () => {
    const pref = leerPreferencias({ actualizacion_omitida: "0.3.0" });
    expect(debeAvisar("0.3.0", "0.2.0", pref, ahora)).toBe(false);
    expect(debeAvisar("0.3.1", "0.2.0", pref, ahora)).toBe(true);
  });

  it("respeta 'Recordarme más tarde' hasta que pase el plazo", () => {
    const hasta = ahora + POSPONER_HORAS * 3600 * 1000;
    const pref = leerPreferencias({ actualizacion_posponer_hasta: String(hasta) });
    expect(debeAvisar("0.3.0", "0.2.0", pref, ahora)).toBe(false);
    expect(debeAvisar("0.3.0", "0.2.0", pref, hasta + 1)).toBe(true);
  });

  it("si la persona busca a mano, avisa aunque la haya omitido o pospuesto", () => {
    const pref = leerPreferencias({ actualizacion_omitida: "0.3.0", actualizacion_posponer_hasta: String(ahora + 1000) });
    expect(debeAvisar("0.3.0", "0.2.0", pref, ahora, true)).toBe(true);
  });

  it("la búsqueda automática viene activada salvo que se desactive", () => {
    expect(sinPreferencias.automatica).toBe(true);
    expect(leerPreferencias({ actualizacion_automatica: "0" }).automatica).toBe(false);
  });
});

describe("novedades", () => {
  it("lee las versiones del CHANGELOG con sus títulos y puntos", () => {
    const versiones = leerNovedades("# Título\n\n## [0.2.0] - 2026-11-01\n\n### Nuevo\n\n- Algo\n\n## [0.1.0]\n- Inicio\n");
    expect(versiones).toEqual([
      { version: "0.2.0", fecha: "2026-11-01", lineas: [{ tipo: "titulo", texto: "Nuevo" }, { tipo: "punto", texto: "Algo" }] },
      { version: "0.1.0", fecha: null, lineas: [{ tipo: "punto", texto: "Inicio" }] },
    ]);
  });

  it("muestra solo las versiones que no se vieron", () => {
    const versiones = leerNovedades("## [0.3.0]\n- c\n## [0.2.0]\n- b\n## [0.1.0]\n- a\n");
    expect(novedadesEntre(versiones, "0.1.0", "0.3.0").map((v) => v.version)).toEqual(["0.3.0", "0.2.0"]);
    expect(novedadesEntre(versiones, null, "0.2.0").map((v) => v.version)).toEqual(["0.2.0", "0.1.0"]);
  });

  it("avisa novedades solo al pasar a una versión más nueva", () => {
    expect(hayNovedadesSinVer("0.2.0", "0.2.0")).toBe(false);
    expect(hayNovedadesSinVer("0.1.0", "0.2.0")).toBe(true);
    expect(hayNovedadesSinVer(null, "0.2.0")).toBe(true);
  });

  it("el CHANGELOG tiene una entrada para la versión de package.json", async () => {
    const { version } = (await import("../../package.json")).default;
    expect(leerNovedades(changelog)[0].version).toBe(version);
  });
});
