import type { EstadoTurno, Paciente, TurnoConPaciente } from "./tipos";

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
}

export interface DatosTurno {
  paciente_id: number;
  inicio: string;
  duracion_min: number;
  estado?: EstadoTurno;
  notas?: string | null;
}

const vacioANull = (s?: string | null) => (s && s.trim() ? s.trim() : null);

export function listarPacientes(db: Db): Promise<Paciente[]> {
  return db.select<Paciente[]>(
    "SELECT * FROM pacientes WHERE activo = 1 ORDER BY nombre COLLATE NOCASE",
  );
}

export async function crearPaciente(db: Db, datos: DatosPaciente): Promise<number> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El nombre del paciente es obligatorio.");
  const monto = datos.monto_sesion ?? 0;
  if (!(monto >= 0)) throw new Error("El monto por sesión no puede ser negativo.");
  const r = await db.execute(
    "INSERT INTO pacientes (nombre, telefono, email, monto_sesion) VALUES ($1, $2, $3, $4)",
    [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto],
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
            paciente_id = $1, inicio = $2, duracion_min = $3, estado = $4, notas = $5
      WHERE id = $6`,
    [datos.paciente_id, datos.inicio, datos.duracion_min, datos.estado ?? "programado", vacioANull(datos.notas), id],
  );
}

export async function eliminarTurno(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM turnos WHERE id = $1", [id]);
}
