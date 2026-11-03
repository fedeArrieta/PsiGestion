import { describe, expect, it } from "vitest";
import { ordenarTurnosFicha } from "./logica";

const t = (id: number, inicio: string) => ({ id, inicio, duracion_min: 50 });

describe("ordenarTurnosFicha", () => {
  it("pone primero los próximos (del más cercano) y después los anteriores (del más reciente)", () => {
    const turnos = [t(1, "2026-12-10T10:00"), t(2, "2026-11-01T10:00"), t(3, "2026-11-05T10:00"), t(4, "2026-10-20T10:00")];
    const { proximos, anteriores } = ordenarTurnosFicha(turnos, new Date(2026, 10, 3, 12, 0));
    expect(proximos.map((x) => x.id)).toEqual([3, 1]);
    expect(anteriores.map((x) => x.id)).toEqual([2, 4]);
  });

  it("el turno en curso cuenta como próximo", () => {
    const { proximos } = ordenarTurnosFicha([t(1, "2026-11-03T11:30")], new Date(2026, 10, 3, 12, 0));
    expect(proximos.map((x) => x.id)).toEqual([1]);
  });
});
