import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX2, NotebookPen, Search } from "lucide-react";
import { obtenerDb } from "../db";
import { listarNotas, listarTurnosDePaciente } from "../repositorio";
import type { NotaClinica, Turno } from "../tipos";
import { etiquetaEstado } from "../ausencias/logica";
import { pesos } from "../formato";
import { desdeIsoLocal } from "../fechas";
import { textoError } from "../errores";
import { alCambiarDatos } from "../papelera/deshacer";
import { filtrarNotas, plantilla, resaltar } from "./logica";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface Props {
  pacienteId: number;
  /** Cambia cuando se guardó o eliminó una nota, para recargar. */
  version: number;
  /** null = nota nueva. */
  onAbrir: (notaId: number | null) => void;
  onCantidad?: (n: number) => void;
}

const Resaltado = ({ texto, busqueda }: { texto: string; busqueda: string }) => (
  <>{resaltar(texto, busqueda).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>
);

type Entrada =
  | { tipo: "nota"; fecha: string; orden: string; nota: NotaClinica }
  | { tipo: "ausencia"; fecha: string; orden: string; turno: Turno };

/**
 * Diario clínico del paciente: todas sus notas, de la más nueva a la más vieja, con el texto
 * completo. Las ausencias aparecen intercaladas como entradas breves (no al buscar).
 */
export default function DiarioPaciente({ pacienteId, version, onAbrir, onCantidad }: Props) {
  const [notas, setNotas] = useState<NotaClinica[]>([]);
  const [ausencias, setAusencias] = useState<Turno[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const [n, t] = await Promise.all([listarNotas(db, { pacienteId }), listarTurnosDePaciente(db, pacienteId)]);
      setNotas(n);
      setAusencias(t.filter((x) => x.estado === "ausente"));
      onCantidad?.(n.length);
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar diario clínico"));
    } finally {
      setCargado(true);
    }
  }, [pacienteId, onCantidad]);

  useEffect(() => {
    cargar();
    return alCambiarDatos(cargar);
  }, [cargar, version]);

  const visibles = useMemo(() => filtrarNotas(notas, busqueda), [notas, busqueda]);
  const entradas = useMemo<Entrada[]>(() => {
    const deNotas: Entrada[] = visibles.map((n) => ({
      tipo: "nota",
      fecha: n.fecha,
      orden: n.turno_inicio ?? "",
      nota: n,
    }));
    if (busqueda.trim()) return deNotas;
    const deAusencias: Entrada[] = ausencias.map((t) => ({
      tipo: "ausencia",
      fecha: t.inicio.slice(0, 10),
      orden: t.inicio,
      turno: t,
    }));
    // Mismo orden que listarNotas: fecha y hora, de lo más nuevo a lo más viejo.
    return [...deNotas, ...deAusencias].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.orden.localeCompare(a.orden),
    );
  }, [visibles, ausencias, busqueda]);

  return (
    <div className="diario">
      <div className="diario-barra">
        <label className="campo-buscar crece">
          <Search size={16} className="icono" />
          <input
            type="search"
            placeholder="Buscar en el diario…"
            aria-label="Buscar en las notas de este paciente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <button type="button" className="primario" onClick={() => onAbrir(null)}>
          <NotebookPen size={16} className="icono" /> Nueva nota
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {cargado && notas.length === 0 && ausencias.length === 0 ? (
        <p className="vacio">
          El diario está vacío. Escribí la primera nota con "Nueva nota" o desde el ícono de una sesión.
        </p>
      ) : (
        <ol className="diario-entradas">
          {entradas.map((e) =>
            e.tipo === "ausencia" ? (
              <li key={`a${e.turno.id}`} className="diario-ausencia">
                <CalendarX2 size={16} className="icono" />
                <strong>{mayuscula(fmtFecha.format(desdeIsoLocal(`${e.fecha}T00:00`)))}</strong>
                <span>
                  {etiquetaEstado(e.turno)} a la sesión de las {e.turno.inicio.slice(11, 16)}
                  {e.turno.cargo != null ? ` · se cobra ${pesos(e.turno.cargo)}` : " · sin cargo"}
                </span>
              </li>
            ) : (
              <EntradaNota key={e.nota.id} n={e.nota} busqueda={busqueda} onAbrir={onAbrir} />
            ),
          )}
          {cargado && notas.length === 0 && !busqueda.trim() && (
            <li className="vacio">
              Todavía no hay notas. Escribí la primera con "Nueva nota" o desde el ícono de una sesión.
            </li>
          )}
          {cargado && notas.length > 0 && visibles.length === 0 && (
            <li className="vacio">Ninguna nota coincide con "{busqueda.trim()}".</li>
          )}
        </ol>
      )}
    </div>
  );
}

function EntradaNota({ n, busqueda, onAbrir }: { n: NotaClinica; busqueda: string; onAbrir: (id: number) => void }) {
  return (
    <li>
      <button type="button" className="diario-entrada" onClick={() => onAbrir(n.id)} title="Abrir para editar">
        <span className="diario-cabecera">
          <strong className="diario-fecha">{fmtFecha.format(desdeIsoLocal(`${n.fecha}T00:00`))}</strong>
          {n.turno_inicio && <span className="nota">sesión de las {n.turno_inicio.slice(11, 16)}</span>}
          <span className="crece" />
          <span className="chip">{plantilla(n.plantilla).nombre}</span>
        </span>
        {n.secciones
          .filter((s) => s.texto.trim())
          .map((s, i) => (
            <span key={i} className="diario-seccion">
              <span className="diario-titulo">{s.titulo}</span>
              <span className="diario-texto">
                <Resaltado texto={s.texto} busqueda={busqueda} />
              </span>
            </span>
          ))}
      </button>
    </li>
  );
}
