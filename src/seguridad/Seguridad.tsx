import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { obtenerDb } from "../db";
import { guardarConfiguracion, leerConfiguracion } from "../repositorio";
import { cambiarContrasena, MINUTOS_BLOQUEO_POR_DEFECTO, nuevaRecuperacion, problemaContrasena } from "./servicio";
import { textoError } from "../errores";


export async function leerMinutosBloqueo(): Promise<number> {
  const config = await leerConfiguracion(await obtenerDb());
  const n = Number(config.bloqueo_minutos);
  return config.bloqueo_minutos !== undefined && n >= 0 ? n : MINUTOS_BLOQUEO_POR_DEFECTO;
}

export default function Seguridad({ onMinutos }: { onMinutos: (minutos: number) => void }) {
  return (
    <div className="copias">
      <h2>Seguridad</h2>
      <p className="nota">
        Los datos y las copias de seguridad están cifrados con tu contraseña. Junto a las copias se guarda el archivo{" "}
        <code>psigestion-llave.json</code>, que hace falta para abrirlas en otra computadora (también está protegido por
        la contraseña).
      </p>
      <BloqueoAutomatico onMinutos={onMinutos} />
      <CambiarContrasena />
      <NuevaRecuperacion />
      <RegistroErrores />
    </div>
  );
}

function BloqueoAutomatico({ onMinutos }: { onMinutos: (minutos: number) => void }) {
  const [minutos, setMinutos] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    leerMinutosBloqueo().then(setMinutos);
  }, []);

  async function guardar(n: number) {
    await guardarConfiguracion(await obtenerDb(), "bloqueo_minutos", String(n));
    setMinutos(n);
    onMinutos(n);
    setMensaje("Guardado.");
  }

  if (minutos === null) return null;
  return (
    <section className="panel">
      <h3>Bloqueo automático</h3>
      <label className="copias-conservar">
        Bloquear la app después de
        <select value={minutos} onChange={(e) => guardar(Number(e.target.value))}>
          {[5, 10, 15, 30, 60].map((n) => (
            <option key={n} value={n}>
              {n} minutos sin uso
            </option>
          ))}
          <option value={0}>Nunca</option>
        </select>
      </label>
      {mensaje && <p className="nota">{mensaje}</p>}
    </section>
  );
}

function CambiarContrasena() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = problemaContrasena(nueva, repetida);
    if (problema) return setMensaje({ ok: false, texto: problema });
    setOcupado(true);
    try {
      if (await cambiarContrasena(actual, nueva)) {
        setMensaje({ ok: true, texto: "Contraseña cambiada." });
        setActual("");
        setNueva("");
        setRepetida("");
      } else {
        setMensaje({ ok: false, texto: "La contraseña actual no es correcta." });
      }
    } catch (err) {
      setMensaje({ ok: false, texto: textoError(err) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="panel acceso-form" onSubmit={enviar}>
      <h3>Cambiar la contraseña</h3>
      <label>
        Contraseña actual
        <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} />
      </label>
      <label>
        Contraseña nueva
        <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </label>
      <label>
        Repetir contraseña nueva
        <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </label>
      {mensaje && <p className={mensaje.ok ? "nota" : "error"}>{mensaje.texto}</p>}
      <button className="primario" disabled={ocupado || !actual}>
        Cambiar contraseña
      </button>
    </form>
  );
}

function NuevaRecuperacion() {
  const [contrasena, setContrasena] = useState("");
  const [clave, setClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const nueva = await nuevaRecuperacion(contrasena);
      if (nueva) {
        setClave(nueva);
        setContrasena("");
      } else {
        setError("La contraseña no es correcta.");
      }
    } catch (err) {
      setError(textoError(err));
    }
  }

  return (
    <form className="panel acceso-form" onSubmit={enviar}>
      <h3>Clave de recuperación</h3>
      <p className="nota">
        Si perdiste la clave de recuperación, podés generar una nueva. La anterior deja de servir.
      </p>
      {clave ? (
        <>
          <code className="clave-recuperacion">{clave}</code>
          <p className="aviso">Guardala ahora en un lugar seguro: no se va a volver a mostrar.</p>
        </>
      ) : (
        <>
          <label>
            Contraseña actual
            <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button disabled={!contrasena}>Generar clave nueva</button>
        </>
      )}
    </form>
  );
}

function RegistroErrores() {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel">
      <h3>Registro de errores</h3>
      <p className="nota">
        La app guarda los errores en un archivo para poder diagnosticarlos. No incluye datos de pacientes. Si pedís
        ayuda por un problema, podés enviar ese archivo.
      </p>
      <div>
        <button
          onClick={() =>
            invoke("abrir_carpeta_registros").catch((e) => setError(textoError(e, "abrir carpeta de registros")))
          }
        >
          Abrir carpeta de registros
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
