import { invoke } from "@tauri-apps/api/core";

export type EstadoAcceso = "sin_configurar" | "falta_llave" | "bloqueada" | "desbloqueada";

export const LARGO_MINIMO = 8;
export const MINUTOS_BLOQUEO_POR_DEFECTO = 10;

export const estadoAcceso = () => invoke<EstadoAcceso>("estado_seguridad");

/** Devuelve la clave de recuperación, que se muestra una sola vez. */
export const configurarContrasena = (contrasena: string) => invoke<string>("configurar_contrasena", { contrasena });

/** false si la contraseña no es correcta. */
export const desbloquear = (contrasena: string) => invoke<boolean>("desbloquear", { contrasena });

export const recuperarAcceso = (claveRecuperacion: string, nuevaContrasena: string) =>
  invoke<boolean>("recuperar_acceso", { claveRecuperacion, nuevaContrasena });

export const cambiarContrasena = (actual: string, nueva: string) => invoke<boolean>("cambiar_contrasena", { actual, nueva });

/** Clave de recuperación nueva, o null si la contraseña no es correcta. */
export const nuevaRecuperacion = (contrasena: string) => invoke<string | null>("nueva_recuperacion", { contrasena });

export const bloquear = () => invoke<void>("bloquear");

export const importarLlave = (ruta: string) => invoke<void>("importar_llave", { ruta });

/** Mensaje de error si la contraseña nueva no sirve, o null si está bien. */
export function problemaContrasena(contrasena: string, repetida: string): string | null {
  if ([...contrasena].length < LARGO_MINIMO) return `La contraseña tiene que tener al menos ${LARGO_MINIMO} caracteres.`;
  if (contrasena !== repetida) return "Las dos contraseñas no coinciden.";
  return null;
}

/** true si pasó el tiempo de inactividad. minutos <= 0 desactiva el bloqueo automático. */
export function debeBloquear(ultimaActividad: number, ahora: number, minutos: number): boolean {
  return minutos > 0 && ahora - ultimaActividad >= minutos * 60_000;
}
