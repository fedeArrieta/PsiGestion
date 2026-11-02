import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { obtenerDb } from "../db";
import { guardarConfiguracion, leerConfiguracion, proximoNumeroRecibo } from "../repositorio";
import type { Emisor, Recibo } from "../tipos";
import { textoError } from "../errores";
import { aFechaIso } from "../fechas";
import {
  CLAVE_CONCEPTO,
  CLAVE_PROXIMO_NUMERO,
  CLAVES_EMISOR,
  CONCEPTO_POR_DEFECTO,
  conceptoDeTurno,
  leerConcepto,
  leerEmisor,
} from "./logica";
import { carpetaRecibos, elegirCarpetaRecibos, verPdf } from "./servicio";
import ListaRecibos from "./ListaRecibos";

const CAMPOS: { campo: keyof Emisor; titulo: string; ayuda?: string; ejemplo?: string }[] = [
  { campo: "nombre", titulo: "Nombre y apellido", ejemplo: "Lic. María Martínez" },
  { campo: "titulo", titulo: "Profesión o título", ejemplo: "Licenciada en Psicología" },
  { campo: "matricula", titulo: "Matrícula", ejemplo: "MN 12345" },
  { campo: "cuit", titulo: "CUIT", ejemplo: "27-12345678-9" },
  { campo: "domicilio", titulo: "Domicilio del consultorio", ejemplo: "Av. Siempreviva 742, CABA" },
  { campo: "telefono", titulo: "Teléfono" },
  { campo: "email", titulo: "Email" },
];

/** Configuración → Recibos: datos del profesional, numeración, carpeta y recibos emitidos. */
export default function ConfigRecibos() {
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [concepto, setConcepto] = useState("");
  const [proximo, setProximo] = useState<number | null>(null);
  const [numeroInicial, setNumeroInicial] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const db = await obtenerDb();
    const config = await leerConfiguracion(db);
    setEmisor(leerEmisor(config));
    setConcepto(leerConcepto(config));
    const n = await proximoNumeroRecibo(db);
    setProximo(n);
    setNumeroInicial(String(n));
    setCarpeta(await carpetaRecibos().catch(() => ""));
  }

  useEffect(() => {
    cargar().catch((e) => setError(textoError(e, "leer configuración de recibos")));
  }, []);

  async function ejecutar(accion: () => Promise<string | void>) {
    setError(null);
    setMensaje(null);
    setOcupado(true);
    try {
      const m = await accion();
      if (m) setMensaje(m);
    } catch (e) {
      setError(textoError(e, "configuración de recibos"));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emisor) return;
    const n = Number(numeroInicial);
    if (!Number.isInteger(n) || n < 1) return setError("El próximo número tiene que ser un número entero mayor que cero.");
    if (proximo != null && n < proximo) {
      return setError(`El próximo número no puede ser menor que ${proximo}: ya hay recibos emitidos hasta el ${proximo - 1}.`);
    }
    return ejecutar(async () => {
      const db = await obtenerDb();
      for (const c of Object.keys(CLAVES_EMISOR) as (keyof Emisor)[]) {
        // La leyenda se guarda aunque quede vacía, para poder sacarla del recibo.
        const valor = emisor[c].trim();
        await guardarConfiguracion(db, CLAVES_EMISOR[c], c === "leyenda" ? valor : valor || null);
      }
      await guardarConfiguracion(db, CLAVE_CONCEPTO, concepto.trim() || null);
      await guardarConfiguracion(db, CLAVE_PROXIMO_NUMERO, String(n));
      await cargar();
      return "Guardado. Se usa en los próximos recibos; los ya emitidos no cambian.";
    });
  };

  const verEjemplo = () =>
    ejecutar(async () => {
      if (!emisor) return;
      const hoy = aFechaIso(new Date());
      const ejemplo: Recibo = {
        id: 0,
        numero: Number(numeroInicial) || proximo || 1,
        fecha: hoy,
        paciente_id: 0,
        paciente_nombre: "Paciente de ejemplo",
        paciente_documento: "30.123.456",
        total: 50000,
        medio_pago: "Transferencia",
        items: [
          { turno_id: null, fecha: hoy, concepto: conceptoDeTurno({ estado: "realizado" }, concepto.trim() || CONCEPTO_POR_DEFECTO), importe: 25000 },
          { turno_id: null, fecha: hoy, concepto: conceptoDeTurno({ estado: "ausente" }, concepto.trim() || CONCEPTO_POR_DEFECTO), importe: 25000 },
        ],
        emisor: { ...emisor, nombre: emisor.nombre.trim() || "Tu nombre" },
        anulado_en: null,
        motivo_anulacion: null,
        creado_en: new Date().toISOString(),
      };
      await verPdf(ejemplo, true);
    });

  const cambiarCarpeta = () =>
    ejecutar(async () => {
      const elegida = await open({ directory: true, title: "Carpeta para los recibos", defaultPath: carpeta || undefined });
      if (typeof elegida !== "string") return;
      await elegirCarpetaRecibos(elegida);
      setCarpeta(elegida);
      return "Los próximos recibos se guardan en la carpeta nueva.";
    });

  const campo = (k: keyof Emisor, titulo: string, ejemplo?: string) =>
    emisor && (
      <label key={k} className="crece">
        {titulo}
        <input value={emisor[k]} placeholder={ejemplo} onChange={(e) => setEmisor({ ...emisor, [k]: e.target.value })} />
      </label>
    );

  return (
    <div className="copias config-recibos">
      <h2>Recibos</h2>
      <p className="nota">
        Cuando registrás un pago en la ficha del paciente, podés emitir un recibo en PDF para entregarlo o enviarlo.
        Es un comprobante de pago, no una factura. Lleva tus datos, el nombre del paciente, las fechas de las sesiones
        y los importes: nunca notas ni datos clínicos.
      </p>
      {error && <p className="error">{error}</p>}
      {emisor && (
        <form className="panel" onSubmit={guardar}>
          <h3>Tus datos en el recibo</h3>
          <div className="campos-recibo">
            {CAMPOS.map((c) => campo(c.campo, c.titulo, c.ejemplo))}
            <label className="crece">
              Concepto de cada sesión
              <input value={concepto} placeholder={CONCEPTO_POR_DEFECTO} onChange={(e) => setConcepto(e.target.value)} />
            </label>
            <label className="crece">
              Próximo número de recibo
              <input
                type="number"
                min={proximo ?? 1}
                step={1}
                value={numeroInicial}
                onChange={(e) => setNumeroInicial(e.target.value)}
              />
            </label>
          </div>
          <label>
            Texto al pie
            <input value={emisor.leyenda} onChange={(e) => setEmisor({ ...emisor, leyenda: e.target.value })} />
          </label>
          <small className="nota">
            {!emisor.nombre.trim() && "El nombre es obligatorio para emitir recibos. "}
            Si ya venías usando un talonario, poné en "Próximo número" el que sigue: si el último fue el 150, poné 151.
          </small>
          {mensaje && <p className="nota">{mensaje}</p>}
          <div className="acciones">
            <button type="button" onClick={verEjemplo} disabled={ocupado}>
              Ver recibo de ejemplo
            </button>
            <span className="crece" />
            <button type="submit" className="primario" disabled={ocupado}>
              Guardar
            </button>
          </div>
        </form>
      )}

      <section className="panel">
        <h3>Carpeta de los PDF</h3>
        <div className="copias-carpeta">
          <code>{carpeta || "—"}</code>
          <button disabled={ocupado} onClick={cambiarCarpeta}>
            Cambiar…
          </button>
        </div>
        <p className="nota">
          Los PDF no están cifrados: cualquiera que tenga el archivo puede leerlo. Si los borrás, se pueden volver a
          generar desde la lista de recibos.
        </p>
      </section>

      <section className="panel">
        <h3>Recibos emitidos</h3>
        <ListaRecibos pacienteId={null} />
      </section>
    </div>
  );
}
