import { OBSTACULO, limitesSombra } from '../engine/environment'
import { CANTIDAD_DIAS, diaDe, type EstadoEscena } from '../engine/simulation'
import { limitesSombraSobreTerreno } from '../engine/terreno'
import { comprobaciones, direccionSombra, perfilSombra, serieDelDia } from '../engine/verificacion'

/**
 * E13: interfaz de verificación. Muestra la evidencia de que el motor coincide con las fuentes:
 * - tabla de esperado frente a simulado, con tolerancia (Proximity, DI cap. 4, p. 218; variables preatentivas, pp. 436–438);
 * - gráfica del día lunar, varias curvas sobre el mismo eje de tiempo (Multi-Y Graph, DI cap. 9, pp. 462–464);
 * - perfil a lo largo de la sombra (Alternative Views, DI cap. 2, pp. 97–98).
 * Solo representación: todos los números vienen de src/engine.
 */

const ANCHO = 248

function formato(x: number, unidad: string): string {
  if (!Number.isFinite(x)) return '—'
  const decimales = unidad === '°' ? 4 : unidad === '%' ? 2 : unidad === 'W/m²' ? 1 : unidad === '' ? 3 : 2
  return unidad ? `${x.toFixed(decimales)} ${unidad}` : x.toFixed(decimales)
}

export function TablaComprobaciones({ estado }: { estado: EstadoEscena }) {
  const filas = comprobaciones(estado)
  return (
    <table className="comprobaciones">
      <thead>
        <tr>
          <th>Magnitud</th>
          <th>Esperado</th>
          <th>Simulado</th>
          <th aria-label="Resultado" />
        </tr>
      </thead>
      <tbody>
        {filas.map((c) => {
          const diferencia = c.simulado - c.esperado
          const cumple = c.tolerancia === null ? null : Math.abs(diferencia) <= c.tolerancia
          return (
            <tr key={c.nombre} title={c.fuente}>
              <td>{c.nombre}</td>
              <td>{formato(c.esperado, c.unidad)}</td>
              <td>{formato(c.simulado, c.unidad)}</td>
              <td className={cumple === null ? 'info' : cumple ? 'ok' : 'falla'}>{cumple === null ? 'Δ' : cumple ? '✓' : '✗'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Escala lineal de un intervalo a otro. */
const escala = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

/** Camino SVG de una serie, cortado donde hay NaN. */
function camino(xs: Float64Array, ys: Float64Array, sx: (v: number) => number, sy: (v: number) => number, yMin: number, yMax: number) {
  let d = ''
  let abierto = false
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]
    if (!Number.isFinite(y)) {
      abierto = false
      continue
    }
    const yc = Math.min(Math.max(y, yMin), yMax)
    d += `${abierto ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(yc).toFixed(1)}`
    abierto = true
  }
  return d
}

/**
 * Multi-Y Graph del día lunar en curso (E18: el que contiene t): α(t); L plano y L relieve (t); error de la altura
 * deducida (t). Clic = ir a ese t dentro del mismo día.
 */
export function GraficaDelDia({ t, alCambiarT }: { t: number; alCambiarT: (t: number) => void }) {
  const d = diaDe(t)
  const serie = serieDelDia(d)
  const sx = escala(d.inicio, d.fin, 28, ANCHO - 4)
  // El final exacto del día es el inicio del siguiente; salvo en el último día, el clic se queda 1 s antes.
  const ultimoT = d.indice === CANTIDAD_DIAS - 1 ? d.fin : d.fin - 1
  const paneles = [
    { titulo: 'α (°)', y0: 0, y1: 70, alto: 46, curvas: [{ ys: serie.elevacion, clase: 'curva-alfa' }] },
    {
      titulo: 'L (m)',
      y0: 0,
      y1: 120,
      alto: 56,
      curvas: [
        { ys: serie.largoPlano, clase: 'curva-plano' },
        { ys: serie.largoRelieve, clase: 'curva-relieve' },
      ],
    },
    { titulo: 'error h (%)', y0: -30, y1: 30, alto: 46, curvas: [{ ys: serie.errorAlturaPorciento, clase: 'curva-error' }] },
  ]
  let y = 4
  const elementos = paneles.map((p) => {
    const sy = escala(p.y0, p.y1, y + p.alto, y)
    const g = (
      <g key={p.titulo}>
        <rect x={28} y={y} width={ANCHO - 32} height={p.alto} className="grafica-marco" />
        <text x={2} y={y + 9} className="grafica-texto">{p.titulo}</text>
        <text x={24} y={y + p.alto} className="grafica-texto" textAnchor="end">{p.y0}</text>
        <text x={24} y={y + 8} className="grafica-texto" textAnchor="end">{p.y1}</text>
        {p.y0 < 0 && <line x1={28} x2={ANCHO - 4} y1={sy(0)} y2={sy(0)} className="grafica-cero" />}
        {p.curvas.map((c) => (
          <path key={c.clase} d={camino(serie.t, c.ys, sx, sy, p.y0, p.y1)} className={c.clase} />
        ))}
      </g>
    )
    y += p.alto + 6
    return g
  })
  const alto = y
  return (
    <svg
      className="grafica"
      viewBox={`0 0 ${ANCHO} ${alto}`}
      width={ANCHO}
      height={alto}
      role="img"
      aria-label={`Gráfica del día lunar ${d.indice + 1}`}
      onClick={(ev) => {
        const caja = (ev.currentTarget as SVGSVGElement).getBoundingClientRect()
        const x = ((ev.clientX - caja.left) / caja.width) * ANCHO
        alCambiarT(Math.min(Math.max(d.inicio + ((x - 28) / (ANCHO - 32)) * d.duracion, d.inicio), ultimoT))
      }}
    >
      {elementos}
      <line x1={sx(t)} x2={sx(t)} y1={2} y2={alto - 2} className="grafica-cursor" />
    </svg>
  )
}

/** Vista de perfil a lo largo de la sombra: relieve, poste y rayos α y α ± θ/2 desde la tapa (ENV-007, ENV-008). */
export function PerfilSombra({ estado }: { estado: EstadoEscena }) {
  const h = OBSTACULO.alturaM
  const r = OBSTACULO.radioM
  const alfa = estado.elevacionSolGrados
  if (alfa <= 1) return <p className="nota">Perfil: sin Sol suficientemente alto (α ≤ 1°).</p>
  const [sx, sz] = direccionSombra(estado)
  const real = limitesSombraSobreTerreno(h, 2 * r, alfa, estado.diametroSolGrados, sx, sz)
  const plano = limitesSombra(h, 2 * r, alfa, estado.diametroSolGrados)
  const hasta = Math.min(Math.max(Number.isFinite(real.finPenumbraM) ? real.finPenumbraM : plano.centroM, plano.centroM) + 10, 200)
  const puntos = perfilSombra(estado, hasta)
  const yMin = Math.min(...puntos.map((p) => p[1]), 0) - 1
  const yMax = h + 2
  const alto = 110
  const ex = escala(-10, hasta, 4, ANCHO - 4)
  const ey = escala(yMin, yMax, alto - 4, 4)
  const suelo = puntos.map(([d, z], i) => `${i ? 'L' : 'M'}${ex(d).toFixed(1)},${ey(z).toFixed(1)}`).join('')
  const rayo = (grados: number) => {
    const largo = hasta - r
    return `M${ex(r)},${ey(h)}L${ex(r + largo)},${ey(h - largo * Math.tan((grados * Math.PI) / 180))}`
  }
  const semi = estado.diametroSolGrados / 2
  return (
    <svg className="grafica" viewBox={`0 0 ${ANCHO} ${alto}`} width={ANCHO} height={alto} role="img" aria-label="Perfil de la sombra">
      <path d={`${suelo}L${ex(hasta)},${alto}L${ex(-10)},${alto}Z`} className="perfil-suelo" />
      <rect x={ex(-r)} y={ey(h)} width={Math.max(ex(r) - ex(-r), 1.5)} height={ey(0) - ey(h)} className="perfil-poste" />
      <path d={rayo(alfa + semi)} className="perfil-rayo" />
      <path d={rayo(alfa - semi)} className="perfil-rayo" />
      <path d={rayo(alfa)} className="perfil-rayo-centro" />
      {Number.isFinite(plano.centroM) && plano.centroM < hasta && (
        <circle cx={ex(r + plano.centroM)} cy={ey(0)} r={3} className="perfil-plano" />
      )}
      {Number.isFinite(real.centroM) && (
        <circle cx={ex(r + real.centroM)} cy={ey(real.desnivelPuntaM)} r={3} className="perfil-real" />
      )}
      <text x={4} y={10} className="grafica-texto">perfil a lo largo de la sombra (escala 1:1)</text>
    </svg>
  )
}
