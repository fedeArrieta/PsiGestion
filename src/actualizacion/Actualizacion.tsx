import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { textoError } from "../errores";
import { leerNovedades } from "./logica";
import {
  buscarActualizacion,
  changelog,
  guardarBusquedaAutomatica,
  instalarActualizacion,
  leerPreferenciasActualizacion,
  omitirVersion,
  posponerAviso,
} from "./servicio";

/** Barra discreta arriba del contenido (no tapa formularios ni bloquea el uso). */
export function AvisoActualizacion({ update, onCerrar }: { update: Update; onCerrar: () => void }) {
  const [estado, setEstado] = useState<{ tipo: "listo" } | { tipo: "instalando"; porcentaje: number | null } | { tipo: "error"; texto: string }>({
    tipo: "listo",
  });
  const [verNotas, setVerNotas] = useState(false);

  async function actualizar() {
    if (!window.confirm(`¿Instalar la versión ${update.version}?\n\nAntes se hace una copia de seguridad. La app se cierra y se vuelve a abrir sola.`))
      return;
    setEstado({ tipo: "instalando", porcentaje: null });
    try {
      await instalarActualizacion(update, (porcentaje) => setEstado({ tipo: "instalando", porcentaje }));
    } catch (e) {
      setEstado({ tipo: "error", texto: textoError(e, "instalar actualización") });
    }
  }

  const instalando = estado.tipo === "instalando";
  return (
    <div className="aviso-actualizacion" role="status">
      <div className="aviso-actualizacion-fila">
        <span>
          <strong>Hay una versión nueva: {update.version}.</strong> Tenés la {update.currentVersion}.
          {update.body && (
            <button className="enlace" onClick={() => setVerNotas((v) => !v)}>
              {verNotas ? "Ocultar novedades" : "Ver novedades"}
            </button>
          )}
        </span>
        <span className="acciones">
          <button className="primario" disabled={instalando} onClick={actualizar}>
            {instalando
              ? estado.porcentaje === null
                ? "Preparando…"
                : `Descargando ${estado.porcentaje}%`
              : "Actualizar ahora"}
          </button>
          <button disabled={instalando} onClick={() => posponerAviso().finally(onCerrar)}>
            Recordarme más tarde
          </button>
          <button disabled={instalando} onClick={() => omitirVersion(update.version).finally(onCerrar)}>
            Omitir esta versión
          </button>
        </span>
      </div>
      {verNotas && update.body && <pre className="notas-version">{update.body}</pre>}
      {estado.tipo === "error" && <p className="error">No se pudo actualizar: {estado.texto}</p>}
    </div>
  );
}

/** Sección "Versión y novedades": versión instalada, novedades y opciones de actualización. */
export default function VersionYNovedades({ version, onActualizacion }: { version: string; onActualizacion: (u: Update) => void }) {
  const versiones = useMemo(() => leerNovedades(changelog), []);
  const [automatica, setAutomatica] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    leerPreferenciasActualizacion()
      .then((p) => setAutomatica(p.automatica))
      .catch(() => setAutomatica(true));
  }, []);

  async function buscar() {
    setBuscando(true);
    setMensaje(null);
    try {
      const u = await buscarActualizacion(true);
      if (u) {
        onActualizacion(u);
        setMensaje({ ok: true, texto: `Hay una versión nueva: ${u.version}. El aviso está arriba.` });
      } else {
        setMensaje({ ok: true, texto: "Tenés la última versión." });
      }
    } catch (e) {
      setMensaje({ ok: false, texto: `No se pudo consultar (¿hay internet?): ${textoError(e, "buscar actualizaciones")}` });
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="copias">
      <h2>Versión y novedades</h2>
      <section className="panel">
        <h3>PsiGestion {version}</h3>
        <label className="copias-conservar">
          <input
            type="checkbox"
            checked={automatica ?? true}
            disabled={automatica === null}
            onChange={(e) => {
              setAutomatica(e.target.checked);
              guardarBusquedaAutomatica(e.target.checked).catch(() => {});
            }}
          />
          Buscar actualizaciones automáticamente
        </label>
        <p className="nota">
          La consulta solo pide a GitHub el número de la última versión: no envía datos de pacientes ni de uso. Sin
          internet, la app funciona igual.
        </p>
        <div>
          <button className="primario" disabled={buscando} onClick={buscar}>
            {buscando ? "Buscando…" : "Buscar actualizaciones"}
          </button>
        </div>
        {mensaje && <p className={mensaje.ok ? "nota" : "error"}>{mensaje.texto}</p>}
      </section>
      {versiones.map((v) => (
        <section className="panel novedades" key={v.version}>
          <h3>
            Versión {v.version}
            {v.fecha && <span className="nota"> · {v.fecha}</span>}
          </h3>
          <ListaNovedades lineas={v.lineas} />
        </section>
      ))}
    </div>
  );
}

function ListaNovedades({ lineas }: { lineas: { tipo: "titulo" | "punto" | "texto"; texto: string }[] }) {
  const bloques: ReactNode[] = [];
  let puntos: string[] = [];
  const cerrar = () => {
    if (puntos.length) bloques.push(<ul key={bloques.length}>{puntos.map((p) => <li key={p}>{p}</li>)}</ul>);
    puntos = [];
  };
  for (const l of lineas) {
    if (l.tipo === "punto") {
      puntos.push(l.texto);
      continue;
    }
    cerrar();
    bloques.push(l.tipo === "titulo" ? <h4 key={bloques.length}>{l.texto}</h4> : <p key={bloques.length}>{l.texto}</p>);
  }
  cerrar();
  return <>{bloques}</>;
}
