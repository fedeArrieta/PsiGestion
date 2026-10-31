import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { debeBloquear, problemaContrasena } = await import("./servicio");

describe("seguridad", () => {
  it("valida la contraseña nueva", () => {
    expect(problemaContrasena("corta", "corta")).toMatch(/al menos 8/);
    expect(problemaContrasena("una clave larga", "otra clave")).toMatch(/no coinciden/);
    expect(problemaContrasena("una clave larga", "una clave larga")).toBeNull();
  });

  it("bloquea después del tiempo de inactividad", () => {
    const inicio = 1_000_000;
    expect(debeBloquear(inicio, inicio + 9 * 60_000, 10)).toBe(false);
    expect(debeBloquear(inicio, inicio + 10 * 60_000, 10)).toBe(true);
    expect(debeBloquear(inicio, inicio + 999 * 60_000, 0)).toBe(false);
  });
});
