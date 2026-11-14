import { useId } from "react"

// Cráteres fijos (x, y, radio en un lienzo de 100): siempre la misma luna.
const CRATERES: [number, number, number][] = [
  [34, 30, 6.5], [62, 24, 3.2], [70, 46, 8], [44, 58, 4.2], [28, 66, 5.5],
  [58, 72, 3.6], [80, 62, 2.6], [50, 40, 2.2], [22, 46, 2.8], [66, 86, 2.4],
  [40, 82, 2], [76, 32, 1.8], [54, 14, 1.6], [16, 34, 1.5],
]
// Mares: manchas oscuras grandes y suaves.
const MARES: [number, number, number, number][] = [
  [40, 38, 18, 14], [64, 54, 14, 18], [32, 70, 12, 9], [58, 28, 9, 7],
]

/**
 * Luna dibujada con SVG: base con relieve fractal, mares, cráteres y un terminador
 * suave que le da volumen. Sin imágenes ni librerías; escala a cualquier tamaño.
 */
export function Luna({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-base`} cx="42%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#f1eee6" />
          <stop offset="55%" stopColor="#c9c5bb" />
          <stop offset="100%" stopColor="#8d8a83" />
        </radialGradient>
        <radialGradient id={`${id}-sombra`} cx="30%" cy="28%" r="85%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="85%" stopColor="#05060a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#05060a" stopOpacity="0.9" />
        </radialGradient>
        <radialGradient id={`${id}-crater`}>
          <stop offset="0%" stopColor="#6f6c66" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#8a867e" stopOpacity="0.35" />
          <stop offset="88%" stopColor="#fbf8f0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fbf8f0" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-relieve`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.35" />
          </feComponentTransfer>
        </filter>
        <filter id={`${id}-mares`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="r" />
          <feDisplacementMap in="SourceGraphic" in2="r" scale="9" />
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <clipPath id={`${id}-disco`}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-disco)`}>
        <circle cx="50" cy="50" r="48" fill={`url(#${id}-base)`} />
        <g filter={`url(#${id}-mares)`} fill="#5f5c57" opacity="0.5">
          {MARES.map(([x, y, rx, ry], i) => (
            <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} />
          ))}
        </g>
        <rect width="100" height="100" filter={`url(#${id}-relieve)`} style={{ mixBlendMode: "multiply" }} />
        {CRATERES.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={`url(#${id}-crater)`} />
        ))}
        <circle cx="50" cy="50" r="48" fill={`url(#${id}-sombra)`} />
      </g>
    </svg>
  )
}
