/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  actualizarTurno,
  crearPaciente,
  crearTurno,
  eliminarTurno,
  listarPacientes,
  listarTurnos,
  type Db,
} from "./repositorio";

const CARPETA_MIGRACIONES = new URL("../src-tauri/migrations/", import.meta.url);

/** Base en memoria con las mismas migraciones que usa la app. */
function crearDbDePrueba(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const archivo of readdirSync(CARPETA_MIGRACIONES).sort()) {
    sqlite.exec(readFileSync(new URL(archivo, CARPETA_MIGRACIONES), "utf8"));
  }
  // tauri-plugin-sql usa $1, $2…; en SQLite eso equivale a ?1, ?2…
  const preparar = (sql: string) => sqlite.prepare(sql.replace(/\$(\d+)/g, "?$1"));
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      return preparar(sql).all(...(params as never[])) as T;
    },
    async execute(sql: string, params: unknown[] = []) {
      const r = preparar(sql).run(...(params as never[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  };
}

describe("repositorio", () => {
  let db: Db;
  beforeEach(() => {
    db = crearDbDePrueba();
  });

  it("crea pacientes y los lista por nombre", async () => {
    await crearPaciente(db, { nombre: "  Zoe ", monto_sesion: 20000 });
    await crearPaciente(db, { nombre: "ana", telefono: "" });
    const pacientes = await listarPacientes(db);
    expect(pacientes.map((p) => p.nombre)).toEqual(["ana", "Zoe"]);
    expect(pacientes[0].telefono).toBeNull();
  });

  it("rechaza un paciente sin nombre", async () => {
    await expect(crearPaciente(db, { nombre: "  " })).rejects.toThrow("obligatorio");
  });

  it("el turno copia el monto del paciente y se lista en su rango", async () => {
    const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
    const id = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
    await crearTurno(db, { paciente_id: ana, inicio: "2026-11-10T10:00", duracion_min: 50 });

    const semana = await listarTurnos(db, "2026-11-02T00:00", "2026-11-09T00:00");
    expect(semana).toHaveLength(1);
    expect(semana[0]).toMatchObject({ id, paciente_nombre: "Ana", monto: 25000, estado: "programado" });
  });

  it("cambiar la tarifa del paciente no altera turnos ya creados", async () => {
    const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
    const id = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
    await db.execute("UPDATE pacientes SET monto_sesion = 30000 WHERE id = $1", [ana]);
    await actualizarTurno(db, id, { paciente_id: ana, inicio: "2026-11-03T11:00", duracion_min: 50, estado: "realizado" });

    const [t] = await listarTurnos(db, "2026-11-03T00:00", "2026-11-04T00:00");
    expect(t).toMatchObject({ inicio: "2026-11-03T11:00", estado: "realizado", monto: 25000 });
  });

  it("al cambiar de paciente toma el monto del nuevo", async () => {
    const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
    const beto = await crearPaciente(db, { nombre: "Beto", monto_sesion: 18000 });
    const id = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
    await actualizarTurno(db, id, { paciente_id: beto, inicio: "2026-11-03T10:00", duracion_min: 50 });

    const [t] = await listarTurnos(db, "2026-11-03T00:00", "2026-11-04T00:00");
    expect(t).toMatchObject({ paciente_nombre: "Beto", monto: 18000 });
  });

  it("elimina turnos y valida los datos", async () => {
    const ana = await crearPaciente(db, { nombre: "Ana" });
    const id = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
    await eliminarTurno(db, id);
    expect(await listarTurnos(db, "2026-11-01T00:00", "2026-12-01T00:00")).toEqual([]);

    await expect(crearTurno(db, { paciente_id: ana, inicio: "3/11 10hs", duracion_min: 50 })).rejects.toThrow();
    await expect(crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 0 })).rejects.toThrow();
    await expect(crearTurno(db, { paciente_id: 999, inicio: "2026-11-03T10:00", duracion_min: 50 })).rejects.toThrow();
  });
});
