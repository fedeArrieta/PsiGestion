import { FileSpreadsheet, FileText, FolderOpen, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerDb } from "../db";
import { datosReporte, primerMesConDatos, type DatosReporte } from "../repositorio";
import { pesos } from "../formato";
import { textoError } from "../errores";
import { textoMes } from "../finanzas/calculo";
import { alCambiarDatos } from "../papelera/deshacer";
import { GraficoBarras } from "./Graficos";
import {
  etiquetasEje,
  mesCorto,
  mesesDelReporte,
  periodosDisponibles,
  pesosCorto,
  porcentaje,
  totalesDelReporte,
  type Periodo,
} from "./logica";
import { abrirArchivo, exportarExcelReporte, exportarPdfReporte } from "./servicio";

export default function Reportes() {
  const [periodos, setPeriodos] = useState<Periodo[]>(() => periodosDisponibles(new Date(), null));
  const [indice, setIndice] = useState(0);
  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTabla, setVerTabla] = useState(false);
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | null>(null);
  const [exportado, setExportado] = useState<string | null>(null);

  const periodo = periodos[Math.min(indice, periodos.length - 1)];

  const cargar = useCallback(async () => {
    try {
      const db = await obtenerDb();
      const primero = await primerMesConDatos(db);
      setPeriodos(periodosDisponibles(new Date(), primero));
      setDatos(await datosReporte(db, periodo.desde, periodo.hasta));
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar reportes"));
    }
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => alCambiarDatos(cargar), [cargar]);

  const hoy = useMemo(() => new Date(), []);
  const meses = useMemo(() => (datos ? mesesDelReporte(datos, hoy) : []), [datos, hoy]);
  const totales = useMemo(() => (datos ? totalesDelReporte(meses, datos) : null), [datos, meses]);

  async function exportar(tipo: "pdf" | "xlsx") {
    if (!datos || !totales) return;
    setExportando(tipo);
    setExportado(null);
    try {
      const ruta =
        tipo === "pdf"
          ? await exportarPdfReporte(periodo, meses, totales)
          : await exportarExcelReporte(periodo, meses, totales, datos);
      if (ruta) setExportado(ruta);
      setError(null);
    } catch (e) {
      setError(textoError(e, "exportar reporte"));
    } finally {
      setExportando(null);
    }
  }

  async function abrir(enCarpeta: boolean) {
    if (!exportado) return;
    try {
      await abrirArchivo(exportado, enCarpeta);
    } catch (e) {
      setError(textoError(e, "abrir reporte"));
    }
  }

  const etiquetas = etiquetasEje(meses.map((m) => m.mes));
  const enCurso = meses.map((m) => m.en_curso);
  const largas = meses.map((m) => textoMes(m.mes) + (m.en_curso ? " (en curso)" : ""));
  const sinDatos = totales != null && totales.sesiones_realizadas === 0 && totales.gastos === 0 && totales.ausencias === 0;

  return (
    <div className="reportes">
      <div className="barra">
        <label className="selector-periodo">
          <span className="sr-only">Período</span>
          <select value={indice} onChange={(e) => setIndice(Number(e.target.value))}>
            {periodos.map((p, i) => (
              <option key={p.titulo} value={i}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>
        <div className="espaciador" />
        <button onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>
          <Table2 size={16} /> {verTabla ? "Ver gráficos" : "Ver tabla"}
        </button>
        <button onClick={() => exportar("pdf")} disabled={!datos || exportando != null}>
          <FileText size={16} /> {exportando === "pdf" ? "Generando…" : "Exportar PDF"}
        </button>
        <button onClick={() => exportar("xlsx")} disabled={!datos || exportando != null}>
          <FileSpreadsheet size={16} /> {exportando === "xlsx" ? "Generando…" : "Exportar Excel"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {exportado && (
        <div className="aviso-exportado">
          <span>Reporte guardado en {exportado}</span>
          <button className="enlace" onClick={() => abrir(false)}>
            Abrir
          </button>
          <button className="enlace" onClick={() => abrir(true)}>
            <FolderOpen size={14} /> Mostrar en la carpeta
          </button>
          <button className="enlace" onClick={() => setExportado(null)}>
            Cerrar
          </button>
        </div>
      )}

      {totales && (
        <>
          <div className="tarjetas tarjetas-reportes">
            <Tarjeta
              titulo="Ingresos"
              valor={pesos(totales.ingresos)}
              detalle={`${totales.sesiones_realizadas} sesiones${
                totales.ingresos_ausencias > 0 ? ` + ${pesos(totales.ingresos_ausencias)} por ausencias` : ""
              }`}
            />
            <Tarjeta titulo="Gastos" valor={pesos(totales.gastos)} detalle={`Cobrado: ${pesos(totales.cobrado)}`} />
            <Tarjeta
              titulo="Ganancia neta"
              valor={pesos(totales.resultado)}
              detalle="Ingresos menos gastos"
              tono={totales.resultado < 0 ? "negativo" : totales.resultado > 0 ? "positivo" : undefined}
            />
            <Tarjeta
              titulo="Objetivo cumplido"
              valor={totales.meses_con_objetivo ? `${totales.meses_cumplidos} de ${totales.meses_con_objetivo}` : "—"}
              detalle={totales.meses_con_objetivo ? "meses cerrados con objetivo" : "Cargalo en Finanzas"}
            />
            <Tarjeta
              titulo="Tasa de ausencias"
              valor={porcentaje(totales.tasa_ausencias)}
              detalle={`${totales.ausencias} ausencias, ${totales.ausencias_sin_aviso} sin aviso`}
            />
            <Tarjeta
              titulo="Pacientes"
              valor={String(totales.pacientes_periodo)}
              detalle={`${String(totales.promedio_pacientes).replace(".", ",")} por mes en promedio · ${totales.pacientes_nuevos} nuevos`}
            />
          </div>

          {sinDatos && <p className="nota">Todavía no hay sesiones ni gastos en este período.</p>}

          {verTabla ? (
            <div className="tabla-contenedor">
              <table className="tabla tabla-reportes">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Sesiones</th>
                    <th className="num">Ingresos</th>
                    <th className="num">Cobrado</th>
                    <th className="num">Gastos</th>
                    <th className="num">Ganancia neta</th>
                    <th className="num">Objetivo</th>
                    <th className="num">Ausencias</th>
                    <th className="num">Cancelados</th>
                    <th className="num">Pacientes</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr key={m.mes}>
                      <td>
                        {mesTabla(m.mes)}
                        {m.en_curso && <span className="etiqueta-curso">en curso</span>}
                      </td>
                      <td className="num">{m.sesiones_realizadas}</td>
                      <td className="num">{pesos(m.ingresos)}</td>
                      <td className="num">{pesos(m.cobrado)}</td>
                      <td className="num">{pesos(m.gastos)}</td>
                      <td className={`num ${m.resultado < 0 ? "deuda" : ""}`}>{pesos(m.resultado)}</td>
                      <td className="num">
                        {m.objetivo ? pesos(m.objetivo) : "—"}
                        {m.cumplido != null && (
                          <span className={`estado-objetivo ${m.cumplido ? "si" : "no"}`}>{m.cumplido ? "cumplido" : "no"}</span>
                        )}
                      </td>
                      <td className="num">
                        {m.ausencias}
                        {m.tasa_ausencias != null && <span className="suave"> ({porcentaje(m.tasa_ausencias)})</span>}
                      </td>
                      <td className="num">{m.cancelados}</td>
                      <td className="num">
                        {m.pacientes_activos}
                        {m.pacientes_nuevos > 0 && <span className="suave"> (+{m.pacientes_nuevos})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="graficos">
              <section className="panel">
                <h3>Ingresos y gastos</h3>
                <GraficoBarras
                  titulo="Ingresos y gastos por mes"
                  etiquetas={etiquetas}
                  etiquetasLargas={largas}
                  atenuados={enCurso}
                  series={[
                    { nombre: "Ingresos", clase: "serie-1", valores: meses.map((m) => m.ingresos) },
                    { nombre: "Gastos", clase: "serie-2", valores: meses.map((m) => m.gastos) },
                  ]}
                  eje={pesosCorto}
                  valor={pesos}
                  detalle={(i) => [
                    `Cobrado: ${pesos(meses[i].cobrado)}`,
                    ...(meses[i].ingresos_ausencias > 0 ? [`Incluye ${pesos(meses[i].ingresos_ausencias)} por ausencias`] : []),
                  ]}
                />
              </section>
              <section className="panel">
                <h3>Ganancia neta y objetivo</h3>
                <GraficoBarras
                  titulo="Ganancia neta por mes comparada con el objetivo"
                  etiquetas={etiquetas}
                  etiquetasLargas={largas}
                  atenuados={enCurso}
                  series={[{ nombre: "Ganancia neta", clase: "serie-1", valores: meses.map((m) => m.resultado) }]}
                  referencia={{ nombre: "Objetivo", valores: meses.map((m) => (m.objetivo ? m.objetivo : null)) }}
                  eje={pesosCorto}
                  valor={pesos}
                  detalle={(i) =>
                    meses[i].cumplido == null
                      ? []
                      : meses[i].cumplido
                        ? ["Objetivo cumplido"]
                        : [`Faltaron ${pesos((meses[i].objetivo ?? 0) - meses[i].resultado)}`]
                  }
                />
              </section>
              <section className="panel">
                <h3>Tasa de ausencias</h3>
                <GraficoBarras
                  titulo="Porcentaje de ausencias por mes"
                  etiquetas={etiquetas}
                  etiquetasLargas={largas}
                  atenuados={enCurso}
                  series={[{ nombre: "Ausencias", clase: "serie-1", valores: meses.map((m) => m.tasa_ausencias ?? 0) }]}
                  eje={(v) => porcentaje(v)}
                  valor={(v) => porcentaje(v)}
                  maximoMinimo={0.1}
                  detalle={(i) => [
                    `${meses[i].ausencias} ausencias de ${meses[i].ausencias + meses[i].sesiones_realizadas} turnos`,
                    `${meses[i].ausencias_sin_aviso} sin aviso · ${meses[i].cancelados} cancelados`,
                  ]}
                />
                <p className="nota">Ausencias sobre los turnos a los que se esperaba al paciente (realizados y ausencias).</p>
              </section>
              <section className="panel">
                <h3>Pacientes activos</h3>
                <GraficoBarras
                  titulo="Pacientes activos por mes"
                  etiquetas={etiquetas}
                  etiquetasLargas={largas}
                  atenuados={enCurso}
                  series={[{ nombre: "Pacientes activos", clase: "serie-1", valores: meses.map((m) => m.pacientes_activos) }]}
                  eje={(v) => String(v)}
                  valor={(v) => String(v)}
                  maximoMinimo={4}
                  detalle={(i) => (meses[i].pacientes_nuevos ? [`${meses[i].pacientes_nuevos} nuevos`] : [])}
                />
                <p className="nota">Pacientes con al menos una sesión realizada en el mes.</p>
              </section>
            </div>
          )}
          <p className="nota">
            Los reportes y las exportaciones llevan solo números, gastos y recibos: nunca notas ni datos clínicos. Los
            archivos exportados no están cifrados.
          </p>
        </>
      )}
    </div>
  );
}

/** "2026-03" → "Mar 2026" */
function mesTabla(mes: string): string {
  const c = mesCorto(mes);
  return `${c.charAt(0).toUpperCase()}${c.slice(1)} ${mes.slice(0, 4)}`;
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
