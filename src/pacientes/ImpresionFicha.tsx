import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PacienteConResumen, Turno } from "../tipos";
import { ESTADOS_TURNO } from "../tipos";
import { pesos } from "../formato";
import { desdeIsoLocal, textoDiaLargo } from "../fechas";

const etiquetaEstado = Object.fromEntries(ESTADOS_TURNO.map((e) => [e.valor, e.etiqueta]));
const fmtFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Ficha del paciente lista para imprimir. Al abrirse llama a la impresión de Windows,
 * donde se puede elegir "Microsoft Print to PDF" para guardarla como PDF.
 */
export default function ImpresionFicha({
  paciente,
  turnos,
  onTerminar,
}: {
  paciente: PacienteConResumen;
  turnos: Turno[];
  onTerminar: () => void;
}) {
  useEffect(() => {
    const terminar = () => onTerminar();
    window.addEventListener("afterprint", terminar);
    // Esperar un cuadro para que la ficha esté dibujada antes de imprimir.
    const id = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("afterprint", terminar);
    };
  }, [onTerminar]);

  const realizadas = turnos.filter((t) => t.estado === "realizado");
  const saldo = realizadas.filter((t) => !t.pagado).reduce((acc, t) => acc + t.monto, 0);
  const ordenados = [...turnos].sort((a, b) => a.inicio.localeCompare(b.inicio));

  return createPortal(
    <div className="impresion">
      <header>
        <h1>{paciente.nombre}</h1>
        <p>Ficha emitida el {textoDiaLargo(new Date())}</p>
      </header>
      <dl>
        <dt>Teléfono</dt>
        <dd>{paciente.telefono || "—"}</dd>
        <dt>Email</dt>
        <dd>{paciente.email || "—"}</dd>
        <dt>Monto por sesión</dt>
        <dd>{pesos(paciente.monto_sesion)}</dd>
        <dt>Sesiones realizadas</dt>
        <dd>{realizadas.length}</dd>
        <dt>Saldo pendiente</dt>
        <dd>{pesos(saldo)}</dd>
      </dl>
      {paciente.notas && (
        <section>
          <h2>Notas</h2>
          <p className="impresion-notas">{paciente.notas}</p>
        </section>
      )}
      <section>
        <h2>Historial de sesiones</h2>
        {ordenados.length === 0 ? (
          <p>Sin sesiones registradas.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Estado</th>
                <th className="num">Monto</th>
                <th>Pagado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((t) => (
                <tr key={t.id}>
                  <td>{fmtFecha.format(desdeIsoLocal(t.inicio))}</td>
                  <td>{t.inicio.slice(11, 16)}</td>
                  <td>{etiquetaEstado[t.estado]}</td>
                  <td className="num">{pesos(t.monto)}</td>
                  <td>{t.pagado ? "Sí" : "No"}</td>
                  <td>{t.notas ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>,
    document.body,
  );
}
