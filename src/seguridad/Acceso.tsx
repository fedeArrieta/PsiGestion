import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  configurarContrasena,
  desbloquear,
  importarLlave,
  problemaContrasena,
  recuperarAcceso,
  type EstadoAcceso,
} from "./servicio";
import { textoError } from "../errores";


/** Pantalla que se muestra mientras la app no está desbloqueada. */
export default function Acceso({ estado, onListo }: { estado: EstadoAcceso; onListo: () => void }) {
  const [recuperacion, setRecuperacion] = useState<string | null>(null);
  const [olvido, setOlvido] = useState(false);

  let contenido;
  if (recuperacion) {
    contenido = <MostrarRecuperacion clave={recuperacion} onListo={onListo} />;
  } else if (estado === "sin_configurar") {
    contenido = <CrearContrasena onCreada={setRecuperacion} />;
  } else if (estado === "falta_llave") {
    contenido = <FaltaLlave onListo={onListo} />;
  } else if (olvido) {
    contenido = <Recuperar onListo={onListo} onVolver={() => setOlvido(false)} />;
  } else {
    contenido = <Desbloquear onListo={onListo} onOlvido={() => setOlvido(true)} />;
  }

  return (
    <div className="acceso">
      <div className="acceso-tarjeta">
        <h1 className="marca">PsiGestion</h1>
        {contenido}
      </div>
    </div>
  );
}

function Desbloquear({ onListo, onOlvido }: { onListo: () => void; onOlvido: () => void }) {
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      if (await desbloquear(contrasena)) onListo();
      else setError("La contraseña no es correcta.");
    } catch (err) {
      setError(textoError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="acceso-form">
      <label>
        Contraseña
        <input type="password" autoFocus value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primario" disabled={ocupado || !contrasena}>
        {ocupado ? "Abriendo…" : "Entrar"}
      </button>
      <button type="button" className="enlace" onClick={onOlvido}>
        Olvidé la contraseña
      </button>
    </form>
  );
}

function CrearContrasena({ onCreada }: { onCreada: (recuperacion: string) => void }) {
  const [contrasena, setContrasena] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = problemaContrasena(contrasena, repetida);
    if (problema) return setError(problema);
    setOcupado(true);
    setError(null);
    try {
      onCreada(await configurarContrasena(contrasena));
    } catch (err) {
      setError(textoError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="acceso-form">
      <h2>Creá una contraseña</h2>
      <p className="nota">
        Los datos de tus pacientes se van a guardar cifrados: sin esta contraseña nadie puede abrirlos, ni siquiera
        copiando el archivo. Elegí una que recuerdes, de al menos 8 caracteres.
      </p>
      <label>
        Contraseña
        <input type="password" autoFocus value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </label>
      <label>
        Repetir contraseña
        <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primario" disabled={ocupado}>
        {ocupado ? "Cifrando los datos…" : "Crear contraseña"}
      </button>
    </form>
  );
}

function MostrarRecuperacion({ clave, onListo }: { clave: string; onListo: () => void }) {
  const [guardada, setGuardada] = useState(false);
  const [copiada, setCopiada] = useState(false);

  return (
    <div className="acceso-form">
      <h2>Guardá tu clave de recuperación</h2>
      <p className="nota">
        Si olvidás la contraseña, esta clave es la única forma de recuperar los datos. Anotala en papel o guardala en un
        lugar seguro fuera de esta computadora. No se va a volver a mostrar.
      </p>
      <code className="clave-recuperacion">{clave}</code>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard
            .writeText(clave)
            .then(() => setCopiada(true))
            .catch(() => setCopiada(false))
        }
      >
        {copiada ? "Copiada" : "Copiar"}
      </button>
      <label className="check">
        <input type="checkbox" checked={guardada} onChange={(e) => setGuardada(e.target.checked)} />
        Ya la guardé en un lugar seguro
      </label>
      <button className="primario" disabled={!guardada} onClick={onListo}>
        Continuar
      </button>
    </div>
  );
}

function Recuperar({ onListo, onVolver }: { onListo: () => void; onVolver: () => void }) {
  const [clave, setClave] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = problemaContrasena(contrasena, repetida);
    if (problema) return setError(problema);
    setOcupado(true);
    setError(null);
    try {
      if (await recuperarAcceso(clave, contrasena)) onListo();
      else setError("La clave de recuperación no es correcta.");
    } catch (err) {
      setError(textoError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="acceso-form">
      <h2>Recuperar el acceso</h2>
      <p className="nota">Escribí la clave de recuperación que guardaste al crear la contraseña y elegí una contraseña nueva.</p>
      <label>
        Clave de recuperación
        <input autoFocus value={clave} onChange={(e) => setClave(e.target.value)} placeholder="ABCD-EFGH-…" />
      </label>
      <label>
        Contraseña nueva
        <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </label>
      <label>
        Repetir contraseña nueva
        <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primario" disabled={ocupado || !clave}>
        {ocupado ? "Verificando…" : "Recuperar"}
      </button>
      <button type="button" className="enlace" onClick={onVolver}>
        Volver
      </button>
    </form>
  );
}

function FaltaLlave({ onListo }: { onListo: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const ruta = await open({
      title: "Archivo psigestion-llave.json",
      filters: [{ name: "Llave de PsiGestion", extensions: ["json"] }],
    });
    if (typeof ruta !== "string") return;
    try {
      await importarLlave(ruta);
      onListo();
    } catch (err) {
      setError(textoError(err));
    }
  }

  return (
    <div className="acceso-form">
      <h2>Falta el archivo de la llave</h2>
      <p className="nota">
        Los datos están cifrados, pero en esta computadora no está el archivo que permite abrirlos con tu contraseña. Lo
        encontrás en la carpeta de copias de seguridad, con el nombre <code>psigestion-llave.json</code>.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="primario" onClick={buscar}>
        Buscar el archivo…
      </button>
    </div>
  );
}
