import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Mail, MessageCircle, RotateCcw, Undo2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { obtenerDb } from "../db";
import {
  guardarPlantillaRecordatorio,
  leerConfiguracion,
  leerPlantillaRecordatorio,
  listarParaRecordatorios,
  marcarRecordatorio,
} from "../repositorio";
import { aFechaIso, aIsoLocal, horaTexto, inicioDelDia, sumarDias, textoDiaLargo } from "../fechas";
import { textoError } from "../errores";
import { alCambiarDatos, avisarDatosCambiados } from "../papelera/deshacer";
import { iniciales } from "../inicio/logica";
import {
  ASUNTO_POR_DEFECTO,
  completarPlantilla,
  emailValido,
  enlaceMail,
  enlaceWhatsApp,
  MENSAJE_POR_DEFECTO,
  telefonoWhatsApp,
  VARIABLES,
  type PlantillaRecordatorio,
  type TurnoParaRecordatorio,
} from "./logica";

const CLAVE_NOMBRE = "nombre_profesional";

/** Recordatorios: arma el mensaje de cada turno del día y lo abre listo para mandar por WhatsApp o mail. */
export default function Recordatorios() {
  const [dia, setDia] = useState(() => sumarDias(inicioDelDia(new Date()), 1));
  const [turnos, setTurnos] = useState<TurnoParaRecordatorio[] | null>(null);
  const [guardada, setGuardada] = useState<PlantillaRecordatorio | null>(null);
  const [borrador, setBorrador] = useState<PlantillaRecordatorio | null>(null);
  const [profesional, setProfesional] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fecha = aFechaIso(dia);

  const cargar = useCallback(async () => {
    try {
      setTurnos(await listarParaRecordatorios(await obtenerDb(), fecha));
      setError(null);
    } catch (e) {
      setError(textoError(e, "cargar recordatorios"));
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => alCambiarDatos(cargar), [cargar]);

  useEffect(() => {
    (async () => {
      const db = await obtenerDb();
      const p = await leerPlantillaRecordatorio(db);
      setGuardada(p);
      setBorrador(p);
      setProfesional((await leerConfiguracion(db))[CLAVE_NOMBRE] ?? "");
    })().catch((e) => setError(textoError(e, "leer plantilla de recordatorio")));
  }, []);

  const hoy = new Date();
  const plantilla = borrador ?? guardada;
  const mensajeDe = (t: TurnoParaRecordatorio, texto = plantilla?.mensaje ?? MENSAJE_POR_DEFECTO) =>
    completarPlantilla(texto, { pacienteNombre: t.paciente_nombre, inicio: t.inicio, profesional, hoy });

  async function marcar(t: TurnoParaRecordatorio, enviado: boolean) {
    try {
      await marcarRecordatorio(await obtenerDb(), t.id, enviado ? aIsoLocal(new Date()) : null);
      avisarDatosCambiados();
    } catch (e) {
      setError(textoError(e, "marcar recordatorio"));
    }
  }

  async function enviar(t: TurnoParaRecordatorio, medio: "whatsapp" | "mail") {
    const texto = mensajeDe(t);
    const telefono = telefonoWhatsApp(t.telefono);
    const url =
      medio === "whatsapp"
        ? telefono && enlaceWhatsApp(telefono, texto)
        : emailValido(t.email) && t.email && enlaceMail(t.email, mensajeDe(t, plantilla?.asunto ?? ASUNTO_POR_DEFECTO), texto);
    if (!url) return;
    try {
      await openUrl(url);
      await marcar(t, true);
      setAviso(
        medio === "whatsapp"
          ? "Se abrió WhatsApp con el mensaje escrito: revisalo y tocá Enviar."
          : "Se abrió tu programa de correo con el mail escrito: revisalo y envialo.",
      );
    } catch (e) {
      setError(textoError(e, medio === "whatsapp" ? "abrir WhatsApp" : "abrir el correo"));
    }
  }

  async function copiar(t: TurnoParaRecordatorio) {
    try {
      await navigator.clipboard.writeText(mensajeDe(t));
      setCopiado(t.id);
      window.setTimeout(() => setCopiado((c) => (c === t.id ? null : c)), 2000);
    } catch (e) {
      setError(textoError(e, "copiar mensaje"));
    }
  }

  async function guardarPlantilla() {
    if (!borrador) return;
    try {
      await guardarPlantillaRecordatorio(await obtenerDb(), borrador);
      const p = await leerPlantillaRecordatorio(await obtenerDb());
      setGuardada(p);
      setBorrador(p);
      setAviso("Mensaje guardado.");
      setError(null);
    } catch (e) {
      setError(textoError(e, "guardar plantilla de recordatorio"));
    }
  }

  function insertarVariable(clave: string) {
    if (!borrador) return;
    const el = textarea.current;
    const marca = `{${clave}}`;
    const desde = el?.selectionStart ?? borrador.mensaje.length;
    const hasta = el?.selectionEnd ?? desde;
    setBorrador({ ...borrador, mensaje: borrador.mensaje.slice(0, desde) + marca + borrador.mensaje.slice(hasta) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(desde + marca.length, desde + marca.length);
    });
  }

  const sinGuardar = !!borrador && !!guardada && (borrador.mensaje !== guardada.mensaje || borrador.asunto !== guardada.asunto);
  const enviados = turnos?.filter((t) => t.recordatorio_en).length ?? 0;
  const ejemplo = useMemo<TurnoParaRecordatorio>(
    () => ({
      id: 0,
      paciente_id: 0,
      inicio: `${aFechaIso(sumarDias(inicioDelDia(new Date()), 1))}T15:00`,
      duracion_min: 50,
      recordatorio_en: null,
      paciente_nombre: "Ana López",
      telefono: null,
      email: null,
    }),
    [],
  );

  return (
    <div className="recordatorios">
      <div className="barra">
        <button onClick={() => setDia(sumarDias(inicioDelDia(new Date()), 1))}>Mañana</button>
        <button className="icono-solo" aria-label="Día anterior" onClick={() => setDia(sumarDias(dia, -1))}>
          <ChevronLeft size={18} />
        </button>
        <button className="icono-solo" aria-label="Día siguiente" onClick={() => setDia(sumarDias(dia, 1))}>
          <ChevronRight size={18} />
        </button>
        <h2 className="titulo-agenda">Recordatorios del {textoDiaLargo(dia)}</h2>
      </div>
      <p className="nota">
        Para cada turno, la app escribe el mensaje y lo abre en WhatsApp o en tu correo: solo tenés que revisarlo y
        enviarlo. Los mensajes llevan solo el nombre, el día y la hora, nunca datos clínicos. Los turnos cancelados o
        con ausencia avisada no aparecen.
      </p>
      {error && <p className="error">{error}</p>}
      {aviso && <p className="aviso-ok">{aviso}</p>}

      <div className="recordatorios-columnas">
        <section className="panel">
          <div className="panel-cabecera">
            <h3>Turnos</h3>
            {turnos && turnos.length > 0 && (
              <span className={enviados === turnos.length ? "chip ok" : "chip pendiente"}>
                {enviados} de {turnos.length} enviados
              </span>
            )}
          </div>
          {turnos && turnos.length === 0 && <p className="nota">No hay turnos programados para este día.</p>}
          <ul className="lista-recordatorios">
            {turnos?.map((t) => {
              const telefono = telefonoWhatsApp(t.telefono);
              const conMail = emailValido(t.email);
              return (
                <li key={t.id} className={t.recordatorio_en ? "recordatorio enviado" : "recordatorio"}>
                  <div className="recordatorio-cabecera">
                    <span className="avatar">{iniciales(t.paciente_nombre)}</span>
                    <span className="recordatorio-paciente">
                      <strong>{t.paciente_nombre}</strong>
                      <span>
                        {horaTexto(t.inicio)} hs
                        {t.telefono ? ` · ${t.telefono}` : ""}
                        {t.email ? ` · ${t.email}` : ""}
                      </span>
                    </span>
                    {t.recordatorio_en ? (
                      <span className="chip ok" title={`Enviado el ${t.recordatorio_en.replace("T", " a las ")}`}>
                        <Check size={14} /> Enviado {horaTexto(t.recordatorio_en)}
                      </span>
                    ) : (
                      <span className="chip pendiente">Sin enviar</span>
                    )}
                  </div>
                  <p className="recordatorio-texto">{mensajeDe(t)}</p>
                  {!t.telefono && !t.email && (
                    <p className="nota">Sin teléfono ni mail: cargalos en la ficha del paciente (Pacientes).</p>
                  )}
                  {t.telefono && !telefono && (
                    <p className="nota">
                      Para WhatsApp el teléfono tiene que tener la característica (ej.: 11 1234-5678 o 351 123-4567).
                      Corregilo en la ficha del paciente.
                    </p>
                  )}
                  {t.email && !conMail && <p className="nota">El mail del paciente no parece válido.</p>}
                  <div className="recordatorio-acciones">
                    <button className="primario" disabled={!telefono} onClick={() => enviar(t, "whatsapp")}>
                      <MessageCircle size={17} className="icono" /> WhatsApp
                    </button>
                    <button className="secundario" disabled={!conMail} onClick={() => enviar(t, "mail")}>
                      <Mail size={17} className="icono" /> Mail
                    </button>
                    <button onClick={() => copiar(t)} title="Copiar el mensaje para pegarlo donde quieras">
                      <Copy size={17} className="icono" /> {copiado === t.id ? "Copiado" : "Copiar"}
                    </button>
                    <span className="crece" />
                    {t.recordatorio_en ? (
                      <button className="enlace" onClick={() => marcar(t, false)}>
                        <Undo2 size={14} /> Marcar como no enviado
                      </button>
                    ) : (
                      <button className="enlace" onClick={() => marcar(t, true)}>
                        <Check size={14} /> Marcar como enviado
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {borrador && (
          <section className="panel recordatorio-plantilla">
            <h3>Mensaje</h3>
            <label className="campo">
              Texto
              <textarea
                ref={textarea}
                rows={6}
                value={borrador.mensaje}
                onChange={(e) => setBorrador({ ...borrador, mensaje: e.target.value })}
              />
            </label>
            <div className="variables">
              {VARIABLES.map((v) => (
                <button key={v.clave} className="chip" title={v.descripcion} onClick={() => insertarVariable(v.clave)}>
                  {`{${v.clave}}`}
                </button>
              ))}
            </div>
            <label className="campo">
              Asunto del mail
              <input value={borrador.asunto} onChange={(e) => setBorrador({ ...borrador, asunto: e.target.value })} />
            </label>
            <div>
              <span className="nota">Así se ve:</span>
              <p className="recordatorio-texto">{mensajeDe(ejemplo, borrador.mensaje)}</p>
            </div>
            {!profesional && borrador.mensaje.includes("{profesional}") && (
              <p className="nota">Para firmar con tu nombre, cargalo en Inicio (el lápiz al lado del saludo).</p>
            )}
            <div className="acciones">
              <button
                className="enlace"
                onClick={() => setBorrador({ mensaje: MENSAJE_POR_DEFECTO, asunto: ASUNTO_POR_DEFECTO })}
              >
                <RotateCcw size={14} /> Mensaje original
              </button>
              <span className="crece" />
              {sinGuardar && (
                <button onClick={() => guardada && setBorrador(guardada)}>Descartar</button>
              )}
              <button className="primario" disabled={!sinGuardar || !borrador.mensaje.trim()} onClick={guardarPlantilla}>
                Guardar mensaje
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
