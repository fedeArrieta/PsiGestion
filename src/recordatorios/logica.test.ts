import { describe, expect, it } from "vitest";
import {
  ASUNTO_POR_DEFECTO,
  completarPlantilla,
  emailValido,
  enlaceMail,
  enlaceWhatsApp,
  leerPlantilla,
  MENSAJE_POR_DEFECTO,
  primerNombre,
  telefonoWhatsApp,
  textoDia,
} from "./logica";

const hoy = new Date(2026, 10, 2, 15, 0); // lunes 2 de noviembre de 2026

describe("telefonoWhatsApp", () => {
  it.each([
    ["011 15 1234-5678", "5491112345678"],
    ["(0351) 15-123-4567", "5493511234567"],
    ["02954 15 12-3456", "5492954123456"],
    ["11 1234 5678", "5491112345678"],
    ["1112345678", "5491112345678"],
    ["+54 9 11 1234-5678", "5491112345678"],
    ["+54 11 1234 5678", "5491112345678"],
    ["0054 9 351 123 4567", "5493511234567"],
    ["5493511234567", "5493511234567"],
    ["+34 612 34 56 78", "34612345678"],
  ])("%s → %s", (entrada, esperado) => {
    expect(telefonoWhatsApp(entrada)).toBe(esperado);
  });

  it("sin característica o vacío no alcanza", () => {
    expect(telefonoWhatsApp("1234-5678")).toBeNull();
    expect(telefonoWhatsApp("15 1234 5678")).toBeNull();
    expect(telefonoWhatsApp("")).toBeNull();
    expect(telefonoWhatsApp(null)).toBeNull();
  });
});

describe("mensaje", () => {
  it("usa el primer nombre y el día relativo", () => {
    expect(primerNombre("  Ana María López ")).toBe("Ana");
    expect(textoDia(new Date(2026, 10, 3, 10, 0), hoy)).toBe("mañana, martes 3 de noviembre");
    expect(textoDia(new Date(2026, 10, 2, 18, 0), hoy)).toBe("hoy, lunes 2 de noviembre");
    expect(textoDia(new Date(2026, 10, 5, 9, 0), hoy)).toBe("el jueves 5 de noviembre");
  });

  it("completa la plantilla por defecto", () => {
    const texto = completarPlantilla(MENSAJE_POR_DEFECTO, {
      pacienteNombre: "Ana López",
      inicio: "2026-11-03T15:00",
      profesional: "Lic. Pérez",
      hoy,
    });
    expect(texto).toBe(
      "Hola Ana, te recuerdo tu turno mañana, martes 3 de noviembre a las 15:00 hs. Si no podés venir, por favor avisame. Saludos, Lic. Pérez",
    );
  });

  it("sin nombre del profesional no deja la coma colgando", () => {
    const texto = completarPlantilla(MENSAJE_POR_DEFECTO, { pacienteNombre: "Ana", inicio: "2026-11-03T15:00", profesional: "", hoy });
    expect(texto.endsWith("avisame. Saludos")).toBe(true);
  });

  it("deja como están las variables desconocidas y respeta mayúsculas", () => {
    expect(completarPlantilla("{NOMBRE} {otra}", { pacienteNombre: "Ana", inicio: "2026-11-03T15:00", profesional: "", hoy })).toBe(
      "Ana {otra}",
    );
  });

  it("plantilla por defecto si no hay configurada", () => {
    expect(leerPlantilla({})).toEqual({ mensaje: MENSAJE_POR_DEFECTO, asunto: ASUNTO_POR_DEFECTO });
    expect(leerPlantilla({ recordatorio_mensaje: "Hola {nombre}", recordatorio_asunto: " " }).asunto).toBe(ASUNTO_POR_DEFECTO);
  });
});

describe("enlaces", () => {
  it("arma el enlace de WhatsApp con el texto codificado", () => {
    expect(enlaceWhatsApp("5491112345678", "Hola Ana, ¿venís?")).toBe(
      "https://wa.me/5491112345678?text=Hola%20Ana%2C%20%C2%BFven%C3%ADs%3F",
    );
  });

  it("arma el mailto con asunto y cuerpo", () => {
    expect(enlaceMail(" ana@mail.com ", "Turno", "Hola & chau")).toBe("mailto:ana@mail.com?subject=Turno&body=Hola%20%26%20chau");
  });

  it("valida el mail", () => {
    expect(emailValido("ana@mail.com")).toBe(true);
    expect(emailValido("ana@mail")).toBe(false);
    expect(emailValido("ana mail.com")).toBe(false);
    expect(emailValido(null)).toBe(false);
  });
});
