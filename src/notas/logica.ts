import type { NotaClinica, SeccionNota } from "../tipos";

export interface Plantilla {
  id: string;
  nombre: string;
  secciones: string[];
}

/** Plantillas para empezar una nota. Las secciones se pueden dejar vacías. */
export const PLANTILLAS: Plantilla[] = [
  { id: "sesion", nombre: "Sesión", secciones: ["Motivo de consulta", "Observaciones", "Tareas"] },
  {
    id: "primera",
    nombre: "Primera entrevista",
    secciones: ["Motivo de consulta", "Antecedentes", "Observaciones", "Plan de trabajo"],
  },
  { id: "libre", nombre: "Nota libre", secciones: ["Nota"] },
];

export const PLANTILLA_PREDETERMINADA = "sesion";

export function plantilla(id: string): Plantilla {
  return PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0];
}

export function seccionesVacias(idPlantilla: string): SeccionNota[] {
  return plantilla(idPlantilla).secciones.map((titulo) => ({ titulo, texto: "" }));
}

/**
 * Pasa el texto escrito a otra plantilla: las secciones con el mismo nombre se
 * conservan y las que no existen en la nueva (y tienen texto) se agregan al final,
 * así nunca se pierde lo escrito.
 */
export function cambiarPlantilla(actuales: SeccionNota[], idNueva: string): SeccionNota[] {
  const nuevas = seccionesVacias(idNueva);
  for (const s of actuales) {
    const destino = nuevas.find((n) => n.titulo === s.titulo);
    if (destino) destino.texto = s.texto;
    else if (s.texto.trim()) nuevas.push({ ...s });
  }
  return nuevas;
}

export const notaVacia = (secciones: SeccionNota[]) => secciones.every((s) => !s.texto.trim());

/** Sin mayúsculas ni tildes, para buscar. */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Palabras de la búsqueda (todas tienen que aparecer). */
export function terminos(busqueda: string): string[] {
  return normalizar(busqueda).split(/\s+/).filter(Boolean);
}

/** Texto donde se busca: paciente, secciones y fecha. */
function textoBuscable(n: NotaClinica): string {
  return normalizar([n.paciente_nombre, n.fecha, ...n.secciones.flatMap((s) => [s.titulo, s.texto])].join("\n"));
}

/** Notas que contienen todas las palabras buscadas, sin importar mayúsculas ni tildes. */
export function filtrarNotas(notas: NotaClinica[], busqueda: string): NotaClinica[] {
  const ts = terminos(busqueda);
  if (!ts.length) return notas;
  return notas.filter((n) => {
    const texto = textoBuscable(n);
    return ts.every((t) => texto.includes(t));
  });
}

export interface Fragmento {
  titulo: string;
  /** Partes del texto; las impares son las coincidencias, para resaltarlas. */
  partes: string[];
}

const LARGO_FRAGMENTO = 180;

/**
 * Fragmento para mostrar en la lista: el de la primera sección donde aparece la
 * búsqueda o, si no hay búsqueda, el comienzo de la primera sección con texto.
 */
export function fragmento(n: NotaClinica, busqueda: string): Fragmento | null {
  const ts = terminos(busqueda);
  const conTexto = n.secciones.filter((s) => s.texto.trim());
  if (!conTexto.length) return null;
  const seccion = (ts.length && conTexto.find((s) => ts.some((t) => normalizar(s.texto).includes(t)))) || conTexto[0];
  const texto = seccion.texto.replace(/\s+/g, " ").trim();
  const norm = normalizar(texto);
  // normalizar() no cambia el largo de los caracteres comunes del español (NFD + quitar tildes
  // vuelve a dejar una letra por letra), así que las posiciones coinciden con el texto original.
  const mismasPosiciones = norm.length === texto.length;
  let desde = 0;
  if (ts.length && mismasPosiciones) {
    const primera = Math.min(...ts.map((t) => norm.indexOf(t)).filter((i) => i >= 0));
    if (Number.isFinite(primera) && primera > 60) desde = primera - 40;
  }
  const recorte = texto.slice(desde, desde + LARGO_FRAGMENTO);
  const recorteNorm = norm.slice(desde, desde + LARGO_FRAGMENTO);
  const prefijo = desde > 0 ? "…" : "";
  const sufijo = desde + LARGO_FRAGMENTO < texto.length ? "…" : "";
  if (!ts.length || !mismasPosiciones) return { titulo: seccion.titulo, partes: [prefijo + recorte + sufijo] };

  // Marca las coincidencias.
  const marcas: [number, number][] = [];
  for (const t of ts) {
    let i = recorteNorm.indexOf(t);
    while (i >= 0) {
      marcas.push([i, i + t.length]);
      i = recorteNorm.indexOf(t, i + t.length);
    }
  }
  marcas.sort((a, b) => a[0] - b[0]);
  const partes: string[] = [];
  let pos = 0;
  for (const [a, b] of marcas) {
    if (a < pos) continue;
    partes.push(recorte.slice(pos, a), recorte.slice(a, b));
    pos = b;
  }
  partes.push(recorte.slice(pos));
  partes[0] = prefijo + partes[0];
  partes[partes.length - 1] += sufijo;
  return { titulo: seccion.titulo, partes };
}

/**
 * Parte el texto para resaltar las palabras buscadas: las partes impares son las
 * coincidencias. Si las tildes no permiten ubicar las posiciones, devuelve el texto entero.
 */
export function resaltar(texto: string, busqueda: string): string[] {
  const ts = terminos(busqueda);
  const norm = normalizar(texto);
  if (!ts.length || norm.length !== texto.length) return [texto];
  const marcas: [number, number][] = [];
  for (const t of ts) {
    for (let i = norm.indexOf(t); i >= 0; i = norm.indexOf(t, i + t.length)) marcas.push([i, i + t.length]);
  }
  marcas.sort((a, b) => a[0] - b[0]);
  const partes: string[] = [];
  let pos = 0;
  for (const [a, b] of marcas) {
    if (a < pos) continue;
    partes.push(texto.slice(pos, a), texto.slice(a, b));
    pos = b;
  }
  partes.push(texto.slice(pos));
  return partes;
}
