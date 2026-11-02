import { useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import type { EstadoTurno, Paciente, Serie, TurnoConPaciente } from "../tipos";
import { ESTADOS_TURNO } from "../tipos";
import { turnosSuperpuestos } from "./logica";
import { desdeIsoLocal, horaTexto } from "../fechas";
import { leerMonto, pesos } from "../formato";
import { textoError } from "../errores";
import type { DatosSerie, VistaPreviaSerie } from "../repositorio";
import { FRECUENCIAS, textoSerie } from "./series";

/** Cómo se repite el turno: null = no se repite. */
export interface Repeticion {
  frecuencia_semanas: number;
  /** AAAA-MM-DD inclusive; null = sin fin. */
  hasta: string | null;
}

/** A qué se aplican los cambios de un turno que es parte de una serie. */
export type Alcance = "turno" | "serie";

export interface ResultadoModal {
  paciente_id: number | null;
  nuevoPaciente: { nombre: string; monto_sesion: number } | null;
  inicio: string;
  duracion_min: number;
  estado: EstadoTurno;
  notas: string;
  pagado: boolean;
  repeticion: Repeticion | null;
  alcance: Alcance;
}

interface Props {
  turno: TurnoConPaciente | null;
  inicioSugerido: string;
  pacientes: Paciente[];
  /** Devuelve los turnos de una fecha (AAAA-MM-DD) para avisar superposiciones. */
  turnosDeFecha: (fecha: string) => Promise<TurnoConPaciente[]>;
  duracionPredeterminada: number;
  /** Serie del turno, si es parte de una. */
  cargarSerie: (id: number) => Promise<Serie | null>;
  /** Qué turnos generaría una serie (para mostrar el resumen antes de guardar). */
  previsualizar: (datos: DatosSerie, excluirSerie?: number) => Promise<VistaPreviaSerie>;
  onGuardar: (r: ResultadoModal) => Promise<void>;
  onEliminar: (id: number) => Promise<void>;
  onTerminarSerie: (serieId: number, desdeFecha: string) => Promise<void>;
  onCerrar: () => void;
}

const fechaCorta = (f: string) =>
  desdeIsoLocal(`${f}T00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "2-digit" });

function lista(fechas: string[], max = 4): string {
  const txt = fechas.slice(0, max).join(", ");
  return fechas.length > max ? `${txt} y ${fechas.length - max} más` : txt;
}

const NUEVO = "nuevo";

export default function TurnoModal(props: Props) {
  const { turno, pacientes } = props;
  const [pacienteSel, setPacienteSel] = useState<string>(
    turno ? String(turno.paciente_id) : pacientes.length ? "" : NUEVO,
  );
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const inicio = turno?.inicio ?? props.inicioSugerido;
  const [fecha, setFecha] = useState(inicio.slice(0, 10));
  const [hora, setHora] = useState(inicio.slice(11, 16));
  const [duracion, setDuracion] = useState(String(turno?.duracion_min ?? props.duracionPredeterminada));
  const [estado, setEstado] = useState<EstadoTurno>(turno?.estado ?? "programado");
  const [notas, setNotas] = useState(turno?.notas ?? "");
  const [pagado, setPagado] = useState(Boolean(turno?.pagado));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Repetición: para un turno nuevo, o para "este y los siguientes" de una serie.
  const [serie, setSerie] = useState<Serie | null>(null);
  const [alcance, setAlcance] = useState<Alcance>("turno");
  const [frecuencia, setFrecuencia] = useState(0);
  const [termina, setTermina] = useState<"nunca" | "fecha">("nunca");
  const [hastaFecha, setHastaFecha] = useState("");
  const [vista, setVista] = useState<VistaPreviaSerie | null>(null);

  const { cargarSerie } = props;
  useEffect(() => {
    if (!turno?.serie_id) return;
    let vigente = true;
    cargarSerie(turno.serie_id).then((s) => {
      if (!vigente || !s) return;
      setSerie(s);
      setFrecuencia(s.frecuencia_semanas);
      setTermina(s.hasta ? "fecha" : "nunca");
      setHastaFecha(s.hasta ?? "");
    });
    return () => {
      vigente = false;
    };
  }, [turno?.serie_id, cargarSerie]);

  const editaSerie = Boolean(serie) && alcance === "serie";
  const repite = turno ? editaSerie : frecuencia > 0;
  const repeticion: Repeticion | null = repite
    ? { frecuencia_semanas: frecuencia || 1, hasta: termina === "fecha" && hastaFecha ? hastaFecha : null }
    : null;

  // Resumen de la serie: cuántos turnos, cuáles se saltean y cuáles se pisan.
  const { previsualizar } = props;
  const pacienteId = pacienteSel && pacienteSel !== NUEVO ? Number(pacienteSel) : null;
  const claveVista = repeticion
    ? JSON.stringify([pacienteId ?? -1, fecha, hora, duracion, repeticion.frecuencia_semanas, repeticion.hasta, serie?.id])
    : "";
  useEffect(() => {
    if (!claveVista) return setVista(null);
    let vigente = true;
    const [pid, f, h, dur, frec, hasta, serieId] = JSON.parse(claveVista);
    const t = window.setTimeout(() => {
      previsualizar(
        { paciente_id: pid > 0 ? pid : 1, desde: f, hora: h, duracion_min: Number(dur), frecuencia_semanas: frec, hasta },
        serieId ?? undefined,
      )
        .then((v) => vigente && setVista(v))
        .catch(() => vigente && setVista(null));
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [claveVista, previsualizar]);

  const { onCerrar } = props;
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  const [delDia, setDelDia] = useState<TurnoConPaciente[]>([]);
  const { turnosDeFecha } = props;
  useEffect(() => {
    if (!fecha) return;
    let vigente = true;
    turnosDeFecha(fecha)
      .then((t) => vigente && setDelDia(t))
      .catch(() => vigente && setDelDia([]));
    return () => {
      vigente = false;
    };
  }, [fecha, turnosDeFecha]);

  const superpuestos = useMemo(() => {
    const dur = Number(duracion);
    if (!fecha || !hora || !(dur > 0) || estado === "cancelado" || repite) return [];
    return turnosSuperpuestos({ id: turno?.id, inicio: `${fecha}T${hora}`, duracion_min: dur }, delDia);
  }, [fecha, hora, duracion, estado, turno?.id, delDia, repite]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const esNuevo = pacienteSel === NUEVO;
    if (!esNuevo && !pacienteSel) return setError("Elegí un paciente.");
    if (esNuevo && !nuevoNombre.trim()) return setError("Escribí el nombre del paciente nuevo.");
    const monto = leerMonto(nuevoMonto);
    if (esNuevo && !(monto >= 0)) return setError("El monto por sesión no es válido.");
    if (repeticion && termina === "fecha" && !hastaFecha) return setError("Elegí hasta qué fecha se repite.");
    if (repeticion?.hasta && repeticion.hasta < fecha)
      return setError("La fecha de fin tiene que ser posterior a la del turno.");
    setGuardando(true);
    try {
      await props.onGuardar({
        paciente_id: esNuevo ? null : Number(pacienteSel),
        nuevoPaciente: esNuevo ? { nombre: nuevoNombre, monto_sesion: monto } : null,
        inicio: `${fecha}T${hora}`,
        duracion_min: Number(duracion),
        estado,
        notas,
        pagado,
        repeticion,
        alcance: editaSerie ? "serie" : "turno",
      });
    } catch (err) {
      setError(textoError(err, "guardar turno"));
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!turno) return;
    if (!window.confirm("¿Eliminar este turno? Si el paciente no vino, mejor marcalo como Cancelado o Ausente."))
      return;
    setGuardando(true);
    try {
      await props.onEliminar(turno.id);
    } catch (err) {
      setError(textoError(err, "eliminar turno"));
      setGuardando(false);
    }
  }

  async function terminarSerie() {
    if (!turno || !serie) return;
    const desde = turno.inicio.slice(0, 10);
    if (
      !window.confirm(
        `¿Terminar la serie "${textoSerie(serie)}"?\n\nSe quitan este turno y los siguientes que estén programados (van a la papelera). Los anteriores quedan como están.`,
      )
    )
      return;
    setGuardando(true);
    try {
      await props.onTerminarSerie(serie.id, desde);
    } catch (err) {
      setError(textoError(err, "terminar serie"));
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onMouseDown={props.onCerrar}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h3>{turno ? "Editar turno" : "Nuevo turno"}</h3>

        {serie && (
          <div className="serie-info">
            <p>
              <Repeat size={16} className="icono" /> Parte de una serie: <strong>{textoSerie(serie)}</strong>
              {serie.hasta ? `, hasta el ${fechaCorta(serie.hasta)}` : ""}
            </p>
            <div className="selector">
              <button type="button" className={alcance === "turno" ? "activo" : ""} onClick={() => setAlcance("turno")}>
                Solo este turno
              </button>
              <button type="button" className={alcance === "serie" ? "activo" : ""} onClick={() => setAlcance("serie")}>
                Este y los siguientes
              </button>
            </div>
          </div>
        )}

        <label>
          Paciente
          <select value={pacienteSel} onChange={(e) => setPacienteSel(e.target.value)} autoFocus>
            <option value="" disabled>
              Elegí un paciente…
            </option>
            {turno && !pacientes.some((p) => p.id === turno.paciente_id) && (
              <option value={turno.paciente_id}>{turno.paciente_nombre} (dado de baja)</option>
            )}
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            <option value={NUEVO}>+ Paciente nuevo</option>
          </select>
        </label>

        {pacienteSel === NUEVO && (
          <div className="fila">
            <label className="crece">
              Nombre
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
            </label>
            <label>
              Monto por sesión
              <input
                inputMode="decimal"
                placeholder="0"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="fila">
          <label className="crece">
            Fecha
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label>
            Hora
            <input type="time" required step={300} value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label>
            Duración (min)
            <input
              type="number"
              min={5}
              step={5}
              required
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
            />
          </label>
        </div>

        {(!turno || editaSerie) && (
          <div className="fila">
            <label className="crece">
              Repetir
              <select value={frecuencia} onChange={(e) => setFrecuencia(Number(e.target.value))}>
                {!turno && <option value={0}>No se repite</option>}
                {FRECUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {repite && (
              <>
                <label className="ancho">
                  Termina
                  <select value={termina} onChange={(e) => setTermina(e.target.value as "nunca" | "fecha")}>
                    <option value="nunca">Sin fecha de fin</option>
                    <option value="fecha">En una fecha</option>
                  </select>
                </label>
                {termina === "fecha" && (
                  <label className="ancho">
                    Hasta
                    <input type="date" required min={fecha} value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} />
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {repite && vista && (
          <div className="serie-resumen">
            <p>
              {vista.agendar.length === 1 ? "Se agenda 1 turno" : `Se agendan ${vista.agendar.length} turnos`}
              {vista.agendar.length > 0 &&
                ` (${fechaCorta(vista.agendar[0])} al ${fechaCorta(vista.agendar[vista.agendar.length - 1])})`}
              {repeticion && !repeticion.hasta && ". Después la app sigue agregando los siguientes sola"}.
              {editaSerie && " Los turnos anteriores a este no cambian."}
            </p>
            {vista.salteadas.length > 0 && (
              <p>
                Se saltean por feriados o vacaciones: {lista(vista.salteadas.map((x) => `${fechaCorta(x.fecha)} (${x.motivo})`), 3)}.
              </p>
            )}
            {vista.superpuestas.length > 0 && (
              <p className="aviso">
                Se superpone con:{" "}
                {lista(vista.superpuestas.map((x) => `${x.paciente_nombre} el ${fechaCorta(x.fecha)} ${horaTexto(x.inicio)}`))}
              </p>
            )}
          </div>
        )}

        {turno && !editaSerie && (
          <div className="fila">
            <label className="crece">
              Estado
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoTurno)}>
                {ESTADOS_TURNO.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
              Pagado{turno.monto ? ` (${pesos(turno.monto)})` : ""}
            </label>
          </div>
        )}

        <label>
          Notas
          <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>

        {superpuestos.length > 0 && (
          <p className="aviso">
            Se superpone con: {superpuestos.map((t) => `${t.paciente_nombre} (${horaTexto(t.inicio)})`).join(", ")}
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <div className="acciones">
          {turno && !editaSerie && (
            <button type="button" className="peligro" onClick={eliminar} disabled={guardando}>
              {serie ? "Eliminar este turno" : "Eliminar"}
            </button>
          )}
          {editaSerie && (
            <button type="button" className="peligro" onClick={terminarSerie} disabled={guardando}>
              Terminar la serie
            </button>
          )}
          <span className="crece" />
          <button type="button" onClick={props.onCerrar} disabled={guardando}>
            Cerrar
          </button>
          <button type="submit" className="primario" disabled={guardando}>
            {editaSerie ? "Guardar en la serie" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
