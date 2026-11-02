import { describe, expect, it } from "vitest";
import type { NotaClinica } from "../tipos";
import { cambiarPlantilla, filtrarNotas, fragmento, notaVacia, seccionesVacias } from "./logica";

const nota = (id: number, paciente: string, textos: string[]): NotaClinica => ({
  id,
  paciente_id: 1,
  paciente_nombre: paciente,
  turno_id: null,
  turno_inicio: null,
  fecha: "2026-11-03",
  plantilla: "sesion",
  secciones: seccionesVacias("sesion").map((s, i) => ({ ...s, texto: textos[i] ?? "" })),
  creado_en: "",
  modificado_en: "",
});

describe("notas clínicas", () => {
  const notas = [
    nota(1, "Ana López", ["Ansiedad por la mudanza", "Duerme mejor"]),
    nota(2, "Beto", ["Duelo", "", "Escribir una carta"]),
  ];

  it("busca sin importar mayúsculas ni tildes, con todas las palabras", () => {
    expect(filtrarNotas(notas, "MUDANZA").map((n) => n.id)).toEqual([1]);
    expect(filtrarNotas(notas, "lopez").map((n) => n.id)).toEqual([1]);
    expect(filtrarNotas(notas, "duelo carta").map((n) => n.id)).toEqual([2]);
    expect(filtrarNotas(notas, "duelo mudanza")).toEqual([]);
    expect(filtrarNotas(notas, "  ")).toHaveLength(2);
  });

  it("el fragmento muestra la sección donde aparece y resalta las coincidencias", () => {
    expect(fragmento(notas[1], "carta")).toEqual({ titulo: "Tareas", partes: ["Escribir una ", "carta", ""] });
    expect(fragmento(notas[0], "")).toEqual({ titulo: "Motivo de consulta", partes: ["Ansiedad por la mudanza"] });
    expect(fragmento(nota(3, "C", []), "")).toBeNull();
  });

  it("el fragmento recorta textos largos alrededor de la coincidencia", () => {
    const largo = `${"palabra ".repeat(30)}encontrada ${"resto ".repeat(40)}`;
    const f = fragmento(nota(4, "D", [largo]), "encontrada")!;
    expect(f.partes[0].startsWith("…")).toBe(true);
    expect(f.partes[1]).toBe("encontrada");
    expect(f.partes[2].endsWith("…")).toBe(true);
  });

  it("cambiar de plantilla no pierde lo escrito", () => {
    const actuales = [
      { titulo: "Motivo de consulta", texto: "Ansiedad" },
      { titulo: "Observaciones", texto: "" },
      { titulo: "Tareas", texto: "Registro diario" },
    ];
    expect(cambiarPlantilla(actuales, "primera")).toEqual([
      { titulo: "Motivo de consulta", texto: "Ansiedad" },
      { titulo: "Antecedentes", texto: "" },
      { titulo: "Observaciones", texto: "" },
      { titulo: "Plan de trabajo", texto: "" },
      { titulo: "Tareas", texto: "Registro diario" },
    ]);
    expect(notaVacia(seccionesVacias("primera"))).toBe(true);
  });
});
