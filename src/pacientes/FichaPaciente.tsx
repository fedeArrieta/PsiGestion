import { useCallback, useEffect, useState } from "react";
import { NotebookPen, ReceiptText, X } from "lucide-react";
import { obtenerDb } from "../db";
import {
  actualizarPaciente,
  cambiarActivoPaciente,
  crearPaciente,
  listarTurnosDePaciente,
  marcarPagado,
  saldarPaciente,
  listarNotas,
  turnosConNota,
  recibosDeTurnos,
  turnosSinRecibo,
  listarRecibos,
  obtenerRecibo,
} from "../repositorio";
import type { PacienteConResumen, Turno } from "../tipos";
import { etiquetaEstado, importeTurno, seCobra } from "../ausencias/logica";
import { leerMonto, montoEditable, pesos } from "../formato";
import { aIsoLocal, desdeIsoLocal } from "../fechas";
import ImpresionFicha from "./ImpresionFicha";
import { textoError } from "../errores";
import NotaModal, { type InicioNota } from "../notas/NotaModal";
import DiarioPaciente from "../notas/DiarioPaciente";
import ReciboModal from "../recibos/ReciboModal";
import ListaRecibos from "../recibos/ListaRecibos";
import { numeroRecibo } from "../recibos/logica";
import { verPdf } from "../recibos/servicio";
import { confirmar } from "../dialogo";

interface Props {
  /** null = paciente nuevo */
  paciente: PacienteConResumen | null;
  onCambio: () => Promise<void> | void;
  onCerrar: () => void;
  /** Pestaña que se muestra al abrir la ficha. */
  pestanaInicial?: Pestana;
}

export type Pestana = "sesiones" | "diario" | "recibos";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtTurno = { format: (d: Date) => `${fmtFecha.format(d)} · ${aIsoLocal(d).slice(11, 16)}` };

export default function FichaPaciente({ paciente, onCambio, onCerrar, pestanaInicial = "sesiones" }: Props) {
  const [nombre, setNombre] = useState(paciente?.nombre ?? "");
  const [telefono, setTelefono] = useState(paciente?.telefono ?? "");
  const [email, setEmail] = useState(paciente?.email ?? "");
  const [documento, setDocumento] = useState(paciente?.documento ?? "");
  const [monto, setMonto] = useState(montoEditable(paciente?.monto_sesion ?? 0));
  const [notas, setNotas] = useState(paciente?.notas ?? "");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [conNota, setConNota] = useState<Set<number>>(new Set());
  const [nota, setNota] = useState<{ id: number | null; inicial?: InicioNota } | null>(null);
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [versionDiario, setVersionDiario] = useState(0);
  const [cantidadNotas, setCantidadNotas] = useState<number | null>(null);
  const terminarImpresion = useCallback(() => setImprimiendo(false), []);
  // Recibos: número de recibo vigente por turno, pagos sin recibo y el modal para emitir.
  const [conRecibo, setConRecibo] = useState<Map<number, number>>(new Map());
  const [pagosSinRecibo, setPagosSinRecibo] = useState(0);
  const [cantidadRecibos, setCantidadRecibos] = useState<number | null>(null);
  const [versionRecibos, setVersionRecibos] = useState(0);
  const [recibo, setRecibo] = useState<{ preseleccion?: number[] } | null>(null);
  /** Pago recién registrado, para ofrecer el recibo. */
  const [ultimoPago, setUltimoPago] = useState<{ ids: number[]; total: number } | null>(null);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  const cargarTurnos = useCallback(async () => {
    if (!paciente) return;
    const db = await obtenerDb();
    const [t, n, notas, r, sinRecibo, recibos] = await Promise.all([
      listarTurnosDePaciente(db, paciente.id),
      turnosConNota(db, paciente.id),
      listarNotas(db, { pacienteId: paciente.id }),
      recibosDeTurnos(db, paciente.id),
      turnosSinRecibo(db, paciente.id),
      listarRecibos(db, paciente.id),
    ]);
    setTurnos(t);
    setConNota(n);
    setCantidadNotas(notas.length);
    setConRecibo(r);
    setPagosSinRecibo(sinRecibo.length);
    setCantidadRecibos(recibos.length);
    // Si el pago recién registrado ya no está pendiente de recibo, deja de ofrecerse.
    setUltimoPago((u) => {
      if (!u) return u;
      const ids = u.ids.filter((id) => sinRecibo.some((x) => x.id === id));
      return ids.length ? { ids, total: sinRecibo.filter((x) => ids.includes(x.id)).reduce((a, x) => a + importeTurno(x), 0) } : null;
    });
  }, [paciente]);

  useEffect(() => {
    cargarTurnos().catch((e) => setError(textoError(e, "cargar turnos del paciente")));
  }, [cargarTurnos]);

  async function ejecutar(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(textoError(e, "ficha de paciente"));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNumero = leerMonto(monto);
    if (Number.isNaN(montoNumero)) return setError("El monto por sesión no es válido. Ejemplo: 25000 o 25.000");
    return ejecutar(async () => {
      const db = await obtenerDb();
      const datos = { nombre, telefono, email, documento, notas, monto_sesion: montoNumero };
      if (paciente) await actualizarPaciente(db, paciente.id, datos, aIsoLocal(new Date()));
      else await crearPaciente(db, datos);
      await onCambio();
      onCerrar();
    });
  };

  const alternarPago = async (t: Turno) => {
    const numero = conRecibo.get(t.id);
    if (
      t.pagado &&
      numero != null &&
      !(await confirmar(
        `Este pago figura en el recibo N° ${numeroRecibo(numero)}. Si lo desmarcás, el recibo sigue vigente: ` +
          "conviene anularlo en la pestaña Recibos. ¿Desmarcar el pago igual?",
      ))
    )
      return;
    return ejecutar(async () => {
      await marcarPagado(await obtenerDb(), t.id, !t.pagado);
      setUltimoPago(!t.pagado && seCobra(t) ? { ids: [t.id], total: importeTurno(t) } : null);
      await Promise.all([cargarTurnos(), onCambio()]);
    });
  };

  const saldar = () => {
    const pendientes = turnos.filter((t) => !t.pagado && seCobra(t));
    return ejecutar(async () => {
      await saldarPaciente(await obtenerDb(), paciente!.id);
      setUltimoPago({ ids: pendientes.map((t) => t.id), total: pendientes.reduce((a, t) => a + importeTurno(t), 0) });
      await Promise.all([cargarTurnos(), onCambio()]);
    });
  };

  const verRecibo = (numero: number) =>
    ejecutar(async () => {
      const r = await obtenerRecibo(await obtenerDb(), numero, "numero");
      if (r) await verPdf(r);
    });

  const cambiarActivo = async () => {
    const darDeBaja = Boolean(paciente!.activo);
    if (
      darDeBaja &&
      !(await confirmar(`¿Dar de baja a ${paciente!.nombre}? Deja de aparecer en la agenda, pero se conserva su historial.`))
    )
      return;
    return ejecutar(async () => {
      await cambiarActivoPaciente(await obtenerDb(), paciente!.id, !darDeBaja);
      await onCambio();
      onCerrar();
    });
  };

  // Saldo: sesiones realizadas y ausencias que se cobran, sin pagar.
  const saldo = turnos.filter((t) => !t.pagado).reduce((acc, t) => acc + importeTurno(t), 0);

  return (
    <>
    <div className="modal-fondo" onMouseDown={onCerrar}>
      <div className="modal ficha" onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={guardar} className="ficha-datos">
          <h3>{paciente ? "Ficha del paciente" : "Nuevo paciente"}</h3>
          <label>
            Nombre
            <input autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <div className="fila">
            <label className="crece">
              Teléfono
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </label>
            <label className="crece">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label>
            DNI o CUIT
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Opcional, para los recibos" />
          </label>
          <label>
            Monto por sesión
            <input inputMode="decimal" placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
            {paciente && <small>Si lo cambiás, se actualizan también sus turnos programados a futuro.</small>}
          </label>
          <label>
            Notas
            <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            {paciente && (
              <button type="button" className={paciente.activo ? "peligro" : ""} onClick={cambiarActivo} disabled={ocupado}>
                {paciente.activo ? "Dar de baja" : "Reactivar"}
              </button>
            )}
            {paciente && (
              <button type="button" onClick={() => setImprimiendo(true)} disabled={ocupado || imprimiendo}>
                Imprimir o guardar PDF
              </button>
            )}
            <span className="crece" />
            <button type="button" onClick={onCerrar} disabled={ocupado}>
              Cerrar
            </button>
            <button type="submit" className="primario" disabled={ocupado}>
              Guardar
            </button>
          </div>
        </form>

        {paciente && (
          <section className="ficha-turnos">
            <div className="ficha-turnos-cabecera">
              <div className="selector pestanas" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pestana === "sesiones"}
                  className={pestana === "sesiones" ? "activo" : ""}
                  onClick={() => setPestana("sesiones")}
                >
                  Sesiones ({turnos.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pestana === "diario"}
                  className={pestana === "diario" ? "activo" : ""}
                  onClick={() => setPestana("diario")}
                >
                  Diario clínico{cantidadNotas != null && ` (${cantidadNotas})`}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pestana === "recibos"}
                  className={pestana === "recibos" ? "activo" : ""}
                  onClick={() => setPestana("recibos")}
                >
                  Recibos{cantidadRecibos != null && ` (${cantidadRecibos})`}
                </button>
              </div>
              {pestana === "sesiones" && saldo > 0 && (
                <button type="button" onClick={saldar} disabled={ocupado}>
                  Marcar todo pagado ({pesos(saldo)})
                </button>
              )}
              {pestana === "recibos" && pagosSinRecibo > 0 && (
                <button type="button" className="primario" onClick={() => setRecibo({})} disabled={ocupado}>
                  Emitir recibo ({pagosSinRecibo} {pagosSinRecibo === 1 ? "pago" : "pagos"} sin recibo)
                </button>
              )}
            </div>
            {pestana === "sesiones" && ultimoPago && (
              <div className="aviso-recibo" role="status">
                <ReceiptText size={18} />
                <span className="crece">
                  Pago registrado: {ultimoPago.ids.length === 1 ? "1 sesión" : `${ultimoPago.ids.length} sesiones`} por{" "}
                  {pesos(ultimoPago.total)}.
                </span>
                <button type="button" className="primario" onClick={() => setRecibo({ preseleccion: ultimoPago.ids })}>
                  Emitir recibo
                </button>
                <button type="button" className="boton-icono" aria-label="No emitir recibo" title="Ahora no" onClick={() => setUltimoPago(null)}>
                  <X size={16} />
                </button>
              </div>
            )}
            {pestana === "recibos" ? (
              <ListaRecibos
                pacienteId={paciente.id}
                version={versionRecibos}
                onCambio={() => void cargarTurnos()}
              />
            ) : pestana === "diario" ? (
              <DiarioPaciente
                pacienteId={paciente.id}
                version={versionDiario}
                onCantidad={setCantidadNotas}
                onAbrir={(id) => setNota({ id, inicial: id == null ? { paciente_id: paciente.id } : undefined })}
              />
            ) : turnos.length === 0 ? (
              <p className="vacio">Todavía no tiene turnos.</p>
            ) : (
              <ul className="lista-turnos">
                {turnos.map((t) => (
                  <li key={t.id} className={`estado-${t.estado}`}>
                    <span className="crece">{fmtTurno.format(desdeIsoLocal(t.inicio))}</span>
                    <span className="estado">{etiquetaEstado(t)}</span>
                    <span className="num" title={t.estado === "ausente" ? (t.cargo != null ? "Se cobra la ausencia" : "La ausencia no se cobra") : undefined}>
                      {t.estado === "ausente"
                        ? t.cargo != null
                          ? pesos(t.cargo)
                          : "Sin cargo"
                        : t.estado === "cancelado"
                          ? "—"
                          : pesos(t.monto)}
                    </span>
                    <button
                      type="button"
                      className={`boton-icono${conNota.has(t.id) ? " con-nota" : ""}`}
                      title={conNota.has(t.id) ? "Ver la nota clínica de esta sesión" : "Escribir la nota clínica de esta sesión"}
                      aria-label={conNota.has(t.id) ? "Ver nota clínica" : "Escribir nota clínica"}
                      onClick={() =>
                        setNota({ id: null, inicial: { paciente_id: t.paciente_id, turno_id: t.id, fecha: t.inicio.slice(0, 10) } })
                      }
                    >
                      <NotebookPen size={15} />
                    </button>
                    <label className={seCobra(t) || t.pagado ? "check" : "check sin-cobro"} title="Pagado">
                      <input type="checkbox" checked={Boolean(t.pagado)} onChange={() => alternarPago(t)} disabled={ocupado} />
                      Pagado
                    </label>
                    {conRecibo.has(t.id) ? (
                      <button
                        type="button"
                        className="boton-icono con-recibo"
                        title={`Recibo N° ${numeroRecibo(conRecibo.get(t.id)!)}: abrir el PDF`}
                        aria-label="Abrir el recibo"
                        disabled={ocupado}
                        onClick={() => verRecibo(conRecibo.get(t.id)!)}
                      >
                        <ReceiptText size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`boton-icono${t.pagado && seCobra(t) ? "" : " oculto"}`}
                        title="Emitir recibo de este pago"
                        aria-label="Emitir recibo de este pago"
                        disabled={ocupado || !(t.pagado && seCobra(t))}
                        onClick={() => setRecibo({ preseleccion: [t.id] })}
                      >
                        <ReceiptText size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {paciente && imprimiendo && <ImpresionFicha paciente={paciente} turnos={turnos} onTerminar={terminarImpresion} />}
    </div>
    {recibo && paciente && (
      <ReciboModal
        pacienteId={paciente.id}
        pacienteNombre={paciente.nombre}
        preseleccion={recibo.preseleccion}
        onEmitido={() => {
          setUltimoPago(null);
          setVersionRecibos((v) => v + 1);
          void cargarTurnos();
        }}
        onCerrar={() => setRecibo(null)}
      />
    )}
    {nota && (
      <NotaModal
        notaId={nota.id}
        inicial={nota.inicial}
        onGuardado={() => {
          setVersionDiario((v) => v + 1);
          void cargarTurnos();
        }}
        onCerrar={() => setNota(null)}
      />
    )}
    </>
  );
}
