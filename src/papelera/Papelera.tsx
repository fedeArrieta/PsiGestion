import { useCallback, useEffect, useState } from "react";
import { obtenerDb } from "../db";
import { textoError } from "../errores";
import {
  borrarDePapelera,
  DIAS_PAPELERA,
  listarHistorial,
  listarPapelera,
  restaurarDePapelera,
  type CambioHistorial,
  type ElementoPapelera,
} from "../repositorio";
import { alOfrecerDeshacer, avisarDatosCambiados, type OfertaDeshacer } from "./deshacer";

/** "2026-11-02T10:00" o "2026-11-02 10:00:00" → "02/11/2026 10:00" */
export function fechaLegible(texto: string): string {
  return texto.replace(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})(:\d{2})?/g, "$3/$2/$1 $4");
}

export default function Papelera() {
  const [elementos, setElementos] = useState<ElementoPapelera[]>([]);
  const [historial, setHistorial] = useState<CambioHistorial[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const [p, h] = await Promise.all([listarPapelera(db), listarHistorial(db, null)]);
      setElementos(p);
      setHistorial(h);
    } catch (e) {
      setError(textoError(e, "cargar papelera"));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion: () => Promise<void>) {
    try {
      await accion();
      setError(null);
      avisarDatosCambiados();
    } catch (e) {
      setError(textoError(e, "papelera"));
    }
    await cargar();
  }

  return (
    <div className="copias">
      <h2>Papelera e historial</h2>

      <section className="panel">
        <h3>Papelera</h3>
        <p className="nota">
          Los turnos y gastos eliminados quedan acá {DIAS_PAPELERA} días y después se borran solos.
        </p>
        {error && <p className="error">{error}</p>}
        {elementos.length === 0 ? (
          <p className="vacio">La papelera está vacía.</p>
        ) : (
          <ul className="lista-gastos">
            {elementos.map((e) => (
              <li key={e.id}>
                <span className="crece">
                  {fechaLegible(e.descripcion)}
                  <span className="nota"> · eliminado el {fechaLegible(e.eliminado_en)}</span>
                </span>
                <button onClick={() => ejecutar(async () => restaurarDePapelera(await obtenerDb(), e.id))}>Restaurar</button>
                <button
                  className="peligro"
                  onClick={() => {
                    if (window.confirm("¿Borrar definitivamente? No se puede deshacer."))
                      ejecutar(async () => borrarDePapelera(await obtenerDb(), e.id));
                  }}
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>Historial de turnos y pagos</h3>
        <p className="nota">Cada cambio de estado, fecha, monto o pago de un turno queda registrado.</p>
        {historial.length === 0 ? (
          <p className="vacio">Todavía no hay cambios registrados.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Cambio</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{fechaLegible(h.fecha)}</td>
                    <td>{h.paciente_nombre}</td>
                    <td>{fechaLegible(h.detalle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const SEGUNDOS_DESHACER = 8;

/** Barra que aparece unos segundos después de eliminar algo, con el botón Deshacer. */
export function BarraDeshacer() {
  const [oferta, setOferta] = useState<OfertaDeshacer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => alOfrecerDeshacer((o) => (setOferta(o), setError(null))), []);

  useEffect(() => {
    if (!oferta) return;
    const id = window.setTimeout(() => setOferta(null), SEGUNDOS_DESHACER * 1000);
    return () => window.clearTimeout(id);
  }, [oferta]);

  if (!oferta) return null;
  return (
    <div className="barra-deshacer" role="status">
      <span>{error ?? oferta.texto}</span>
      <button
        onClick={async () => {
          try {
            await restaurarDePapelera(await obtenerDb(), oferta.papeleraId);
            setOferta(null);
            avisarDatosCambiados();
          } catch (e) {
            setError(textoError(e, "deshacer"));
          }
        }}
      >
        Deshacer
      </button>
    </div>
  );
}
