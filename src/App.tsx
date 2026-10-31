import { useEffect, useState } from "react";
import { obtenerDb } from "./db";
import "./App.css";

type Seccion = "agenda" | "pacientes" | "finanzas";

const SECCIONES: { id: Seccion; titulo: string; descripcion: string }[] = [
  { id: "agenda", titulo: "Agenda", descripcion: "Turnos del día y de la semana." },
  { id: "pacientes", titulo: "Pacientes", descripcion: "Datos de contacto y monto por sesión." },
  { id: "finanzas", titulo: "Finanzas", descripcion: "Objetivo mensual, gastos y sesiones necesarias." },
];

type EstadoDb =
  | { tipo: "cargando" }
  | { tipo: "ok"; pacientes: number; turnos: number }
  | { tipo: "error"; mensaje: string };

function App() {
  const [seccion, setSeccion] = useState<Seccion>("agenda");
  const [estadoDb, setEstadoDb] = useState<EstadoDb>({ tipo: "cargando" });

  useEffect(() => {
    (async () => {
      try {
        const db = await obtenerDb();
        const [p] = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM pacientes");
        const [t] = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM turnos");
        setEstadoDb({ tipo: "ok", pacientes: p.n, turnos: t.n });
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
          {estadoDb.tipo === "ok" &&
            `Base de datos lista · ${estadoDb.pacientes} pacientes · ${estadoDb.turnos} turnos`}
          {estadoDb.tipo === "error" && `Error en la base de datos: ${estadoDb.mensaje}`}
        </div>
      </nav>
      <main className="contenido">
        <h2>{actual.titulo}</h2>
        <p className="descripcion">{actual.descripcion}</p>
        <p className="pendiente">Esta sección se construye en los próximos pasos.</p>
      </main>
    </div>
  );
}

export default App;
