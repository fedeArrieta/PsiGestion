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

// En la base los montos se guardan en centavos enteros (migración 0004), así las
// sumas son exactas. Hacia afuera de este archivo todo se maneja en pesos.

/** Pesos → centavos enteros. */
export const aCentavos = (pesos: number) => Math.round((pesos + Number.EPSILON) * 100);

/** Pasa a pesos los campos de montos de cada fila. */
function enPesos<T>(filas: T[], campos: (keyof T)[]): T[] {
  for (const f of filas) {
    for (const c of campos) {
      const v = f[c] as unknown;
      if (typeof v === "number") (f[c] as unknown) = v / 100;
    }
  }
  return filas;
}

export async function listarPacientes(db: Db): Promise<Paciente[]> {
  const filas = await db.select<Paciente[]>("SELECT * FROM pacientes WHERE activo = 1 ORDER BY nombre COLLATE NOCASE");
  return enPesos(filas, ["monto_sesion"]);
}

function validarPaciente(datos: DatosPaciente): { nombre: string; monto: number } {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El nombre del paciente es obligatorio.");
  const monto = datos.monto_sesion ?? 0;
  if (!(monto >= 0)) throw new Error("El monto por sesión no es válido.");
  return { nombre, monto: aCentavos(monto) };
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
export async function listarTurnos(db: Db, desde: string, hasta: string): Promise<TurnoConPaciente[]> {
  const filas = await db.select<TurnoConPaciente[]>(
    `SELECT t.*, p.nombre AS paciente_nombre
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.inicio >= $1 AND t.inicio < $2
      ORDER BY t.inicio, t.id`,
    [desde, hasta],
  );
  return enPesos(filas, ["monto"]);
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

/** Manda el turno a la papelera. Devuelve el id en la papelera, para poder deshacer. */
export async function eliminarTurno(db: Db, id: number): Promise<number | null> {
  await db.transaccion([
    {
      sql: `INSERT INTO papelera (tipo, registro_id, datos, descripcion)
            SELECT 'turno', t.id,
                   json_object('id', t.id, 'paciente_id', t.paciente_id, 'inicio', t.inicio,
                               'duracion_min', t.duracion_min, 'estado', t.estado, 'monto', t.monto,
                               'pagado', t.pagado, 'notas', t.notas, 'creado_en', t.creado_en),
                   'Turno de ' || p.nombre || ' (' || t.inicio || ')'
              FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
             WHERE t.id = $1`,
      params: [id],
    },
    { sql: "DELETE FROM turnos WHERE id = $1", params: [id] },
  ]);
  return ultimoEnPapelera(db, "turno", id);
}

/**
 * Pacientes con sus totales. "Saldo pendiente" es la suma de las sesiones
 * realizadas que todavía no se marcaron como pagadas.
 */
export async function listarPacientesConResumen(db: Db, incluirInactivos = false): Promise<PacienteConResumen[]> {
  const filas = await db.select<PacienteConResumen[]>(
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
  return enPesos(filas, ["monto_sesion", "saldo_pendiente"]);
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

export async function listarTurnosDePaciente(db: Db, pacienteId: number): Promise<Turno[]> {
  const filas = await db.select<Turno[]>(
    "SELECT * FROM turnos WHERE paciente_id = $1 ORDER BY inicio DESC, id DESC",
    [pacienteId],
  );
  return enPesos(filas, ["monto"]);
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

export async function listarGastos(db: Db, mes: string): Promise<Gasto[]> {
  const filas = await db.select<Gasto[]>("SELECT * FROM gastos WHERE mes = $1 ORDER BY fijo DESC, monto DESC, id", [
    mes,
  ]);
  return enPesos(filas, ["monto"]);
}

export async function crearGasto(db: Db, datos: DatosGasto): Promise<number> {
  const descripcion = validarGasto(datos);
  const r = await db.execute("INSERT INTO gastos (mes, descripcion, monto, fijo) VALUES ($1, $2, $3, $4)", [
    datos.mes,
    descripcion,
    aCentavos(datos.monto),
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
    aCentavos(datos.monto),
    datos.fijo ? 1 : 0,
    id,
  ]);
}

/** Manda el gasto a la papelera. Devuelve el id en la papelera, para poder deshacer. */
export async function eliminarGasto(db: Db, id: number): Promise<number | null> {
  await db.transaccion([
    {
      sql: `INSERT INTO papelera (tipo, registro_id, datos, descripcion)
            SELECT 'gasto', id,
                   json_object('id', id, 'mes', mes, 'descripcion', descripcion, 'monto', monto,
                               'fijo', fijo, 'creado_en', creado_en),
                   'Gasto "' || descripcion || '" (' || mes || ')'
              FROM gastos WHERE id = $1`,
      params: [id],
    },
    { sql: "DELETE FROM gastos WHERE id = $1", params: [id] },
  ]);
  return ultimoEnPapelera(db, "gasto", id);
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
  return filas.length ? filas[0].monto / 100 : null;
}

export async function guardarObjetivo(db: Db, mes: string, monto: number): Promise<void> {
  if (!MES.test(mes)) throw new Error("El mes no es válido.");
  if (!(monto >= 0)) throw new Error("El objetivo no es válido.");
  await db.execute(
    "INSERT INTO objetivos (mes, monto) VALUES ($1, $2) ON CONFLICT (mes) DO UPDATE SET monto = excluded.monto",
    [mes, aCentavos(monto)],
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
  return {
    ...t,
    facturado: t.facturado / 100,
    cobrado: t.cobrado / 100,
    programado: t.programado / 100,
    gastos: g.total / 100,
    precio_promedio: (p.promedio ?? 0) / 100,
  };
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
  return {
    pacientes: enPesos(pacientes, ["monto_sesion"]),
    turnos: enPesos(turnos, ["monto"]),
    gastos: enPesos(gastos, ["monto"]),
  };
}

// ---------- Papelera e historial ----------

export interface ElementoPapelera {
  id: number;
  tipo: "turno" | "gasto";
  descripcion: string;
  eliminado_en: string;
}

export interface CambioHistorial {
  id: number;
  fecha: string;
  turno_id: number;
  paciente_id: number;
  paciente_nombre: string;
  accion: string;
  detalle: string;
}

/** Días que se conservan los elementos de la papelera. */
export const DIAS_PAPELERA = 30;

async function ultimoEnPapelera(db: Db, tipo: string, registroId: number): Promise<number | null> {
  const filas = await db.select<{ id: number }[]>(
    "SELECT id FROM papelera WHERE tipo = $1 AND registro_id = $2 ORDER BY id DESC LIMIT 1",
    [tipo, registroId],
  );
  return filas.length ? filas[0].id : null;
}

export function listarPapelera(db: Db): Promise<ElementoPapelera[]> {
  return db.select<ElementoPapelera[]>(
    "SELECT id, tipo, descripcion, eliminado_en FROM papelera ORDER BY eliminado_en DESC, id DESC",
  );
}

/** Vuelve a poner el turno o gasto donde estaba, con el mismo id. */
export async function restaurarDePapelera(db: Db, id: number): Promise<void> {
  const [elemento] = await db.select<{ tipo: string }[]>("SELECT tipo FROM papelera WHERE id = $1", [id]);
  if (!elemento) throw new Error("Ese elemento ya no está en la papelera.");
  const insertar =
    elemento.tipo === "turno"
      ? `INSERT INTO turnos (id, paciente_id, inicio, duracion_min, estado, monto, pagado, notas, creado_en)
         SELECT json_extract(datos, '$.id'), json_extract(datos, '$.paciente_id'), json_extract(datos, '$.inicio'),
                json_extract(datos, '$.duracion_min'), json_extract(datos, '$.estado'), json_extract(datos, '$.monto'),
                json_extract(datos, '$.pagado'), json_extract(datos, '$.notas'), json_extract(datos, '$.creado_en')
           FROM papelera WHERE id = $1`
      : `INSERT INTO gastos (id, mes, descripcion, monto, fijo, creado_en)
         SELECT json_extract(datos, '$.id'), json_extract(datos, '$.mes'), json_extract(datos, '$.descripcion'),
                json_extract(datos, '$.monto'), json_extract(datos, '$.fijo'), json_extract(datos, '$.creado_en')
           FROM papelera WHERE id = $1`;
  const pasos = [{ sql: insertar, params: [id] as unknown[] }];
  if (elemento.tipo === "turno") {
    // El trigger de alta registra "creado"; para el historial es una restauración.
    pasos.push({
      sql: `UPDATE historial SET accion = 'restaurado', detalle = REPLACE(detalle, 'Turno del', 'Turno restaurado del')
             WHERE id = (SELECT MAX(id) FROM historial
                          WHERE turno_id = (SELECT json_extract(datos, '$.id') FROM papelera WHERE id = $1)
                            AND accion = 'creado')`,
      params: [id],
    });
  }
  pasos.push({ sql: "DELETE FROM papelera WHERE id = $1", params: [id] });
  await db.transaccion(pasos);
}

export async function borrarDePapelera(db: Db, id: number): Promise<void> {
  await db.execute("DELETE FROM papelera WHERE id = $1", [id]);
}

/** Borra definitivamente lo que lleva más de 30 días en la papelera. */
export async function vaciarPapeleraVencida(db: Db, ahora: string): Promise<number> {
  const r = await db.execute("DELETE FROM papelera WHERE eliminado_en < datetime($1, $2)", [
    ahora.replace("T", " "),
    `-${DIAS_PAPELERA} days`,
  ]);
  return r.rowsAffected;
}

/** Últimos cambios de turnos y pagos, de un paciente o de todos. */
export function listarHistorial(db: Db, pacienteId: number | null, limite = 200): Promise<CambioHistorial[]> {
  return db.select<CambioHistorial[]>(
    `SELECT h.*, p.nombre AS paciente_nombre
       FROM historial h JOIN pacientes p ON p.id = h.paciente_id
      WHERE $1 IS NULL OR h.paciente_id = $1
      ORDER BY h.fecha DESC, h.id DESC
      LIMIT $2`,
    [pacienteId, limite],
  );
}
