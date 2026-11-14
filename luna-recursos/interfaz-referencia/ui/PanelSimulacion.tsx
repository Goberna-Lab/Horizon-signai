// E26.3: panel de la simulación de aterrizaje, abajo y plegable para no tapar la escena (Center Stage, DI pp. 231–232;
// Collapsible Panels, pp. 249–250). El perfil de altura y la escena están enlazados (Data Brushing, pp. 459–460): elegir un
// instante en el perfil mueve el LM en 3D, con los mismos colores por fase. El deslizador del tiempo actualiza todo al
// instante (Dynamic Queries, pp. 455–458).
import { useMemo, useRef, useState } from 'react'
import type { Simulacion } from '../engine/simulacion'
import { COLOR_FASE } from '../scene/colores'
import { SITIOS } from '../engine/sitio'
import { muestraEn, type PlanSimulacion } from './simulacionComun'

const NOMBRE_FASE = { P63: 'Frenado (P63)', P64: 'Aproximación (P64)', P66: 'Descenso vertical (P66)' } as const
const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function PanelSimulacion(props: {
  plan: PlanSimulacion
  sim: Simulacion
  tau: number
  alCambiarTau: (t: number) => void
  corriendo: boolean
  alAlternar: () => void
  velocidad: number
  alCambiarVelocidad: (v: number) => void
  persecucion: boolean
  alCambiarPersecucion: (p: boolean) => void
  combustibleInicialKg: number
  /** Horas después del contacto que muestra la escena (estadía) y su rango. */
  estadiaH: number
  alCambiarEstadiaH: (h: number) => void
  diasSuperficie: number
  /** Instante que muestra la escena (ms). */
  msEscena: number
  /** Ventanas reales de Sol y Tierra en la estadía (para la pista de su deslizador). */
  ventanasEstadia: { inicioMs: number; finMs: number; sol: Array<{ inicioMs: number; finMs: number }>; tierra: Array<{ inicioMs: number; finMs: number }> } | null
  alNueva: () => void
  alSalir: () => void
}) {
  const { sim, tau } = props
  const [abierto, setAbierto] = useState(true)
  const duracion = sim.descenso.eventos.contacto
  const m = muestraEn(sim.descenso.muestras, tau)
  const cumplidos = sim.veredicto.filter((c) => c.cumple).length
  const todo = cumplidos === sim.veredicto.length
  const ahoraMs = props.msEscena
  const combustible = props.combustibleInicialKg - (sim.descenso.muestras[0].masaKg - m.masaKg)
  return (
    <section className={`simulacion ${abierto ? '' : 'simulacion--plegada'}`} aria-label="Simulación de aterrizaje">
      <header className="simulacion__cabecera">
        <button className="simulacion__plegar" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} title={abierto ? 'Plegar el panel' : 'Desplegar el panel'}>
          {abierto ? '▾' : '▴'}
        </button>
        <strong>{props.plan.mision || 'Misión'}</strong>
        <span className="plan__detalle">
          {SITIOS[props.plan.sitio].nombre} · contacto {fecha(sim.contactoMs)} UTC · rumbo {sim.rumboGrados.toFixed(0)}° (Sol a la espalda)
        </span>
        <span className={`simulacion__veredicto ${todo ? 'simulacion__veredicto--si' : 'simulacion__veredicto--no'}`}>
          {todo ? 'Cumple tus requisitos' : `Cumple ${cumplidos} de ${sim.veredicto.length} requisitos`}
        </span>
        <span className="simulacion__acciones">
          <button className="boton-texto" onClick={() => props.alCambiarPersecucion(!props.persecucion)} aria-pressed={props.persecucion}>
            {props.persecucion ? 'Cámara libre' : 'Seguir al LM'}
          </button>
          <button className="boton-texto" onClick={props.alNueva}>
            Nueva simulación
          </button>
          <button className="boton-texto" onClick={props.alSalir}>
            Salir
          </button>
        </span>
      </header>
      {abierto && (
        <div className="simulacion__cuerpo">
          <div className="simulacion__lecturas">
            <div className="simulacion__fase" style={{ color: props.estadiaH > 0 ? 'var(--texto)' : COLOR_FASE[m.fase] }}>
              {props.estadiaH > 0 ? `En superficie · +${props.estadiaH.toFixed(1)} h después del contacto` : `${NOMBRE_FASE[m.fase]} · T+${reloj(tau)}`}
            </div>
            <div className="plan__detalle">{fecha(ahoraMs)} UTC</div>
            <dl className="datos datos--ancho">
              <dt>Altura</dt>
              <dd>{m.alturaM >= 1000 ? `${(m.alturaM / 1000).toFixed(2)} km` : `${m.alturaM.toFixed(0)} m`}</dd>
              <dt>Al sitio</dt>
              <dd>{Math.abs(m.alcanceM) >= 1000 ? `${(Math.abs(m.alcanceM) / 1000).toFixed(1)} km` : `${Math.abs(m.alcanceM).toFixed(0)} m`}</dd>
              <dt title="Vertical · horizontal">Velocidad</dt>
              <dd>
                {m.vVerticalMs.toFixed(1)} · {m.vHorizontalMs.toFixed(0)} m/s
              </dd>
              <dt title="Empuje del motor · inclinación respecto de la vertical">Empuje</dt>
              <dd>
                {(100 * m.empuje).toFixed(0)} % · {m.inclinacionGrados.toFixed(0)}°
              </dd>
              <dt>Combustible</dt>
              <dd>{Math.max(0, combustible).toFixed(0)} kg</dd>
            </dl>
          </div>
          <Perfil sim={sim} tau={tau} alElegir={props.alCambiarTau} />
        </div>
      )}
      {/* El tiempo queda visible con el panel plegado (Collapsible Panels, DI p. 249; Dynamic Queries, p. 456). */}
      <div className="simulacion__tiempo">
            <span className="simulacion__etiqueta-tiempo">Descenso</span>
            <button className="botones__principal" onClick={props.alAlternar} aria-label={props.corriendo ? 'Pausar' : 'Reproducir'}>
              {props.corriendo ? '⏸' : '▶︎'}
            </button>
            <input
              type="range"
              min={0}
              max={duracion}
              step={0.5}
              value={Math.min(tau, duracion)}
              onChange={(e) => props.alCambiarTau(e.target.valueAsNumber)}
              aria-label="Tiempo desde el encendido"
              className="simulacion__deslizador"
              style={{ background: fondoFases(sim, duracion) }}
            />
            <span className="reloj">
              {reloj(tau)} / {reloj(duracion)}
            </span>
            <div className="velocidades simulacion__velocidades" role="group" aria-label="Velocidad">
              {[1, 10, 50].map((v) => (
                <button key={v} className={props.velocidad === v ? 'activo' : ''} onClick={() => props.alCambiarVelocidad(v)}>
                  ×{v}
                </button>
              ))}
            </div>
      </div>
      <div className="simulacion__tiempo">
        <span className="simulacion__etiqueta-tiempo">Estadía</span>
        <input
          type="range"
          min={0}
          max={props.diasSuperficie * 24}
          step={0.25}
          value={props.estadiaH}
          onChange={(e) => props.alCambiarEstadiaH(e.target.valueAsNumber)}
          aria-label="Horas después del contacto"
          className="simulacion__deslizador simulacion__deslizador--estadia"
          style={{ background: fondoEstadia(props.ventanasEstadia) }}
        />
        <span className="reloj">{props.estadiaH > 0 ? `+${props.estadiaH.toFixed(1)} h` : 'contacto'}</span>
        <span className="plan__detalle simulacion__estadia-nota">
          <span className="simulacion__muestra simulacion__muestra--sol" /> Sol <span className="simulacion__muestra simulacion__muestra--tierra" /> Tierra
          visibles después del contacto
        </span>
      </div>
    </section>
  )
}

/** Pista de la estadía: arriba las ventanas de Sol, abajo las de Tierra (colores del planificador). */
function fondoEstadia(v: { inicioMs: number; finMs: number; sol: Array<{ inicioMs: number; finMs: number }>; tierra: Array<{ inicioMs: number; finMs: number }> } | null): string {
  if (!v) return 'rgba(255, 255, 255, 0.08)'
  const total = v.finMs - v.inicioMs
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (100 * (ms - v.inicioMs)) / total)).toFixed(2)}%`
  // Paradas duras: transparente fuera de las ventanas, color dentro.
  const pista = (ws: Array<{ inicioMs: number; finMs: number }>, color: string) =>
    `linear-gradient(to right, transparent 0%, ${ws.map((w) => `transparent ${pct(w.inicioMs)}, ${color} ${pct(w.inicioMs)}, ${color} ${pct(w.finMs)}, transparent ${pct(w.finMs)}`).join(', ')}${ws.length ? ', ' : ''}transparent 100%)`
  return `${pista(v.sol, 'rgba(245, 215, 110, 0.85)')} top / 100% 50% no-repeat, ${pista(v.tierra, 'rgba(110, 170, 245, 0.85)')} bottom / 100% 50% no-repeat, rgba(255, 255, 255, 0.06)`
}

/** Fondo del deslizador con las fases en sus colores. */
function fondoFases(sim: Simulacion, duracion: number): string {
  const e = sim.descenso.eventos
  const p = (t: number) => `${((100 * t) / duracion).toFixed(2)}%`
  return `linear-gradient(to right, ${COLOR_FASE.P63} 0 ${p(e.puertaAlta)}, ${COLOR_FASE.P64} ${p(e.puertaAlta)} ${p(e.inicioP66)}, ${COLOR_FASE.P66} ${p(e.inicioP66)} 100%)`
}

/** Perfil de altura frente a distancia al sitio; clic o arrastre elige el instante (Data Brushing). */
function Perfil({ sim, tau, alElegir }: { sim: Simulacion; tau: number; alElegir: (t: number) => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const muestras = sim.descenso.muestras
  const ANCHO = 900
  const ALTO = 110
  // Escala de la distancia: raíz cuadrada, para ver a la vez los 490 km del frenado y los últimos metros (no lineal: avisado).
  const xMax = Math.sqrt(Math.abs(muestras[0].alcanceM))
  const yMax = muestras[0].alturaM
  const X = (alcance: number) => ANCHO - (Math.sqrt(Math.abs(alcance)) / xMax) * ANCHO
  const Y = (h: number) => ALTO - (Math.sqrt(Math.max(h, 0)) / Math.sqrt(yMax)) * ALTO
  const trazos = useMemo(() => {
    const xm = Math.sqrt(Math.abs(muestras[0].alcanceM))
    const ym = Math.sqrt(muestras[0].alturaM)
    const porFase: Record<string, string> = {}
    muestras.forEach((s, i) => {
      const x = ANCHO - (Math.sqrt(Math.abs(s.alcanceM)) / xm) * ANCHO
      const y = ALTO - (Math.sqrt(Math.max(s.alturaM, 0)) / ym) * ALTO
      porFase[s.fase] = (porFase[s.fase] ?? '') + `${i === 0 || muestras[i - 1].fase !== s.fase ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    return porFase
  }, [muestras])
  const m = muestraEn(muestras, tau)
  // Datatip del perfil (DI p. 448): al pasar el puntero se ve el instante y sus valores; clic o arrastre lo elige.
  const [sobre, setSobre] = useState<(typeof muestras)[number] | null>(null)
  const cercana = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return null
    const x = ((clientX - r.left) / r.width) * (ANCHO + 12) - 6
    let mejor = muestras[0]
    for (const s of muestras) if (Math.abs(X(s.alcanceM) - x) < Math.abs(X(mejor.alcanceM) - x)) mejor = s
    return mejor
  }
  const elegir = (clientX: number) => {
    const s = cercana(clientX)
    if (s) alElegir(s.tS)
  }
  return (
    <figure className="simulacion__perfil">
      <svg
        ref={ref}
        viewBox={`-6 -6 ${ANCHO + 12} ${ALTO + 26}`}
        className="plan__svg plan__svg--tiempo"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          elegir(e.clientX)
        }}
        onPointerMove={(e) => (e.buttons === 1 ? elegir(e.clientX) : setSobre(cercana(e.clientX)))}
        onPointerLeave={() => setSobre(null)}
        role="img"
        aria-label="Perfil del descenso: altura frente a distancia al sitio"
      >
        {Object.entries(trazos).map(([fase, d]) => (
          <path key={fase} d={d} fill="none" stroke={COLOR_FASE[fase as keyof typeof COLOR_FASE]} strokeWidth={2.5} />
        ))}
        <line x1={0} x2={ANCHO} y1={ALTO} y2={ALTO} className="plan__rejilla plan__rejilla--cero" />
        <circle cx={X(m.alcanceM)} cy={Y(m.alturaM)} r={6} fill={COLOR_FASE[m.fase]} stroke="#000" strokeWidth={1.5} />
        {sobre && (
          <>
            <circle cx={X(sobre.alcanceM)} cy={Y(sobre.alturaM)} r={6} fill="none" stroke={COLOR_FASE[sobre.fase]} strokeWidth={2} />
            <text x={4} y={12} className="plan__eje plan__eje--claro">
              T+{reloj(sobre.tS)} · {sobre.alturaM >= 1000 ? `${(sobre.alturaM / 1000).toFixed(1)} km` : `${sobre.alturaM.toFixed(0)} m`} de altura ·{' '}
              {(Math.abs(sobre.alcanceM) / 1000).toFixed(1)} km al sitio
            </text>
          </>
        )}
        {[400, 100, 10].map((km) => (
          <text key={km} x={X(-km * 1000)} y={ALTO + 16} className="plan__eje" textAnchor="middle">
            {km} km
          </text>
        ))}
        <text x={ANCHO} y={ALTO + 16} className="plan__eje" textAnchor="end">
          sitio
        </text>
      </svg>
      <figcaption className="nota">
        Altura frente a distancia al sitio (escalas en raíz cuadrada: no lineales). Clic o arrastre para elegir el instante; el LM se mueve en la escena.
      </figcaption>
    </figure>
  )
}
