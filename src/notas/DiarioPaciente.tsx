import { useCallback, useEffect, useMemo, useState } from "react";
import { NotebookPen, Search } from "lucide-react";
import { obtenerDb } from "../db";
import { listarNotas } from "../repositorio";
import type { NotaClinica } from "../tipos";
import { desdeIsoLocal } from "../fechas";
import { textoError } from "../errores";
import { alCambiarDatos } from "../papelera/deshacer";
import { filtrarNotas, plantilla, resaltar } from "./logica";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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

/** Diario clínico del paciente: todas sus notas, de la más nueva a la más vieja, con el texto completo. */
export default function DiarioPaciente({ pacienteId, version, onAbrir, onCantidad }: Props) {
  const [notas, setNotas] = useState<NotaClinica[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const n = await listarNotas(await obtenerDb(), { pacienteId });
      setNotas(n);
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
      {cargado && notas.length === 0 ? (
        <p className="vacio">
          El diario está vacío. Escribí la primera nota con "Nueva nota" o desde el ícono de una sesión.
        </p>
      ) : (
        <ol className="diario-entradas">
          {visibles.map((n) => (
            <li key={n.id}>
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
          ))}
          {cargado && notas.length > 0 && visibles.length === 0 && (
            <li className="vacio">Ninguna nota coincide con "{busqueda.trim()}".</li>
          )}
        </ol>
      )}
    </div>
  );
}
