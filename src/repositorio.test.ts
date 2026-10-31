/// <reference types="node" />
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  actualizarGasto,
  actualizarPaciente,
  actualizarTurno,
  cambiarActivoPaciente,
  copiarGastosFijos,
  crearGasto,
  crearPaciente,
  crearTurno,
  eliminarGasto,
  guardarObjetivo,
  listarGastos,
  obtenerObjetivo,
  resumenMes,
  eliminarTurno,
  listarPacientes,
  listarPacientesConResumen,
  listarTurnos,
  listarTurnosDePaciente,
  marcarPagado,
  saldarPaciente,
  copiarBaseA,
  guardarConfiguracion,
  leerConfiguracion,
  verificarIntegridad,
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
    async transaccion(sentencias) {
      sqlite.exec("BEGIN");
      try {
        for (const s of sentencias) preparar(s.sql).run(...((s.params ?? []) as never[]));
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
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

  describe("pacientes y pagos", () => {
    async function escenario() {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
      const turno = (inicio: string, estado?: "realizado" | "cancelado" | "programado") =>
        crearTurno(db, { paciente_id: ana, inicio, duracion_min: 50, estado });
      const t1 = await turno("2026-10-20T10:00", "realizado");
      const t2 = await turno("2026-10-27T10:00", "realizado");
      const t3 = await turno("2026-10-29T10:00", "cancelado");
      const t4 = await turno("2026-11-03T10:00", "programado");
      return { ana, t1, t2, t3, t4 };
    }

    it("el saldo pendiente suma solo sesiones realizadas sin pagar", async () => {
      const { ana, t1 } = await escenario();
      await marcarPagado(db, t1, true);
      const [p] = await listarPacientesConResumen(db);
      expect(p).toMatchObject({ id: ana, sesiones_realizadas: 2, saldo_pendiente: 25000, ultima_sesion: "2026-10-27T10:00" });
    });

    it("saldar marca como pagadas todas las realizadas pendientes", async () => {
      const { ana } = await escenario();
      expect(await saldarPaciente(db, ana)).toBe(2);
      const [p] = await listarPacientesConResumen(db);
      expect(p.saldo_pendiente).toBe(0);
      const turnos = await listarTurnosDePaciente(db, ana);
      expect(turnos.map((t) => t.inicio)).toEqual([
        "2026-11-03T10:00",
        "2026-10-29T10:00",
        "2026-10-27T10:00",
        "2026-10-20T10:00",
      ]);
      expect(turnos.filter((t) => t.pagado).length).toBe(2);
    });

    it("cambiar la tarifa actualiza solo los turnos programados futuros", async () => {
      const { ana, t4 } = await escenario();
      await crearTurno(db, { paciente_id: ana, inicio: "2026-10-30T10:00", duracion_min: 50 }); // programado pero pasado
      await actualizarPaciente(db, ana, { nombre: "Ana María", monto_sesion: 30000 }, "2026-10-31T12:00");

      const turnos = await listarTurnosDePaciente(db, ana);
      const monto = Object.fromEntries(turnos.map((t) => [t.inicio, t.monto]));
      expect(monto["2026-11-03T10:00"]).toBe(30000);
      expect(monto["2026-10-30T10:00"]).toBe(25000);
      expect(monto["2026-10-27T10:00"]).toBe(25000);
      expect(turnos.find((t) => t.id === t4)?.monto).toBe(30000);
      const [p] = await listarPacientes(db);
      expect(p).toMatchObject({ nombre: "Ana María", monto_sesion: 30000 });
    });

    it("dar de baja oculta al paciente de la agenda pero conserva el historial", async () => {
      const { ana } = await escenario();
      await cambiarActivoPaciente(db, ana, false);
      expect(await listarPacientes(db)).toEqual([]);
      expect(await listarPacientesConResumen(db)).toEqual([]);
      const [conBajas] = await listarPacientesConResumen(db, true);
      expect(conBajas).toMatchObject({ id: ana, activo: 0, sesiones_realizadas: 2 });
      await cambiarActivoPaciente(db, ana, true);
      expect(await listarPacientes(db)).toHaveLength(1);
    });

    it("editar un turno puede marcarlo pagado, y si no se indica lo deja igual", async () => {
      const { ana, t1 } = await escenario();
      const datos = { paciente_id: ana, inicio: "2026-10-20T10:00", duracion_min: 50, estado: "realizado" as const };
      await actualizarTurno(db, t1, { ...datos, pagado: true });
      await actualizarTurno(db, t1, datos);
      const t = (await listarTurnosDePaciente(db, ana)).find((x) => x.id === t1);
      expect(t?.pagado).toBe(1);
    });
  });

  describe("finanzas", () => {
    it("gastos: alta, edición, baja y copia de fijos al mes siguiente", async () => {
      const alquiler = await crearGasto(db, { mes: "2026-10", descripcion: "Alquiler consultorio", monto: 200000, fijo: true });
      await crearGasto(db, { mes: "2026-10", descripcion: "Libros", monto: 30000 });
      const sup = await crearGasto(db, { mes: "2026-10", descripcion: "Supervisión", monto: 40000, fijo: true });
      await actualizarGasto(db, alquiler, { mes: "2026-10", descripcion: "Alquiler consultorio", monto: 220000, fijo: true });
      expect((await listarGastos(db, "2026-10")).map((g) => g.descripcion)).toEqual([
        "Alquiler consultorio",
        "Supervisión",
        "Libros",
      ]);

      expect(await copiarGastosFijos(db, "2026-10", "2026-11")).toBe(2);
      // Copiar de nuevo no duplica
      expect(await copiarGastosFijos(db, "2026-10", "2026-11")).toBe(0);
      const nov = await listarGastos(db, "2026-11");
      expect(nov.map((g) => [g.descripcion, g.monto])).toEqual([
        ["Alquiler consultorio", 220000],
        ["Supervisión", 40000],
      ]);

      await eliminarGasto(db, sup);
      expect(await listarGastos(db, "2026-10")).toHaveLength(2);
      await expect(crearGasto(db, { mes: "2026-10", descripcion: " ", monto: 1 })).rejects.toThrow();
    });

    it("el objetivo se hereda del último mes que lo tenga", async () => {
      expect(await obtenerObjetivo(db, "2026-10")).toBeNull();
      await guardarObjetivo(db, "2026-09", 800000);
      await guardarObjetivo(db, "2026-09", 900000);
      expect(await obtenerObjetivo(db, "2026-10")).toBe(900000);
      await guardarObjetivo(db, "2026-11", 1000000);
      expect(await obtenerObjetivo(db, "2026-10")).toBe(900000);
      expect(await obtenerObjetivo(db, "2026-12")).toBe(1000000);
      expect(await obtenerObjetivo(db, "2026-08")).toBeNull();
    });

    it("resumen del mes con ingresos, cobros, programados y gastos", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
      const beto = await crearPaciente(db, { nombre: "Beto", monto_sesion: 15000 });
      const t = (p: number, inicio: string, estado: "realizado" | "programado" | "cancelado" | "ausente") =>
        crearTurno(db, { paciente_id: p, inicio, duracion_min: 50, estado });
      const pagado = await t(ana, "2026-11-02T10:00", "realizado");
      await t(beto, "2026-11-03T10:00", "realizado");
      await t(ana, "2026-11-09T10:00", "programado");
      await t(ana, "2026-11-10T10:00", "cancelado");
      await t(beto, "2026-11-11T10:00", "ausente");
      await t(ana, "2026-10-30T10:00", "realizado"); // otro mes
      await marcarPagado(db, pagado, true);
      await crearGasto(db, { mes: "2026-11", descripcion: "Alquiler", monto: 100000 });

      expect(await resumenMes(db, "2026-11")).toEqual({
        facturado: 40000,
        cobrado: 25000,
        sesiones_realizadas: 2,
        programado: 25000,
        sesiones_programadas: 1,
        gastos: 100000,
        precio_promedio: (25000 + 15000 + 25000) / 3,
      });
    });

    it("sin turnos en el mes, el precio promedio sale de los pacientes activos", async () => {
      await crearPaciente(db, { nombre: "Ana", monto_sesion: 20000 });
      await crearPaciente(db, { nombre: "Beto", monto_sesion: 30000 });
      const c = await crearPaciente(db, { nombre: "Caro", monto_sesion: 90000 });
      await cambiarActivoPaciente(db, c, false);
      const r = await resumenMes(db, "2027-01");
      expect(r).toMatchObject({ facturado: 0, gastos: 0, precio_promedio: 25000 });
    });
  });

  describe("cuidado de los datos", () => {
    it("rechaza un turno de un paciente que no existe", async () => {
      await expect(
        db.execute("INSERT INTO turnos (paciente_id, inicio) VALUES ($1, $2)", [999, "2026-11-02T10:00"]),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    it("una transacción con un error no guarda nada", async () => {
      const id = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      await expect(
        db.transaccion([
          { sql: "UPDATE pacientes SET monto_sesion = $1 WHERE id = $2", params: [500, id] },
          { sql: "UPDATE tabla_que_no_existe SET x = 1" },
        ]),
      ).rejects.toThrow();
      const [p] = await listarPacientes(db);
      expect(p.monto_sesion).toBe(100);
    });

    it("guarda y lee la configuración", async () => {
      expect(await leerConfiguracion(db)).toEqual({});
      await guardarConfiguracion(db, "copias_carpeta", "C:\\Copias");
      await guardarConfiguracion(db, "copias_carpeta", "D:\\Otra");
      await guardarConfiguracion(db, "copias_conservar", "10");
      expect(await leerConfiguracion(db)).toEqual({ copias_carpeta: "D:\\Otra", copias_conservar: "10" });
    });

    it("la base recién creada pasa el chequeo de integridad", async () => {
      expect(await verificarIntegridad(db)).toEqual([]);
    });

    it("copia la base completa a un archivo", async () => {
      await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const carpeta = mkdtempSync(join(tmpdir(), "psigestion-"));
      try {
        const ruta = join(carpeta, "psigestion-manual-2026-10-31_20-00-00.db");
        await copiarBaseA(db, ruta);
        const copia = new DatabaseSync(ruta);
        const filas = copia.prepare("SELECT nombre FROM pacientes").all();
        copia.close();
        expect(filas).toEqual([{ nombre: "Ana" }]);
        await expect(copiarBaseA(db, ruta)).rejects.toThrow();
      } finally {
        rmSync(carpeta, { recursive: true, force: true });
      }
    });
  });
});
