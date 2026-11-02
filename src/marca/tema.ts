/** Tema de colores: automático (sigue a Windows), claro u oscuro. Se guarda en este equipo. */
export type Tema = "auto" | "claro" | "oscuro";

const CLAVE = "psigestion.tema";

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === "claro" || t === "oscuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function aplicarTema(tema: Tema) {
  if (tema === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

export function guardarTema(tema: Tema) {
  aplicarTema(tema);
  try {
    if (tema === "auto") localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento solo no se recuerda la elección.
  }
}

export const SIGUIENTE_TEMA: Record<Tema, Tema> = { auto: "claro", claro: "oscuro", oscuro: "auto" };
export const NOMBRE_TEMA: Record<Tema, string> = { auto: "Tema automático", claro: "Tema claro", oscuro: "Tema oscuro" };
