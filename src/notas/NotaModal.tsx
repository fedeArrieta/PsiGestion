import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Lock } from "lucide-react";
import { obtenerDb } from "../db";
import {
  actualizarNota,
  crearNota,
  eliminarNota,
  listarPacientesConResumen,
  listarTurnosDePaciente,
  listarVersionesNota,
  notaDeTurno,
  obtenerNota,
  turnosConNota,
} from "../repositorio";
import type { NotaClinica, Paciente, SeccionNota, Turno, VersionNota } from "../tipos";
import { ESTADOS_TURNO } from "../tipos";
import { aFechaIso, aIsoLocal, desdeIsoLocal } from "../fechas";
import { textoError } from "../errores";
import { ofrecerDeshacer } from "../papelera/deshacer";
import { fechaLegible } from "../papelera/Papelera";
import { cambiarPlantilla, notaVacia, PLANTILLA_PREDETERMINADA, PLANTILLAS, plantilla, seccionesVacias } from "./logica";

export interface InicioNota {
  paciente_id?: number;
  turno_id?: number;
  /** AAAA-MM-DD */
  fecha?: string;
}

interface Props {
  /** Nota a editar; null = nueva (o la de la sesión de "inicial", si ya tiene). */
  notaId: number | null;
  inicial?: InicioNota;
  onGuardado?: () => void;
  onCerrar: () => void;
}

const etiquetaEstado = Object.fromEntries(ESTADOS_TURNO.map((e) => [e.valor, e.etiqueta]));
const fmtSesion = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "numeric", year: "2-digit" });
const textoSesion = (t: Turno) =>
  `${fmtSesion.format(desdeIsoLocal(t.inicio))} · ${t.inicio.slice(11, 16)} (${etiquetaEstado[t.estado].toLowerCase()})`;

interface Borrador {
  paciente_id: number | null;
  turno_id: number | null;
  fecha: string;
  plantilla: string;
  secciones: SeccionNota[];
}

const firma = (b: Borrador) => JSON.stringify(b);

export default function NotaModal({ notaId, inicial, onGuardado, onCerrar }: Props) {
  const [nota, setNota] = useState<NotaClinica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [borrador, setBorrador] = useState<Borrador>(() => ({
    paciente_id: inicial?.paciente_id ?? null,
    turno_id: inicial?.turno_id ?? null,
    fecha: inicial?.fecha ?? aFechaIso(new Date()),
    plantilla: PLANTILLA_PREDETERMINADA,
    secciones: seccionesVacias(PLANTILLA_PREDETERMINADA),
  }));
  const [original, setOriginal] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [versiones, setVersiones] = useState<VersionNota[]>([]);
  const [verVersiones, setVerVersiones] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const sinGuardar = !cargando && firma(borrador) !== original;

  // Carga la nota (la indicada, o la que ya tenga la sesión) y los pacientes.
  useEffect(() => {
    (async () => {
      const db = await obtenerDb();
      const [lista, existente] = await Promise.all([
        listarPacientesConResumen(db, true),
        notaId != null ? obtenerNota(db, notaId) : inicial?.turno_id != null ? notaDeTurno(db, inicial.turno_id) : null,
      ]);
      setPacientes(lista);
      let b = borrador;
      if (existente) {
        setNota(existente);
        b = {
          paciente_id: existente.paciente_id,
          turno_id: existente.turno_id,
          fecha: existente.fecha,
          plantilla: existente.plantilla,
          // Las secciones de la plantilla que quedaron vacías no se guardan: se vuelven a mostrar.
          secciones: cambiarPlantilla(existente.secciones, existente.plantilla),
        };
        setBorrador(b);
        setVersiones(await listarVersionesNota(db, existente.id));
      }
      setOriginal(firma(b));
    })()
      .catch((e) => setError(textoError(e, "abrir nota clínica")))
      .finally(() => setCargando(false));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sesiones del paciente para vincular la nota: las que ya pasaron y no tienen otra nota (y la vinculada).
  useEffect(() => {
    if (!borrador.paciente_id) return setTurnos([]);
    let vigente = true;
    (async () => {
      const db = await obtenerDb();
      const [todos, ocupados] = await Promise.all([
        listarTurnosDePaciente(db, borrador.paciente_id!),
        turnosConNota(db, borrador.paciente_id!),
      ]);
      const finDeHoy = `${aFechaIso(new Date())}T23:59`;
      const libre = (t: Turno) => t.inicio <= finDeHoy && t.estado !== "cancelado" && !ocupados.has(t.id);
      if (vigente) setTurnos(todos.filter((t) => libre(t) || t.id === borrador.turno_id || t.id === nota?.turno_id));
    })().catch((e) => setError(textoError(e, "sesiones del paciente")));
    return () => {
      vigente = false;
    };
    // Solo cuando cambia el paciente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador.paciente_id]);

  const cerrar = useCallback(() => {
    if (sinGuardar && !window.confirm("La nota tiene cambios sin guardar. ¿Cerrar igual y descartarlos?")) return;
    onCerrar();
  }, [sinGuardar, onCerrar]);

  const guardar = useCallback(async () => {
    if (!borrador.paciente_id) return setError("Elegí el paciente.");
    setError(null);
    setOcupado(true);
    try {
      const db = await obtenerDb();
      const datos = { ...borrador, paciente_id: borrador.paciente_id };
      if (nota) await actualizarNota(db, nota.id, datos, aIsoLocal(new Date()));
      else await crearNota(db, datos);
      onGuardado?.();
      onCerrar();
    } catch (e) {
      setError(textoError(e, "guardar nota clínica"));
    } finally {
      setOcupado(false);
    }
  }, [borrador, nota, onGuardado, onCerrar]);

  useEffect(() => {
    // En captura y sin propagar el Escape, para que no cierre también la ventana de abajo (turno o ficha).
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!ocupado) guardar();
      }
    };
    window.addEventListener("keydown", alPresionar, true);
    return () => window.removeEventListener("keydown", alPresionar, true);
  }, [cerrar, guardar, ocupado]);

  async function eliminar() {
    if (!nota || !window.confirm("¿Eliminar esta nota? Va a la papelera y se puede recuperar durante 30 días.")) return;
    setOcupado(true);
    try {
      const papeleraId = await eliminarNota(await obtenerDb(), nota.id);
      ofrecerDeshacer("Se eliminó la nota clínica.", papeleraId);
      onGuardado?.();
      onCerrar();
    } catch (e) {
      setError(textoError(e, "eliminar nota clínica"));
      setOcupado(false);
    }
  }

  const cambiar = (cambios: Partial<Borrador>) => setBorrador((b) => ({ ...b, ...cambios }));
  const cambiarTexto = (i: number, texto: string) =>
    setBorrador((b) => ({ ...b, secciones: b.secciones.map((s, j) => (j === i ? { ...s, texto } : s)) }));

  const elegirSesion = (valor: string) => {
    const t = turnos.find((x) => String(x.id) === valor);
    cambiar(t ? { turno_id: t.id, fecha: t.inicio.slice(0, 10) } : { turno_id: null });
  };

  const opcionesPacientes = useMemo(
    () => pacientes.filter((p) => p.activo || p.id === borrador.paciente_id),
    [pacientes, borrador.paciente_id],
  );
  const desdeSesion = inicial?.turno_id != null && !nota;
  const titulo = nota ? "Nota clínica" : "Nueva nota clínica";

  return (
    <div className="modal-fondo">
      <div className="modal nota-clinica" role="dialog" aria-label={titulo}>
        <div className="nota-clinica-cabecera">
          <h3>{titulo}</h3>
          <span className="chip" title="Se guarda dentro de la base cifrada con tu contraseña">
            <Lock size={13} /> Cifrada
          </span>
        </div>
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : (
          <>
            <div className="fila">
              <label className="crece">
                Paciente
                <select
                  value={borrador.paciente_id ?? ""}
                  disabled={desdeSesion || ocupado}
                  onChange={(e) => cambiar({ paciente_id: Number(e.target.value) || null, turno_id: null })}
                  autoFocus={!borrador.paciente_id}
                >
                  <option value="">Elegí un paciente…</option>
                  {opcionesPacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.activo ? "" : " (de baja)"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  required
                  value={borrador.fecha}
                  disabled={borrador.turno_id != null || ocupado}
                  onChange={(e) => cambiar({ fecha: e.target.value })}
                />
              </label>
            </div>
            <div className="fila">
              <label className="crece">
                Sesión
                <select
                  value={borrador.turno_id ?? ""}
                  disabled={!borrador.paciente_id || desdeSesion || ocupado}
                  onChange={(e) => elegirSesion(e.target.value)}
                >
                  <option value="">Sin vincular a una sesión</option>
                  {turnos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {textoSesion(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Plantilla
                <select
                  value={borrador.plantilla}
                  disabled={ocupado}
                  onChange={(e) =>
                    cambiar({ plantilla: e.target.value, secciones: cambiarPlantilla(borrador.secciones, e.target.value) })
                  }
                >
                  {PLANTILLAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="nota-clinica-secciones">
              {borrador.secciones.map((s, i) => (
                <label key={s.titulo + i}>
                  {s.titulo}
                  <textarea
                    rows={borrador.secciones.length === 1 ? 12 : 4}
                    value={s.texto}
                    autoFocus={Boolean(borrador.paciente_id) && i === 0}
                    disabled={ocupado}
                    onChange={(e) => cambiarTexto(i, e.target.value)}
                  />
                </label>
              ))}
            </div>

            {nota && (
              <p className="nota">
                Creada el {fechaLegible(nota.creado_en)}
                {nota.modificado_en !== nota.creado_en && ` · modificada el ${fechaLegible(nota.modificado_en)}`}
                {versiones.length > 0 && (
                  <>
                    {" · "}
                    <button type="button" className="enlace" onClick={() => setVerVersiones((v) => !v)}>
                      <History size={13} /> {verVersiones ? "Ocultar" : "Ver"} versiones anteriores ({versiones.length})
                    </button>
                  </>
                )}
              </p>
            )}
            {verVersiones && (
              <ul className="nota-clinica-versiones">
                {versiones.map((v) => (
                  <li key={v.id}>
                    <strong>
                      Versión guardada el {fechaLegible(v.guardada_en)} · {plantilla(v.plantilla).nombre}
                      {v.fecha !== borrador.fecha && ` · fecha ${fechaLegible(`${v.fecha}T00:00`).slice(0, 10)}`}
                    </strong>
                    {v.secciones
                      .filter((s) => s.texto.trim())
                      .map((s, i) => (
                        <div key={i}>
                          <span className="nota">{s.titulo}</span>
                          <p>{s.texto}</p>
                        </div>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="acciones">
          {nota && (
            <button type="button" className="peligro" onClick={eliminar} disabled={ocupado}>
              Eliminar
            </button>
          )}
          <span className="crece" />
          <button type="button" onClick={cerrar} disabled={ocupado}>
            Cerrar
          </button>
          <button
            type="button"
            className="primario"
            onClick={guardar}
            disabled={ocupado || cargando || notaVacia(borrador.secciones)}
            title="Ctrl+S"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
