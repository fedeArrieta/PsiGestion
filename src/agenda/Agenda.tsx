import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { obtenerDb } from "../db";
import {
  actualizarTurno,
  crearPaciente,
  crearSerie,
  crearTurno,
  eliminarTurno,
  extenderSeries,
  listarNoLaborables,
  listarPacientes,
  listarTurnos,
  modificarSerieDesde,
  obtenerSerie,
  previsualizarSerie,
  terminarSerie,
  type DatosSerie,
} from "../repositorio";
import type { NoLaborable, Paciente, TurnoConPaciente } from "../tipos";
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
import NoLaborablesModal from "./NoLaborablesModal";
import { periodoDe } from "./series";
import { textoError } from "../errores";
import { alCambiarDatos, ofrecerDeshacer } from "../papelera/deshacer";

type Vista = "semana" | "dia";
type Edicion = { turno: TurnoConPaciente | null; inicioSugerido: string };

const turnosDeFecha = async (fecha: string) => {
  const dia = desdeIsoLocal(`${fecha}T00:00`);
  return listarTurnos(await obtenerDb(), aIsoLocal(dia), aIsoLocal(sumarDias(dia, 1)));
};

const hoyIso = () => aFechaIso(new Date());
const cargarSerie = async (id: number) => obtenerSerie(await obtenerDb(), id);
const previsualizar = async (datos: DatosSerie, excluirSerie?: number) =>
  previsualizarSerie(await obtenerDb(), datos, hoyIso(), excluirSerie);

/** abrirNuevo: abre la ventana de turno nuevo al entrar (desde "Nuevo turno" en Inicio). */
export default function Agenda({ abrirNuevo = false }: { abrirNuevo?: boolean }) {
  const [vista, setVista] = useState<Vista>("semana");
  const [referencia, setReferencia] = useState(() => inicioDelDia(new Date()));
  const [turnos, setTurnos] = useState<TurnoConPaciente[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [noLaborables, setNoLaborables] = useState<NoLaborable[]>([]);
  const [verNoLaborables, setVerNoLaborables] = useState(false);

  const dias = useMemo(() => {
    if (vista === "dia") return [referencia];
    const lunes = inicioDeSemana(referencia);
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  }, [vista, referencia]);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const ultimo = aFechaIso(dias[dias.length - 1]);
      // Los turnos recurrentes se generan hasta unos meses adelante: si se mira más lejos, se completan.
      await extenderSeries(db, hoyIso(), ultimo);
      const desde = aIsoLocal(dias[0]);
      const hasta = aIsoLocal(sumarDias(dias[dias.length - 1], 1));
      const [t, p, nl] = await Promise.all([
        listarTurnos(db, desde, hasta),
        listarPacientes(db),
        listarNoLaborables(db, aFechaIso(dias[0]), ultimo),
      ]);
      setTurnos(t);
      setPacientes(p);
      setNoLaborables(nl);
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar agenda"));
    }
  }, [dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => alCambiarDatos(cargar), [cargar]);

  useEffect(() => {
    if (!mensaje) return;
    const t = window.setTimeout(() => setMensaje(null), 10_000);
    return () => window.clearTimeout(t);
  }, [mensaje]);

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
    const serie = (): DatosSerie => ({
      paciente_id: pacienteId!,
      desde: r.inicio.slice(0, 10),
      hora: r.inicio.slice(11, 16),
      duracion_min: r.duracion_min,
      frecuencia_semanas: r.repeticion!.frecuencia_semanas,
      hasta: r.repeticion!.hasta,
      notas: r.notas,
    });
    const turno = edicion?.turno;
    let aviso: string | null = null;
    if (turno && r.alcance === "serie" && turno.serie_id && r.repeticion) {
      const n = await modificarSerieDesde(db, turno.serie_id, turno.inicio.slice(0, 10), serie(), hoyIso());
      aviso = `Se actualizó la serie: ${n === 1 ? "1 turno" : `${n} turnos`} desde el ${textoDiaLargo(desdeIsoLocal(r.inicio))}.`;
    } else if (turno) await actualizarTurno(db, turno.id, datos);
    else if (r.repeticion) {
      const n = await crearSerie(db, serie(), hoyIso());
      aviso = `Se agendaron ${n === 1 ? "1 turno" : `${n} turnos`} recurrentes.`;
    } else await crearTurno(db, datos);
    setEdicion(null);
    setMensaje(aviso);
    await cargar();
  }

  async function eliminar(id: number) {
    ofrecerDeshacer("Se eliminó el turno.", await eliminarTurno(await obtenerDb(), id));
    setEdicion(null);
    await cargar();
  }

  async function terminar(serieId: number, desdeFecha: string) {
    const n = await terminarSerie(await obtenerDb(), serieId, desdeFecha);
    setEdicion(null);
    setMensaje(
      `Se terminó la serie. ${n === 1 ? "Se quitó 1 turno" : `Se quitaron ${n} turnos`} (quedan en la papelera).`,
    );
    await cargar();
  }

  function nuevoTurno() {
    const hoy = new Date();
    const muestraHoy = dias.some((d) => mismoDia(d, hoy));
    const base = vista === "dia" ? referencia : muestraHoy ? hoy : dias[0];
    const hora = mismoDia(base, hoy) ? Math.max(HORA_INICIO, Math.min(hoy.getHours() + 1, HORA_FIN - 1)) : HORA_INICIO;
    const inicio = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hora, 0);
    setEdicion({ turno: null, inicioSugerido: aIsoLocal(inicio) });
  }

  const abrioNuevo = useRef(false);
  useEffect(() => {
    if (abrirNuevo && !abrioNuevo.current) {
      abrioNuevo.current = true;
      nuevoTurno();
    }
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNuevo]);

  const hoy = new Date();
  const titulo = vista === "semana" ? textoSemana(dias[0]) : textoDiaLargo(referencia);

  return (
    <div className="agenda">
      <div className="barra">
        <button onClick={() => setReferencia(inicioDelDia(new Date()))}>Hoy</button>
        <button className="icono-solo" aria-label="Anterior" onClick={() => mover(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button className="icono-solo" aria-label="Siguiente" onClick={() => mover(1)}>
          <ChevronRight size={18} />
        </button>
        <h2 className="titulo-agenda">{titulo}</h2>
        <div className="selector">
          <button className={vista === "dia" ? "activo" : ""} onClick={() => setVista("dia")}>Día</button>
          <button className={vista === "semana" ? "activo" : ""} onClick={() => setVista("semana")}>Semana</button>
        </div>
        <button onClick={() => setVerNoLaborables(true)} title="Días en los que no se agendan los turnos recurrentes">
          <CalendarOff size={18} className="icono" /> Feriados y vacaciones
        </button>
        <button className="primario" onClick={nuevoTurno}>
          <CalendarPlus size={18} className="icono" /> Nuevo turno
        </button>
      </div>

      <div className="leyenda-agenda">
        <span><span className="punto ok" /> Programado</span>
        <span><span className="punto pendiente" /> Realizado, falta cobrar</span>
        <span><span className="punto pago" /> Pagado</span>
        <span><span className="punto atencion" /> Ausente</span>
        <span><span className="punto" /> Cancelado</span>
        <span><Repeat size={12} /> Turno recurrente</span>
      </div>

      {error && <p className="error">{error}</p>}
      {mensaje && (
        <p className="nota-agenda" onClick={() => setMensaje(null)} title="Clic para ocultar">
          {mensaje}
        </p>
      )}

      <div className="grilla" style={{ gridTemplateColumns: `56px repeat(${dias.length}, 1fr)` }}>
        <div className="esquina" />
        {dias.map((d) => {
          const libre = periodoDe(aFechaIso(d), noLaborables);
          return (
            <div
              key={d.toISOString()}
              className={`cabecera${mismoDia(d, hoy) ? " hoy" : ""}${libre ? " no-laborable" : ""}`}
              title={libre?.descripcion}
            >
              {textoDia(d)}
              {libre && <span className="cabecera-libre">{libre.descripcion}</span>}
            </div>
          );
        })}

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
              className={periodoDe(fecha, noLaborables) ? "columna-dia no-laborable" : "columna-dia"}
              style={{ height: horas.length * ALTO_HORA, backgroundSize: `100% ${ALTO_HORA / 2}px` }}
              onClick={(e) => clicEnDia(d, e)}
            >
              {distribuirEnColumnas(delDia).map(({ turno, columna, columnas }) => {
                const top = ((minutosDelDia(turno.inicio) - horaDesde * 60) / 60) * ALTO_HORA;
                const alto = Math.max((turno.duracion_min / 60) * ALTO_HORA, 22);
                return (
                  <button
                    key={turno.id}
                    className={`turno estado-${turno.estado}${turno.pagado ? " pagado" : ""}`}
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
                    {turno.serie_id ? <Repeat size={11} className="turno-serie" aria-label="Recurrente" /> : null}
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
          cargarSerie={cargarSerie}
          previsualizar={previsualizar}
          onGuardar={guardar}
          onEliminar={eliminar}
          onTerminarSerie={terminar}
          onCerrar={() => setEdicion(null)}
        />
      )}

      {verNoLaborables && (
        <NoLaborablesModal
          onCambio={cargar}
          onCerrar={() => setVerNoLaborables(false)}
        />
      )}
    </div>
  );
}
