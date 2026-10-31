import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  guardarCarpeta,
  guardarConservar,
  hacerCopia,
  leerConfigCopias,
  listarCopias,
  restaurarCopia,
  type ConfigCopias,
} from "./servicio";
import { copiaAtrasada, diasSinCopia, leerNombreCopia, tamanoTexto, TEXTO_TIPO, type ArchivoCopia } from "./logica";

const fmtFecha = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

export default function Copias({ onCambio }: { onCambio: () => void }) {
  const [config, setConfig] = useState<ConfigCopias | null>(null);
  const [copias, setCopias] = useState<ArchivoCopia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const c = await leerConfigCopias();
      setConfig(c);
      setCopias(await listarCopias(c.carpeta));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion: () => Promise<string | void>) {
    setOcupado(true);
    setMensaje(null);
    try {
      const m = await accion();
      if (m) setMensaje(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
      await cargar();
      onCambio();
    }
  }

  async function elegirCarpeta() {
    const carpeta = await open({ directory: true, title: "Carpeta para las copias de seguridad", defaultPath: config?.carpeta });
    if (typeof carpeta === "string") {
      await ejecutar(async () => {
        await guardarCarpeta(carpeta);
        return "Carpeta guardada. Las próximas copias se van a guardar ahí.";
      });
    }
  }

  function restaurar(copia: ArchivoCopia) {
    const info = leerNombreCopia(copia.nombre);
    const fecha = info ? fmtFecha.format(info.fecha) : copia.nombre;
    const confirmado = window.confirm(
      `¿Restaurar la copia del ${fecha}?\n\n` +
        "Se reemplazan todos los datos actuales por los de esa copia y la app se reinicia. " +
        "Antes se guarda una copia del estado actual, por si necesitás volver atrás.",
    );
    if (confirmado) ejecutar(() => restaurarCopia(copia.ruta));
  }

  if (!config) return <div className="copias">{error && <p className="error">{error}</p>}</div>;

  const dias = diasSinCopia(config.ultima, new Date());

  return (
    <div className="copias">
      <h2>Copias de seguridad</h2>

      <section className="panel">
        <div className="copias-estado">
          <div>
            <strong>
              {config.ultima ? `Última copia: ${fmtFecha.format(config.ultima)}` : "Todavía no se hizo ninguna copia"}
            </strong>
            <p className="nota">
              La app hace una copia automática al abrirse, como máximo una vez por día, y conserva las últimas{" "}
              {config.conservar} automáticas. Las manuales no se borran solas.
            </p>
          </div>
          <button className="primario" disabled={ocupado} onClick={() => ejecutar(async () => {
            await hacerCopia("manual");
            return "Copia hecha.";
          })}>
            Hacer copia ahora
          </button>
        </div>
        {config.error && <p className="aviso">No se pudo hacer la última copia automática: {config.error}</p>}
        {!config.error && copiaAtrasada(config.ultima, new Date()) && dias !== null && (
          <p className="aviso">Hace {dias} días que no se hace una copia.</p>
        )}
        {mensaje && <p className="nota">{mensaje}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h3>Dónde se guardan</h3>
        <div className="copias-carpeta">
          <code>{config.carpeta}</code>
          <button disabled={ocupado} onClick={elegirCarpeta}>
            Cambiar carpeta…
          </button>
        </div>
        <p className="nota">
          Para que las copias sirvan si se rompe la computadora, elegí una carpeta sincronizada con la nube (OneDrive,
          Google Drive) o un disco externo.
        </p>
        <label className="copias-conservar">
          Copias automáticas a conservar
          <input
            type="number"
            min={1}
            max={365}
            defaultValue={config.conservar}
            key={config.conservar}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n !== config.conservar) ejecutar(() => guardarConservar(n));
            }}
          />
        </label>
      </section>

      <section className="panel">
        <h3>Copias guardadas</h3>
        {copias.length === 0 ? (
          <p className="vacio">No hay copias en esta carpeta.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="num">Tamaño</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {copias.map((c) => {
                  const info = leerNombreCopia(c.nombre);
                  return (
                    <tr key={c.ruta}>
                      <td>{fmtFecha.format(info?.fecha ?? new Date(c.modificada))}</td>
                      <td>{info ? TEXTO_TIPO[info.tipo] : "Otra"}</td>
                      <td className="num">{tamanoTexto(c.bytes)}</td>
                      <td className="num">
                        <button disabled={ocupado} onClick={() => restaurar(c)}>
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
