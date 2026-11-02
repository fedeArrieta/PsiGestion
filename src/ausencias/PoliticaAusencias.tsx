import { useEffect, useState } from "react";
import { obtenerDb } from "../db";
import { guardarPoliticaAusencias, leerPoliticaAusencias } from "../repositorio";
import { textoError } from "../errores";
import type { PoliticaAusencias as Politica } from "./logica";

const OPCIONES = [0, 25, 50, 75, 100];

const textoOpcion = (pct: number) => (pct === 0 ? "No cobrar" : pct === 100 ? "Cobrar la sesión completa" : `Cobrar el ${pct}%`);

/** Configuración: cuánto se propone cobrar cuando un paciente falta. */
export default function PoliticaAusencias() {
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => setPolitica(await leerPoliticaAusencias(await obtenerDb())))().catch((e) =>
      setError(textoError(e, "leer política de ausencias")),
    );
  }, []);

  async function cambiar(p: Politica) {
    try {
      await guardarPoliticaAusencias(await obtenerDb(), p);
      setPolitica(p);
      setMensaje("Guardado. Se aplica a las próximas ausencias que marques; las ya cargadas no cambian.");
      setError(null);
    } catch (e) {
      setError(textoError(e, "guardar política de ausencias"));
    }
  }

  const selector = (pct: number, alCambiar: (n: number) => void) => (
    <select value={pct} onChange={(e) => alCambiar(Number(e.target.value))}>
      {[...new Set([...OPCIONES, pct])]
        .sort((a, b) => a - b)
        .map((n) => (
          <option key={n} value={n}>
            {textoOpcion(n)}
          </option>
        ))}
    </select>
  );

  return (
    <div className="copias">
      <h2>Ausencias y cancelaciones</h2>
      <p className="nota">
        Cuando marcás un turno como ausente, la app propone cobrarlo según esta política. Es solo una sugerencia: en
        cada turno podés decidir si se cobra y cuánto. Lo que se cobra se suma al saldo del paciente y a los ingresos
        del mes. Los turnos cancelados no se cobran.
      </p>
      {error && <p className="error">{error}</p>}
      {politica && (
        <section className="panel">
          <h3>Política de cobro</h3>
          <label className="copias-conservar">
            Ausente sin aviso (no vino y no avisó):
            {selector(politica.sinAvisoPct, (n) => cambiar({ ...politica, sinAvisoPct: n }))}
          </label>
          <label className="copias-conservar">
            Ausente con aviso (avisó que no venía):
            {selector(politica.conAvisoPct, (n) => cambiar({ ...politica, conAvisoPct: n }))}
          </label>
          {mensaje && <p className="nota">{mensaje}</p>}
        </section>
      )}
    </div>
  );
}
