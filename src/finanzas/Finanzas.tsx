import { useCallback, useEffect, useState } from "react";
import { obtenerDb } from "../db";
import {
  actualizarGasto,
  copiarGastosFijos,
  crearGasto,
  eliminarGasto,
  guardarObjetivo,
  listarGastos,
  obtenerObjetivo,
  resumenMes,
} from "../repositorio";
import type { Gasto, ResumenMes } from "../tipos";
import { leerMonto, montoEditable, pesos } from "../formato";
import { calcularMetas, mesDe, sumarMeses, textoMes, type Meta } from "./calculo";
import { textoError } from "../errores";

export default function Finanzas() {
  const [mes, setMes] = useState(() => mesDe(new Date()));
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [objetivo, setObjetivo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const [r, g, o] = await Promise.all([resumenMes(db, mes), listarGastos(db, mes), obtenerObjetivo(db, mes)]);
      setResumen(r);
      setGastos(g);
      setObjetivo(o);
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar finanzas"));
    }
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>) {
    try {
      await accion();
      await cargar();
    } catch (e) {
      setError(textoError(e, "finanzas"));
    }
  }

  const metas = resumen ? calcularMetas(resumen, objetivo) : [];
  const neto = resumen ? resumen.facturado - resumen.gastos : 0;

  return (
    <div className="finanzas">
      <div className="barra">
        <button aria-label="Mes anterior" onClick={() => setMes((m) => sumarMeses(m, -1))}>
          ‹
        </button>
        <button aria-label="Mes siguiente" onClick={() => setMes((m) => sumarMeses(m, 1))}>
          ›
        </button>
        <h2 className="titulo-agenda">{textoMes(mes)}</h2>
        {mes !== mesDe(new Date()) && <button onClick={() => setMes(mesDe(new Date()))}>Mes actual</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {resumen && (
        <>
          <div className="tarjetas">
            <Tarjeta
              titulo="Ganado"
              valor={pesos(resumen.facturado)}
              detalle={`${resumen.sesiones_realizadas} sesiones realizadas`}
            />
            <Tarjeta
              titulo="Cobrado"
              valor={pesos(resumen.cobrado)}
              detalle={
                resumen.facturado > resumen.cobrado
                  ? `Falta cobrar ${pesos(resumen.facturado - resumen.cobrado)}`
                  : "Todo cobrado"
              }
            />
            <Tarjeta
              titulo="Programado"
              valor={pesos(resumen.programado)}
              detalle={`${resumen.sesiones_programadas} turnos por delante`}
            />
            <Tarjeta titulo="Gastos" valor={pesos(resumen.gastos)} detalle={`${gastos.length} gastos cargados`} />
            <Tarjeta
              titulo="Resultado"
              valor={pesos(neto)}
              detalle="Ganado menos gastos"
              tono={neto < 0 ? "negativo" : neto > 0 ? "positivo" : undefined}
            />
          </div>

          <div className="columnas-finanzas">
            <section className="panel">
              <h3>Objetivo y sesiones necesarias</h3>
              <ObjetivoEditable
                key={`${mes}-${objetivo}`}
                valor={objetivo}
                onGuardar={(monto) => ejecutar(async () => guardarObjetivo(await obtenerDb(), mes, monto))}
              />
              {resumen.precio_promedio > 0 ? (
                <p className="nota">Calculado con una sesión promedio de {pesos(resumen.precio_promedio)}.</p>
              ) : (
                <p className="nota">
                  Cargá pacientes con su monto por sesión para poder calcular cuántas sesiones hacen falta.
                </p>
              )}
              {metas.map((m) => (
                <MetaVista key={m.titulo} meta={m} />
              ))}
            </section>

            <section className="panel">
              <Gastos mes={mes} gastos={gastos} ejecutar={ejecutar} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta(props: { titulo: string; valor: string; detalle: string; tono?: "positivo" | "negativo" }) {
  return (
    <div className={`tarjeta ${props.tono ?? ""}`}>
      <span className="tarjeta-titulo">{props.titulo}</span>
      <strong className="tarjeta-valor">{props.valor}</strong>
      <span className="tarjeta-detalle">{props.detalle}</span>
    </div>
  );
}

function ObjetivoEditable({ valor, onGuardar }: { valor: number | null; onGuardar: (monto: number) => void }) {
  const [texto, setTexto] = useState(montoEditable(valor ?? 0));
  const [error, setError] = useState(false);
  const guardar = () => {
    const monto = leerMonto(texto);
    if (Number.isNaN(monto)) return setError(true);
    setError(false);
    if (monto !== (valor ?? 0)) onGuardar(monto);
  };
  return (
    <label className="objetivo">
      Objetivo de ganancia (después de gastos)
      <input
        inputMode="decimal"
        placeholder="Ej: 800.000"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
      {error && <small className="error">Monto no válido. Ejemplo: 800000 o 800.000</small>}
    </label>
  );
}

function MetaVista({ meta }: { meta: Meta }) {
  const base = Math.max(meta.monto, meta.realizado + meta.programado, 1);
  const pctRealizado = Math.min(100, (meta.realizado / base) * 100);
  const pctProgramado = Math.min(100 - pctRealizado, (meta.programado / base) * 100);
  const pctMeta = (meta.monto / base) * 100;

  let mensaje: string;
  if (meta.monto === 0) mensaje = "No hay montos cargados todavía.";
  else if (meta.cumplida) mensaje = "¡Cumplido con las sesiones realizadas!";
  else if (meta.faltante === 0) mensaje = "Se cumple si se realizan los turnos programados.";
  else if (meta.sesionesAdicionales == null) mensaje = `Faltan ${pesos(meta.faltante)}.`;
  else
    mensaje = `Faltan ${pesos(meta.faltante)}: hay que agendar ${meta.sesionesAdicionales} ${
      meta.sesionesAdicionales === 1 ? "sesión más" : "sesiones más"
    }.`;

  return (
    <div className={`meta ${meta.cumplida && meta.monto > 0 ? "cumplida" : ""}`}>
      <div className="meta-cabecera">
        <strong>{meta.titulo}</strong>
        <span>
          {pesos(meta.monto)}
          {meta.sesionesNecesarias != null && meta.monto > 0 && ` · ${meta.sesionesNecesarias} sesiones en el mes`}
        </span>
      </div>
      <div className="barra-progreso" role="img" aria-label={mensaje}>
        <div className="relleno realizado" style={{ width: `${pctRealizado}%` }} />
        <div className="relleno programado" style={{ width: `${pctProgramado}%` }} />
        {meta.monto > 0 && <div className="marca-meta" style={{ left: `${pctMeta}%` }} />}
      </div>
      <p className="meta-mensaje">{mensaje}</p>
    </div>
  );
}

function Gastos(props: { mes: string; gastos: Gasto[]; ejecutar: (a: () => Promise<unknown>) => Promise<void> }) {
  const { mes, gastos, ejecutar } = props;
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [fijo, setFijo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditando(null);
    setDescripcion("");
    setMonto("");
    setFijo(false);
  }, [mes]);

  function editar(g: Gasto) {
    setEditando(g);
    setDescripcion(g.descripcion);
    setMonto(montoEditable(g.monto));
    setFijo(Boolean(g.fijo));
    setError(null);
  }

  function limpiar() {
    setEditando(null);
    setDescripcion("");
    setMonto("");
    setFijo(false);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const valor = leerMonto(monto);
    if (!monto.trim() || Number.isNaN(valor)) return setError("Escribí un monto válido. Ejemplo: 200.000");
    if (!descripcion.trim()) return setError("Escribí una descripción.");
    const datos = { mes, descripcion, monto: valor, fijo };
    await ejecutar(async () => {
      const db = await obtenerDb();
      if (editando) await actualizarGasto(db, editando.id, datos);
      else await crearGasto(db, datos);
    });
    limpiar();
  }

  const total = gastos.reduce((a, g) => a + g.monto, 0);
  const anterior = sumarMeses(mes, -1);

  return (
    <>
      <div className="panel-cabecera">
        <h3>Gastos del mes</h3>
        <button
          type="button"
          onClick={() => ejecutar(async () => copiarGastosFijos(await obtenerDb(), anterior, mes))}
          title={`Copia los gastos marcados como fijos de ${textoMes(anterior)}`}
        >
          Copiar fijos del mes anterior
        </button>
      </div>

      <form className="form-gasto" onSubmit={guardar}>
        <input
          placeholder="Descripción (ej: alquiler)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <input
          className="monto"
          inputMode="decimal"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <label className="check" title="Se repite todos los meses">
          <input type="checkbox" checked={fijo} onChange={(e) => setFijo(e.target.checked)} />
          Fijo
        </label>
        <button type="submit" className="primario">
          {editando ? "Guardar" : "Agregar"}
        </button>
        {editando && (
          <button type="button" onClick={limpiar}>
            Cancelar
          </button>
        )}
      </form>
      {error && <p className="error">{error}</p>}

      {gastos.length === 0 ? (
        <p className="vacio">No hay gastos cargados en {textoMes(mes).toLowerCase()}.</p>
      ) : (
        <ul className="lista-gastos">
          {gastos.map((g) => (
            <li key={g.id} className={editando?.id === g.id ? "editando" : ""}>
              <button type="button" className="enlace crece" onClick={() => editar(g)} title="Editar">
                {g.descripcion}
                {g.fijo ? <span className="etiqueta">Fijo</span> : null}
              </button>
              <span className="num">{pesos(g.monto)}</span>
              <button
                type="button"
                className="quitar"
                aria-label={`Eliminar ${g.descripcion}`}
                onClick={() => {
                  if (window.confirm(`¿Eliminar "${g.descripcion}"?`))
                    ejecutar(async () => eliminarGasto(await obtenerDb(), g.id));
                }}
              >
                ×
              </button>
            </li>
          ))}
          <li className="total">
            <span className="crece">Total</span>
            <span className="num">{pesos(total)}</span>
            <span className="quitar-espacio" />
          </li>
        </ul>
      )}
    </>
  );
}
