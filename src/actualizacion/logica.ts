/** Lógica pura del aviso de actualización y de las novedades (sin Tauri, para poder probarla). */

/** Compara versiones "x.y.z". Negativo si a < b, 0 si son iguales, positivo si a > b. */
export function compararVersiones(a: string, b: string): number {
  const partes = (v: string) => v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const POSPONER_HORAS = 24;

export interface PreferenciasActualizacion {
  /** Buscar actualizaciones automáticamente (al abrir la app y cada 24 horas). */
  automatica: boolean;
  /** Versión que se eligió omitir. */
  omitida: string | null;
  /** Hasta cuándo no volver a avisar ("Recordarme más tarde"), en milisegundos. */
  posponerHasta: number | null;
}

export function leerPreferencias(config: Record<string, string>): PreferenciasActualizacion {
  const hasta = Number(config.actualizacion_posponer_hasta);
  return {
    automatica: config.actualizacion_automatica !== "0",
    omitida: config.actualizacion_omitida || null,
    posponerHasta: Number.isFinite(hasta) && hasta > 0 ? hasta : null,
  };
}

/**
 * Si corresponde mostrar el aviso de una versión disponible. Cuando la busca la persona a mano
 * (manual = true) se muestra siempre, aunque la haya omitido o pospuesto.
 */
export function debeAvisar(
  disponible: string,
  instalada: string,
  pref: PreferenciasActualizacion,
  ahora: number,
  manual = false,
): boolean {
  if (compararVersiones(disponible, instalada) <= 0) return false;
  if (manual) return true;
  if (pref.omitida && compararVersiones(disponible, pref.omitida) <= 0) return false;
  if (pref.posponerHasta && ahora < pref.posponerHasta) return false;
  return true;
}

export interface VersionNovedades {
  version: string;
  fecha: string | null;
  /** Bloques de la versión: títulos ("### Nuevo") y puntos ("- ..."). */
  lineas: { tipo: "titulo" | "punto" | "texto"; texto: string }[];
}

/** Lee las secciones "## [x.y.z] - fecha" del CHANGELOG.md. */
export function leerNovedades(changelog: string): VersionNovedades[] {
  const versiones: VersionNovedades[] = [];
  for (const linea of changelog.split(/\r?\n/)) {
    const encabezado = /^##\s+\[?v?([\d.]+)\]?(?:\s*-\s*(.+))?$/.exec(linea.trim());
    if (encabezado) {
      versiones.push({ version: encabezado[1], fecha: encabezado[2]?.trim() ?? null, lineas: [] });
      continue;
    }
    const actual = versiones[versiones.length - 1];
    const t = linea.trim();
    if (!actual || !t) continue;
    if (t.startsWith("### ")) actual.lineas.push({ tipo: "titulo", texto: t.slice(4) });
    else if (t.startsWith("- ")) actual.lineas.push({ tipo: "punto", texto: t.slice(2) });
    else actual.lineas.push({ tipo: "texto", texto: t });
  }
  return versiones;
}

/** Las versiones más nuevas que "desde" y hasta "hasta" inclusive (las novedades que no se vieron). */
export function novedadesEntre(todas: VersionNovedades[], desde: string | null, hasta: string): VersionNovedades[] {
  return todas.filter(
    (v) => compararVersiones(v.version, hasta) <= 0 && (desde === null || compararVersiones(v.version, desde) > 0),
  );
}

/**
 * Si hay que mostrar "Novedades" al abrir: solo cuando se pasó de una versión anterior a la actual.
 * Sin versión vista guardada se muestran (vale para quien viene de la 0.1.0, que no la guardaba).
 */
export function hayNovedadesSinVer(vista: string | null, actual: string): boolean {
  return vista === null || compararVersiones(actual, vista) > 0;
}
