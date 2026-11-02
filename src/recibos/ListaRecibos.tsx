import { useCallback, useEffect, useState } from "react";
import { FileDown, FolderOpen } from "lucide-react";
import { obtenerDb } from "../db";
import { anularRecibo, listarRecibos } from "../repositorio";
import type { Recibo } from "../tipos";
import { textoError } from "../errores";
import { aIsoLocal } from "../fechas";
import { fechaCorta, numeroRecibo, pesosConCentavos } from "./logica";
import { abrirPdf, guardarPdf, verPdf } from "./servicio";

/** Recibos emitidos, de un paciente o de todos, con las acciones de ver el PDF y anular. */
export default function ListaRecibos({
  pacienteId,
  version = 0,
  onCambio,
}: {
  /** null = todos los pacientes (se muestra la columna Paciente). */
  pacienteId: number | null;
  /** Cambiarlo vuelve a cargar la lista. */
  version?: number;
  onCambio?: () => void;
}) {
  const [recibos, setRecibos] = useState<Recibo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setRecibos(await listarRecibos(await obtenerDb(), pacienteId));
  }, [pacienteId]);

  useEffect(() => {
    cargar().catch((e) => setError(textoError(e, "listar recibos")));
  }, [cargar, version]);

  async function ejecutar(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(textoError(e, "recibos"));
    } finally {
      setOcupado(false);
    }
  }

  const anular = (r: Recibo) => {
    const motivo = window.prompt(
      `¿Anular el recibo N° ${numeroRecibo(r.numero)} de ${r.paciente_nombre} por ${pesosConCentavos(r.total)}?\n\n` +
        "El recibo queda guardado con la marca ANULADO y sus pagos se pueden incluir en un recibo nuevo. " +
        "Si querés, escribí el motivo:",
      "",
    );
    if (motivo === null) return;
    return ejecutar(async () => {
      await anularRecibo(await obtenerDb(), r.id, motivo, aIsoLocal(new Date()));
      await cargar();
      onCambio?.();
    });
  };

  if (!recibos) return error ? <p className="error">{error}</p> : null;

  return (
    <div className="lista-recibos">
      {error && <p className="error">{error}</p>}
      {recibos.length === 0 ? (
        <p className="vacio">Todavía no hay recibos emitidos.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                {pacienteId === null && <th>Paciente</th>}
                <th>Forma de pago</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recibos.map((r) => (
                <tr key={r.id} className={r.anulado_en ? "inactivo" : undefined}>
                  <td>{numeroRecibo(r.numero)}</td>
                  <td>{fechaCorta(r.fecha)}</td>
                  {pacienteId === null && <td>{r.paciente_nombre}</td>}
                  <td>
                    {r.medio_pago ?? "—"}
                    {r.anulado_en && (
                      <span className="etiqueta" title={r.motivo_anulacion ?? undefined}>
                        Anulado
                      </span>
                    )}
                  </td>
                  <td className="num">{pesosConCentavos(r.total)}</td>
                  <td className="num acciones-recibo">
                    <button
                      type="button"
                      className="boton-icono"
                      title="Abrir el PDF"
                      aria-label="Abrir el PDF"
                      disabled={ocupado}
                      onClick={() => ejecutar(async () => void (await verPdf(r)))}
                    >
                      <FileDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="boton-icono"
                      title="Mostrar el PDF en la carpeta (para adjuntarlo en un mail o WhatsApp)"
                      aria-label="Mostrar en la carpeta"
                      disabled={ocupado}
                      onClick={() => ejecutar(async () => abrirPdf(await guardarPdf(r), true))}
                    >
                      <FolderOpen size={16} />
                    </button>
                    {!r.anulado_en && (
                      <button type="button" className="enlace peligro" disabled={ocupado} onClick={() => anular(r)}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
