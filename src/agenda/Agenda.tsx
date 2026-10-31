import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerDb } from "../db";
import {
  actualizarTurno,
  crearPaciente,
  crearTurno,
  eliminarTurno,
  listarPacientes,
  listarTurnos,
} from "../repositorio";
import type { Paciente, TurnoConPaciente } from "../tipos";
import {
  aFechaIso,
  aIsoLocal,
  desdeIsoLocal,
  horaTexto,
  inicioDeSemana,
  inicioDelDia,
  mismoDia,
  minutosDelDia,
  sumarDias,
  textoDia,
  textoDiaLargo,
  textoSemana,
} from "../fechas";
import { distribuirEnColumnas } from "./logica";
import { ALTO_HORA, DURACION_PREDETERMINADA, HORA_FIN, HORA_INICIO } from "./config";
import TurnoModal, { type ResultadoModal } from "./TurnoModal";
import { textoError } from "../errores";

type Vista = "semana" | "dia";
type Edicion = { turno: TurnoConPaciente | null; inicioSugerido: string };

const turnosDeFecha = async (fecha: string) => {
  const dia = desdeIsoLocal(`${fecha}T00:00`);
  return listarTurnos(await obtenerDb(), aIsoLocal(dia), aIsoLocal(sumarDias(dia, 1)));
};

export default function Agenda() {
  const [vista, setVista] = useState<Vista>("semana");
  const [referencia, setReferencia] = useState(() => inicioDelDia(new Date()));
  const [turnos, setTurnos] = useState<TurnoConPaciente[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dias = useMemo(() => {
    if (vista === "dia") return [referencia];
    const lunes = inicioDeSemana(referencia);
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  }, [vista, referencia]);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const desde = aIsoLocal(dias[0]);
      const hasta = aIsoLocal(sumarDias(dias[dias.length - 1], 1));
      const [t, p] = await Promise.all([listarTurnos(db, desde, hasta), listarPacientes(db)]);
      setTurnos(t);
      setPacientes(p);
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar agenda"));
    }
  }, [dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // La grilla va de HORA_INICIO a HORA_FIN, pero se agranda si hay turnos fuera de ese horario.
  const [horaDesde, horaHasta] = useMemo(() => {
    let desde = HORA_INICIO;
    let hasta = HORA_FIN;
    for (const t of turnos) {
      const ini = minutosDelDia(t.inicio);
      desde = Math.min(desde, Math.floor(ini / 60));
      hasta = Math.max(hasta, Math.min(24, Math.ceil((ini + t.duracion_min) / 60)));
    }
    return [desde, hasta];
  }, [turnos]);
  const horas = Array.from({ length: horaHasta - horaDesde }, (_, i) => horaDesde + i);

  function mover(sentido: number) {
    setReferencia((r) => sumarDias(r, sentido * (vista === "semana" ? 7 : 1)));
  }

  function clicEnDia(dia: Date, e: React.MouseEvent<HTMLDivElement>) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minutos = horaDesde * 60 + Math.floor((y / ALTO_HORA) * 2) * 30;
    const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, minutos);
    setEdicion({ turno: null, inicioSugerido: aIsoLocal(inicio) });
  }

  async function guardar(r: ResultadoModal) {
    const db = await obtenerDb();
    let pacienteId = r.paciente_id;
    if (r.nuevoPaciente) pacienteId = await crearPaciente(db, r.nuevoPaciente);
    const datos = {
      paciente_id: pacienteId!,
      inicio: r.inicio,
      duracion_min: r.duracion_min,
      estado: r.estado,
      notas: r.notas,
      pagado: r.pagado,
    };
    if (edicion?.turno) await actualizarTurno(db, edicion.turno.id, datos);
    else await crearTurno(db, datos);
    setEdicion(null);
    await cargar();
  }

  async function eliminar(id: number) {
    await eliminarTurno(await obtenerDb(), id);
    setEdicion(null);
    await cargar();
  }

  const hoy = new Date();
  const titulo = vista === "semana" ? textoSemana(dias[0]) : textoDiaLargo(referencia);

  return (
    <div className="agenda">
      <div className="barra">
        <button onClick={() => setReferencia(inicioDelDia(new Date()))}>Hoy</button>
        <button aria-label="Anterior" onClick={() => mover(-1)}>‹</button>
        <button aria-label="Siguiente" onClick={() => mover(1)}>›</button>
        <h2 className="titulo-agenda">{titulo}</h2>
        <div className="selector">
          <button className={vista === "dia" ? "activo" : ""} onClick={() => setVista("dia")}>Día</button>
          <button className={vista === "semana" ? "activo" : ""} onClick={() => setVista("semana")}>Semana</button>
        </div>
        <button
          className="primario"
          onClick={() => {
            const muestraHoy = dias.some((d) => mismoDia(d, hoy));
            const base = vista === "dia" ? referencia : muestraHoy ? hoy : dias[0];
            const hora = mismoDia(base, hoy)
              ? Math.max(HORA_INICIO, Math.min(hoy.getHours() + 1, HORA_FIN - 1))
              : HORA_INICIO;
            const inicio = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hora, 0);
            setEdicion({ turno: null, inicioSugerido: aIsoLocal(inicio) });
          }}
        >
          + Nuevo turno
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="grilla" style={{ gridTemplateColumns: `56px repeat(${dias.length}, 1fr)` }}>
        <div className="esquina" />
        {dias.map((d) => (
          <div key={d.toISOString()} className={mismoDia(d, hoy) ? "cabecera hoy" : "cabecera"}>
            {textoDia(d)}
          </div>
        ))}

        <div className="horas" style={{ height: horas.length * ALTO_HORA }}>
          {horas.map((h) => (
            <div key={h} className="hora" style={{ height: ALTO_HORA }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {dias.map((d) => {
          const fecha = aFechaIso(d);
          const delDia = turnos.filter((t) => t.inicio.startsWith(fecha));
          return (
            <div
              key={fecha}
              className="columna-dia"
              style={{ height: horas.length * ALTO_HORA, backgroundSize: `100% ${ALTO_HORA / 2}px` }}
              onClick={(e) => clicEnDia(d, e)}
            >
              {distribuirEnColumnas(delDia).map(({ turno, columna, columnas }) => {
                const top = ((minutosDelDia(turno.inicio) - horaDesde * 60) / 60) * ALTO_HORA;
                const alto = Math.max((turno.duracion_min / 60) * ALTO_HORA, 22);
                return (
                  <button
                    key={turno.id}
                    className={`turno estado-${turno.estado}`}
                    style={{
                      top,
                      height: alto,
                      left: `calc(${(columna / columnas) * 100}% + 2px)`,
                      width: `calc(${100 / columnas}% - 4px)`,
                    }}
                    title={`${horaTexto(turno.inicio)} · ${turno.paciente_nombre}${turno.notas ? `\n${turno.notas}` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdicion({ turno, inicioSugerido: turno.inicio });
                    }}
                  >
                    <span className="turno-hora">{horaTexto(turno.inicio)}</span>{" "}
                    <span className="turno-nombre">{turno.paciente_nombre}</span>
                    {turno.pagado ? <span className="turno-pagado" title="Pagado">$</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {edicion && (
        <TurnoModal
          turno={edicion.turno}
          inicioSugerido={edicion.inicioSugerido}
          pacientes={pacientes}
          turnosDeFecha={turnosDeFecha}
          duracionPredeterminada={DURACION_PREDETERMINADA}
          onGuardar={guardar}
          onEliminar={eliminar}
          onCerrar={() => setEdicion(null)}
        />
      )}
    </div>
  );
}
