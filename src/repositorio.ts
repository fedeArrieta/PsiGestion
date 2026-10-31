import type { EstadoTurno, Paciente, PacienteConResumen, Turno, TurnoConPaciente } from "./tipos";

/** Lo mínimo que se usa de la base. En la app es tauri-plugin-sql; en los tests, SQLite de Node. */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
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
  await db.execute(
    "UPDATE pacientes SET nombre = $1, telefono = $2, email = $3, monto_sesion = $4, notas = $5 WHERE id = $6",
    [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto, vacioANull(datos.notas), id],
  );
  await db.execute(
    "UPDATE turnos SET monto = $1 WHERE paciente_id = $2 AND estado = 'programado' AND inicio >= $3",
    [monto, id, ahora],
  );
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
