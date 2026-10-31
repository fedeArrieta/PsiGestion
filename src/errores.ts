import { error as registrarError } from "@tauri-apps/plugin-log";

// Mensajes de error para mostrar en pantalla, en lenguaje simple. El detalle técnico
// se guarda en el registro (sin datos de pacientes: solo el mensaje del error).

const GENERICO = "Ocurrió un error inesperado. Se guardó el detalle en el registro de errores (sección Seguridad).";

const CONOCIDOS: [RegExp, string][] = [
  [/database is locked|SQLITE_BUSY/i, "La base de datos está ocupada. Probá de nuevo en unos segundos."],
  [/FOREIGN KEY/i, "No se puede hacer porque hay datos relacionados (por ejemplo, turnos de ese paciente)."],
  [/UNIQUE constraint/i, "Ya existe un registro igual."],
  [/no space left|disk (is )?full|SQLITE_FULL/i, "No queda espacio en el disco."],
  [/database disk image is malformed|file is not a database/i, "La base de datos parece dañada. Conviene restaurar una copia de seguridad."],
  [/permission denied|access is denied|acceso denegado/i, "Windows no dio permiso para usar ese archivo o carpeta."],
  [/not (been )?loaded|no está abierta/i, "La base de datos no está abierta. Volvé a entrar a la app."],
];

/** Texto técnico del error, sin cambiarlo. */
export function detalleError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}

/** Mensaje para el usuario. Los errores propios de la app ya están en español y se muestran tal cual. */
export function mensajeAmigable(e: unknown): string {
  const detalle = detalleError(e);
  for (const [patron, texto] of CONOCIDOS) if (patron.test(detalle)) return texto;
  const tecnico = /error returned from database|sqlx|panicked|undefined|null|TypeError|\(code: \d+\)/i.test(detalle);
  return !tecnico && /^[A-ZÁÉÍÓÚÑ¿¡"]/.test(detalle) && detalle.length < 200 ? detalle : GENERICO;
}

/** Registra el error y devuelve el mensaje para mostrar. */
export function textoError(e: unknown, operacion = "operación"): string {
  registrarError(`${operacion}: ${detalleError(e)}`).catch(() => {});
  return mensajeAmigable(e);
}

/** Registra los errores que no maneja ninguna pantalla. */
export function registrarErroresGlobales() {
  window.addEventListener("error", (ev) => {
    registrarError(`error no manejado: ${ev.message} (${ev.filename}:${ev.lineno})`).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (ev) => {
    registrarError(`promesa rechazada: ${detalleError(ev.reason)}`).catch(() => {});
  });
}
