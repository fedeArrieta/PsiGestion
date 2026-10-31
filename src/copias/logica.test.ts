import { describe, expect, it } from "vitest";
import {
  copiaAtrasada,
  copiasABorrar,
  diasSinCopia,
  leerNombreCopia,
  necesitaCopiaAutomatica,
  nombreCopia,
  tamanoTexto,
  type ArchivoCopia,
} from "./logica";

const archivo = (nombre: string): ArchivoCopia => ({ nombre, ruta: `C:\\Copias\\${nombre}`, bytes: 1, modificada: 0 });

describe("copias de seguridad", () => {
  it("arma y lee el nombre de una copia", () => {
    const d = new Date(2026, 9, 31, 8, 5, 3);
    const nombre = nombreCopia("auto", d);
    expect(nombre).toBe("psigestion-auto-2026-10-31_08-05-03.db");
    expect(leerNombreCopia(nombre)).toEqual({ tipo: "auto", fecha: d });
    expect(leerNombreCopia("psigestion.db")).toBeNull();
  });

  it("borra solo las automáticas que sobran, empezando por las más viejas", () => {
    const copias = [
      archivo("psigestion-auto-2026-10-29_10-00-00.db"),
      archivo("psigestion-manual-2026-10-01_10-00-00.db"),
      archivo("psigestion-auto-2026-10-31_10-00-00.db"),
      archivo("psigestion-auto-2026-10-30_10-00-00.db"),
      archivo("psigestion-previa-2026-09-01_10-00-00.db"),
    ];
    expect(copiasABorrar(copias, 2).map((c) => c.nombre)).toEqual(["psigestion-auto-2026-10-29_10-00-00.db"]);
    expect(copiasABorrar(copias, 5)).toEqual([]);
    // Siempre queda al menos una.
    expect(copiasABorrar(copias, 0)).toHaveLength(2);
  });

  it("decide cuándo hace falta una copia automática", () => {
    const ahora = new Date(2026, 9, 31, 20, 0);
    expect(necesitaCopiaAutomatica(null, ahora)).toBe(true);
    expect(necesitaCopiaAutomatica(new Date(2026, 9, 31, 9, 0), ahora)).toBe(false);
    expect(necesitaCopiaAutomatica(new Date(2026, 9, 30, 20, 0), ahora)).toBe(true);
  });

  it("avisa si pasaron 7 días o más sin copia", () => {
    const ahora = new Date(2026, 9, 31, 20, 0);
    expect(diasSinCopia(null, ahora)).toBeNull();
    expect(copiaAtrasada(null, ahora)).toBe(true);
    expect(copiaAtrasada(new Date(2026, 9, 25, 20, 0), ahora)).toBe(false);
    expect(copiaAtrasada(new Date(2026, 9, 24, 20, 0), ahora)).toBe(true);
  });

  it("muestra el tamaño en texto", () => {
    expect(tamanoTexto(500)).toBe("500 B");
    expect(tamanoTexto(2048)).toBe("2 KB");
    expect(tamanoTexto(3.5 * 1024 * 1024)).toBe("3,5 MB");
  });
});
