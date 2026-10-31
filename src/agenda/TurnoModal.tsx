import { useEffect, useMemo, useState } from "react";
import type { EstadoTurno, Paciente, TurnoConPaciente } from "../tipos";
import { ESTADOS_TURNO } from "../tipos";
import { turnosSuperpuestos } from "./logica";
import { horaTexto } from "../fechas";

export interface ResultadoModal {
  paciente_id: number | null;
  nuevoPaciente: { nombre: string; monto_sesion: number } | null;
  inicio: string;
  duracion_min: number;
  estado: EstadoTurno;
  notas: string;
}

interface Props {
  turno: TurnoConPaciente | null;
  inicioSugerido: string;
  pacientes: Paciente[];
  /** Devuelve los turnos de una fecha (AAAA-MM-DD) para avisar superposiciones. */
  turnosDeFecha: (fecha: string) => Promise<TurnoConPaciente[]>;
  duracionPredeterminada: number;
  onGuardar: (r: ResultadoModal) => Promise<void>;
  onEliminar: (id: number) => Promise<void>;
  onCerrar: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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
    if (!fecha || !hora || !(dur > 0) || estado === "cancelado") return [];
    return turnosSuperpuestos(
      { id: turno?.id, inicio: `${fecha}T${hora}`, duracion_min: dur },
      delDia,
    );
  }, [fecha, hora, duracion, estado, turno?.id, delDia]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const esNuevo = pacienteSel === NUEVO;
    if (!esNuevo && !pacienteSel) return setError("Elegí un paciente.");
    if (esNuevo && !nuevoNombre.trim()) return setError("Escribí el nombre del paciente nuevo.");
    const monto = nuevoMonto.trim() ? Number(nuevoMonto.replace(",", ".")) : 0;
    if (esNuevo && !(monto >= 0)) return setError("El monto por sesión no es válido.");
    setGuardando(true);
    try {
      await props.onGuardar({
        paciente_id: esNuevo ? null : Number(pacienteSel),
        nuevoPaciente: esNuevo ? { nombre: nuevoNombre, monto_sesion: monto } : null,
        inicio: `${fecha}T${hora}`,
        duracion_min: Number(duracion),
        estado,
        notas,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!turno) return;
    if (!window.confirm("¿Eliminar este turno? Si el paciente no vino, mejor marcalo como Cancelado o Ausente.")) return;
    setGuardando(true);
    try {
      await props.onEliminar(turno.id);
    } catch (err) {
      setError(String(err));
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onMouseDown={props.onCerrar}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h3>{turno ? "Editar turno" : "Nuevo turno"}</h3>

        <label>
          Paciente
          <select value={pacienteSel} onChange={(e) => setPacienteSel(e.target.value)} autoFocus>
            <option value="" disabled>
              Elegí un paciente…
            </option>
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
              <input inputMode="decimal" placeholder="0" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} />
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
            <input type="number" min={5} step={5} required value={duracion} onChange={(e) => setDuracion(e.target.value)} />
          </label>
        </div>

        {turno && (
          <label>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoTurno)}>
              {ESTADOS_TURNO.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </label>
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
          {turno && (
            <button type="button" className="peligro" onClick={eliminar} disabled={guardando}>
              Eliminar
            </button>
          )}
          <span className="crece" />
          <button type="button" onClick={props.onCerrar} disabled={guardando}>
            Cerrar
          </button>
          <button type="submit" className="primario" disabled={guardando}>
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
