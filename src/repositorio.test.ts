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
  borrarDePapelera,
  listarHistorial,
  listarPapelera,
  restaurarDePapelera,
  vaciarPapeleraVencida,
  datosParaExportar,
  guardarConfiguracion,
  leerConfiguracion,
  verificarIntegridad,
  agregarNoLaborable,
  cargarFeriados,
  crearSerie,
  eliminarNoLaborable,
  extenderSeries,
  listarNoLaborables,
  listarSeriesDePaciente,
  modificarSerieDesde,
  obtenerSerie,
  previsualizarSerie,
  terminarSerie,
  actualizarNota,
  crearNota,
  eliminarNota,
  listarNotas,
  listarVersionesNota,
  notaDeTurno,
  obtenerNota,
  turnosConNota,
  guardarPoliticaAusencias,
  leerPoliticaAusencias,
  listarParaRecordatorios,
  contarRecordatoriosPendientes,
  marcarRecordatorio,
  leerPlantillaRecordatorio,
  guardarPlantillaRecordatorio,
  emitirRecibo,
  anularRecibo,
  listarRecibos,
  turnosSinRecibo,
  recibosDeTurnos,
  proximoNumeroRecibo,
  ultimoMedioPago,
  obtenerRecibo,
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
        ausencias: 1,
        ausencias_sin_aviso: 1,
        cargos_ausencias: 0,
        cancelados: 1,
        programado: 25000,
        sesiones_programadas: 1,
        gastos: 100000,
        precio_promedio: expect.closeTo((25000 + 15000 + 25000) / 3, 6),
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

  it("junta los datos para exportar, completos o de un mes", async () => {
    const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
    const beto = await crearPaciente(db, { nombre: "Beto", monto_sesion: 200 });
    await cambiarActivoPaciente(db, beto, false);
    await crearTurno(db, { paciente_id: ana, inicio: "2026-10-31T09:00", duracion_min: 50 });
    await crearTurno(db, { paciente_id: ana, inicio: "2026-11-02T09:00", duracion_min: 50 });
    await crearGasto(db, { mes: "2026-10", descripcion: "Alquiler", monto: 1000 });
    await crearGasto(db, { mes: "2026-11", descripcion: "Luz", monto: 50 });

    const todo = await datosParaExportar(db, null);
    expect(todo.pacientes.map((p) => p.nombre)).toEqual(["Ana", "Beto"]);
    expect(todo.turnos).toHaveLength(2);
    expect(todo.turnos[0].paciente_nombre).toBe("Ana");
    expect(todo.gastos).toHaveLength(2);

    const octubre = await datosParaExportar(db, "2026-10");
    expect(octubre.turnos.map((t) => t.inicio)).toEqual(["2026-10-31T09:00"]);
    expect(octubre.gastos.map((g) => g.descripcion)).toEqual(["Alquiler"]);
    await expect(datosParaExportar(db, "octubre")).rejects.toThrow();
  });

  it("guarda los montos en centavos y suma sin errores de redondeo", async () => {
    // 0,1 + 0,2 en números de punto flotante da 0,30000000000000004.
    await crearGasto(db, { mes: "2026-11", descripcion: "A", monto: 0.1 });
    await crearGasto(db, { mes: "2026-11", descripcion: "B", monto: 0.2 });
    for (let i = 0; i < 1000; i++) await crearGasto(db, { mes: "2026-11", descripcion: `C${i}`, monto: 0.01 });
    expect((await resumenMes(db, "2026-11")).gastos).toBe(10.3);
    const [crudo] = await db.select<{ monto: number }[]>("SELECT monto FROM gastos WHERE descripcion = 'B'");
    expect(crudo.monto).toBe(20);
    expect((await listarGastos(db, "2026-11")).find((g) => g.descripcion === "B")?.monto).toBe(0.2);
  });

  it("la migración pasa a centavos los montos que ya estaban cargados", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const archivos = readdirSync(CARPETA_MIGRACIONES).sort();
    for (const a of archivos.slice(0, 3)) sqlite.exec(readFileSync(new URL(a, CARPETA_MIGRACIONES), "utf8"));
    sqlite.exec("INSERT INTO pacientes (nombre, monto_sesion) VALUES ('Ana', 25000.5)");
    sqlite.exec("INSERT INTO turnos (paciente_id, inicio, monto) VALUES (1, '2026-11-02T10:00', 25000.5)");
    sqlite.exec("INSERT INTO gastos (mes, descripcion, monto) VALUES ('2026-11', 'Luz', 1234.56)");
    sqlite.exec("INSERT INTO objetivos (mes, monto) VALUES ('2026-11', 500000)");
    sqlite.exec(readFileSync(new URL(archivos[3], CARPETA_MIGRACIONES), "utf8"));
    const fila = (sql: string) => Object.values(sqlite.prepare(sql).get() as object)[0];
    expect(fila("SELECT monto_sesion FROM pacientes")).toBe(2500050);
    expect(fila("SELECT monto FROM turnos")).toBe(2500050);
    expect(fila("SELECT monto FROM gastos")).toBe(123456);
    expect(fila("SELECT monto FROM objetivos")).toBe(50000000);
  });

  describe("papelera e historial", () => {
    it("un turno eliminado va a la papelera y se puede restaurar igual que estaba", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-02T10:00", duracion_min: 50, notas: "x" });
      await marcarPagado(db, turno, true);
      const enPapelera = await eliminarTurno(db, turno);
      expect(await listarTurnosDePaciente(db, ana)).toEqual([]);
      const papelera = await listarPapelera(db);
      expect(papelera).toHaveLength(1);
      expect(papelera[0]).toMatchObject({ id: enPapelera, tipo: "turno", descripcion: "Turno de Ana (2026-11-02T10:00)" });

      await restaurarDePapelera(db, enPapelera!);
      const [t] = await listarTurnosDePaciente(db, ana);
      expect(t).toMatchObject({ id: turno, monto: 25000, pagado: 1, notas: "x", duracion_min: 50 });
      expect(await listarPapelera(db)).toEqual([]);
      const acciones = (await listarHistorial(db, ana)).map((h) => h.accion);
      expect(acciones.filter((a) => a === "creado")).toHaveLength(1);
      expect(acciones[0]).toBe("restaurado");
      await expect(restaurarDePapelera(db, enPapelera!)).rejects.toThrow(/ya no está/);
    });

    it("un gasto eliminado se puede restaurar o borrar definitivamente", async () => {
      const id = await crearGasto(db, { mes: "2026-11", descripcion: "Luz", monto: 1234.5, fijo: true });
      const enPapelera = await eliminarGasto(db, id);
      expect(await listarGastos(db, "2026-11")).toEqual([]);
      await restaurarDePapelera(db, enPapelera!);
      expect(await listarGastos(db, "2026-11")).toMatchObject([{ id, descripcion: "Luz", monto: 1234.5, fijo: 1 }]);

      const otra = await eliminarGasto(db, id);
      await borrarDePapelera(db, otra!);
      expect(await listarPapelera(db)).toEqual([]);
    });

    it("vacía lo que lleva más de 30 días", async () => {
      const id = await crearGasto(db, { mes: "2026-11", descripcion: "Luz", monto: 10 });
      await eliminarGasto(db, id);
      await db.execute("UPDATE papelera SET eliminado_en = '2026-10-01 10:00:00'");
      expect(await vaciarPapeleraVencida(db, "2026-10-25T10:00")).toBe(0);
      expect(await vaciarPapeleraVencida(db, "2026-11-05T10:00")).toBe(1);
    });

    it("registra los cambios de turnos y pagos", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-02T10:00", duracion_min: 50 });
      await actualizarTurno(db, turno, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50, estado: "realizado" });
      await marcarPagado(db, turno, true);
      await actualizarPaciente(db, ana, { nombre: "Ana", monto_sesion: 200 }, "2026-01-01T00:00");
      await eliminarTurno(db, turno);
      const acciones = (await listarHistorial(db, ana)).map((h) => h.accion).reverse();
      // Estado y fecha cambian en el mismo UPDATE: SQLite no garantiza el orden de esos dos.
      expect(acciones[0]).toBe("creado");
      expect(acciones.slice(1, 3).sort()).toEqual(["estado", "reprogramado"]);
      expect(acciones.slice(3)).toEqual(["pagado", "eliminado"]);
      const [ultimo] = await listarHistorial(db, null, 1);
      expect(ultimo).toMatchObject({ paciente_nombre: "Ana", detalle: "Turno del 2026-11-03T10:00 eliminado" });
    });
  });

  describe("turnos recurrentes", () => {
    const HOY = "2026-11-02";
    const fechas = async (pacienteId: number) =>
      (await listarTurnosDePaciente(db, pacienteId)).map((t) => t.inicio).reverse();

    it("crea la serie y agenda los turnos con el monto del paciente", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
      const n = await crearSerie(
        db,
        { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-11-24", notas: "Fijo" },
        HOY,
      );
      expect(n).toBe(4);
      const turnos = await listarTurnosDePaciente(db, ana);
      expect(turnos.map((t) => t.inicio).reverse()).toEqual([
        "2026-11-03T10:00",
        "2026-11-10T10:00",
        "2026-11-17T10:00",
        "2026-11-24T10:00",
      ]);
      expect(turnos[0]).toMatchObject({ monto: 25000, estado: "programado", notas: "Fijo" });
      expect(turnos.every((t) => t.serie_id === turnos[0].serie_id && t.serie_id != null)).toBe(true);
      expect(await listarSeriesDePaciente(db, ana, HOY)).toHaveLength(1);
    });

    it("sin fecha de fin genera hasta el horizonte y después se extiende sola", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const n = await crearSerie(
        db,
        { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 2, hasta: null },
        HOY,
      );
      expect(n).toBe(13); // 26 semanas, semana por medio
      expect(await extenderSeries(db, HOY)).toBe(0);
      // Un mes después aparecen los turnos que faltan, sin repetir.
      expect(await extenderSeries(db, "2026-12-02")).toBe(3);
      const f = await fechas(ana);
      expect(new Set(f).size).toBe(f.length);
      expect(f[f.length - 1]).toBe("2027-06-01T10:00");
      // Pacientes dados de baja: sus series no se extienden.
      await cambiarActivoPaciente(db, ana, false);
      expect(await extenderSeries(db, "2027-03-01")).toBe(0);
    });

    it("saltea feriados y vacaciones, y avisa superposiciones", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const beto = await crearPaciente(db, { nombre: "Beto" });
      await agregarNoLaborable(db, { desde: "2026-11-10", hasta: "2026-11-10", descripcion: "Feriado inventado" });
      await crearTurno(db, { paciente_id: beto, inicio: "2026-11-17T10:30", duracion_min: 50 });
      const d = { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-11-24" };
      const vista = await previsualizarSerie(db, d, HOY);
      expect(vista.agendar).toEqual(["2026-11-03", "2026-11-17", "2026-11-24"]);
      expect(vista.salteadas).toEqual([{ fecha: "2026-11-10", motivo: "Feriado inventado" }]);
      expect(vista.superpuestas).toEqual([{ fecha: "2026-11-17", paciente_nombre: "Beto", inicio: "2026-11-17T10:30" }]);
      expect(await crearSerie(db, d, HOY)).toBe(3);
    });

    it("cargar vacaciones quita los turnos de la serie y borrarlas los devuelve", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      await crearSerie(
        db,
        { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-12-01" },
        HOY,
      );
      const suelto = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-12T15:00", duracion_min: 50 });
      const r = await agregarNoLaborable(db, { desde: "2026-11-09", hasta: "2026-11-20", descripcion: "Vacaciones" });
      expect(r).toEqual({ quitados: 2, sueltos: 1 });
      expect(await fechas(ana)).toEqual(["2026-11-03T10:00", "2026-11-12T15:00", "2026-11-24T10:00", "2026-12-01T10:00"]);
      await eliminarTurno(db, suelto);

      const [vac] = await listarNoLaborables(db);
      // Si ya pasó parte del período, solo vuelven los turnos desde hoy.
      expect(await eliminarNoLaborable(db, vac.id, "2026-11-15")).toBe(1);
      expect(await fechas(ana)).toEqual(["2026-11-03T10:00", "2026-11-17T10:00", "2026-11-24T10:00", "2026-12-01T10:00"]);
      expect(await listarNoLaborables(db)).toEqual([]);
    });

    it("carga los feriados sin duplicarlos", async () => {
      const feriados = [
        { desde: "2026-11-23", hasta: "2026-11-23", descripcion: "Soberanía" },
        { desde: "2026-12-08", hasta: "2026-12-08", descripcion: "Inmaculada" },
      ];
      expect((await cargarFeriados(db, feriados)).agregados).toBe(2);
      expect((await cargarFeriados(db, feriados)).agregados).toBe(0);
      expect((await listarNoLaborables(db))[0]).toMatchObject({ tipo: "feriado" });
    });

    it("modifica la serie desde un turno en adelante sin tocar los anteriores ni los ya cancelados", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      await crearSerie(
        db,
        { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-12-01" },
        HOY,
      );
      const turnos = (await listarTurnosDePaciente(db, ana)).reverse();
      const serieId = turnos[0].serie_id!;
      await actualizarTurno(db, turnos[0].id, { paciente_id: ana, inicio: turnos[0].inicio, duracion_min: 50, estado: "realizado" });
      // El 24 lo cancelaron a mano: se respeta.
      await actualizarTurno(db, turnos[3].id, { paciente_id: ana, inicio: turnos[3].inicio, duracion_min: 50, estado: "cancelado" });

      // Desde el 17 pasa a los miércoles a las 11.
      const n = await modificarSerieDesde(
        db,
        serieId,
        "2026-11-17",
        { paciente_id: ana, desde: "2026-11-18", hora: "11:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-12-02" },
        HOY,
      );
      expect(n).toBe(3);
      expect(await fechas(ana)).toEqual([
        "2026-11-03T10:00",
        "2026-11-10T10:00",
        "2026-11-18T11:00",
        "2026-11-24T10:00",
        "2026-11-25T11:00",
        "2026-12-02T11:00",
      ]);
      expect(await obtenerSerie(db, serieId)).toMatchObject({ desde: "2026-11-18", hora: "11:00", hasta: "2026-12-02" });
    });

    it("terminar la serie manda los turnos siguientes a la papelera", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      await crearSerie(
        db,
        { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: null },
        HOY,
      );
      const serieId = (await listarTurnosDePaciente(db, ana))[0].serie_id!;
      expect(await terminarSerie(db, serieId, "2026-11-17")).toBe(24);
      expect(await fechas(ana)).toEqual(["2026-11-03T10:00", "2026-11-10T10:00"]);
      expect(await obtenerSerie(db, serieId)).toMatchObject({ hasta: "2026-11-16", generada_hasta: "2026-11-16" });
      expect(await extenderSeries(db, "2027-01-01")).toBe(0);
      expect(await listarSeriesDePaciente(db, ana, "2026-11-20")).toEqual([]);

      // Un turno restaurado de la papelera vuelve con su serie.
      const [elemento] = await listarPapelera(db);
      await restaurarDePapelera(db, elemento.id);
      expect((await listarTurnosDePaciente(db, ana)).filter((t) => t.serie_id === serieId)).toHaveLength(3);
    });
  });

  describe("notas clínicas", () => {
    const secciones = (motivo: string, obs = "", tareas = "") => [
      { titulo: "Motivo de consulta", texto: motivo },
      { titulo: "Observaciones", texto: obs },
      { titulo: "Tareas", texto: tareas },
    ];

    it("crea una nota vinculada a la sesión y la lista con el paciente", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const id = await crearNota(db, {
        paciente_id: ana,
        turno_id: turno,
        fecha: "2026-11-03",
        plantilla: "sesion",
        secciones: secciones("Ansiedad en el trabajo", "Mejor ánimo  \n"),
      });
      const nota = await obtenerNota(db, id);
      expect(nota).toMatchObject({ paciente_nombre: "Ana", turno_id: turno, turno_inicio: "2026-11-03T10:00", fecha: "2026-11-03" });
      expect(nota!.secciones).toEqual(secciones("Ansiedad en el trabajo", "Mejor ánimo"));
      expect((await notaDeTurno(db, turno))!.id).toBe(id);
      expect(await turnosConNota(db, ana)).toEqual(new Set([turno]));
      expect(await listarNotas(db, { pacienteId: ana + 1 })).toEqual([]);
    });

    it("valida la nota", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const beto = await crearPaciente(db, { nombre: "Beto" });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const base = { paciente_id: ana, fecha: "2026-11-03", plantilla: "sesion" };
      await expect(crearNota(db, { ...base, secciones: secciones("  ") })).rejects.toThrow("vacía");
      await expect(crearNota(db, { ...base, fecha: "3/11", secciones: secciones("x") })).rejects.toThrow("fecha");
      await expect(crearNota(db, { ...base, paciente_id: beto, turno_id: turno, secciones: secciones("x") })).rejects.toThrow(
        "otro paciente",
      );
      await crearNota(db, { ...base, turno_id: turno, secciones: secciones("x") });
      await expect(crearNota(db, { ...base, turno_id: turno, secciones: secciones("y") })).rejects.toThrow("ya tiene una nota");
    });

    it("lista de la más nueva a la más vieja", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const base = { paciente_id: ana, plantilla: "libre" };
      await crearNota(db, { ...base, fecha: "2026-10-01", secciones: [{ titulo: "Nota", texto: "a" }] });
      await crearNota(db, { ...base, fecha: "2026-11-01", secciones: [{ titulo: "Nota", texto: "b" }] });
      expect((await listarNotas(db)).map((n) => n.fecha)).toEqual(["2026-11-01", "2026-10-01"]);
    });

    it("guarda las versiones anteriores al modificar", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const d = { paciente_id: ana, fecha: "2026-11-03", plantilla: "sesion" };
      const id = await crearNota(db, { ...d, secciones: secciones("Primera") });
      await actualizarNota(db, id, { ...d, secciones: secciones("Segunda") }, "2026-11-03T12:00");
      await actualizarNota(db, id, { ...d, secciones: secciones("Segunda") }, "2026-11-03T12:05"); // sin cambios
      await actualizarNota(db, id, { ...d, secciones: secciones("Tercera") }, "2026-11-04T09:00");
      const versiones = await listarVersionesNota(db, id);
      expect(versiones.map((v) => v.secciones[0].texto)).toEqual(["Segunda", "Primera"]);
      expect(versiones[0].guardada_en).toBe("2026-11-03 12:05");
      expect((await obtenerNota(db, id))!.modificado_en).toBe("2026-11-04 09:00");
    });

    it("eliminar la manda a la papelera sin el contenido en la descripción, y se puede restaurar", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const d = { paciente_id: ana, turno_id: turno, fecha: "2026-11-03", plantilla: "sesion" };
      const id = await crearNota(db, { ...d, secciones: secciones("Secreto") });
      await actualizarNota(db, id, { ...d, secciones: secciones("Secreto 2") }, "2026-11-03T12:00");
      const papeleraId = await eliminarNota(db, id);
      expect(await listarNotas(db)).toEqual([]);
      const [elemento] = await listarPapelera(db);
      expect(elemento).toMatchObject({ id: papeleraId, tipo: "nota", descripcion: "Nota clínica de Ana (2026-11-03)" });
      expect(elemento.descripcion).not.toContain("Secreto");

      // Vaciar la papelera de otras cosas no borra las versiones de una nota que está en la papelera.
      const gasto = await crearGasto(db, { mes: "2026-11", descripcion: "Luz", monto: 1 });
      const gastoPapelera = await eliminarGasto(db, gasto);
      await borrarDePapelera(db, gastoPapelera!);
      expect(await listarVersionesNota(db, id)).toHaveLength(1);

      await restaurarDePapelera(db, papeleraId!);
      const nota = await obtenerNota(db, id);
      expect(nota).toMatchObject({ turno_id: turno, modificado_en: "2026-11-03 12:00" });
      expect(nota!.secciones[0].texto).toBe("Secreto 2");
      expect(await listarVersionesNota(db, id)).toHaveLength(1);
    });

    it("si la sesión ya tiene otra nota, la restaurada vuelve sin vincular", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const d = { paciente_id: ana, turno_id: turno, fecha: "2026-11-03", plantilla: "sesion" };
      const id = await crearNota(db, { ...d, secciones: secciones("Vieja") });
      const papeleraId = await eliminarNota(db, id);
      await crearNota(db, { ...d, secciones: secciones("Nueva") });
      await restaurarDePapelera(db, papeleraId!);
      expect((await obtenerNota(db, id))!.turno_id).toBeNull();
    });

    it("borrar la nota de la papelera borra también sus versiones", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const d = { paciente_id: ana, fecha: "2026-11-03", plantilla: "sesion" };
      const id = await crearNota(db, { ...d, secciones: secciones("Uno") });
      await actualizarNota(db, id, { ...d, secciones: secciones("Dos") }, "2026-11-03T12:00");
      const papeleraId = await eliminarNota(db, id);
      await borrarDePapelera(db, papeleraId!);
      expect(await listarVersionesNota(db, id)).toEqual([]);
    });

    it("la nota sigue vinculada si el turno va a la papelera y vuelve", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const turno = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const id = await crearNota(db, { paciente_id: ana, turno_id: turno, fecha: "2026-11-03", plantilla: "sesion", secciones: secciones("x") });
      const papeleraId = await eliminarTurno(db, turno);
      expect((await obtenerNota(db, id))!.turno_inicio).toBeNull();
      await restaurarDePapelera(db, papeleraId!);
      expect((await obtenerNota(db, id))!.turno_inicio).toBe("2026-11-03T10:00");
    });

    it("las notas no se exportan a Excel", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      await crearNota(db, { paciente_id: ana, fecha: "2026-11-03", plantilla: "sesion", secciones: secciones("Secreto") });
      expect(JSON.stringify(await datosParaExportar(db, null))).not.toContain("Secreto");
    });
  });

  describe("ausencias y cancelaciones", () => {
    const base = { inicio: "2026-11-03T10:00", duracion_min: 50 };

    it("una ausencia sin cobro no suma al saldo; con cobro, sí", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 20000 });
      const t1 = await crearTurno(db, { paciente_id: ana, ...base });
      const t2 = await crearTurno(db, { paciente_id: ana, ...base, inicio: "2026-11-10T10:00" });
      const t3 = await crearTurno(db, { paciente_id: ana, ...base, inicio: "2026-11-17T10:00" });
      await actualizarTurno(db, t1, { paciente_id: ana, ...base, estado: "realizado" });
      await actualizarTurno(db, t2, { paciente_id: ana, ...base, inicio: "2026-11-10T10:00", estado: "ausente", aviso: "con_aviso" });
      await actualizarTurno(db, t3, {
        paciente_id: ana, ...base, inicio: "2026-11-17T10:00", estado: "ausente", aviso: "sin_aviso", cargo: 10000.5,
      });

      const [p] = await listarPacientesConResumen(db);
      expect(p).toMatchObject({ sesiones_realizadas: 1, ausencias: 2, saldo_pendiente: 30000.5 });
      const turnos = await listarTurnosDePaciente(db, ana);
      expect(turnos.find((t) => t.id === t2)).toMatchObject({ aviso: "con_aviso", cargo: null });
      expect(turnos.find((t) => t.id === t3)).toMatchObject({ aviso: "sin_aviso", cargo: 10000.5 });

      expect(await saldarPaciente(db, ana)).toBe(2);
      expect((await listarPacientesConResumen(db))[0].saldo_pendiente).toBe(0);
      expect((await listarTurnosDePaciente(db, ana)).find((t) => t.id === t2)!.pagado).toBe(0);
    });

    it("aviso y cargo solo se guardan en ausencias; sin cobro el turno no queda pagado", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 20000 });
      const id = await crearTurno(db, { paciente_id: ana, ...base });
      await actualizarTurno(db, id, { paciente_id: ana, ...base, estado: "ausente", cargo: 20000, pagado: true });
      expect((await listarTurnosDePaciente(db, ana))[0]).toMatchObject({ aviso: "sin_aviso", cargo: 20000, pagado: 1 });

      await actualizarTurno(db, id, { paciente_id: ana, ...base, estado: "cancelado", aviso: "con_aviso", cargo: 5, pagado: true });
      expect((await listarTurnosDePaciente(db, ana))[0]).toMatchObject({ estado: "cancelado", aviso: null, cargo: null, pagado: 0 });

      await expect(
        actualizarTurno(db, id, { paciente_id: ana, ...base, estado: "ausente", cargo: -1 }),
      ).rejects.toThrow(/no es válido/);
    });

    it("el resumen del mes suma lo que se cobra por ausencias y cuenta ausencias y cancelaciones", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 20000 });
      const ids = [];
      for (const dia of ["03", "10", "17", "24"]) ids.push(await crearTurno(db, { paciente_id: ana, ...base, inicio: `2026-11-${dia}T10:00` }));
      await actualizarTurno(db, ids[0], { paciente_id: ana, ...base, estado: "realizado", pagado: true });
      await actualizarTurno(db, ids[1], { paciente_id: ana, ...base, inicio: "2026-11-10T10:00", estado: "ausente", aviso: "sin_aviso", cargo: 20000 });
      await actualizarTurno(db, ids[2], { paciente_id: ana, ...base, inicio: "2026-11-17T10:00", estado: "ausente", aviso: "con_aviso" });
      await actualizarTurno(db, ids[3], { paciente_id: ana, ...base, inicio: "2026-11-24T10:00", estado: "cancelado" });

      expect(await resumenMes(db, "2026-11")).toMatchObject({
        facturado: 40000,
        cobrado: 20000,
        sesiones_realizadas: 1,
        ausencias: 2,
        ausencias_sin_aviso: 1,
        cargos_ausencias: 20000,
        cancelados: 1,
        programado: 0,
      });
    });

    it("una ausencia avisada libera el horario para la serie; una sin aviso, no", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const beto = await crearPaciente(db, { nombre: "Beto", monto_sesion: 100 });
      const t = await crearTurno(db, { paciente_id: ana, ...base });
      await actualizarTurno(db, t, { paciente_id: ana, ...base, estado: "ausente", aviso: "con_aviso" });
      const serie = { paciente_id: beto, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-11-03" };
      expect((await previsualizarSerie(db, serie, "2026-11-01")).superpuestas).toEqual([]);
      await actualizarTurno(db, t, { paciente_id: ana, ...base, estado: "ausente", aviso: "sin_aviso" });
      expect((await previsualizarSerie(db, serie, "2026-11-01")).superpuestas).toHaveLength(1);
    });

    it("una ausencia en un turno de serie se conserva al modificar la serie", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const datos = { paciente_id: ana, desde: "2026-11-03", hora: "10:00", duracion_min: 50, frecuencia_semanas: 1, hasta: "2026-11-24" };
      await crearSerie(db, datos, "2026-11-01");
      const turnos = (await listarTurnosDePaciente(db, ana)).reverse();
      const segundo = turnos[1];
      await actualizarTurno(db, segundo.id, { ...segundo, pagado: false, estado: "ausente", aviso: "con_aviso", cargo: 50 });

      await modificarSerieDesde(db, segundo.serie_id!, "2026-11-03", { ...datos, hora: "11:00" }, "2026-11-01");
      const despues = (await listarTurnosDePaciente(db, ana)).reverse();
      expect(despues.map((t) => `${t.inicio} ${t.estado}`)).toEqual([
        "2026-11-03T11:00 programado",
        "2026-11-10T10:00 ausente",
        "2026-11-17T11:00 programado",
        "2026-11-24T11:00 programado",
      ]);
      expect(despues[1]).toMatchObject({ aviso: "con_aviso", cargo: 50 });
    });

    it("la papelera conserva aviso y cargo", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const t = await crearTurno(db, { paciente_id: ana, ...base });
      await actualizarTurno(db, t, { paciente_id: ana, ...base, estado: "ausente", aviso: "con_aviso", cargo: 50 });
      await restaurarDePapelera(db, (await eliminarTurno(db, t))!);
      expect((await listarTurnosDePaciente(db, ana))[0]).toMatchObject({ estado: "ausente", aviso: "con_aviso", cargo: 50 });
    });

    it("el historial registra el tipo de ausencia y el cobro", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 100 });
      const t = await crearTurno(db, { paciente_id: ana, ...base });
      await actualizarTurno(db, t, { paciente_id: ana, ...base, estado: "ausente", aviso: "sin_aviso" });
      await actualizarTurno(db, t, { paciente_id: ana, ...base, estado: "ausente", aviso: "con_aviso", cargo: 50 });
      const detalles = (await listarHistorial(db, ana)).map((h) => h.detalle).reverse();
      expect(detalles[1]).toBe("Turno del 2026-11-03T10:00: programado → ausente sin aviso");
      // Aviso y cargo cambian en el mismo UPDATE: SQLite no garantiza el orden de esos dos.
      expect(detalles.slice(2).sort()).toEqual([
        "Turno del 2026-11-03T10:00: ausente sin aviso → ausente con aviso",
        "Turno del 2026-11-03T10:00: se cobra la ausencia (50.00)",
      ]);
    });

    it("guarda la política de cobro y valida los porcentajes", async () => {
      expect(await leerPoliticaAusencias(db)).toEqual({ sinAvisoPct: 100, conAvisoPct: 0 });
      await guardarPoliticaAusencias(db, { sinAvisoPct: 50, conAvisoPct: 25 });
      expect(await leerPoliticaAusencias(db)).toEqual({ sinAvisoPct: 50, conAvisoPct: 25 });
      await expect(guardarPoliticaAusencias(db, { sinAvisoPct: 150, conAvisoPct: 0 })).rejects.toThrow(/entre 0 y 100/);
    });

    it("la migración toma las ausencias anteriores como sin aviso y sin cobro", () => {
      const sqlite = new DatabaseSync(":memory:");
      const archivos = readdirSync(CARPETA_MIGRACIONES).sort();
      for (const a of archivos.filter((a) => a < "0007")) sqlite.exec(readFileSync(new URL(a, CARPETA_MIGRACIONES), "utf8"));
      sqlite.exec(`INSERT INTO pacientes (nombre, monto_sesion) VALUES ('Ana', 100);
                   INSERT INTO turnos (paciente_id, inicio, estado, monto) VALUES (1, '2026-10-01T10:00', 'ausente', 100),
                                                                              (1, '2026-10-08T10:00', 'realizado', 100);`);
      for (const a of archivos.filter((a) => a >= "0007")) sqlite.exec(readFileSync(new URL(a, CARPETA_MIGRACIONES), "utf8"));
      expect(sqlite.prepare("SELECT estado, aviso, cargo FROM turnos ORDER BY id").all()).toEqual([
        { estado: "ausente", aviso: "sin_aviso", cargo: null },
        { estado: "realizado", aviso: null, cargo: null },
      ]);
    });
  });

  describe("recordatorios", () => {
    it("lista solo los turnos programados del día, con el contacto del paciente", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", telefono: "11 1234 5678", email: "ana@mail.com" });
      const beto = await crearPaciente(db, { nombre: "Beto" });
      await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T15:00", duracion_min: 50 });
      await crearTurno(db, { paciente_id: beto, inicio: "2026-11-03T09:00", duracion_min: 50 });
      await crearTurno(db, { paciente_id: beto, inicio: "2026-11-03T11:00", duracion_min: 50, estado: "cancelado" });
      await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T18:00", duracion_min: 50, estado: "ausente", aviso: "con_aviso" });
      await crearTurno(db, { paciente_id: ana, inicio: "2026-11-04T09:00", duracion_min: 50 });
      const lista = await listarParaRecordatorios(db, "2026-11-03");
      expect(lista.map((t) => [t.paciente_nombre, t.inicio, t.telefono, t.email, t.recordatorio_en])).toEqual([
        ["Beto", "2026-11-03T09:00", null, null, null],
        ["Ana", "2026-11-03T15:00", "11 1234 5678", "ana@mail.com", null],
      ]);
      expect(await contarRecordatoriosPendientes(db, "2026-11-03")).toBe(2);
    });

    it("marca el envío y lo olvida si el turno cambia de horario", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana" });
      const id = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T15:00", duracion_min: 50 });
      await marcarRecordatorio(db, id, "2026-11-02T18:30");
      expect((await listarParaRecordatorios(db, "2026-11-03"))[0].recordatorio_en).toBe("2026-11-02T18:30");
      expect(await contarRecordatoriosPendientes(db, "2026-11-03")).toBe(0);
      // Cambiar solo la nota no borra el envío.
      await actualizarTurno(db, id, { paciente_id: ana, inicio: "2026-11-03T15:00", duracion_min: 50, notas: "x" });
      expect((await listarParaRecordatorios(db, "2026-11-03"))[0].recordatorio_en).toBe("2026-11-02T18:30");
      await actualizarTurno(db, id, { paciente_id: ana, inicio: "2026-11-03T16:00", duracion_min: 50 });
      expect((await listarParaRecordatorios(db, "2026-11-03"))[0].recordatorio_en).toBeNull();
      await marcarRecordatorio(db, id, "2026-11-02T18:31");
      await marcarRecordatorio(db, id, null);
      expect(await contarRecordatoriosPendientes(db, "2026-11-03")).toBe(1);
    });

    it("guarda la plantilla del mensaje", async () => {
      const original = await leerPlantillaRecordatorio(db);
      await guardarPlantillaRecordatorio(db, { mensaje: " Hola {nombre} ", asunto: "" });
      expect(await leerPlantillaRecordatorio(db)).toEqual({ mensaje: "Hola {nombre}", asunto: original.asunto });
      await expect(guardarPlantillaRecordatorio(db, { mensaje: "  ", asunto: "x" })).rejects.toThrow(/vacío/);
    });
  });

  describe("recibos", () => {
    async function preparar() {
      await guardarConfiguracion(db, "nombre_profesional", "Dra. Martínez");
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000, documento: " 30111222 " });
      const t1 = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      const t2 = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-10T10:00", duracion_min: 50 });
      const t3 = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-17T10:00", duracion_min: 50 });
      await actualizarTurno(db, t1, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50, estado: "realizado", pagado: true });
      await actualizarTurno(db, t2, {
        paciente_id: ana, inicio: "2026-11-10T10:00", duracion_min: 50, estado: "ausente", aviso: "sin_aviso", cargo: 12500.5, pagado: true,
      });
      return { ana, t1, t2, t3 };
    }

    it("solo los turnos pagados con importe quedan pendientes de recibo", async () => {
      const { ana, t1, t2 } = await preparar();
      expect((await turnosSinRecibo(db, ana)).map((t) => t.id).sort()).toEqual([t1, t2].sort());
    });

    it("emite el recibo con número correlativo, copia de los datos y total en centavos exactos", async () => {
      const { ana, t1, t2 } = await preparar();
      const r = await emitirRecibo(db, { paciente_id: ana, turno_ids: [t2, t1], fecha: "2026-11-11", medio_pago: "Efectivo" });
      expect(r).toMatchObject({
        numero: 1, fecha: "2026-11-11", paciente_nombre: "Ana", paciente_documento: "30111222", total: 37500.5, medio_pago: "Efectivo",
      });
      expect(r.emisor.nombre).toBe("Dra. Martínez");
      expect(r.items.map((i) => [i.turno_id, i.importe, i.concepto])).toEqual([
        [t1, 25000, "Sesión de psicoterapia"],
        [t2, 12500.5, "Sesión de psicoterapia (ausencia)"],
      ]);
      expect(await turnosSinRecibo(db, ana)).toEqual([]);
      expect(await recibosDeTurnos(db, ana)).toEqual(new Map([[t1, 1], [t2, 1]]));
      expect(await ultimoMedioPago(db)).toBe("Efectivo");
      // Cambiar después la ficha o los datos del profesional no cambia el recibo emitido.
      await actualizarPaciente(db, ana, { nombre: "Ana López", monto_sesion: 25000 }, "2026-11-12T00:00");
      expect((await obtenerRecibo(db, r.id))?.paciente_nombre).toBe("Ana");
      const historial = await listarHistorial(db, ana);
      expect(historial.filter((h) => h.accion === "recibo")).toHaveLength(2);
    });

    it("no emite sin el nombre del profesional, sin pagos o con pagos que ya tienen recibo", async () => {
      const ana = await crearPaciente(db, { nombre: "Ana", monto_sesion: 25000 });
      const t = await crearTurno(db, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50 });
      await expect(emitirRecibo(db, { paciente_id: ana, turno_ids: [t], fecha: "2026-11-03" })).rejects.toThrow("nombre");
      await guardarConfiguracion(db, "recibo_nombre", "Lic. Y");
      await expect(emitirRecibo(db, { paciente_id: ana, turno_ids: [], fecha: "2026-11-03" })).rejects.toThrow("al menos");
      // Programado sin pagar: no se puede.
      await expect(emitirRecibo(db, { paciente_id: ana, turno_ids: [t], fecha: "2026-11-03" })).rejects.toThrow("ya tiene recibo");
      await actualizarTurno(db, t, { paciente_id: ana, inicio: "2026-11-03T10:00", duracion_min: 50, estado: "realizado", pagado: true });
      await emitirRecibo(db, { paciente_id: ana, turno_ids: [t], fecha: "2026-11-03" });
      await expect(emitirRecibo(db, { paciente_id: ana, turno_ids: [t], fecha: "2026-11-03" })).rejects.toThrow("ya tiene recibo");
    });

    it("anular libera los pagos; el recibo no se borra ni se modifica", async () => {
      const { ana, t1 } = await preparar();
      const r = await emitirRecibo(db, { paciente_id: ana, turno_ids: [t1], fecha: "2026-11-11" });
      await anularRecibo(db, r.id, "Monto equivocado", "2026-11-12T09:00");
      await expect(anularRecibo(db, r.id, null, "2026-11-12T09:00")).rejects.toThrow("ya estaba anulado");
      const [anulado] = await listarRecibos(db, ana);
      expect(anulado).toMatchObject({ anulado_en: "2026-11-12 09:00", motivo_anulacion: "Monto equivocado" });
      expect((await turnosSinRecibo(db, ana)).map((t) => t.id)).toContain(t1);
      const nuevo = await emitirRecibo(db, { paciente_id: ana, turno_ids: [t1], fecha: "2026-11-12" });
      expect(nuevo.numero).toBe(2);
      await expect(db.execute("DELETE FROM recibos WHERE id = $1", [r.id])).rejects.toThrow("se anulan");
      await expect(db.execute("UPDATE recibos SET total = 1 WHERE id = $1", [nuevo.id])).rejects.toThrow("no se puede modificar");
      await expect(db.execute("UPDATE recibos SET anulado_en = NULL WHERE id = $1", [r.id])).rejects.toThrow("no se puede modificar");
      expect((await listarHistorial(db, ana)).some((h) => h.accion === "recibo anulado" && h.detalle.includes("Monto equivocado"))).toBe(true);
    });

    it("la numeración puede arrancar desde un número configurado", async () => {
      const { ana, t1, t2 } = await preparar();
      expect(await proximoNumeroRecibo(db)).toBe(1);
      await guardarConfiguracion(db, "recibo_proximo_numero", "151");
      expect((await emitirRecibo(db, { paciente_id: ana, turno_ids: [t1], fecha: "2026-11-11" })).numero).toBe(151);
      expect((await emitirRecibo(db, { paciente_id: ana, turno_ids: [t2], fecha: "2026-11-11" })).numero).toBe(152);
    });

    it("se exportan a Excel", async () => {
      const { ana, t1 } = await preparar();
      await emitirRecibo(db, { paciente_id: ana, turno_ids: [t1], fecha: "2026-11-11" });
      expect((await datosParaExportar(db, "2026-11")).recibos).toHaveLength(1);
      expect((await datosParaExportar(db, "2026-10")).recibos).toHaveLength(0);
    });
  });
});
