import { useCallback, useEffect, useState } from "react";
import { obtenerDb } from "./db";
import { verificarIntegridad } from "./repositorio";
import Copias from "./copias/Copias";
import { copiaAtrasada, diasSinCopia } from "./copias/logica";
import { copiaAutomaticaSiCorresponde, leerConfigCopias, resultadoRestauracion } from "./copias/servicio";
import Agenda from "./agenda/Agenda";
import Pacientes from "./pacientes/Pacientes";
import Finanzas from "./finanzas/Finanzas";
import "./App.css";

type Seccion = "agenda" | "pacientes" | "finanzas" | "copias";

const SECCIONES: { id: Seccion; titulo: string }[] = [
  { id: "agenda", titulo: "Agenda" },
  { id: "pacientes", titulo: "Pacientes" },
  { id: "finanzas", titulo: "Finanzas" },
  { id: "copias", titulo: "Copias de seguridad" },
];

/** Cada cuánto se revisa, con la app abierta, si toca la copia automática. */
const REVISAR_COPIA_MS = 60 * 60 * 1000;

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

function App() {
  const [seccion, setSeccion] = useState<Seccion>("agenda");
  const [estadoDb, setEstadoDb] = useState<EstadoDb>({ tipo: "cargando" });
  const [avisoIntegridad, setAvisoIntegridad] = useState<Aviso | null>(null);
  const [avisoRestauracion, setAvisoRestauracion] = useState<Aviso | null>(null);
  const [avisoCopias, setAvisoCopias] = useState<Aviso | null>(null);

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
      setAvisoCopias({ tipo: "aviso", texto: `Error en las copias de seguridad: ${String(e)}`, ir: "copias" });
    }
  }, []);

  useEffect(() => {
    let intervalo: number | undefined;
    (async () => {
      try {
        const db = await obtenerDb();
        await db.select("SELECT 1");
        setEstadoDb({ tipo: "ok" });
      } catch (e) {
        setEstadoDb({ tipo: "error", mensaje: String(e) });
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
        setAvisoIntegridad({ tipo: "error", texto: `No se pudo revisar la base de datos: ${String(e)}` });
      }
      await revisarCopias();
      intervalo = window.setInterval(revisarCopias, REVISAR_COPIA_MS);
    })();
    return () => window.clearInterval(intervalo);
  }, [revisarCopias]);

  const avisos = [avisoIntegridad, avisoRestauracion, avisoCopias].filter((a): a is Aviso => a !== null);

  return (
    <div className="app">
      <nav className="menu">
        <h1 className="marca">PsiGestion</h1>
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            className={s.id === seccion ? "item activo" : "item"}
            onClick={() => setSeccion(s.id)}
          >
            {s.titulo}
          </button>
        ))}
        {avisos.map((a) => (
          <button
            key={a.texto}
            className={`aviso-menu ${a.tipo}`}
            onClick={() => (a.ir ? setSeccion(a.ir) : a === avisoRestauracion && setAvisoRestauracion(null))}
          >
            {a.texto}
          </button>
        ))}
        <div className="estado-db">
          {estadoDb.tipo === "cargando" && "Conectando base de datos…"}
          {estadoDb.tipo === "ok" && "Base de datos lista"}
          {estadoDb.tipo === "error" && `Error en la base de datos: ${estadoDb.mensaje}`}
        </div>
      </nav>
      <main className="contenido">
        {seccion === "agenda" && <Agenda />}
        {seccion === "pacientes" && <Pacientes />}
        {seccion === "finanzas" && <Finanzas />}
        {seccion === "copias" && <Copias onCambio={revisarCopias} />}
      </main>
    </div>
  );
}

export default App;
