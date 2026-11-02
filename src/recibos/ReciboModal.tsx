import { useEffect, useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";
import { obtenerDb } from "../db";
import { emitirRecibo, leerConfiguracion, proximoNumeroRecibo, turnosSinRecibo, ultimoMedioPago } from "../repositorio";
import type { Recibo, Turno } from "../tipos";
import { textoError } from "../errores";
import { aFechaIso } from "../fechas";
import {
  faltaParaEmitir,
  fechaCorta,
  itemsDeTurnos,
  leerConcepto,
  leerEmisor,
  MEDIOS_PAGO,
  numeroRecibo,
  pesosConCentavos,
} from "./logica";
import { abrirPdf, carpetaRecibos, guardarPdf } from "./servicio";

interface Props {
  pacienteId: number;
  pacienteNombre: string;
  /** Pagos que se marcan de entrada (por ejemplo, los que se acaban de registrar). Sin indicar: todos. */
  preseleccion?: number[];
  onEmitido: () => void;
  onCerrar: () => void;
}

/** Emite un recibo por pagos ya registrados y guarda el PDF. */
export default function ReciboModal({ pacienteId, pacienteNombre, preseleccion, onEmitido, onCerrar }: Props) {
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [fecha, setFecha] = useState(() => aFechaIso(new Date()));
  const [medio, setMedio] = useState("");
  const [concepto, setConcepto] = useState("");
  const [numero, setNumero] = useState<number | null>(null);
  const [carpeta, setCarpeta] = useState("");
  const [falta, setFalta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [emitido, setEmitido] = useState<{ recibo: Recibo; ruta: string | null } | null>(null);

  useEffect(() => {
    // En captura y sin propagar el Escape, para que no cierre también la ficha de abajo.
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!ocupado) onCerrar();
    };
    window.addEventListener("keydown", alPresionar, true);
    return () => window.removeEventListener("keydown", alPresionar, true);
  }, [onCerrar, ocupado]);

  useEffect(() => {
    (async () => {
      const db = await obtenerDb();
      const [t, config, n, ultimo, c] = await Promise.all([
        turnosSinRecibo(db, pacienteId),
        leerConfiguracion(db),
        proximoNumeroRecibo(db),
        ultimoMedioPago(db),
        carpetaRecibos().catch(() => ""),
      ]);
      setTurnos(t);
      const pre = preseleccion?.filter((id) => t.some((x) => x.id === id));
      setElegidos(new Set(pre?.length ? pre : t.map((x) => x.id)));
      setFalta(faltaParaEmitir(leerEmisor(config)));
      setConcepto(leerConcepto(config));
      setNumero(n);
      setMedio(ultimo ?? "");
      setCarpeta(c);
    })().catch((e) => setError(textoError(e, "preparar recibo")));
  }, [pacienteId, preseleccion]);

  const items = useMemo(
    () => (turnos ? itemsDeTurnos(turnos.filter((t) => elegidos.has(t.id)), concepto) : []),
    [turnos, elegidos, concepto],
  );
  const total = items.reduce((acc, it) => acc + it.importe, 0);
  const porId = useMemo(() => new Map(itemsDeTurnos(turnos ?? [], concepto).map((it) => [it.turno_id, it])), [turnos, concepto]);

  function alternar(id: number) {
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function guardarArchivo(recibo: Recibo) {
    try {
      setEmitido({ recibo, ruta: await guardarPdf(recibo) });
    } catch (e) {
      setEmitido({ recibo, ruta: null });
      setError(`El recibo quedó emitido, pero no se pudo guardar el PDF: ${textoError(e, "guardar PDF del recibo")}`);
    }
  }

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const recibo = await emitirRecibo(await obtenerDb(), {
        paciente_id: pacienteId,
        turno_ids: [...elegidos],
        fecha,
        medio_pago: medio || null,
      });
      onEmitido();
      await guardarArchivo(recibo);
    } catch (err) {
      setError(textoError(err, "emitir recibo"));
    } finally {
      setOcupado(false);
    }
  }

  async function abrir(enCarpeta: boolean) {
    if (!emitido?.ruta) return;
    setError(null);
    try {
      await abrirPdf(emitido.ruta, enCarpeta);
    } catch (e) {
      setError(textoError(e, "abrir recibo"));
    }
  }

  return (
    <div className="modal-fondo" onMouseDown={() => !ocupado && onCerrar()}>
      <div className="modal recibo-modal" onMouseDown={(e) => e.stopPropagation()}>
        {emitido ? (
          <>
            <h3 className="recibo-listo">
              <CircleCheck size={22} /> Recibo N° {numeroRecibo(emitido.recibo.numero)} emitido
            </h3>
            <p>
              {emitido.recibo.paciente_nombre} · {pesosConCentavos(emitido.recibo.total)} ·{" "}
              {emitido.recibo.items.length === 1 ? "1 sesión" : `${emitido.recibo.items.length} sesiones`}
            </p>
            {emitido.ruta && (
              <p className="nota">
                Guardado en <code>{emitido.ruta}</code>. Para enviarlo por mail o WhatsApp, adjuntá ese archivo.
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="acciones">
              {emitido.ruta ? (
                <>
                  <button type="button" onClick={() => abrir(true)}>
                    Mostrar en la carpeta
                  </button>
                  <button type="button" onClick={() => abrir(false)}>
                    Abrir PDF
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => guardarArchivo(emitido.recibo)}>
                  Reintentar guardar el PDF
                </button>
              )}
              <span className="crece" />
              <button type="button" className="primario" onClick={onCerrar}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={emitir}>
            <h3>Nuevo recibo · {pacienteNombre}</h3>
            {falta ? (
              <p className="aviso">{falta}</p>
            ) : (
              turnos && (
                <>
                  <div className="fila">
                    <label className="crece">
                      Fecha
                      <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </label>
                    <label className="crece">
                      Forma de pago
                      <select value={medio} onChange={(e) => setMedio(e.target.value)}>
                        <option value="">Sin indicar</option>
                        {[...new Set([...MEDIOS_PAGO, ...(medio ? [medio] : [])])].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {turnos.length === 0 ? (
                    <p className="vacio">
                      No hay pagos sin recibo. Marcá las sesiones como pagadas en la ficha y después emití el recibo.
                    </p>
                  ) : (
                    <fieldset className="recibo-pagos">
                      <legend>Pagos que incluye</legend>
                      <ul>
                        {[...turnos].reverse().map((t) => {
                          const it = porId.get(t.id)!;
                          return (
                            <li key={t.id}>
                              <label className="check">
                                <input type="checkbox" checked={elegidos.has(t.id)} onChange={() => alternar(t.id)} />
                                <span className="crece">
                                  {fechaCorta(it.fecha)} · {it.concepto}
                                </span>
                                <span className="num">{pesosConCentavos(it.importe)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="recibo-total">
                        <span>Total</span>
                        <strong>{pesosConCentavos(total)}</strong>
                      </div>
                    </fieldset>
                  )}
                  <small>
                    {numero != null && <>Se emite con el N° {numeroRecibo(numero)}. </>}
                    {carpeta && <>El PDF se guarda en {carpeta}. </>}
                    Lleva tus datos, el nombre del paciente, las fechas y los importes: nunca notas clínicas.
                  </small>
                </>
              )
            )}
            {error && <p className="error">{error}</p>}
            <div className="acciones">
              <span className="crece" />
              <button type="button" onClick={onCerrar} disabled={ocupado}>
                Cancelar
              </button>
              {!falta && (
                <button type="submit" className="primario" disabled={ocupado || !items.length}>
                  {ocupado ? "Emitiendo…" : "Emitir recibo"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
