import { useEffect, useState } from "react";
import { obtenerDb } from "./db";
import Agenda from "./agenda/Agenda";
import Pacientes from "./pacientes/Pacientes";
import "./App.css";

type Seccion = "agenda" | "pacientes" | "finanzas";

const SECCIONES: { id: Seccion; titulo: string; descripcion: string }[] = [
  { id: "agenda", titulo: "Agenda", descripcion: "Turnos del día y de la semana." },
  { id: "pacientes", titulo: "Pacientes", descripcion: "Datos de contacto y monto por sesión." },
  { id: "finanzas", titulo: "Finanzas", descripcion: "Objetivo mensual, gastos y sesiones necesarias." },
];

type EstadoDb =
  | { tipo: "cargando" }
  | { tipo: "ok" }
  | { tipo: "error"; mensaje: string };

function App() {
  const [seccion, setSeccion] = useState<Seccion>("agenda");
  const [estadoDb, setEstadoDb] = useState<EstadoDb>({ tipo: "cargando" });

  useEffect(() => {
    (async () => {
      try {
        const db = await obtenerDb();
        await db.select("SELECT 1");
        setEstadoDb({ tipo: "ok" });
      } catch (e) {
        setEstadoDb({ tipo: "error", mensaje: String(e) });
      }
    })();
  }, []);

  const actual = SECCIONES.find((s) => s.id === seccion)!;

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
        <div className="estado-db">
          {estadoDb.tipo === "cargando" && "Conectando base de datos…"}
          {estadoDb.tipo === "ok" && "Base de datos lista"}
          {estadoDb.tipo === "error" && `Error en la base de datos: ${estadoDb.mensaje}`}
        </div>
      </nav>
      <main className="contenido">
        {seccion === "agenda" ? (
          <Agenda />
        ) : seccion === "pacientes" ? (
          <Pacientes />
        ) : (
          <>
            <h2>{actual.titulo}</h2>
            <p className="descripcion">{actual.descripcion}</p>
            <p className="pendiente">Esta sección se construye en los próximos pasos.</p>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
