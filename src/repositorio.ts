import type {
  EstadoTurno,
  Gasto,
  Paciente,
  PacienteConResumen,
  ResumenMes,
  Turno,
  TurnoConPaciente,
} from "./tipos";

/** Lo mínimo que se usa de la base. En la app es tauri-plugin-sql; en los tests, SQLite de Node. */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  /** Ejecuta todas las sentencias o ninguna. */
  transaccion(sentencias: Sentencia[]): Promise<void>;
}

export interface Sentencia {
  sql: string;
  params?: unknown[];
}

export interface DatosPaciente {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  monto_sesion?: number;
  notas?: string | null;
}

export interface DatosTurno {
  paciente_id: number;
  inicio: string;
  duracion_min: number;
  estado?: EstadoTurno;
  notas?: string | null;
  /** Si no se indica, se mantiene como estaba. */
  pagado?: boolean;
}

const vacioANull = (s?: string | null) => (s && s.trim() ? s.trim() : null);

export function listarPacientes(db: Db): Promise<Paciente[]> {
  return db.select<Paciente[]>(
    "SELECT * FROM pacientes WHERE activo = 1 ORDER BY nombre COLLATE NOCASE",
  );
}

function validarPaciente(datos: DatosPaciente): { nombre: string; monto: number } {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El nombre del paciente es obligatorio.");
  const monto = datos.monto_sesion ?? 0;
  if (!(monto >= 0)) throw new Error("El monto por sesión no es válido.");
  return { nombre, monto };
}

export async function crearPaciente(db: Db, datos: DatosPaciente): Promise<number> {
  const { nombre, monto } = validarPaciente(datos);
  const r = await db.execute(
    "INSERT INTO pacientes (nombre, telefono, email, monto_sesion, notas) VALUES ($1, $2, $3, $4, $5)",
    [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto, vacioANull(datos.notas)],
  );
  if (r.lastInsertId == null) throw new Error("No se pudo crear el paciente.");
  return r.lastInsertId;
}

/** Turnos con inicio en [desde, hasta), ambos en formato AAAA-MM-DDTHH:MM. */
export function listarTurnos(db: Db, desde: string, hasta: string): Promise<TurnoConPaciente[]> {
  return db.select<TurnoConPaciente[]>(
    `SELECT t.*, p.nombre AS paciente_nombre
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.inicio >= $1 AND t.inicio < $2
      ORDER BY t.inicio, t.id`,
    [desde, hasta],
  );
}

function validarTurno(datos: DatosTurno) {
  if (!datos.paciente_id) throw new Error("Elegí un paciente.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datos.inicio)) throw new Error("La fecha u hora no es válida.");
  if (!(datos.duracion_min > 0)) throw new Error("La duración tiene que ser mayor a cero.");
}

/** Crea el turno copiando el monto por sesión actual del paciente. */
export async function crearTurno(db: Db, datos: DatosTurno): Promise<number> {
  validarTurno(datos);
  const r = await db.execute(
    `INSERT INTO turnos (paciente_id, inicio, duracion_min, estado, notas, monto)
     VALUES ($1, $2, $3, $4, $5, (SELECT monto_sesion FROM pacientes WHERE id = $1))`,
    [datos.paciente_id, datos.inicio, datos.duracion_min, datos.estado ?? "programado", vacioANull(datos.notas)],
  );
  if (r.lastInsertId == null) throw new Error("No se pudo crear el turno.");
  return r.lastInsertId;
}

/** Actualiza el turno. Si cambia el paciente, toma el monto del nuevo paciente. */
export async function actualizarTurno(db: Db, id: number, datos: DatosTurno): Promise<void> {
  validarTurno(datos);
  await db.execute(
    `UPDATE turnos
        SET monto = CASE WHEN paciente_id = $1 THEN monto
                         ELSE (SELECT monto_sesion FROM pacientes WHERE id = $1) END,
            paciente_id = $1, inicio = $2, duracion_min = $3, estado = $4, notas = $5,
            pagado = COALESCE($6, pagado)
      WHERE id = $7`,
    [
      datos.paciente_id,
      datos.inicio,
      datos.duracion_min,
      datos.estado ?? "programado",
      vacioANull(datos.notas),
      datos.pagado === undefined ? null : datos.pagado ? 1 : 0,
      id,
    ],
  );
}

export async function eliminarTurno(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM turnos WHERE id = $1", [id]);
}

/**
 * Pacientes con sus totales. "Saldo pendiente" es la suma de las sesiones
 * realizadas que todavía no se marcaron como pagadas.
 */
export function listarPacientesConResumen(db: Db, incluirInactivos = false): Promise<PacienteConResumen[]> {
  return db.select<PacienteConResumen[]>(
    `SELECT p.*,
            COALESCE(SUM(t.estado = 'realizado'), 0) AS sesiones_realizadas,
            COALESCE(SUM(CASE WHEN t.estado = 'realizado' AND t.pagado = 0 THEN t.monto END), 0) AS saldo_pendiente,
            MAX(CASE WHEN t.estado = 'realizado' THEN t.inicio END) AS ultima_sesion
       FROM pacientes p LEFT JOIN turnos t ON t.paciente_id = p.id
      WHERE $1 = 1 OR p.activo = 1
      GROUP BY p.id
      ORDER BY p.activo DESC, p.nombre COLLATE NOCASE`,
    [incluirInactivos ? 1 : 0],
  );
}

/**
 * Actualiza los datos del paciente. Si cambia el monto por sesión, también se
 * actualizan sus turnos programados desde "ahora" en adelante; los turnos
 * pasados conservan el monto que tenían.
 */
export async function actualizarPaciente(db: Db, id: number, datos: DatosPaciente, ahora: string): Promise<void> {
  const { nombre, monto } = validarPaciente(datos);
  await db.transaccion([
    {
      sql: "UPDATE pacientes SET nombre = $1, telefono = $2, email = $3, monto_sesion = $4, notas = $5 WHERE id = $6",
      params: [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto, vacioANull(datos.notas), id],
    },
    {
      sql: "UPDATE turnos SET monto = $1 WHERE paciente_id = $2 AND estado = 'programado' AND inicio >= $3",
      params: [monto, id, ahora],
    },
  ]);
}

/** Baja lógica: el paciente deja de aparecer en la agenda pero se conserva su historial. */
export async function cambiarActivoPaciente(db: Db, id: number, activo: boolean): Promise<void> {
  await db.execute("UPDATE pacientes SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export function listarTurnosDePaciente(db: Db, pacienteId: number): Promise<Turno[]> {
  return db.select<Turno[]>(
    "SELECT * FROM turnos WHERE paciente_id = $1 ORDER BY inicio DESC, id DESC",
    [pacienteId],
  );
}

export async function marcarPagado(db: Db, turnoId: number, pagado: boolean): Promise<void> {
  await db.execute("UPDATE turnos SET pagado = $1 WHERE id = $2", [pagado ? 1 : 0, turnoId]);
}

/** Marca como pagadas todas las sesiones realizadas del paciente que estaban pendientes. */
export async function saldarPaciente(db: Db, pacienteId: number): Promise<number> {
  const r = await db.execute(
    "UPDATE turnos SET pagado = 1 WHERE paciente_id = $1 AND estado = 'realizado' AND pagado = 0",
    [pacienteId],
  );
  return r.rowsAffected;
}

// ---------- Finanzas ----------

export interface DatosGasto {
  mes: string;
  descripcion: string;
  monto: number;
  fijo?: boolean;
}

const MES = /^\d{4}-\d{2}$/;

function validarGasto(datos: DatosGasto): string {
  if (!MES.test(datos.mes)) throw new Error("El mes no es válido.");
  const descripcion = datos.descripcion.trim();
  if (!descripcion) throw new Error("Escribí una descripción para el gasto.");
  if (!(datos.monto >= 0)) throw new Error("El monto del gasto no es válido.");
  return descripcion;
}

export function listarGastos(db: Db, mes: string): Promise<Gasto[]> {
  return db.select<Gasto[]>("SELECT * FROM gastos WHERE mes = $1 ORDER BY fijo DESC, monto DESC, id", [mes]);
}

export async function crearGasto(db: Db, datos: DatosGasto): Promise<number> {
  const descripcion = validarGasto(datos);
  const r = await db.execute("INSERT INTO gastos (mes, descripcion, monto, fijo) VALUES ($1, $2, $3, $4)", [
    datos.mes,
    descripcion,
    datos.monto,
    datos.fijo ? 1 : 0,
  ]);
  if (r.lastInsertId == null) throw new Error("No se pudo guardar el gasto.");
  return r.lastInsertId;
}

export async function actualizarGasto(db: Db, id: number, datos: DatosGasto): Promise<void> {
  const descripcion = validarGasto(datos);
  await db.execute("UPDATE gastos SET mes = $1, descripcion = $2, monto = $3, fijo = $4 WHERE id = $5", [
    datos.mes,
    descripcion,
    datos.monto,
    datos.fijo ? 1 : 0,
    id,
  ]);
}

export async function eliminarGasto(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM gastos WHERE id = $1", [id]);
}

/** Copia los gastos fijos de un mes a otro, salvo los que ya existan con la misma descripción. */
export async function copiarGastosFijos(db: Db, desde: string, hacia: string): Promise<number> {
  const r = await db.execute(
    `INSERT INTO gastos (mes, descripcion, monto, fijo)
     SELECT $2, g.descripcion, g.monto, 1 FROM gastos g
      WHERE g.mes = $1 AND g.fijo = 1
        AND NOT EXISTS (SELECT 1 FROM gastos h WHERE h.mes = $2 AND h.descripcion = g.descripcion)`,
    [desde, hacia],
  );
  return r.rowsAffected;
}

/** Objetivo del mes, o el del último mes anterior que tenga uno. null si nunca se cargó. */
export async function obtenerObjetivo(db: Db, mes: string): Promise<number | null> {
  const filas = await db.select<{ monto: number }[]>(
    "SELECT monto FROM objetivos WHERE mes <= $1 ORDER BY mes DESC LIMIT 1",
    [mes],
  );
  return filas.length ? filas[0].monto : null;
}

export async function guardarObjetivo(db: Db, mes: string, monto: number): Promise<void> {
  if (!MES.test(mes)) throw new Error("El mes no es válido.");
  if (!(monto >= 0)) throw new Error("El objetivo no es válido.");
  await db.execute(
    "INSERT INTO objetivos (mes, monto) VALUES ($1, $2) ON CONFLICT (mes) DO UPDATE SET monto = excluded.monto",
    [mes, monto],
  );
}

/** Resumen de ingresos, turnos y gastos de un mes (AAAA-MM). */
export async function resumenMes(db: Db, mes: string): Promise<ResumenMes> {
  if (!MES.test(mes)) throw new Error("El mes no es válido.");
  const [t] = await db.select<Omit<ResumenMes, "gastos" | "precio_promedio">[]>(
    `SELECT
        COALESCE(SUM(CASE WHEN estado = 'realizado' THEN monto END), 0) AS facturado,
        COALESCE(SUM(CASE WHEN estado = 'realizado' AND pagado = 1 THEN monto END), 0) AS cobrado,
        COALESCE(SUM(estado = 'realizado'), 0) AS sesiones_realizadas,
        COALESCE(SUM(CASE WHEN estado = 'programado' THEN monto END), 0) AS programado,
        COALESCE(SUM(estado = 'programado'), 0) AS sesiones_programadas
       FROM turnos WHERE substr(inicio, 1, 7) = $1`,
    [mes],
  );
  const [g] = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE mes = $1",
    [mes],
  );
  // Precio promedio: el de las sesiones del mes; si no hay, el de los pacientes activos.
  const [p] = await db.select<{ promedio: number | null }[]>(
    `SELECT COALESCE(
        (SELECT AVG(monto) FROM turnos
          WHERE substr(inicio, 1, 7) = $1 AND estado IN ('realizado', 'programado') AND monto > 0),
        (SELECT AVG(monto_sesion) FROM pacientes WHERE activo = 1 AND monto_sesion > 0)
     ) AS promedio`,
    [mes],
  );
  return { ...t, gastos: g.total, precio_promedio: p.promedio ?? 0 };
}

// ---------- Configuración y cuidado de los datos ----------

export async function leerConfiguracion(db: Db): Promise<Record<string, string>> {
  const filas = await db.select<{ clave: string; valor: string | null }[]>("SELECT clave, valor FROM configuracion");
  return Object.fromEntries(filas.filter((f) => f.valor != null).map((f) => [f.clave, f.valor as string]));
}

export async function guardarConfiguracion(db: Db, clave: string, valor: string | null): Promise<void> {
  await db.execute(
    "INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor",
    [clave, valor],
  );
}

/** Copia consistente de toda la base en un archivo nuevo (que no debe existir). */
export async function copiarBaseA(db: Db, ruta: string): Promise<void> {
  await db.execute("VACUUM INTO $1", [ruta]);
}

/** Revisa que el archivo de la base no esté dañado. Devuelve los problemas encontrados (vacío si está bien). */
export async function verificarIntegridad(db: Db): Promise<string[]> {
  const filas = await db.select<Record<string, string>[]>("PRAGMA quick_check");
  const mensajes = filas.map((f) => Object.values(f)[0]);
  return mensajes.length === 1 && mensajes[0] === "ok" ? [] : mensajes;
}

// ---------- Exportación ----------

export interface DatosExportacion {
  pacientes: Paciente[];
  turnos: TurnoConPaciente[];
  gastos: Gasto[];
}

/** Todo lo que se exporta. Con mes (AAAA-MM) se limitan turnos y gastos a ese mes. */
export async function datosParaExportar(db: Db, mes: string | null): Promise<DatosExportacion> {
  if (mes !== null && !MES.test(mes)) throw new Error("El mes no es válido.");
  const [pacientes, turnos, gastos] = await Promise.all([
    db.select<Paciente[]>("SELECT * FROM pacientes ORDER BY nombre COLLATE NOCASE"),
    db.select<TurnoConPaciente[]>(
      `SELECT t.*, p.nombre AS paciente_nombre
         FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
        WHERE $1 IS NULL OR substr(t.inicio, 1, 7) = $1
        ORDER BY t.inicio, t.id`,
      [mes],
    ),
    db.select<Gasto[]>("SELECT * FROM gastos WHERE $1 IS NULL OR mes = $1 ORDER BY mes, id", [mes]),
  ]);
  return { pacientes, turnos, gastos };
}
