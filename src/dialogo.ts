import { ask } from "@tauri-apps/plugin-dialog";
import { error as registrarError } from "@tauri-apps/plugin-log";

/**
 * Pregunta Sí/No con el cuadro de diálogo de Windows.
 *
 * No usar window.confirm: en la app instalada el plugin de diálogos lo reemplaza por una
 * versión asíncrona que devuelve una promesa (siempre "verdadera" en un if), así que la
 * pregunta se salteaba y la acción se hacía sin confirmar.
 * Si el cuadro no se puede mostrar, responde que no: ante la duda, no se hace nada.
 */
export async function confirmar(pregunta: string, opciones: { si?: string; no?: string } = {}): Promise<boolean> {
  try {
    return await ask(pregunta, {
      title: "PsiGestion",
      kind: "warning",
      okLabel: opciones.si ?? "Sí",
      cancelLabel: opciones.no ?? "No",
    });
  } catch (e) {
    registrarError(`confirmación: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    return false;
  }
}
