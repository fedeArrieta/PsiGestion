import { useCallback, useEffect, useState } from "react";
import { obtenerDb } from "../db";
import {
  actualizarPaciente,
  cambiarActivoPaciente,
  crearPaciente,
  listarTurnosDePaciente,
  marcarPagado,
  saldarPaciente,
} from "../repositorio";
import type { PacienteConResumen, Turno } from "../tipos";
import { ESTADOS_TURNO } from "../tipos";
import { leerMonto, montoEditable, pesos } from "../formato";
import { aIsoLocal, desdeIsoLocal } from "../fechas";

interface Props {
  /** null = paciente nuevo */
  paciente: PacienteConResumen | null;
  onCambio: () => Promise<void> | void;
  onCerrar: () => void;
}

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtTurno = { format: (d: Date) => `${fmtFecha.format(d)} · ${aIsoLocal(d).slice(11, 16)}` };

const etiquetaEstado = Object.fromEntries(ESTADOS_TURNO.map((e) => [e.valor, e.etiqueta]));

export default function FichaPaciente({ paciente, onCambio, onCerrar }: Props) {
  const [nombre, setNombre] = useState(paciente?.nombre ?? "");
  const [telefono, setTelefono] = useState(paciente?.telefono ?? "");
  const [email, setEmail] = useState(paciente?.email ?? "");
  const [monto, setMonto] = useState(montoEditable(paciente?.monto_sesion ?? 0));
  const [notas, setNotas] = useState(paciente?.notas ?? "");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  const cargarTurnos = useCallback(async () => {
    if (paciente) setTurnos(await listarTurnosDePaciente(await obtenerDb(), paciente.id));
  }, [paciente]);

  useEffect(() => {
    cargarTurnos().catch((e) => setError(String(e)));
  }, [cargarTurnos]);

  async function ejecutar(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNumero = leerMonto(monto);
    if (Number.isNaN(montoNumero)) return setError("El monto por sesión no es válido. Ejemplo: 25000 o 25.000");
    return ejecutar(async () => {
      const db = await obtenerDb();
      const datos = { nombre, telefono, email, notas, monto_sesion: montoNumero };
      if (paciente) await actualizarPaciente(db, paciente.id, datos, aIsoLocal(new Date()));
      else await crearPaciente(db, datos);
      await onCambio();
      onCerrar();
    });
  };

  const alternarPago = (t: Turno) =>
    ejecutar(async () => {
      await marcarPagado(await obtenerDb(), t.id, !t.pagado);
      await Promise.all([cargarTurnos(), onCambio()]);
    });

  const saldar = () =>
    ejecutar(async () => {
      await saldarPaciente(await obtenerDb(), paciente!.id);
      await Promise.all([cargarTurnos(), onCambio()]);
    });

  const cambiarActivo = () => {
    const darDeBaja = Boolean(paciente!.activo);
    if (
      darDeBaja &&
      !window.confirm(`¿Dar de baja a ${paciente!.nombre}? Deja de aparecer en la agenda, pero se conserva su historial.`)
    )
      return;
    return ejecutar(async () => {
      await cambiarActivoPaciente(await obtenerDb(), paciente!.id, !darDeBaja);
      await onCambio();
      onCerrar();
    });
  };

  const pendientes = turnos.filter((t) => t.estado === "realizado" && !t.pagado);
  const saldo = pendientes.reduce((acc, t) => acc + t.monto, 0);

  return (
    <div className="modal-fondo" onMouseDown={onCerrar}>
      <div className="modal ficha" onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={guardar} className="ficha-datos">
          <h3>{paciente ? "Ficha del paciente" : "Nuevo paciente"}</h3>
          <label>
            Nombre
            <input autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <div className="fila">
            <label className="crece">
              Teléfono
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </label>
            <label className="crece">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label>
            Monto por sesión
            <input inputMode="decimal" placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
            {paciente && <small>Si lo cambiás, se actualizan también sus turnos programados a futuro.</small>}
          </label>
          <label>
            Notas
            <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            {paciente && (
              <button type="button" className={paciente.activo ? "peligro" : ""} onClick={cambiarActivo} disabled={ocupado}>
                {paciente.activo ? "Dar de baja" : "Reactivar"}
              </button>
            )}
            <span className="crece" />
            <button type="button" onClick={onCerrar} disabled={ocupado}>
              Cerrar
            </button>
            <button type="submit" className="primario" disabled={ocupado}>
              Guardar
            </button>
          </div>
        </form>

        {paciente && (
          <section className="ficha-turnos">
            <div className="ficha-turnos-cabecera">
              <h4>Sesiones</h4>
              {saldo > 0 && (
                <button type="button" onClick={saldar} disabled={ocupado}>
                  Marcar todo pagado ({pesos(saldo)})
                </button>
              )}
            </div>
            {turnos.length === 0 ? (
              <p className="vacio">Todavía no tiene turnos.</p>
            ) : (
              <ul className="lista-turnos">
                {turnos.map((t) => (
                  <li key={t.id} className={`estado-${t.estado}`}>
                    <span className="crece">{fmtTurno.format(desdeIsoLocal(t.inicio))}</span>
                    <span className="estado">{etiquetaEstado[t.estado]}</span>
                    <span className="num">{pesos(t.monto)}</span>
                    <label className="check" title="Pagado">
                      <input type="checkbox" checked={Boolean(t.pagado)} onChange={() => alternarPago(t)} disabled={ocupado} />
                      Pagado
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
