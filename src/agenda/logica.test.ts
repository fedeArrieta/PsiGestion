import { describe, expect, it } from "vitest";
import type { Turno } from "../tipos";
import { distribuirEnColumnas, seSuperponen, turnosSuperpuestos } from "./logica";

const turno = (id: number, hora: string, duracion_min = 50, estado: Turno["estado"] = "programado"): Turno => ({
  id,
  paciente_id: 1,
  inicio: `2026-11-03T${hora}`,
  duracion_min,
  estado,
  monto: 0,
  pagado: 0,
  notas: null,
});

describe("superposición de turnos", () => {
  it("turnos seguidos no se superponen", () => {
    expect(seSuperponen(turno(1, "10:00", 60), turno(2, "11:00"))).toBe(false);
  });

  it("detecta los que se pisan, ignorando cancelados y el propio turno", () => {
    const existentes = [turno(1, "10:00"), turno(2, "10:30", 50, "cancelado"), turno(3, "12:00")];
    const encontrados = turnosSuperpuestos({ inicio: "2026-11-03T10:20", duracion_min: 50 }, existentes);
    expect(encontrados.map((t) => t.id)).toEqual([1]);
    expect(turnosSuperpuestos({ id: 1, inicio: "2026-11-03T10:00", duracion_min: 50 }, existentes)).toEqual([]);
  });
});

describe("distribuirEnColumnas", () => {
  it("un turno solo ocupa todo el ancho", () => {
    const [r] = distribuirEnColumnas([turno(1, "10:00")]);
    expect(r).toMatchObject({ columna: 0, columnas: 1 });
  });

  it("los superpuestos van lado a lado y los demás no se ven afectados", () => {
    const r = distribuirEnColumnas([turno(1, "10:00"), turno(2, "10:30"), turno(3, "11:00"), turno(4, "14:00")]);
    const porId = Object.fromEntries(r.map((x) => [x.turno.id, x]));
    expect(porId[1]).toMatchObject({ columna: 0, columnas: 2 });
    expect(porId[2]).toMatchObject({ columna: 1, columnas: 2 });
    // El de las 11:00 reutiliza la primera columna, que ya quedó libre a las 10:50.
    expect(porId[3]).toMatchObject({ columna: 0, columnas: 2 });
    expect(porId[4]).toMatchObject({ columna: 0, columnas: 1 });
  });
});
