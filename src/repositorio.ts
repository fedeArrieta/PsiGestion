import type {
  AvisoAusencia,
  EstadoTurno,
  Gasto,
  NoLaborable,
  NotaClinica,
  Paciente,
  PacienteConResumen,
  ResumenMes,
  Serie,
  Turno,
  TurnoConPaciente,
  Emisor,
  ItemRecibo,
  Recibo,
  SeccionNota,
  VersionNota,
} from "./tipos";
import { seSuperponen } from "./agenda/logica";
import { leerPolitica, CLAVE_CON_AVISO, CLAVE_SIN_AVISO, type PoliticaAusencias } from "./ausencias/logica";
import {
  CLAVE_ASUNTO,
  CLAVE_MENSAJE,
  leerPlantilla,
  type PlantillaRecordatorio,
  type TurnoParaRecordatorio,
} from "./recordatorios/logica";
import { CLAVE_PROXIMO_NUMERO, itemsDeTurnos, leerConcepto, leerEmisor, faltaParaEmitir } from "./recibos/logica";
import { fechasDeSerie, horizonte, periodoDe, repartirFechas, sumarDiasFecha } from "./agenda/series";

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
  /** DNI o CUIT, para los recibos. */
  documento?: string | null;
}

export interface DatosTurno {
  paciente_id: number;
  inicio: string;
  duracion_min: number;
  estado?: EstadoTurno;
  notas?: string | null;
  /** Si no se indica, se mantiene como estaba. */
  pagado?: boolean;
  /** Solo para ausencias: si el paciente avisó. Por defecto, sin aviso. */
  aviso?: AvisoAusencia | null;
  /** Solo para ausencias: lo que se cobra, en pesos. null o sin indicar = no se cobra. */
  cargo?: number | null;
}

/**
 * Lo que el paciente debe por un turno (sobre la tabla "t"), en centavos: la sesión
 * realizada o el cargo de la ausencia. Igual que importeTurno en src/ausencias/logica.ts.
 */
const IMPORTE = `(CASE WHEN t.estado = 'realizado' THEN t.monto WHEN t.estado = 'ausente' THEN COALESCE(t.cargo, 0) ELSE 0 END)`;

/** Turnos (sobre "t") que dejan libre el horario: cancelados y ausencias avisadas. */
const LIBERA_HORARIO = `(t.estado = 'cancelado' OR (t.estado = 'ausente' AND t.aviso = 'con_aviso'))`;

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
    "INSERT INTO pacientes (nombre, telefono, email, monto_sesion, notas, documento) VALUES ($1, $2, $3, $4, $5, $6)",
    [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto, vacioANull(datos.notas), vacioANull(datos.documento)],
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
  return enPesos(filas, ["monto", "cargo"]);
}

/** Valida y devuelve aviso y cargo (centavos) como se guardan: solo en ausencias. */
function validarTurno(datos: DatosTurno): { aviso: AvisoAusencia | null; cargo: number | null } {
  if (!datos.paciente_id) throw new Error("Elegí un paciente.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datos.inicio)) throw new Error("La fecha u hora no es válida.");
  if (!(datos.duracion_min > 0)) throw new Error("La duración tiene que ser mayor a cero.");
  if (datos.estado !== "ausente") return { aviso: null, cargo: null };
  const cargo = datos.cargo ?? null;
  if (cargo !== null && !(cargo >= 0)) throw new Error("El monto a cobrar por la ausencia no es válido.");
  return { aviso: datos.aviso ?? "sin_aviso", cargo: cargo === null ? null : aCentavos(cargo) };
}

/** Crea el turno copiando el monto por sesión actual del paciente. */
export async function crearTurno(db: Db, datos: DatosTurno): Promise<number> {
  const { aviso, cargo } = validarTurno(datos);
  const r = await db.execute(
    `INSERT INTO turnos (paciente_id, inicio, duracion_min, estado, notas, monto, aviso, cargo)
     VALUES ($1, $2, $3, $4, $5, (SELECT monto_sesion FROM pacientes WHERE id = $1), $6, $7)`,
    [datos.paciente_id, datos.inicio, datos.duracion_min, datos.estado ?? "programado", vacioANull(datos.notas), aviso, cargo],
  );
  if (r.lastInsertId == null) throw new Error("No se pudo crear el turno.");
  return r.lastInsertId;
}

/** Actualiza el turno. Si cambia el paciente, toma el monto del nuevo paciente. */
export async function actualizarTurno(db: Db, id: number, datos: DatosTurno): Promise<void> {
  const { aviso, cargo } = validarTurno(datos);
  const estado = datos.estado ?? "programado";
  // Un turno que deja de generar algo para cobrar (programado, cancelado, ausencia sin cargo) no queda "pagado".
  const pagado = estado === "realizado" || cargo !== null ? (datos.pagado === undefined ? null : datos.pagado ? 1 : 0) : 0;
  await db.execute(
    `UPDATE turnos
        SET monto = CASE WHEN paciente_id = $1 THEN monto
                         ELSE (SELECT monto_sesion FROM pacientes WHERE id = $1) END,
            paciente_id = $1, inicio = $2, duracion_min = $3, estado = $4, notas = $5,
            pagado = COALESCE($6, pagado), aviso = $7, cargo = $8,
            -- Si cambia el día o la hora, el recordatorio enviado ya no vale.
            recordatorio_en = CASE WHEN inicio = $2 THEN recordatorio_en END
      WHERE id = $9`,
    [datos.paciente_id, datos.inicio, datos.duracion_min, estado, vacioANull(datos.notas), pagado, aviso, cargo, id],
  );
}

/** INSERT que copia a la papelera los turnos que cumplen la condición (sobre "t"). */
function turnosAPapelera(condicion: string): string {
  return `INSERT INTO papelera (tipo, registro_id, datos, descripcion)
          SELECT 'turno', t.id,
                 json_object('id', t.id, 'paciente_id', t.paciente_id, 'inicio', t.inicio,
                             'duracion_min', t.duracion_min, 'estado', t.estado, 'monto', t.monto,
                             'pagado', t.pagado, 'notas', t.notas, 'creado_en', t.creado_en,
                             'serie_id', t.serie_id, 'aviso', t.aviso, 'cargo', t.cargo),
                 'Turno de ' || p.nombre || ' (' || t.inicio || ')'
            FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
           WHERE ${condicion}`;
}

/** Manda el turno a la papelera. Devuelve el id en la papelera, para poder deshacer. */
export async function eliminarTurno(db: Db, id: number): Promise<number | null> {
  await db.transaccion([
    { sql: turnosAPapelera("t.id = $1"), params: [id] },
    { sql: "DELETE FROM turnos WHERE id = $1", params: [id] },
  ]);
  return ultimoEnPapelera(db, "turno", id);
}

/**
 * Pacientes con sus totales. "Saldo pendiente" es la suma de las sesiones
 * realizadas y de las ausencias que se cobran, que todavía no se marcaron como pagadas.
 */
export async function listarPacientesConResumen(db: Db, incluirInactivos = false): Promise<PacienteConResumen[]> {
  const filas = await db.select<PacienteConResumen[]>(
    `SELECT p.*,
            COALESCE(SUM(t.estado = 'realizado'), 0) AS sesiones_realizadas,
            COALESCE(SUM(t.estado = 'ausente'), 0) AS ausencias,
            COALESCE(SUM(CASE WHEN t.pagado = 0 THEN ${IMPORTE} END), 0) AS saldo_pendiente,
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
      sql: "UPDATE pacientes SET nombre = $1, telefono = $2, email = $3, monto_sesion = $4, notas = $5, documento = $6 WHERE id = $7",
      params: [nombre, vacioANull(datos.telefono), vacioANull(datos.email), monto, vacioANull(datos.notas), vacioANull(datos.documento), id],
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
  return enPesos(filas, ["monto", "cargo"]);
}

export async function marcarPagado(db: Db, turnoId: number, pagado: boolean): Promise<void> {
  await db.execute("UPDATE turnos SET pagado = $1 WHERE id = $2", [pagado ? 1 : 0, turnoId]);
}

/** Marca como pagado todo lo pendiente del paciente: sesiones realizadas y ausencias que se cobran. */
export async function saldarPaciente(db: Db, pacienteId: number): Promise<number> {
  const r = await db.execute(
    `UPDATE turnos SET pagado = 1
      WHERE paciente_id = $1 AND pagado = 0 AND (estado = 'realizado' OR (estado = 'ausente' AND cargo IS NOT NULL))`,
    [pacienteId],
  );
  return r.rowsAffected;
}

// ---------- Turnos recurrentes (series) ----------

export interface DatosSerie {
  paciente_id: number;
  /** AAAA-MM-DD: primera fecha; define el día de la semana. */
  desde: string;
  /** HH:MM */
  hora: string;
  duracion_min: number;
  frecuencia_semanas: number;
  /** AAAA-MM-DD inclusive; null = sin fin. */
  hasta: string | null;
  notas?: string | null;
}

export interface VistaPreviaSerie {
  /** Fechas en las que se van a agendar turnos (hasta el horizonte). */
  agendar: string[];
  /** Fechas del patrón que caen en feriados o vacaciones. */
  salteadas: { fecha: string; motivo: string }[];
  /** Fechas que se pisan con otros turnos. */
  superpuestas: { fecha: string; paciente_nombre: string; inicio: string }[];
  /** Última fecha que se genera ahora; después la app sigue agregando sola. */
  limite: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function validarSerie(d: DatosSerie) {
  if (!d.paciente_id) throw new Error("Elegí un paciente.");
  if (!FECHA.test(d.desde) || !/^\d{2}:\d{2}$/.test(d.hora)) throw new Error("La fecha u hora no es válida.");
  if (!(d.duracion_min > 0)) throw new Error("La duración tiene que ser mayor a cero.");
  if (![1, 2, 3, 4].includes(d.frecuencia_semanas)) throw new Error("La frecuencia no es válida.");
  if (d.hasta !== null && (!FECHA.test(d.hasta) || d.hasta < d.desde))
    throw new Error("La fecha de fin tiene que ser posterior a la del primer turno.");
}

/** Hasta dónde generar: el horizonte desde hoy, pero al menos el primer turno. */
function limiteDeGeneracion(d: DatosSerie, hoy: string): string {
  const h = horizonte(hoy);
  const limite = d.desde > h ? d.desde : h;
  return d.hasta && d.hasta < limite ? d.hasta : limite;
}

export async function listarNoLaborables(db: Db, desde?: string, hasta?: string): Promise<NoLaborable[]> {
  return db.select<NoLaborable[]>(
    `SELECT * FROM no_laborables
      WHERE ($1 IS NULL OR hasta >= $1) AND ($2 IS NULL OR desde <= $2)
      ORDER BY desde, id`,
    [desde ?? null, hasta ?? null],
  );
}

/** Fechas (AAAA-MM-DD) en las que la serie ya tiene un turno que se conserva. */
async function fechasOcupadasDeSerie(db: Db, serieId: number, excluirProgramadosDesde?: string): Promise<Set<string>> {
  const filas = await db.select<{ fecha: string }[]>(
    `SELECT DISTINCT substr(inicio, 1, 10) AS fecha FROM turnos
      WHERE serie_id = $1 AND ($2 IS NULL OR estado <> 'programado' OR substr(inicio, 1, 10) < $2)`,
    [serieId, excluirProgramadosDesde ?? null],
  );
  return new Set(filas.map((f) => f.fecha));
}

/** INSERTs de los turnos de una serie. serie: id o una subconsulta SQL que lo devuelve. */
function insertarTurnosDeSerie(serie: number | string, d: DatosSerie, fechas: string[]): Sentencia[] {
  const idSerie = typeof serie === "number" ? "$5" : `(${serie})`;
  return fechas.map((fecha) => ({
    sql: `INSERT INTO turnos (paciente_id, inicio, duracion_min, estado, notas, monto, serie_id)
          VALUES ($1, $2, $3, 'programado', $4, (SELECT monto_sesion FROM pacientes WHERE id = $1), ${idSerie})`,
    params: [d.paciente_id, `${fecha}T${d.hora}`, d.duracion_min, vacioANull(d.notas), ...(typeof serie === "number" ? [serie] : [])],
  }));
}

/**
 * Qué turnos se agendarían con esta serie: cuáles se saltean por feriados o
 * vacaciones y cuáles se pisan con otros turnos. excluirSerie: al modificar una
 * serie, sus propios turnos no cuentan como superposición.
 */
export async function previsualizarSerie(
  db: Db,
  d: DatosSerie,
  hoy: string,
  excluirSerie?: number,
): Promise<VistaPreviaSerie> {
  validarSerie(d);
  const limite = limiteDeGeneracion(d, hoy);
  const periodos = await listarNoLaborables(db, d.desde, limite);
  const { agendar, salteadas } = repartirFechas(fechasDeSerie(d, d.desde, limite), periodos);
  const otros = await db.select<(Pick<Turno, "inicio" | "duracion_min" | "serie_id"> & { paciente_nombre: string })[]>(
    `SELECT t.inicio, t.duracion_min, t.serie_id, p.nombre AS paciente_nombre
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE NOT ${LIBERA_HORARIO} AND t.inicio >= $1 AND t.inicio < $2
        AND ($3 IS NULL OR t.serie_id IS NULL OR t.serie_id <> $3)`,
    [d.desde, sumarDiasFecha(limite, 1), excluirSerie ?? null],
  );
  const porFecha = new Map<string, typeof otros>();
  for (const t of otros) {
    const f = t.inicio.slice(0, 10);
    porFecha.set(f, [...(porFecha.get(f) ?? []), t]);
  }
  const superpuestas: VistaPreviaSerie["superpuestas"] = [];
  for (const fecha of agendar) {
    const nuevo = { inicio: `${fecha}T${d.hora}`, duracion_min: d.duracion_min };
    for (const t of porFecha.get(fecha) ?? []) {
      if (seSuperponen(nuevo, t)) superpuestas.push({ fecha, paciente_nombre: t.paciente_nombre, inicio: t.inicio });
    }
  }
  return { agendar, salteadas, superpuestas, limite };
}

/** Crea la serie y agenda sus turnos hasta el horizonte. Devuelve cuántos turnos se crearon. */
export async function crearSerie(db: Db, d: DatosSerie, hoy: string): Promise<number> {
  const { agendar, limite } = await previsualizarSerie(db, d, hoy);
  await db.transaccion([
    {
      sql: `INSERT INTO series (paciente_id, desde, hora, duracion_min, frecuencia_semanas, hasta, generada_hasta, notas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      params: [d.paciente_id, d.desde, d.hora, d.duracion_min, d.frecuencia_semanas, d.hasta, limite, vacioANull(d.notas)],
    },
    // Dentro de la transacción la serie recién creada es la de id más alto.
    ...insertarTurnosDeSerie("SELECT MAX(id) FROM series", d, agendar),
  ]);
  return agendar.length;
}

export async function obtenerSerie(db: Db, id: number): Promise<Serie | null> {
  const [serie] = await db.select<Serie[]>("SELECT * FROM series WHERE id = $1", [id]);
  return serie ?? null;
}

/** Series vigentes de un paciente (las que todavía tienen turnos por delante). */
export function listarSeriesDePaciente(db: Db, pacienteId: number, hoy: string): Promise<Serie[]> {
  return db.select<Serie[]>(
    "SELECT * FROM series WHERE paciente_id = $1 AND (hasta IS NULL OR hasta >= $2) ORDER BY desde, id",
    [pacienteId, hoy],
  );
}

/**
 * Cambia la serie desde la fecha del turno elegido en adelante: borra sus turnos
 * programados desde ahí y los vuelve a generar con los datos nuevos. Los turnos
 * anteriores, y los ya realizados, cancelados o ausentes, no se tocan.
 */
export async function modificarSerieDesde(db: Db, serieId: number, fechaTurno: string, d: DatosSerie, hoy: string): Promise<number> {
  const corte = fechaTurno < d.desde ? fechaTurno : d.desde;
  const { agendar, limite } = await previsualizarSerie(db, d, hoy, serieId);
  const ocupadas = await fechasOcupadasDeSerie(db, serieId, corte);
  const fechas = agendar.filter((f) => !ocupadas.has(f));
  await db.transaccion([
    {
      sql: "DELETE FROM turnos WHERE serie_id = $1 AND estado = 'programado' AND substr(inicio, 1, 10) >= $2",
      params: [serieId, corte],
    },
    {
      sql: `UPDATE series SET paciente_id = $1, desde = $2, hora = $3, duracion_min = $4, frecuencia_semanas = $5,
                              hasta = $6, generada_hasta = $7, notas = $8
             WHERE id = $9`,
      params: [d.paciente_id, d.desde, d.hora, d.duracion_min, d.frecuencia_semanas, d.hasta, limite, vacioANull(d.notas), serieId],
    },
    ...insertarTurnosDeSerie(serieId, d, fechas),
  ]);
  return fechas.length;
}

/**
 * Termina la serie: desde esa fecha no hay más turnos. Los turnos programados
 * desde ahí van a la papelera. Devuelve cuántos se quitaron.
 */
export async function terminarSerie(db: Db, serieId: number, desdeFecha: string): Promise<number> {
  const condicion = "t.serie_id = $1 AND t.estado = 'programado' AND substr(t.inicio, 1, 10) >= $2";
  const [{ n }] = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM turnos t WHERE ${condicion}`, [
    serieId,
    desdeFecha,
  ]);
  const ultimo = sumarDiasFecha(desdeFecha, -1);
  await db.transaccion([
    { sql: turnosAPapelera(condicion), params: [serieId, desdeFecha] },
    { sql: `DELETE FROM turnos AS t WHERE ${condicion}`, params: [serieId, desdeFecha] },
    {
      sql: "UPDATE series SET hasta = $2, generada_hasta = MIN(generada_hasta, $2) WHERE id = $1",
      params: [serieId, ultimo],
    },
  ]);
  return n;
}

/**
 * Agrega los turnos que faltan para que las series lleguen al horizonte (o a la
 * fecha indicada, si es más lejana). Se llama al abrir la app y la agenda.
 * Las series de pacientes dados de baja no se extienden.
 */
export function extenderSeries(db: Db, hoy: string, hastaFecha?: string): Promise<number> {
  // De a una por vez: si dos pantallas lo piden juntas, la segunda ve lo que generó la primera.
  const r = extensionEnCurso.then(() => extenderSeriesAhora(db, hoy, hastaFecha));
  extensionEnCurso = r.catch(() => 0);
  return r;
}

let extensionEnCurso: Promise<unknown> = Promise.resolve();

async function extenderSeriesAhora(db: Db, hoy: string, hastaFecha?: string): Promise<number> {
  const h = horizonte(hoy);
  const limite = hastaFecha && hastaFecha > h ? hastaFecha : h;
  const series = await db.select<Serie[]>(
    `SELECT s.* FROM series s JOIN pacientes p ON p.id = s.paciente_id
      WHERE p.activo = 1 AND s.generada_hasta < $1 AND (s.hasta IS NULL OR s.generada_hasta < s.hasta)`,
    [limite],
  );
  if (!series.length) return 0;
  const periodos = await listarNoLaborables(db, hoy, limite);
  const sentencias: Sentencia[] = [];
  let creados = 0;
  for (const s of series) {
    const fin = s.hasta && s.hasta < limite ? s.hasta : limite;
    const { agendar } = repartirFechas(fechasDeSerie(s, sumarDiasFecha(s.generada_hasta, 1), fin), periodos);
    sentencias.push(...insertarTurnosDeSerie(s.id, s, agendar), {
      sql: "UPDATE series SET generada_hasta = $1 WHERE id = $2",
      params: [fin, s.id],
    });
    creados += agendar.length;
  }
  await db.transaccion(sentencias);
  return creados;
}

// ---------- Feriados y vacaciones ----------

export interface DatosNoLaborable {
  desde: string;
  hasta: string;
  descripcion: string;
  tipo?: "feriado" | "vacaciones";
}

export interface ResultadoNoLaborable {
  /** Turnos de series que se quitaron de esas fechas. */
  quitados: number;
  /** Turnos sueltos (no recurrentes) que quedan en esas fechas: conviene revisarlos. */
  sueltos: number;
}

const SERIE_EN_RANGO = "serie_id IS NOT NULL AND estado = 'programado' AND substr(inicio, 1, 10) BETWEEN $1 AND $2";
const SUELTOS_EN_RANGO =
  "(serie_id IS NULL OR estado <> 'programado') AND estado NOT IN ('cancelado', 'ausente') AND substr(inicio, 1, 10) BETWEEN $1 AND $2";

/**
 * Guarda el feriado o las vacaciones y quita los turnos programados de las
 * series en esas fechas (se generaron solos; si se borra el período, vuelven).
 */
export async function agregarNoLaborable(db: Db, d: DatosNoLaborable): Promise<ResultadoNoLaborable> {
  const descripcion = d.descripcion.trim();
  if (!FECHA.test(d.desde) || !FECHA.test(d.hasta)) throw new Error("Las fechas no son válidas.");
  if (d.hasta < d.desde) throw new Error("La fecha de fin tiene que ser igual o posterior a la de inicio.");
  if (!descripcion) throw new Error("Escribí una descripción (por ejemplo, Vacaciones de verano).");
  const [{ quitados, sueltos }] = await db.select<ResultadoNoLaborable[]>(
    `SELECT (SELECT COUNT(*) FROM turnos WHERE ${SERIE_EN_RANGO}) AS quitados,
            (SELECT COUNT(*) FROM turnos WHERE ${SUELTOS_EN_RANGO}) AS sueltos`,
    [d.desde, d.hasta],
  );
  await db.transaccion([
    {
      sql: "INSERT INTO no_laborables (desde, hasta, descripcion, tipo) VALUES ($1, $2, $3, $4)",
      params: [d.desde, d.hasta, descripcion, d.tipo ?? "vacaciones"],
    },
    { sql: `DELETE FROM turnos WHERE ${SERIE_EN_RANGO}`, params: [d.desde, d.hasta] },
  ]);
  return { quitados, sueltos };
}

/** Carga los feriados indicados que todavía no estén (no pisa los días ya cargados). */
export async function cargarFeriados(db: Db, feriados: DatosNoLaborable[]): Promise<ResultadoNoLaborable & { agregados: number }> {
  const existentes = await listarNoLaborables(db);
  const total = { agregados: 0, quitados: 0, sueltos: 0 };
  for (const f of feriados) {
    if (periodoDe(f.desde, existentes)) continue;
    const r = await agregarNoLaborable(db, { ...f, tipo: "feriado" });
    total.agregados++;
    total.quitados += r.quitados;
    total.sueltos += r.sueltos;
  }
  return total;
}

/**
 * Borra el feriado o las vacaciones y vuelve a agendar, desde hoy, los turnos de
 * las series que se habían salteado por eso. Devuelve cuántos turnos volvieron.
 */
export async function eliminarNoLaborable(db: Db, id: number, hoy: string): Promise<number> {
  const [periodo] = await db.select<NoLaborable[]>("SELECT * FROM no_laborables WHERE id = $1", [id]);
  if (!periodo) return 0;
  const desde = periodo.desde > hoy ? periodo.desde : hoy;
  const otros = (await listarNoLaborables(db, desde, periodo.hasta)).filter((p) => p.id !== id);
  const series = await db.select<Serie[]>(
    `SELECT s.* FROM series s JOIN pacientes p ON p.id = s.paciente_id
      WHERE p.activo = 1 AND s.desde <= $2 AND s.generada_hasta >= $1 AND (s.hasta IS NULL OR s.hasta >= $1)`,
    [desde, periodo.hasta],
  );
  const sentencias: Sentencia[] = [{ sql: "DELETE FROM no_laborables WHERE id = $1", params: [id] }];
  let vuelven = 0;
  for (const s of series) {
    const fin = s.generada_hasta < periodo.hasta ? s.generada_hasta : periodo.hasta;
    const ocupadas = await fechasOcupadasDeSerie(db, s.id);
    const { agendar } = repartirFechas(fechasDeSerie(s, desde, fin), otros);
    const fechas = agendar.filter((f) => !ocupadas.has(f));
    sentencias.push(...insertarTurnosDeSerie(s.id, s, fechas));
    vuelven += fechas.length;
  }
  await db.transaccion(sentencias);
  return vuelven;
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
        COALESCE(SUM(${IMPORTE}), 0) AS facturado,
        COALESCE(SUM(CASE WHEN t.pagado = 1 THEN ${IMPORTE} END), 0) AS cobrado,
        COALESCE(SUM(t.estado = 'realizado'), 0) AS sesiones_realizadas,
        COALESCE(SUM(t.estado = 'ausente'), 0) AS ausencias,
        COALESCE(SUM(t.estado = 'ausente' AND t.aviso IS NOT 'con_aviso'), 0) AS ausencias_sin_aviso,
        COALESCE(SUM(CASE WHEN t.estado = 'ausente' THEN t.cargo END), 0) AS cargos_ausencias,
        COALESCE(SUM(t.estado = 'cancelado'), 0) AS cancelados,
        COALESCE(SUM(CASE WHEN t.estado = 'programado' THEN t.monto END), 0) AS programado,
        COALESCE(SUM(t.estado = 'programado'), 0) AS sesiones_programadas
       FROM turnos t WHERE substr(t.inicio, 1, 7) = $1`,
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
    cargos_ausencias: t.cargos_ausencias / 100,
    programado: t.programado / 100,
    gastos: g.total / 100,
    precio_promedio: (p.promedio ?? 0) / 100,
  };
}

// ---------- Recordatorios ----------

/** Turnos programados del día (AAAA-MM-DD) con los datos de contacto del paciente, para recordarlos. */
export function listarParaRecordatorios(db: Db, fecha: string): Promise<TurnoParaRecordatorio[]> {
  return db.select<TurnoParaRecordatorio[]>(
    `SELECT t.id, t.paciente_id, t.inicio, t.duracion_min, t.recordatorio_en,
            p.nombre AS paciente_nombre, p.telefono, p.email
       FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
      WHERE t.estado = 'programado' AND t.inicio >= $1 AND t.inicio < $2
      ORDER BY t.inicio, t.id`,
    [`${fecha}T00:00`, `${sumarDiasFecha(fecha, 1)}T00:00`],
  );
}

/** Cuántos turnos programados del día todavía no tienen el recordatorio enviado. */
export async function contarRecordatoriosPendientes(db: Db, fecha: string): Promise<number> {
  const [f] = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM turnos
      WHERE estado = 'programado' AND recordatorio_en IS NULL AND inicio >= $1 AND inicio < $2`,
    [`${fecha}T00:00`, `${sumarDiasFecha(fecha, 1)}T00:00`],
  );
  return f?.n ?? 0;
}

/** Marca (con la fecha y hora en que se envió) o desmarca el recordatorio de un turno. */
export async function marcarRecordatorio(db: Db, turnoId: number, enviadoEn: string | null): Promise<void> {
  await db.execute("UPDATE turnos SET recordatorio_en = $1 WHERE id = $2", [enviadoEn, turnoId]);
}

export async function leerPlantillaRecordatorio(db: Db): Promise<PlantillaRecordatorio> {
  return leerPlantilla(await leerConfiguracion(db));
}

export async function guardarPlantillaRecordatorio(db: Db, p: PlantillaRecordatorio): Promise<void> {
  const mensaje = p.mensaje.trim();
  if (!mensaje) throw new Error("El mensaje del recordatorio no puede quedar vacío.");
  await db.transaccion([
    { sql: CONFIG_UPSERT, params: [CLAVE_MENSAJE, mensaje] },
    { sql: CONFIG_UPSERT, params: [CLAVE_ASUNTO, p.asunto.trim() || null] },
  ]);
}

// ---------- Configuración y cuidado de los datos ----------

export async function leerConfiguracion(db: Db): Promise<Record<string, string>> {
  const filas = await db.select<{ clave: string; valor: string | null }[]>("SELECT clave, valor FROM configuracion");
  return Object.fromEntries(filas.filter((f) => f.valor != null).map((f) => [f.clave, f.valor as string]));
}

const CONFIG_UPSERT =
  "INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor";

export async function guardarConfiguracion(db: Db, clave: string, valor: string | null): Promise<void> {
  await db.execute(CONFIG_UPSERT, [clave, valor]);
}

export async function leerPoliticaAusencias(db: Db): Promise<PoliticaAusencias> {
  return leerPolitica(await leerConfiguracion(db));
}

export async function guardarPoliticaAusencias(db: Db, p: PoliticaAusencias): Promise<void> {
  for (const v of [p.sinAvisoPct, p.conAvisoPct]) {
    if (!(v >= 0 && v <= 100)) throw new Error("El porcentaje tiene que estar entre 0 y 100.");
  }
  await db.transaccion([
    { sql: CONFIG_UPSERT, params: [CLAVE_SIN_AVISO, String(p.sinAvisoPct)] },
    { sql: CONFIG_UPSERT, params: [CLAVE_CON_AVISO, String(p.conAvisoPct)] },
  ]);
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
  recibos: Recibo[];
}

/** Todo lo que se exporta. Con mes (AAAA-MM) se limitan turnos y gastos a ese mes. */
export async function datosParaExportar(db: Db, mes: string | null): Promise<DatosExportacion> {
  if (mes !== null && !MES.test(mes)) throw new Error("El mes no es válido.");
  const [pacientes, turnos, gastos, recibos] = await Promise.all([
    db.select<Paciente[]>("SELECT * FROM pacientes ORDER BY nombre COLLATE NOCASE"),
    db.select<TurnoConPaciente[]>(
      `SELECT t.*, p.nombre AS paciente_nombre
         FROM turnos t JOIN pacientes p ON p.id = t.paciente_id
        WHERE $1 IS NULL OR substr(t.inicio, 1, 7) = $1
        ORDER BY t.inicio, t.id`,
      [mes],
    ),
    db.select<Gasto[]>("SELECT * FROM gastos WHERE $1 IS NULL OR mes = $1 ORDER BY mes, id", [mes]),
    db.select<FilaRecibo[]>("SELECT * FROM recibos WHERE $1 IS NULL OR substr(fecha, 1, 7) = $1 ORDER BY numero", [mes]),
  ]);
  return {
    pacientes: enPesos(pacientes, ["monto_sesion"]),
    turnos: enPesos(turnos, ["monto", "cargo"]),
    gastos: enPesos(gastos, ["monto"]),
    recibos: recibos.map(aRecibo),
  };
}

// ---------- Papelera e historial ----------

export interface ElementoPapelera {
  id: number;
  tipo: "turno" | "gasto" | "nota";
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
    elemento.tipo === "nota"
      ? // Si mientras tanto esa sesión tiene otra nota, la restaurada queda sin vincular.
        `INSERT INTO notas_clinicas (id, paciente_id, turno_id, fecha, plantilla, secciones, creado_en, modificado_en)
         SELECT json_extract(datos, '$.id'), json_extract(datos, '$.paciente_id'),
                CASE WHEN EXISTS (SELECT 1 FROM notas_clinicas n WHERE n.turno_id = json_extract(datos, '$.turno_id'))
                     THEN NULL ELSE json_extract(datos, '$.turno_id') END,
                json_extract(datos, '$.fecha'), json_extract(datos, '$.plantilla'), json_extract(datos, '$.secciones'),
                json_extract(datos, '$.creado_en'), json_extract(datos, '$.modificado_en')
           FROM papelera WHERE id = $1`
      : elemento.tipo === "turno"
      ? `INSERT INTO turnos (id, paciente_id, inicio, duracion_min, estado, monto, pagado, notas, creado_en, serie_id,
                             aviso, cargo)
         SELECT json_extract(datos, '$.id'), json_extract(datos, '$.paciente_id'), json_extract(datos, '$.inicio'),
                json_extract(datos, '$.duracion_min'), json_extract(datos, '$.estado'), json_extract(datos, '$.monto'),
                json_extract(datos, '$.pagado'), json_extract(datos, '$.notas'), json_extract(datos, '$.creado_en'),
                (SELECT s.id FROM series s WHERE s.id = json_extract(datos, '$.serie_id')),
                -- Turnos que fueron a la papelera antes de la versión 0.6.0 no tienen aviso ni cargo.
                CASE WHEN json_extract(datos, '$.estado') = 'ausente'
                     THEN COALESCE(json_extract(datos, '$.aviso'), 'sin_aviso') END,
                json_extract(datos, '$.cargo')
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

/** Versiones anteriores de notas que ya no existen ni están en la papelera. */
const BORRAR_VERSIONES_HUERFANAS = `DELETE FROM notas_versiones
  WHERE nota_id NOT IN (SELECT id FROM notas_clinicas)
    AND nota_id NOT IN (SELECT registro_id FROM papelera WHERE tipo = 'nota')`;

export async function borrarDePapelera(db: Db, id: number): Promise<void> {
  await db.transaccion([
    { sql: "DELETE FROM papelera WHERE id = $1", params: [id] },
    { sql: BORRAR_VERSIONES_HUERFANAS },
  ]);
}

/** Borra definitivamente lo que lleva más de 30 días en la papelera. */
export async function vaciarPapeleraVencida(db: Db, ahora: string): Promise<number> {
  const r = await db.execute("DELETE FROM papelera WHERE eliminado_en < datetime($1, $2)", [
    ahora.replace("T", " "),
    `-${DIAS_PAPELERA} days`,
  ]);
  if (r.rowsAffected) await db.execute(BORRAR_VERSIONES_HUERFANAS);
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

// ---------- Notas clínicas ----------
// Las notas viven en la base cifrada. Nunca se escriben en el registro de errores:
// los mensajes de error de SQLite no incluyen los valores de los parámetros.

export interface DatosNota {
  paciente_id: number;
  turno_id?: number | null;
  /** AAAA-MM-DD */
  fecha: string;
  plantilla: string;
  secciones: SeccionNota[];
}

export interface FiltroNotas {
  pacienteId?: number | null;
}

type FilaNota = Omit<NotaClinica, "secciones"> & { secciones: string };

function leerSecciones(json: string): SeccionNota[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((s) => ({ titulo: String(s?.titulo ?? ""), texto: String(s?.texto ?? "") })) : [];
  } catch {
    return [];
  }
}

const SELECT_NOTAS = `SELECT n.*, p.nombre AS paciente_nombre, t.inicio AS turno_inicio
    FROM notas_clinicas n
    JOIN pacientes p ON p.id = n.paciente_id
    LEFT JOIN turnos t ON t.id = n.turno_id`;

const conSecciones = (filas: FilaNota[]): NotaClinica[] =>
  filas.map((f) => ({ ...f, secciones: leerSecciones(f.secciones) }));

/** Notas, de la más nueva a la más vieja. La búsqueda por texto se hace con filtrarNotas (src/notas/logica.ts). */
export async function listarNotas(db: Db, filtro: FiltroNotas = {}): Promise<NotaClinica[]> {
  const filas = await db.select<FilaNota[]>(
    `${SELECT_NOTAS}
      WHERE $1 IS NULL OR n.paciente_id = $1
      ORDER BY n.fecha DESC, COALESCE(t.inicio, '') DESC, n.id DESC`,
    [filtro.pacienteId ?? null],
  );
  return conSecciones(filas);
}

export async function obtenerNota(db: Db, id: number): Promise<NotaClinica | null> {
  const filas = await db.select<FilaNota[]>(`${SELECT_NOTAS} WHERE n.id = $1`, [id]);
  return conSecciones(filas)[0] ?? null;
}

/** Nota de una sesión, si ya tiene. */
export async function notaDeTurno(db: Db, turnoId: number): Promise<NotaClinica | null> {
  const filas = await db.select<FilaNota[]>(`${SELECT_NOTAS} WHERE n.turno_id = $1`, [turnoId]);
  return conSecciones(filas)[0] ?? null;
}

/** Ids de los turnos de un paciente que tienen nota. */
export async function turnosConNota(db: Db, pacienteId: number): Promise<Set<number>> {
  const filas = await db.select<{ turno_id: number }[]>(
    "SELECT turno_id FROM notas_clinicas WHERE paciente_id = $1 AND turno_id IS NOT NULL",
    [pacienteId],
  );
  return new Set(filas.map((f) => f.turno_id));
}

async function validarNota(db: Db, d: DatosNota, id: number | null): Promise<SeccionNota[]> {
  if (!d.paciente_id) throw new Error("Elegí el paciente.");
  if (!FECHA.test(d.fecha)) throw new Error("La fecha no es válida.");
  const secciones = d.secciones
    .map((s) => ({ titulo: s.titulo.trim(), texto: s.texto.replace(/\s+$/, "") }))
    .filter((s) => s.titulo || s.texto);
  if (secciones.every((s) => !s.texto.trim())) throw new Error("La nota está vacía.");
  if (d.turno_id != null) {
    const [t] = await db.select<{ paciente_id: number }[]>("SELECT paciente_id FROM turnos WHERE id = $1", [d.turno_id]);
    if (!t) throw new Error("La sesión elegida ya no existe.");
    if (t.paciente_id !== d.paciente_id) throw new Error("La sesión elegida es de otro paciente.");
    const otra = await db.select<{ id: number }[]>(
      "SELECT id FROM notas_clinicas WHERE turno_id = $1 AND id IS NOT $2",
      [d.turno_id, id],
    );
    if (otra.length) throw new Error("Esa sesión ya tiene una nota.");
  }
  return secciones;
}

export async function crearNota(db: Db, d: DatosNota): Promise<number> {
  const secciones = await validarNota(db, d, null);
  const r = await db.execute(
    `INSERT INTO notas_clinicas (paciente_id, turno_id, fecha, plantilla, secciones)
     VALUES ($1, $2, $3, $4, $5)`,
    [d.paciente_id, d.turno_id ?? null, d.fecha, d.plantilla, JSON.stringify(secciones)],
  );
  return Number(r.lastInsertId);
}

/** Guarda los cambios; la versión anterior queda en notas_versiones (trigger de la migración 0006). */
export async function actualizarNota(db: Db, id: number, d: DatosNota, ahora: string): Promise<void> {
  const secciones = await validarNota(db, d, id);
  await db.execute(
    `UPDATE notas_clinicas
        SET paciente_id = $1, turno_id = $2, fecha = $3, plantilla = $4, secciones = $5, modificado_en = $6
      WHERE id = $7`,
    [d.paciente_id, d.turno_id ?? null, d.fecha, d.plantilla, JSON.stringify(secciones), ahora.replace("T", " "), id],
  );
}

/** Manda la nota a la papelera. Devuelve el id en la papelera, para poder deshacer. */
export async function eliminarNota(db: Db, id: number): Promise<number | null> {
  await db.transaccion([
    {
      // La descripción no lleva el contenido de la nota, solo paciente y fecha.
      sql: `INSERT INTO papelera (tipo, registro_id, datos, descripcion)
            SELECT 'nota', n.id,
                   json_object('id', n.id, 'paciente_id', n.paciente_id, 'turno_id', n.turno_id, 'fecha', n.fecha,
                               'plantilla', n.plantilla, 'secciones', n.secciones,
                               'creado_en', n.creado_en, 'modificado_en', n.modificado_en),
                   'Nota clínica de ' || p.nombre || ' (' || n.fecha || ')'
              FROM notas_clinicas n JOIN pacientes p ON p.id = n.paciente_id
             WHERE n.id = $1`,
      params: [id],
    },
    { sql: "DELETE FROM notas_clinicas WHERE id = $1", params: [id] },
  ]);
  return ultimoEnPapelera(db, "nota", id);
}

/** Versiones anteriores de una nota, de la más nueva a la más vieja. */
export async function listarVersionesNota(db: Db, notaId: number): Promise<VersionNota[]> {
  const filas = await db.select<(Omit<VersionNota, "secciones"> & { secciones: string })[]>(
    "SELECT * FROM notas_versiones WHERE nota_id = $1 ORDER BY id DESC",
    [notaId],
  );
  return filas.map((f) => ({ ...f, secciones: leerSecciones(f.secciones) }));
}

// ---------- Recibos de pago ----------
// Un recibo emitido no se borra ni se modifica (lo impiden triggers de la migración 0009):
// solo se anula. Un turno pagado puede estar en un solo recibo vigente.

interface FilaRecibo extends Omit<Recibo, "items" | "emisor"> {
  items: string;
  emisor: string;
}

function aRecibo(f: FilaRecibo): Recibo {
  const items = (JSON.parse(f.items) as ItemRecibo[]).map((it) => ({ ...it, importe: it.importe / 100 }));
  return { ...f, total: f.total / 100, items, emisor: JSON.parse(f.emisor) as Emisor };
}

/** Turnos (sobre "t") que ya están en un recibo vigente. */
const EN_RECIBO_VIGENTE = `EXISTS (SELECT 1 FROM recibo_turnos rt JOIN recibos r ON r.id = rt.recibo_id
                                    WHERE rt.turno_id = t.id AND r.anulado_en IS NULL)`;

/** Pagos del paciente que todavía no tienen recibo: turnos pagados que generan un cobro. */
export async function turnosSinRecibo(db: Db, pacienteId: number): Promise<Turno[]> {
  const filas = await db.select<Turno[]>(
    `SELECT t.* FROM turnos t
      WHERE t.paciente_id = $1 AND t.pagado = 1 AND ${IMPORTE} > 0 AND NOT ${EN_RECIBO_VIGENTE}
      ORDER BY t.inicio DESC, t.id DESC`,
    [pacienteId],
  );
  return enPesos(filas, ["monto", "cargo"]);
}

/** Número de recibo vigente de cada turno del paciente (para mostrarlo en la ficha). */
export async function recibosDeTurnos(db: Db, pacienteId: number): Promise<Map<number, number>> {
  const filas = await db.select<{ turno_id: number; numero: number }[]>(
    `SELECT rt.turno_id, r.numero FROM recibo_turnos rt JOIN recibos r ON r.id = rt.recibo_id
      WHERE r.paciente_id = $1 AND r.anulado_en IS NULL`,
    [pacienteId],
  );
  return new Map(filas.map((f) => [f.turno_id, f.numero]));
}

/** Próximo número de recibo: el siguiente al último, o el inicial configurado si es mayor. */
export async function proximoNumeroRecibo(db: Db): Promise<number> {
  const [f] = await db.select<{ n: number }[]>(
    `SELECT MAX(COALESCE((SELECT MAX(numero) FROM recibos), 0) + 1,
                COALESCE((SELECT CAST(valor AS INTEGER) FROM configuracion WHERE clave = $1), 1)) AS n`,
    [CLAVE_PROXIMO_NUMERO],
  );
  return Number(f.n);
}

export interface DatosRecibo {
  paciente_id: number;
  turno_ids: number[];
  /** AAAA-MM-DD */
  fecha: string;
  medio_pago?: string | null;
}

/** Emite un recibo por los turnos pagados elegidos. Devuelve el recibo guardado. */
export async function emitirRecibo(db: Db, d: DatosRecibo): Promise<Recibo> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new Error("La fecha del recibo no es válida.");
  const ids = [...new Set(d.turno_ids)];
  if (!ids.length) throw new Error("Elegí al menos un pago para el recibo.");
  const config = await leerConfiguracion(db);
  const emisor = leerEmisor(config);
  const falta = faltaParaEmitir(emisor);
  if (falta) throw new Error(falta);
  const [paciente] = await db.select<Paciente[]>("SELECT * FROM pacientes WHERE id = $1", [d.paciente_id]);
  if (!paciente) throw new Error("No se encontró el paciente.");
  const disponibles = new Map((await turnosSinRecibo(db, d.paciente_id)).map((t) => [t.id, t]));
  const turnos = ids.map((id) => disponibles.get(id));
  if (turnos.some((t) => !t)) {
    throw new Error("Alguno de los pagos elegidos ya tiene recibo, no está pagado o no es de este paciente.");
  }
  const items = itemsDeTurnos(turnos as Turno[], leerConcepto(config)).map((it) => ({ ...it, importe: aCentavos(it.importe) }));
  const total = items.reduce((acc, it) => acc + it.importe, 0);
  const numero = await proximoNumeroRecibo(db);
  await db.transaccion([
    {
      sql: `INSERT INTO recibos (numero, fecha, paciente_id, paciente_nombre, paciente_documento, total, medio_pago, items, emisor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      params: [
        numero,
        d.fecha,
        paciente.id,
        paciente.nombre,
        paciente.documento ?? null,
        total,
        vacioANull(d.medio_pago),
        JSON.stringify(items),
        JSON.stringify(emisor),
      ],
    },
    {
      sql: `INSERT INTO recibo_turnos (recibo_id, turno_id)
            SELECT (SELECT id FROM recibos WHERE numero = $1), value FROM json_each($2)`,
      params: [numero, JSON.stringify(ids)],
    },
  ]);
  const recibo = await obtenerRecibo(db, numero, "numero");
  if (!recibo) throw new Error("No se pudo guardar el recibo.");
  return recibo;
}

export async function obtenerRecibo(db: Db, valor: number, por: "id" | "numero" = "id"): Promise<Recibo | null> {
  const [f] = await db.select<FilaRecibo[]>(`SELECT * FROM recibos WHERE ${por === "id" ? "id" : "numero"} = $1`, [valor]);
  return f ? aRecibo(f) : null;
}

/** Recibos de un paciente (o de todos), del más nuevo al más viejo. */
export async function listarRecibos(db: Db, pacienteId: number | null = null, limite = 500): Promise<Recibo[]> {
  const filas = await db.select<FilaRecibo[]>(
    `SELECT * FROM recibos WHERE $1 IS NULL OR paciente_id = $1 ORDER BY numero DESC LIMIT $2`,
    [pacienteId, limite],
  );
  return filas.map(aRecibo);
}

/** Anula un recibo: queda guardado (con la marca ANULADO) y sus pagos pueden ir en otro recibo. */
export async function anularRecibo(db: Db, id: number, motivo: string | null, ahora: string): Promise<void> {
  const r = await db.execute("UPDATE recibos SET anulado_en = $1, motivo_anulacion = $2 WHERE id = $3 AND anulado_en IS NULL", [
    ahora.replace("T", " "),
    vacioANull(motivo),
    id,
  ]);
  if (!r.rowsAffected) throw new Error("El recibo no existe o ya estaba anulado.");
}

/** Medio de pago del último recibo, para proponerlo en el siguiente. */
export async function ultimoMedioPago(db: Db): Promise<string | null> {
  const [f] = await db.select<{ medio_pago: string | null }[]>("SELECT medio_pago FROM recibos ORDER BY id DESC LIMIT 1");
  return f?.medio_pago ?? null;
}
