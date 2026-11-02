// Gráficos de barras en SVG, sin librerías externas (la CSP no permite recursos de afuera).
// Barras finas con el extremo redondeado, grilla suave, un solo eje y tooltip al pasar el mouse.

import { useEffect, useRef, useState } from "react";
import { escalaEje } from "./logica";

export interface Serie {
  nombre: string;
  /** Clase CSS que da el color (serie-1, serie-2). */
  clase: string;
  valores: number[];
}

export interface Referencia {
  nombre: string;
  /** Valor de referencia de cada mes (por ejemplo el objetivo). null = no hay. */
  valores: (number | null)[];
}

interface Props {
  titulo: string;
  etiquetas: string[];
  /** Texto largo de cada mes para el tooltip ("Marzo 2026"). */
  etiquetasLargas: string[];
  series: Serie[];
  referencia?: Referencia;
  /** Formato de los valores en el eje y en el tooltip. */
  eje: (n: number) => string;
  valor: (n: number) => string;
  /** Renglones extra del tooltip para el mes i. */
  detalle?: (i: number) => string[];
  /** Máximo mínimo del eje (por ejemplo 1 para porcentajes chicos). */
  maximoMinimo?: number;
  /** Meses que se muestran más claros (el mes en curso, que todavía puede cambiar). */
  atenuados?: boolean[];
}

const ALTO = 220;
const M = { arriba: 12, abajo: 26, izquierda: 64, derecha: 8 };

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Barra con el extremo de datos redondeado (4px) y el lado de la base recto. */
function barra(x: number, y0: number, y1: number, ancho: number): string {
  const alto = Math.abs(y1 - y0);
  const r = Math.min(4, ancho / 2, alto);
  if (y1 <= y0) {
    // Hacia arriba
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 - r} V${y0} Z`;
}

export function GraficoBarras(p: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);

  const todos = [...p.series.flatMap((s) => s.valores), ...(p.referencia?.valores.filter((v): v is number => v != null) ?? [])];
  const { min, max, pasos } = escalaEje(Math.max(p.maximoMinimo ?? 0, ...todos, 0), Math.min(0, ...todos));
  const interior = { x: M.izquierda, y: M.arriba, ancho: ancho - M.izquierda - M.derecha, alto: ALTO - M.arriba - M.abajo };
  const aY = (v: number) => interior.y + interior.alto - ((v - min) / (max - min || 1)) * interior.alto;
  const n = p.etiquetas.length;
  const banda = interior.ancho / Math.max(n, 1);
  const hueco = 2;
  const anchoBarra = Math.max(3, Math.min(18, (banda * 0.7 - hueco * (p.series.length - 1)) / p.series.length));
  const grupo = anchoBarra * p.series.length + hueco * (p.series.length - 1);
  // Con muchas columnas se muestra una etiqueta de mes cada dos.
  const saltoEtiqueta = banda < 34 ? 2 : 1;

  // El tooltip va al costado de la columna, para no tapar las barras.
  const aLaDerecha = activo != null && interior.x + banda * (activo + 0.5) < ancho / 2;
  const tooltipX = activo == null ? 0 : aLaDerecha ? interior.x + banda * (activo + 1) + 6 : interior.x + banda * activo - 6;

  return (
    <div className="grafico">
      {(p.series.length > 1 || p.referencia) && (
        <div className="grafico-leyenda" aria-hidden="true">
          {p.series.map((s) => (
            <span key={s.nombre}>
              <i className={`muestra ${s.clase}`} />
              {s.nombre}
            </span>
          ))}
          {p.referencia && (
            <span>
              <i className="muestra referencia" />
              {p.referencia.nombre}
            </span>
          )}
        </div>
      )}
      <div className="grafico-lienzo" ref={ref} onMouseLeave={() => setActivo(null)}>
        <svg width={ancho} height={ALTO} role="img" aria-label={p.titulo}>
          {pasos.map((v) => (
            <g key={v}>
              <line
                x1={interior.x}
                x2={interior.x + interior.ancho}
                y1={aY(v)}
                y2={aY(v)}
                className={v === 0 ? "eje-base" : "eje-grilla"}
              />
              <text x={interior.x - 8} y={aY(v)} dy="0.32em" textAnchor="end" className="eje-texto">
                {p.eje(v)}
              </text>
            </g>
          ))}
          {p.etiquetas.map((e, i) => (
            <g key={i}>
              {activo === i && (
                <rect className="banda-activa" x={interior.x + banda * i} y={interior.y} width={banda} height={interior.alto} />
              )}
              {p.series.map((s, j) => {
                const v = s.valores[i] ?? 0;
                if (!v) return null;
                const x = interior.x + banda * (i + 0.5) - grupo / 2 + j * (anchoBarra + hueco);
                return (
                  <path
                    key={s.nombre}
                    className={`marca ${s.clase}${p.atenuados?.[i] ? " atenuada" : ""}`}
                    d={barra(x, aY(0), aY(v), anchoBarra)}
                  />
                );
              })}
              {p.referencia?.valores[i] != null && (
                <line
                  className="marca-referencia"
                  x1={interior.x + banda * i + banda * 0.12}
                  x2={interior.x + banda * (i + 1) - banda * 0.12}
                  y1={aY(p.referencia.valores[i]!)}
                  y2={aY(p.referencia.valores[i]!)}
                />
              )}
              {i % saltoEtiqueta === 0 && (
                <text x={interior.x + banda * (i + 0.5)} y={ALTO - 8} textAnchor="middle" className="eje-texto">
                  {e}
                </text>
              )}
              {/* Zona de hover: toda la columna del mes, más grande que la barra. */}
              <rect
                className="zona-hover"
                x={interior.x + banda * i}
                y={0}
                width={banda}
                height={ALTO}
                onMouseEnter={() => setActivo(i)}
              />
            </g>
          ))}
        </svg>
        {activo != null && (
          <div
            className="grafico-tooltip"
            style={aLaDerecha ? { left: tooltipX, top: 4 } : { right: ancho - tooltipX, top: 4 }}
          >
            <strong>{p.etiquetasLargas[activo]}</strong>
            {p.series.map((s) => (
              <span key={s.nombre}>
                <i className={`muestra ${s.clase}`} />
                {s.nombre}: <b>{p.valor(s.valores[activo] ?? 0)}</b>
              </span>
            ))}
            {p.referencia && (
              <span>
                <i className="muestra referencia" />
                {p.referencia.nombre}:{" "}
                <b>{p.referencia.valores[activo] != null ? p.valor(p.referencia.valores[activo]!) : "sin cargar"}</b>
              </span>
            )}
            {p.detalle?.(activo).map((d) => (
              <span key={d} className="tooltip-detalle">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
