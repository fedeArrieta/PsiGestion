/**
 * Isotipo de PsiGestion: la letra psi (Ψ) con una cabeza, un arco que la abraza y dos hojas.
 * Toma los colores de las variables CSS, así se adapta al tema claro y al oscuro.
 */
export function Isotipo({ tamano = 40, className }: { tamano?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={tamano}
      height={tamano}
      viewBox="0 0 100 100"
      role="img"
      aria-label="PsiGestion"
    >
      <path d={ARCO} fill="none" stroke="var(--logo-arco)" strokeWidth="3" strokeLinecap="round" />
      <path d={HOJA_IZQUIERDA} fill="var(--logo-hoja)" />
      <path d={HOJA_DERECHA} fill="var(--logo-hoja-clara)" />
      <g fill="none" stroke="var(--logo-psi)" strokeLinecap="round" strokeLinejoin="round">
        <path d={BRAZOS} strokeWidth="7" />
        <path d={TALLO} strokeWidth="7.5" />
      </g>
      <circle cx="50" cy="27" r="6.5" fill="var(--logo-psi)" />
    </svg>
  );
}

/** Logo completo: isotipo + nombre (+ lema opcional). */
export function Logo({ lema = false, tamano = 44 }: { lema?: boolean; tamano?: number }) {
  return (
    <div className="logo">
      <Isotipo tamano={tamano} />
      <div className="logo-texto">
        <span className="logo-nombre">PsiGestion</span>
        {lema && <span className="logo-lema">Tu consultorio, en armonía</span>}
      </div>
    </div>
  );
}

// Geometría compartida con el ícono de la app (src-tauri/icons/fuente/icono.svg).
export const ARCO = "M17 34 A36 36 0 0 1 83 34";
export const BRAZOS = "M27 38 C27 58 36 66 50 66 C64 66 73 58 73 38";
export const TALLO = "M50 40 L50 86";
export const HOJA_IZQUIERDA = "M48 87 C44 70 30 57 11 55 C12 74 28 89 48 87 Z";
export const HOJA_DERECHA = "M52 87 C56 70 70 57 89 55 C88 74 72 89 52 87 Z";
