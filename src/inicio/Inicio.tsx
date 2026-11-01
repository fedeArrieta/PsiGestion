import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Check,
  HandCoins,
  Pencil,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { obtenerDb } from "../db";
import { listarPacientesConResumen, listarTurnos, obtenerObjetivo, resumenMes } from "../repositorio";
import type { TurnoConPaciente } from "../tipos";
import { aIsoLocal, horaTexto, inicioDelDia, sumarDias, textoDiaLargo } from "../fechas";
import { pesos } from "../formato";
import { mesDe } from "../finanzas/calculo";
import { textoError } from "../errores";
import { alCambiarDatos } from "../papelera/deshacer";
import {
  iniciales,
  saludoDelMomento,
  sumaRealizada,
  textoCuando,
  tonoTurno,
  tramoMesAnterior,
  variacion,
} from "./logica";

/** Cuántos turnos mostrar en "Próximos turnos" y hasta cuántos días adelante buscarlos. */
const CANTIDAD_PROXIMOS = 6;
const DIAS_PROXIMOS = 14;

interface Datos {
  turnosHoy: number;
  realizadosHoy: number;
  pacientesActivos: number;
  porCobrar: number;
  pacientesConDeuda: number;
  ingresosMes: number;
  variacionIngresos: number | null;
  neto: number;
  objetivo: number | null;
  proximos: TurnoConPaciente[];
}

async function cargarDatos(ahora: Date): Promise<Datos> {
  const db = await obtenerDb();
  const hoy = inicioDelDia(ahora);
  const mes = mesDe(ahora);
  const tramo = tramoMesAnterior(ahora);
  const [deHoy, pacientes, resumen, objetivo, mesAnterior, siguientes] = await Promise.all([
    listarTurnos(db, aIsoLocal(hoy), aIsoLocal(sumarDias(hoy, 1))),
    listarPacientesConResumen(db),
    resumenMes(db, mes),
    obtenerObjetivo(db, mes),
    listarTurnos(db, `${tramo.desde}T00:00`, `${tramo.hasta}T00:00`),
    listarTurnos(db, aIsoLocal(ahora), aIsoLocal(sumarDias(hoy, DIAS_PROXIMOS))),
  ]);
  const activosHoy = deHoy.filter((t) => t.estado !== "cancelado");
  const conDeuda = pacientes.filter((p) => p.saldo_pendiente > 0);
  return {
    turnosHoy: activosHoy.length,
    realizadosHoy: activosHoy.filter((t) => t.estado === "realizado").length,
    pacientesActivos: pacientes.length,
    porCobrar: conDeuda.reduce((acc, p) => acc + p.saldo_pendiente, 0),
    pacientesConDeuda: conDeuda.length,
    ingresosMes: resumen.facturado,
    variacionIngresos: variacion(resumen.facturado, sumaRealizada(mesAnterior)),
    neto: resumen.facturado - resumen.gastos,
    objetivo,
    proximos: siguientes.filter((t) => t.estado === "programado").slice(0, CANTIDAD_PROXIMOS),
  };
}

export type DestinoInicio = "agenda" | "nuevo-turno" | "pacientes" | "finanzas";

export default function Inicio({
  nombre,
  onNombre,
  onIr,
}: {
  nombre: string;
  onNombre: (nombre: string) => Promise<void>;
  onIr: (destino: DestinoInicio) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora] = useState(() => new Date());

  const cargar = useCallback(async () => {
    try {
      setDatos(await cargarDatos(new Date()));
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar inicio"));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => alCambiarDatos(cargar), [cargar]);

  const subeOBaja = datos?.variacionIngresos ?? null;

  return (
    <div className="inicio">
      <Hojas />
      <div className="inicio-cabecera">
        <div>
          <Saludo nombre={nombre} onNombre={onNombre} />
          <p>
            {saludoDelMomento(ahora)} · {textoDiaLargo(ahora)}
          </p>
        </div>
        <div className="inicio-acciones">
          <button className="secundario" onClick={() => onIr("finanzas")}>
            <ChartColumn size={18} className="icono" /> Ver finanzas
          </button>
          <button className="primario" onClick={() => onIr("nuevo-turno")}>
            <CalendarPlus size={18} className="icono" /> Nuevo turno <ArrowRight size={16} className="icono" />
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="indicadores">
        <Indicador
          icono={<CalendarDays size={20} />}
          titulo="Hoy"
          valor={datos ? String(datos.turnosHoy) : "–"}
          detalle={
            datos
              ? datos.turnosHoy === 1
                ? "turno"
                : datos.realizadosHoy
                  ? `turnos · ${datos.realizadosHoy} realizados`
                  : "turnos"
              : ""
          }
          onClick={() => onIr("agenda")}
        />
        <Indicador
          icono={<Users size={20} />}
          titulo="Pacientes"
          valor={datos ? String(datos.pacientesActivos) : "–"}
          detalle="activos"
          onClick={() => onIr("pacientes")}
        />
        <Indicador
          icono={<ChartColumn size={20} />}
          titulo="Ingresos (mes)"
          valor={datos ? pesos(datos.ingresosMes) : "–"}
          detalle={
            subeOBaja === null ? (
              "sesiones realizadas"
            ) : (
              <>
                {subeOBaja >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {Math.abs(subeOBaja)}% vs. mes anterior
              </>
            )
          }
          claseDetalle={subeOBaja === null ? "" : subeOBaja >= 0 ? "sube" : "baja"}
          onClick={() => onIr("finanzas")}
        />
        <Indicador
          icono={<HandCoins size={20} />}
          titulo="Por cobrar"
          valor={datos ? pesos(datos.porCobrar) : "–"}
          detalle={
            datos
              ? datos.pacientesConDeuda
                ? `${datos.pacientesConDeuda} ${datos.pacientesConDeuda === 1 ? "paciente" : "pacientes"}`
                : "todo al día"
              : ""
          }
          calido
          onClick={() => onIr("pacientes")}
        />
      </div>

      <div className="inicio-columnas">
        <section className="panel">
          <div className="panel-cabecera">
            <h3>Próximos turnos</h3>
            <button className="enlace" onClick={() => onIr("agenda")}>
              Ver agenda <ArrowRight size={14} />
            </button>
          </div>
          {datos && datos.proximos.length === 0 ? (
            <p className="nota">No hay turnos en los próximos {DIAS_PROXIMOS} días.</p>
          ) : (
            <ul className="proximos">
              {datos?.proximos.map((t) => {
                const { tono, etiqueta } = tonoTurno(t);
                return (
                  <li key={t.id}>
                    <button className="proximo" onClick={() => onIr("agenda")}>
                      <span className="avatar">{iniciales(t.paciente_nombre)}</span>
                      <span className="proximo-texto">
                        <strong>{t.paciente_nombre}</strong>
                        <span>
                          {textoCuando(t.inicio, ahora)}
                          {t.notas ? ` · ${t.notas.split("\n")[0]}` : ""}
                        </span>
                      </span>
                      <span className="proximo-hora">{horaTexto(t.inicio)}</span>
                      <span className={`punto ${tono}`} title={etiqueta} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <h3>Objetivo del mes</h3>
            <button className="enlace" onClick={() => onIr("finanzas")}>
              Finanzas <ArrowRight size={14} />
            </button>
          </div>
          {datos && <ProgresoObjetivo neto={datos.neto} objetivo={datos.objetivo} />}
          <div className="leyenda-estados">
            <span className="chip ok">
              <span className="punto ok" /> Confirmado
            </span>
            <span className="chip pendiente">
              <span className="punto pendiente" /> Pendiente
            </span>
            <span className="chip pago">
              <span className="punto pago" /> Pagado
            </span>
            <span className="chip atencion">
              <span className="punto atencion" /> Atención
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Indicador({
  icono,
  titulo,
  valor,
  detalle,
  claseDetalle = "",
  calido = false,
  onClick,
}: {
  icono: ReactNode;
  titulo: string;
  valor: string;
  detalle: ReactNode;
  claseDetalle?: string;
  calido?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={calido ? "indicador calido" : "indicador"} onClick={onClick}>
      <span className="indicador-icono">{icono}</span>
      <span className="indicador-titulo">{titulo}</span>
      <span className="indicador-valor">{valor}</span>
      <span className={`indicador-detalle ${claseDetalle}`}>{detalle}</span>
    </button>
  );
}

function ProgresoObjetivo({ neto, objetivo }: { neto: number; objetivo: number | null }) {
  if (!objetivo) {
    return (
      <p className="nota">
        Todavía no definiste un objetivo para este mes. Podés cargarlo en Finanzas. Por ahora llevás{" "}
        <strong>{pesos(neto)}</strong> de ganancia neta.
      </p>
    );
  }
  const pct = Math.max(0, Math.min(100, (neto / objetivo) * 100));
  return (
    <div className="progreso-objetivo">
      <div className="cifras">
        <span>
          Ganancia neta <strong>{pesos(neto)}</strong>
        </span>
        <span>de {pesos(objetivo)}</span>
      </div>
      <div className="barra-simple" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="nota">
        {neto >= objetivo ? "¡Objetivo cumplido!" : `Faltan ${pesos(objetivo - neto)} (${Math.round(pct)}% logrado).`}
      </p>
    </div>
  );
}

function Saludo({ nombre, onNombre }: { nombre: string; onNombre: (nombre: string) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nombre);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await onNombre(texto.trim());
    setEditando(false);
  }

  if (editando) {
    return (
      <form className="saludo-form" onSubmit={guardar}>
        <input
          autoFocus
          placeholder="Cómo querés que te salude (ej.: Dra. Martínez)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          size={36}
        />
        <button type="submit" className="primario icono-solo" aria-label="Guardar">
          <Check size={18} />
        </button>
        <button type="button" className="icono-solo" aria-label="Cancelar" onClick={() => setEditando(false)}>
          <X size={18} />
        </button>
      </form>
    );
  }
  return (
    <h2 className="saludo-nombre">
      {nombre ? `Hola, ${nombre}` : "Hola"}
      <button
        title={nombre ? "Cambiar el nombre" : "Agregar tu nombre"}
        aria-label={nombre ? "Cambiar el nombre" : "Agregar tu nombre"}
        onClick={() => {
          setTexto(nombre);
          setEditando(true);
        }}
      >
        <Pencil size={16} />
      </button>
    </h2>
  );
}

/** Rama de hojas decorativa, como en el tablero de marca. */
function Hojas() {
  return (
    <svg className="inicio-hojas" viewBox="0 0 200 160" aria-hidden="true">
      <path d="M40 150 C80 110 120 70 190 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M75 118 C60 95 62 72 80 55 C92 78 92 100 75 118 Z" fill="currentColor" />
      <path d="M78 116 C100 112 122 120 135 140 C110 146 90 136 78 116 Z" fill="currentColor" />
      <path d="M118 78 C108 56 112 34 132 20 C142 44 138 64 118 78 Z" fill="currentColor" />
      <path d="M122 76 C144 70 166 76 180 94 C156 102 136 96 122 76 Z" fill="currentColor" />
      <path d="M160 40 C158 24 166 10 182 4 C186 22 178 34 160 40 Z" fill="currentColor" />
    </svg>
  );
}
