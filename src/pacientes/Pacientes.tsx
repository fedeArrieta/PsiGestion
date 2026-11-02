import { Search, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerDb } from "../db";
import { listarPacientesConResumen } from "../repositorio";
import type { PacienteConResumen } from "../tipos";
import { pesos } from "../formato";
import { desdeIsoLocal } from "../fechas";
import FichaPaciente from "./FichaPaciente";
import { textoError } from "../errores";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Compara sin importar mayúsculas ni tildes. */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<PacienteConResumen[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [verBajas, setVerBajas] = useState(false);
  const [abierto, setAbierto] = useState<PacienteConResumen | "nuevo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setPacientes(await listarPacientesConResumen(await obtenerDb(), verBajas));
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar pacientes"));
    }
  }, [verBajas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return pacientes;
    return pacientes.filter((p) =>
      [p.nombre, p.telefono ?? "", p.email ?? ""].some((campo) => normalizar(campo).includes(q)),
    );
  }, [pacientes, busqueda]);

  const saldoTotal = pacientes.reduce((acc, p) => acc + p.saldo_pendiente, 0);

  return (
    <div className="pacientes">
      <div className="barra">
        <h2 className="titulo-agenda">Pacientes</h2>
        <label className="campo-buscar">
          <Search size={17} className="icono" />
          <input
            className="buscador"
            type="search"
            placeholder="Buscar paciente…"
            aria-label="Buscar por nombre, teléfono o email"
            title="Buscá por nombre, teléfono o email"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} />
          Ver dados de baja
        </label>
        <button className="primario" onClick={() => setAbierto("nuevo")}>
          <UserPlus size={18} className="icono" /> Nuevo paciente
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {saldoTotal > 0 && (
        <p className="resumen">
          Saldo pendiente de cobro: <strong>{pesos(saldoTotal)}</strong>
        </p>
      )}

      {pacientes.length === 0 ? (
        <p className="vacio-panel">Todavía no hay pacientes. Agregá el primero con "Nuevo paciente".</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th className="num">Monto por sesión</th>
                <th className="num">Sesiones</th>
                <th>Última sesión</th>
                <th className="num">Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className={p.activo ? "" : "inactivo"} onClick={() => setAbierto(p)}>
                  <td>
                    {p.nombre}
                    {!p.activo && <span className="etiqueta">De baja</span>}
                  </td>
                  <td>{p.telefono ?? "—"}</td>
                  <td className="num">{pesos(p.monto_sesion)}</td>
                  <td className="num">{p.sesiones_realizadas}</td>
                  <td>{p.ultima_sesion ? fmtFecha.format(desdeIsoLocal(p.ultima_sesion)) : "—"}</td>
                  <td className={p.saldo_pendiente > 0 ? "num deuda" : "num"}>
                    {p.saldo_pendiente > 0 ? pesos(p.saldo_pendiente) : "—"}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="vacio">
                    Ningún paciente coincide con "{busqueda}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <FichaPaciente
          paciente={abierto === "nuevo" ? null : abierto}
          onCambio={cargar}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
