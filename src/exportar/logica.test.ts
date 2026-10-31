import { describe, expect, it } from "vitest";
import { hojasExportacion, nombreArchivo } from "./logica";

describe("exportación", () => {
  it("arma las tres hojas con formato legible", () => {
    const hojas = hojasExportacion({
      pacientes: [{ id: 1, nombre: "Ana", telefono: null, email: null, monto_sesion: 25000, notas: null, activo: 1 }],
      turnos: [
        {
          id: 1, paciente_id: 1, paciente_nombre: "Ana", inicio: "2026-10-31T09:00", duracion_min: 50,
          estado: "realizado", monto: 25000, pagado: 0, notas: null,
        },
      ],
      gastos: [{ id: 1, mes: "2026-10", descripcion: "Alquiler", monto: 100000, fijo: 1 }],
    });
    expect(hojas.map((h) => h.nombre)).toEqual(["Pacientes", "Turnos", "Gastos"]);
    expect(hojas[0].filas[0]).toEqual(["Ana", null, null, 25000, "Sí", null]);
    expect(hojas[1].filas[0]).toEqual(["31/10/2026 09:00", "Ana", 50, "Realizado", 25000, "No", null]);
    expect(hojas[2].filas[0]).toEqual(["10/2026", "Alquiler", 100000, "Sí"]);
    for (const h of hojas) for (const f of h.filas) expect(f).toHaveLength(h.columnas.length);
  });

  it("sugiere un nombre de archivo", () => {
    expect(nombreArchivo("2026-10", new Date(2026, 10, 2))).toBe("PsiGestion 2026-10.xlsx");
    expect(nombreArchivo(null, new Date(2026, 10, 2))).toBe("PsiGestion completo 2026-11-02.xlsx");
  });
});
