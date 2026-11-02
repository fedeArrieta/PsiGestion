import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, NotebookPen, Search } from "lucide-react";
import { obtenerDb } from "../db";
import { listarNotas, listarPacientesConResumen } from "../repositorio";
import type { NotaClinica, Paciente } from "../tipos";
import { desdeIsoLocal } from "../fechas";
import { textoError } from "../errores";
import { alCambiarDatos } from "../papelera/deshacer";
import { filtrarNotas, fragmento, plantilla } from "./logica";
import NotaModal from "./NotaModal";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fechaNota = (f: string) => fmtFecha.format(desdeIsoLocal(`${f}T00:00`));

type Abierta = { id: number | null } | null;

export default function NotasClinicas() {
  const [notas, setNotas] = useState<NotaClinica[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [pacienteId, setPacienteId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<Abierta>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const [n, p] = await Promise.all([listarNotas(db), listarPacientesConResumen(db, true)]);
      setNotas(n);
      setPacientes(p);
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar notas clínicas"));
    } finally {
      setCargado(true);
    }
  }, []);

  useEffect(() => {
    cargar();
    return alCambiarDatos(cargar);
  }, [cargar]);

  const visibles = useMemo(
    () => filtrarNotas(pacienteId ? notas.filter((n) => n.paciente_id === pacienteId) : notas, busqueda),
    [notas, pacienteId, busqueda],
  );

  // En el filtro, solo los pacientes que tienen notas o están activos.
  const conNotas = useMemo(() => new Set(notas.map((n) => n.paciente_id)), [notas]);
  const opciones = pacientes.filter((p) => p.activo || conNotas.has(p.id));

  return (
    <div className="pacientes notas-clinicas">
      <div className="barra">
        <h2 className="titulo-agenda">Notas clínicas</h2>
        <label className="campo-buscar">
          <Search size={17} className="icono" />
          <input
            className="buscador"
            type="search"
            placeholder="Buscar en las notas…"
            aria-label="Buscar en el texto de las notas"
            title="Buscá palabras en las notas, sin importar mayúsculas ni tildes"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <select
          aria-label="Paciente"
          value={pacienteId ?? ""}
          onChange={(e) => setPacienteId(Number(e.target.value) || null)}
        >
          <option value="">Todos los pacientes</option>
          {opciones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button className="primario" onClick={() => setAbierta({ id: null })}>
          <NotebookPen size={18} className="icono" /> Nueva nota
        </button>
      </div>

      <p className="nota nota-privacidad">
        <Lock size={13} /> Las notas se guardan cifradas con tu contraseña, entran en las copias de seguridad y no se
        incluyen en la exportación a Excel.
      </p>

      {error && <p className="error">{error}</p>}

      {cargado && notas.length === 0 ? (
        <p className="vacio-panel">
          Todavía no hay notas. Creá la primera con "Nueva nota", o desde un turno de la agenda con "Nota de la sesión".
        </p>
      ) : (
        <ul className="lista-notas">
          {visibles.map((n) => {
            const f = fragmento(n, busqueda);
            return (
              <li key={n.id}>
                <button className="nota-item" onClick={() => setAbierta({ id: n.id })}>
                  <span className="nota-item-cabecera">
                    <strong>{n.paciente_nombre}</strong>
                    <span className="nota-item-fecha">
                      {fechaNota(n.fecha)}
                      {n.turno_inicio && ` · sesión de las ${n.turno_inicio.slice(11, 16)}`}
                    </span>
                    <span className="crece" />
                    <span className="chip">{plantilla(n.plantilla).nombre}</span>
                  </span>
                  {f && (
                    <span className="nota-item-texto">
                      <span className="nota-item-seccion">{f.titulo}: </span>
                      {f.partes.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {cargado && visibles.length === 0 && (
            <li className="vacio">
              {busqueda.trim() ? `Ninguna nota coincide con "${busqueda.trim()}".` : "Este paciente todavía no tiene notas."}
            </li>
          )}
        </ul>
      )}

      {abierta && (
        <NotaModal
          notaId={abierta.id}
          inicial={abierta.id == null && pacienteId ? { paciente_id: pacienteId } : undefined}
          onGuardado={cargar}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
