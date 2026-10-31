import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn(() => Promise.resolve()) }));
const { mensajeAmigable, textoError } = await import("./errores");
const { error } = await import("@tauri-apps/plugin-log");

describe("errores", () => {
  it("deja pasar los mensajes propios de la app", () => {
    expect(mensajeAmigable(new Error("El nombre del paciente es obligatorio."))).toBe("El nombre del paciente es obligatorio.");
    expect(mensajeAmigable("La contraseña no es correcta.")).toBe("La contraseña no es correcta.");
  });

  it("traduce los errores técnicos conocidos", () => {
    expect(mensajeAmigable("error returned from database: (code: 5) database is locked")).toMatch(/ocupada/);
    expect(mensajeAmigable("error returned from database: (code: 787) FOREIGN KEY constraint failed")).toMatch(/relacionados/);
  });

  it("usa un mensaje genérico para el resto y registra el detalle", () => {
    expect(textoError(new TypeError("x is undefined"), "cargar agenda")).toMatch(/inesperado/);
    expect(error).toHaveBeenCalledWith("cargar agenda: x is undefined");
  });
});
