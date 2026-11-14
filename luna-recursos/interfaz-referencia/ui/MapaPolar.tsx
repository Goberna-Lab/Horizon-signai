// E24: mapa del polo sur para elegir un punto (estereográfica polar, LOLA 960 m, ±200 km del polo). El sombreado es
// cartográfico (luz fija del noroeste del mapa, a 45°): NO es la iluminación real, solo muestra el relieve.
import { useEffect, useRef, useState } from 'react'
import { desdeEstereoSur, estereoSur, RADIO_DOMINIO_M, type DemPolar } from '../engine/demPolar'
import { cargarDemPolar } from './lugares'

const MEDIO_LADO_M = 200_000

export function MapaPolar(props: {
  marcas: Array<{ id: string; nombre: string; latitudGrados: number; longitudEsteGrados: number }>
  elegido: { latitudGrados: number; longitudEsteGrados: number } | null
  alElegir: (latitudGrados: number, longitudEsteGrados: number) => void
}) {
  const [dem, setDem] = useState<DemPolar | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let vivo = true
    cargarDemPolar().then((d) => vivo && setDem(d))
    return () => {
      vivo = false
    }
  }, [])
  const g = dem?.lejos
  const c0 = g ? Math.round((-MEDIO_LADO_M - g.x0M) / g.pasoM) : 0
  const f0 = g ? Math.round((g.y0M - MEDIO_LADO_M) / g.pasoM) : 0
  const n = g ? Math.round((2 * MEDIO_LADO_M) / g.pasoM) : 1

  useEffect(() => {
    const lienzo = ref.current
    if (!g || !lienzo) return
    const ctx = lienzo.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(n, n)
    const a = (f: number, c: number) => g.alturas[(f0 + f) * g.n + c0 + c]
    // Sombreado cartográfico: luz desde arriba a la izquierda del mapa, 45° de altura; exageración vertical ×4 (visual).
    const L = [-Math.SQRT1_2 * Math.SQRT1_2, Math.SQRT1_2 * Math.SQRT1_2, Math.SQRT1_2]
    for (let f = 1; f < n - 1; f++) {
      for (let c = 1; c < n - 1; c++) {
        const dzdx = ((a(f, c + 1) - a(f, c - 1)) / (2 * g.pasoM)) * 4
        const dzdy = ((a(f - 1, c) - a(f + 1, c)) / (2 * g.pasoM)) * 4
        const norma = Math.hypot(dzdx, dzdy, 1)
        const luz = Math.max(0, (-dzdx * L[0] - dzdy * L[1] + L[2]) / norma)
        const altura = (a(f, c) + 5500) / 12500
        const v = Math.round(255 * (0.15 + 0.6 * luz) * (0.7 + 0.3 * altura))
        const i = (f * n + c) * 4
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = Math.min(255, v + 8)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [g, n, c0, f0])

  // Coordenadas del mapa (0–1) ↔ estereográficas.
  const aMapa = (lat: number, lon: number) => {
    const [x, y] = estereoSur(lat, lon)
    return [(x + MEDIO_LADO_M) / (2 * MEDIO_LADO_M), (MEDIO_LADO_M - y) / (2 * MEDIO_LADO_M)]
  }
  const radio = RADIO_DOMINIO_M / (2 * MEDIO_LADO_M)
  return (
    <div className="mapa-polar">
      {!dem && <p className="nota">Cargando el relieve del polo (LOLA, 6,3 MB)…</p>}
      <div className="mapa-polar__marco">
        <canvas
          ref={ref}
          width={n}
          height={n}
          className="mapa-polar__lienzo"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const x = ((e.clientX - r.left) / r.width) * 2 * MEDIO_LADO_M - MEDIO_LADO_M
            const y = MEDIO_LADO_M - ((e.clientY - r.top) / r.height) * 2 * MEDIO_LADO_M
            if (Math.hypot(x, y) > RADIO_DOMINIO_M) return
            const [lat, lon] = desdeEstereoSur(x, y)
            props.alElegir(lat, lon)
          }}
        />
        <svg className="mapa-polar__capa" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <circle cx={0.5} cy={0.5} r={radio} className="mapa-polar__dominio" />
          <line x1={0.5} x2={0.5} y1={0.49} y2={0.51} className="mapa-polar__polo" />
          <line x1={0.49} x2={0.51} y1={0.5} y2={0.5} className="mapa-polar__polo" />
        </svg>
        {props.marcas.map((m) => {
          const [u, v] = aMapa(m.latitudGrados, m.longitudEsteGrados)
          return (
            <span key={m.id} className="mapa-polar__marca" style={{ left: `${u * 100}%`, top: `${v * 100}%` }} title={m.nombre}>
              <span className="mapa-polar__etiqueta">{m.nombre}</span>
            </span>
          )
        })}
        {props.elegido &&
          (() => {
            const [u, v] = aMapa(props.elegido.latitudGrados, props.elegido.longitudEsteGrados)
            return <span className="mapa-polar__elegido" style={{ left: `${u * 100}%`, top: `${v * 100}%` }} />
          })()}
        <span className="mapa-polar__rumbo" style={{ left: '50%', top: '2%' }}>0°</span>
        <span className="mapa-polar__rumbo" style={{ left: '97%', top: '50%' }}>90° E</span>
        <span className="mapa-polar__rumbo" style={{ left: '50%', top: '97%' }}>180°</span>
        <span className="mapa-polar__rumbo" style={{ left: '4%', top: '50%' }}>270° E</span>
      </div>
      <p className="nota">
        Polo sur hasta 200 km (LOLA, 960 m por píxel; sombreado cartográfico, no la iluminación real). Clic dentro del círculo (190 km, ~83,7° S) para
        elegir un punto propio. Puntos: sitios del catálogo; cruz: el polo.
      </p>
    </div>
  )
}
