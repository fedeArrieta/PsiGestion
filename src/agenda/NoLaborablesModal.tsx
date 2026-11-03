import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { obtenerDb } from "../db";
import { aFechaIso, desdeIsoLocal } from "../fechas";
import { textoError } from "../errores";
import {
  agregarNoLaborable,
  cambiarTipoNoLaborable,
  cargarFeriados,
  eliminarNoLaborable,
  listarNoLaborables,
  type ResultadoNoLaborable,
} from "../repositorio";
import type { NoLaborable } from "../tipos";

type TipoNoLaborable = NoLaborable["tipo"];
const NOMBRE_TIPO: Record<TipoNoLaborable, string> = { feriado: "Feriado", vacaciones: "Vacaciones" };
const OTRO_TIPO: Record<TipoNoLaborable, TipoNoLaborable> = { feriado: "vacaciones", vacaciones: "feriado" };
import { feriadosNacionales } from "./series";

interface Props {
  /** Se llama cuando cambian los días o los turnos, para recargar la agenda. */
  onCambio: () => void;
  onCerrar: () => void;
}

const fechaTexto = (f: string) =>
  desdeIsoLocal(`${f}T00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function textoResultado(r: ResultadoNoLaborable): string {
  const partes: string[] = [];
  if (r.quitados)
    partes.push(
      r.quitados === 1 ? "Se quitó 1 turno recurrente de esos días." : `Se quitaron ${r.quitados} turnos recurrentes de esos días.`,
    );
  if (r.sueltos)
    partes.push(
      `Ojo: ${r.sueltos === 1 ? "queda 1 turno suelto" : `quedan ${r.sueltos} turnos sueltos`} en esas fechas; revisalos en la agenda.`,
    );
  return partes.join(" ");
}

/** Feriados y vacaciones: en esos días no se agendan los turnos recurrentes. */
export default function NoLaborablesModal({ onCambio, onCerrar }: Props) {
  const hoy = aFechaIso(new Date());
  const anio = Number(hoy.slice(0, 4));
  const [lista, setLista] = useState<NoLaborable[]>([]);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<TipoNoLaborable>("feriado");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await listarNoLaborables(await obtenerDb(), hoy));
    } catch (e) {
      setError(textoError(e, "cargar feriados y vacaciones"));
    }
  }, [hoy]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  async function hacer(accion: () => Promise<string>, que: string) {
    setOcupado(true);
    setError(null);
    setMensaje(null);
    try {
      setMensaje(await accion());
      await cargar();
      onCambio();
    } catch (e) {
      setError(textoError(e, que));
    } finally {
      setOcupado(false);
    }
  }

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    hacer(async () => {
      const r = await agregarNoLaborable(await obtenerDb(), { desde, hasta, descripcion, tipo });
      setDescripcion("");
      return textoResultado(r) || "Listo.";
    }, tipo === "feriado" ? "agregar feriado" : "agregar vacaciones");
  };

  const cambiarTipo = (p: NoLaborable) =>
    hacer(async () => {
      await cambiarTipoNoLaborable(await obtenerDb(), p.id, OTRO_TIPO[p.tipo]);
      return `"${p.descripcion}" ahora figura como ${NOMBRE_TIPO[OTRO_TIPO[p.tipo]].toLowerCase()}.`;
    }, "cambiar tipo de feriado o vacaciones");

  const feriados = (a: number) =>
    hacer(async () => {
      const r = await cargarFeriados(await obtenerDb(), feriadosNacionales(a).filter((f) => f.hasta >= hoy));
      if (!r.agregados) return `Los feriados de ${a} ya estaban cargados.`;
      return `Se cargaron ${r.agregados} feriados de ${a}. ${textoResultado(r)}`;
    }, "cargar feriados");

  const quitar = (p: NoLaborable) =>
    hacer(async () => {
      const n = await eliminarNoLaborable(await obtenerDb(), p.id, hoy);
      return n ? `Se volvieron a agendar ${n === 1 ? "1 turno recurrente" : `${n} turnos recurrentes`}.` : "Listo.";
    }, "quitar feriado o vacaciones");

  return (
    <div className="modal-fondo" onMouseDown={onCerrar}>
      <form className="modal no-laborables" onMouseDown={(e) => e.stopPropagation()} onSubmit={agregar}>
        <h3>Feriados y vacaciones</h3>
        <p className="nota">
          En estos días no se agendan los turnos recurrentes. Al cargarlos, se quitan los turnos recurrentes que ya estaban en
          esas fechas; si después los borrás, vuelven.
        </p>

        <div className="fila">
          <label>
            Desde
            <input
              type="date"
              required
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                if (hasta < e.target.value) setHasta(e.target.value);
              }}
            />
          </label>
          <label>
            Hasta
            <input type="date" required min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoNoLaborable)}>
              <option value="feriado">Feriado</option>
              <option value="vacaciones">Vacaciones</option>
            </select>
          </label>
          <label className="crece">
            Descripción
            <input
              placeholder={tipo === "feriado" ? "Feriado puente" : "Vacaciones de verano"}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
        </div>
        <div className="acciones">
          <button type="button" onClick={() => feriados(anio)} disabled={ocupado}>
            Cargar feriados {anio}
          </button>
          <button type="button" onClick={() => feriados(anio + 1)} disabled={ocupado}>
            Cargar feriados {anio + 1}
          </button>
          <span className="crece" />
          <button type="submit" className="primario" disabled={ocupado}>
            Agregar
          </button>
        </div>
        <small className="nota">
          Los feriados nacionales se calculan según la ley (con los trasladables ya movidos). Los días puente y los no laborables
          que se decretan cada año agregalos a mano, eligiendo el tipo. Para cambiar el tipo de uno ya cargado, tocá su etiqueta.
        </small>

        {mensaje && <p className="nota-agenda">{mensaje}</p>}
        {error && <p className="error">{error}</p>}

        <div className="lista-no-laborables">
          {lista.length === 0 ? (
            <p className="vacio">No hay feriados ni vacaciones cargados de acá en adelante.</p>
          ) : (
            <table className="tabla">
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {fechaTexto(p.desde)}
                      {p.hasta !== p.desde && ` al ${fechaTexto(p.hasta)}`}
                    </td>
                    <td>
                      {p.descripcion}
                      <button
                        type="button"
                        className="etiqueta"
                        title={`Cambiar a ${NOMBRE_TIPO[OTRO_TIPO[p.tipo]].toLowerCase()}`}
                        onClick={() => cambiarTipo(p)}
                        disabled={ocupado}
                      >
                        {NOMBRE_TIPO[p.tipo]}
                      </button>
                    </td>
                    <td className="derecha">
                      <button
                        type="button"
                        className="icono-solo"
                        aria-label="Quitar"
                        title="Quitar"
                        onClick={() => quitar(p)}
                        disabled={ocupado}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="acciones">
          <span className="crece" />
          <button type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </form>
    </div>
  );
}
