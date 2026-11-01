import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChartColumn,
  DatabaseBackup,
  House,
  Info,
  Lock,
  Moon,
  ShieldCheck,
  Sparkles,
  SunMedium,
  SunMoon,
  Trash2,
  Users,
  type LucideProps,
} from "lucide-react";
import { obtenerDb } from "./db";
import { guardarConfiguracion, leerConfiguracion, vaciarPapeleraVencida, verificarIntegridad } from "./repositorio";
import { aIsoLocal } from "./fechas";
import Copias from "./copias/Copias";
import { copiaAtrasada, diasSinCopia } from "./copias/logica";
import { copiaAutomaticaSiCorresponde, leerConfigCopias, resultadoRestauracion } from "./copias/servicio";
import Agenda from "./agenda/Agenda";
import Inicio, { type DestinoInicio } from "./inicio/Inicio";
import { iniciales } from "./inicio/logica";
import { Logo } from "./marca/Logo";
import { guardarTema, leerTema, NOMBRE_TEMA, SIGUIENTE_TEMA, type Tema } from "./marca/tema";
import Pacientes from "./pacientes/Pacientes";
import Finanzas from "./finanzas/Finanzas";
import Acceso from "./seguridad/Acceso";
import Papelera, { BarraDeshacer } from "./papelera/Papelera";
import Seguridad, { leerMinutosBloqueo } from "./seguridad/Seguridad";
import { bloquear, debeBloquear, estadoAcceso, MINUTOS_BLOQUEO_POR_DEFECTO, type EstadoAcceso } from "./seguridad/servicio";
import VersionYNovedades, { AvisoActualizacion } from "./actualizacion/Actualizacion";
import { buscarActualizacion, leerVersionVista, marcarNovedadesVistas, versionInstalada } from "./actualizacion/servicio";
import { hayNovedadesSinVer } from "./actualizacion/logica";
import type { Update } from "@tauri-apps/plugin-updater";
import "./App.css";
import { textoError } from "./errores";

type Seccion = "inicio" | "agenda" | "pacientes" | "finanzas" | "copias" | "papelera" | "seguridad" | "version";

type Icono = ComponentType<LucideProps>;

const SECCIONES: { id: Seccion; titulo: string; icono: Icono }[] = [
  { id: "inicio", titulo: "Inicio", icono: House },
  { id: "agenda", titulo: "Agenda", icono: CalendarDays },
  { id: "pacientes", titulo: "Pacientes", icono: Users },
  { id: "finanzas", titulo: "Finanzas", icono: ChartColumn },
];

const SECCIONES_CONFIGURACION: { id: Seccion; titulo: string; icono: Icono }[] = [
  { id: "copias", titulo: "Copias de seguridad", icono: DatabaseBackup },
  { id: "papelera", titulo: "Papelera e historial", icono: Trash2 },
  { id: "seguridad", titulo: "Seguridad", icono: ShieldCheck },
];

const ICONO_TEMA: Record<Tema, Icono> = { auto: SunMoon, claro: SunMedium, oscuro: Moon };
const ICONO_AVISO: Record<"error" | "aviso" | "nota", Icono> = { error: AlertTriangle, aviso: AlertTriangle, nota: Sparkles };

/** Nombre con el que la app saluda (ej.: "Dra. Martínez"). */
const CLAVE_NOMBRE = "nombre_profesional";

/** Cada cuánto se revisa si pasó el tiempo de inactividad. */
const REVISAR_INACTIVIDAD_MS = 15 * 1000;

/** Cada cuánto se revisa, con la app abierta, si toca la copia automática. */
const REVISAR_COPIA_MS = 60 * 60 * 1000;

/** Cada cuánto se busca una actualización con la app abierta. */
const REVISAR_ACTUALIZACION_MS = 24 * 60 * 60 * 1000;

interface Aviso {
  tipo: "error" | "aviso" | "nota";
  texto: string;
  /** Si se indica, el aviso lleva a esa sección. */
  ir?: Seccion;
}

type EstadoDb =
  | { tipo: "cargando" }
  | { tipo: "ok" }
  | { tipo: "error"; mensaje: string };

/** Controla el acceso: mientras la app está bloqueada no se muestra (ni se carga) ningún dato. */
function App() {
  const [estado, setEstado] = useState<EstadoAcceso | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actualizar = useCallback(() => {
    estadoAcceso()
      .then(setEstado)
      .catch((e) => setError(textoError(e, "estado de acceso")));
  }, []);

  useEffect(actualizar, [actualizar]);

  const alBloquear = useCallback(async () => {
    await bloquear().catch(() => {});
    setEstado("bloqueada");
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!estado) return null;
  if (estado !== "desbloqueada") return <Acceso estado={estado} onListo={actualizar} />;
  return <Principal onBloquear={alBloquear} />;
}

/** Bloquea la app después de un rato sin usarla. */
function useBloqueoPorInactividad(minutos: number, onBloquear: () => void) {
  const ultimaActividad = useRef(Date.now());
  useEffect(() => {
    const registrar = () => {
      ultimaActividad.current = Date.now();
    };
    const eventos = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;
    eventos.forEach((e) => window.addEventListener(e, registrar, { passive: true }));
    const intervalo = window.setInterval(() => {
      if (debeBloquear(ultimaActividad.current, Date.now(), minutos)) onBloquear();
    }, REVISAR_INACTIVIDAD_MS);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, registrar));
      window.clearInterval(intervalo);
    };
  }, [minutos, onBloquear]);
}

function Principal({ onBloquear }: { onBloquear: () => void }) {
  const [seccion, setSeccionEstado] = useState<Seccion>("inicio");
  const [abrirNuevoTurno, setAbrirNuevoTurno] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tema, setTema] = useState<Tema>(leerTema);

  const setSeccion = useCallback((s: Seccion) => {
    setAbrirNuevoTurno(false);
    setSeccionEstado(s);
  }, []);

  const irDesdeInicio = useCallback((destino: DestinoInicio) => {
    setSeccionEstado(destino === "nuevo-turno" ? "agenda" : destino);
    setAbrirNuevoTurno(destino === "nuevo-turno");
  }, []);

  const cambiarNombre = useCallback(async (n: string) => {
    await guardarConfiguracion(await obtenerDb(), CLAVE_NOMBRE, n || null);
    setNombre(n);
  }, []);

  function cambiarTema() {
    const t = SIGUIENTE_TEMA[tema];
    guardarTema(t);
    setTema(t);
  }
  const [minutosBloqueo, setMinutosBloqueo] = useState(MINUTOS_BLOQUEO_POR_DEFECTO);
  useBloqueoPorInactividad(minutosBloqueo, onBloquear);

  useEffect(() => {
    leerMinutosBloqueo()
      .then(setMinutosBloqueo)
      .catch(() => {});
  }, []);

  const [estadoDb, setEstadoDb] = useState<EstadoDb>({ tipo: "cargando" });
  const [avisoIntegridad, setAvisoIntegridad] = useState<Aviso | null>(null);
  const [avisoRestauracion, setAvisoRestauracion] = useState<Aviso | null>(null);
  const [avisoCopias, setAvisoCopias] = useState<Aviso | null>(null);
  const [avisoNovedades, setAvisoNovedades] = useState<Aviso | null>(null);
  const [actualizacion, setActualizacion] = useState<Update | null>(null);
  const [version, setVersion] = useState("");

  // Versión instalada, "Novedades" una vez después de actualizar y búsqueda de actualizaciones.
  useEffect(() => {
    let intervalo: number | undefined;
    (async () => {
      try {
        const v = await versionInstalada();
        setVersion(v);
        if (hayNovedadesSinVer(await leerVersionVista(), v)) {
          setAvisoNovedades({ tipo: "nota", texto: `Novedades de la versión ${v}`, ir: "version" });
        }
      } catch {
        // Si falla, solo no se muestran la versión ni las novedades.
      }
      const buscar = () =>
        buscarActualizacion(false)
          .then((u) => u && setActualizacion(u))
          .catch(() => {});
      await buscar();
      intervalo = window.setInterval(buscar, REVISAR_ACTUALIZACION_MS);
    })();
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (seccion === "version" && version && avisoNovedades) {
      marcarNovedadesVistas(version).catch(() => {});
      setAvisoNovedades(null);
    }
  }, [seccion, version, avisoNovedades]);

  const revisarCopias = useCallback(async () => {
    try {
      await copiaAutomaticaSiCorresponde();
      const c = await leerConfigCopias();
      const dias = diasSinCopia(c.ultima, new Date());
      if (c.error) {
        setAvisoCopias({ tipo: "aviso", texto: "No se pudo hacer la copia de seguridad automática.", ir: "copias" });
      } else if (copiaAtrasada(c.ultima, new Date())) {
        setAvisoCopias({
          tipo: "aviso",
          texto: dias === null ? "Todavía no hay copias de seguridad." : `Hace ${dias} días que no hay copia de seguridad.`,
          ir: "copias",
        });
      } else {
        setAvisoCopias(null);
      }
    } catch (e) {
      setAvisoCopias({ tipo: "aviso", texto: `Error en las copias de seguridad: ${textoError(e, "copia automática")}`, ir: "copias" });
    }
  }, []);

  useEffect(() => {
    let intervalo: number | undefined;
    (async () => {
      try {
        const db = await obtenerDb();
        await db.select("SELECT 1");
        setEstadoDb({ tipo: "ok" });
        leerConfiguracion(db)
          .then((c) => setNombre(c[CLAVE_NOMBRE] ?? ""))
          .catch(() => {});
      } catch (e) {
        setEstadoDb({ tipo: "error", mensaje: textoError(e, "abrir base") });
        return;
      }
      try {
        const restauracion = await resultadoRestauracion();
        if (restauracion) {
          setAvisoRestauracion(
            restauracion.ok
              ? { tipo: "nota", texto: "Se restauró la copia de seguridad elegida." }
              : { tipo: "error", texto: `No se pudo restaurar la copia: ${restauracion.detalle}`, ir: "copias" },
          );
        }
        const problemas = await verificarIntegridad(await obtenerDb());
        if (problemas.length) {
          setAvisoIntegridad({
            tipo: "error",
            texto: "La base de datos parece dañada. Conviene restaurar la última copia de seguridad.",
            ir: "copias",
          });
          // No copiar una base dañada encima de las copias buenas.
          return;
        }
      } catch (e) {
        setAvisoIntegridad({ tipo: "error", texto: `No se pudo revisar la base de datos: ${textoError(e, "chequeo de integridad")}` });
      }
      await vaciarPapeleraVencida(await obtenerDb(), aIsoLocal(new Date())).catch(() => {});
      await revisarCopias();
      intervalo = window.setInterval(revisarCopias, REVISAR_COPIA_MS);
    })();
    return () => window.clearInterval(intervalo);
  }, [revisarCopias]);

  const avisos = [avisoIntegridad, avisoRestauracion, avisoCopias, avisoNovedades].filter((a): a is Aviso => a !== null);

  return (
    <div className="app">
      <nav className="menu">
        <Logo tamano={40} />
        {SECCIONES.map((s) => (
          <ItemMenu key={s.id} {...s} activo={s.id === seccion} onClick={() => setSeccion(s.id)} />
        ))}
        <div className="menu-grupo">Configuración</div>
        {SECCIONES_CONFIGURACION.map((s) => (
          <ItemMenu key={s.id} {...s} activo={s.id === seccion} onClick={() => setSeccion(s.id)} />
        ))}
        <div className="menu-pie">
          {avisos.map((a) => {
            const IconoAviso = ICONO_AVISO[a.tipo];
            return (
              <button
                key={a.texto}
                className={`aviso-menu ${a.tipo}`}
                onClick={() => (a.ir ? setSeccion(a.ir) : a === avisoRestauracion && setAvisoRestauracion(null))}
              >
                <IconoAviso size={16} className="icono" />
                {a.texto}
              </button>
            );
          })}
          <ItemMenu
            titulo={NOMBRE_TEMA[tema]}
            icono={ICONO_TEMA[tema]}
            chico
            onClick={cambiarTema}
          />
          <ItemMenu
            titulo={version ? `Versión ${version}` : "Versión y novedades"}
            icono={Info}
            chico
            activo={seccion === "version"}
            onClick={() => setSeccion("version")}
          />
          <ItemMenu titulo="Bloquear" icono={Lock} chico onClick={onBloquear} />
          <div className="menu-perfil">
            <span className="avatar">{nombre ? iniciales(nombre.replace(/^(dr|dra|lic|psic)\.?\s+/i, "")) : "Ψ"}</span>
            <div className="menu-perfil-texto">
              <span>{nombre || "Mi consultorio"}</span>
              <span className={estadoDb.tipo === "error" ? "estado-db error" : "estado-db"}>
                {estadoDb.tipo === "cargando" && "Conectando base de datos…"}
                {estadoDb.tipo === "ok" && "Base de datos lista"}
                {estadoDb.tipo === "error" && `Error en la base de datos: ${estadoDb.mensaje}`}
              </span>
            </div>
          </div>
        </div>
      </nav>
      <main className="contenido">
        {actualizacion && <AvisoActualizacion update={actualizacion} onCerrar={() => setActualizacion(null)} />}
        {seccion === "inicio" && <Inicio nombre={nombre} onNombre={cambiarNombre} onIr={irDesdeInicio} />}
        {seccion === "agenda" && <Agenda abrirNuevo={abrirNuevoTurno} />}
        {seccion === "pacientes" && <Pacientes />}
        {seccion === "finanzas" && <Finanzas />}
        {seccion === "copias" && <Copias onCambio={revisarCopias} />}
        {seccion === "papelera" && <Papelera />}
        {seccion === "seguridad" && <Seguridad onMinutos={setMinutosBloqueo} />}
        {seccion === "version" && <VersionYNovedades version={version} onActualizacion={setActualizacion} />}
        <BarraDeshacer />
      </main>
    </div>
  );
}

function ItemMenu({
  titulo,
  icono: IconoItem,
  activo = false,
  chico = false,
  onClick,
}: {
  titulo: string;
  icono: Icono;
  activo?: boolean;
  chico?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`item${activo ? " activo" : ""}${chico ? " chico" : ""}`} onClick={onClick} aria-current={activo ? "page" : undefined}>
      <IconoItem size={chico ? 17 : 19} className="icono" />
      {titulo}
    </button>
  );
}

export default App;
