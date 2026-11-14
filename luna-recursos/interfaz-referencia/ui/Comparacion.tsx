// E25: comparar escenarios (lugar + fecha + período + altura) lado a lado, y ver cómo cambian las condiciones mes a mes en
// 2026–2030 para el lugar elegido. El reto lo pide para reaccionar rápido a un cambio de fecha o de sitio.
import { useEffect, useMemo, useState } from 'react'
import { prepararSitio, type TablaLuna } from '../engine/efemeridesLuna'
import { perfilDesde, type Mascara } from '../engine/mascara'
import { barrer, porMeses, resumir, ventanas, type PuntoPlan, type ResumenPlan, type Ventana } from '../engine/planificador'
import { obtenerMascara, type Lugar } from './lugares'
import { SITIOS, type IdSitio } from '../engine/sitio'

const DIA_MS = 86_400_000
const PASO_MS = 600_000

export type Escenario = { id: string; lugar: Lugar; inicio: number; dias: number; altura: number }

const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const pct = (x: number) => `${(100 * x).toFixed(1)} %`
const horas = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(0)} h`)
const alturaTexto = (h: number) => (h === 0 ? 'suelo' : `${String(h).replace('.', ',')} m`)

function useMascaras(lugares: Lugar[]): Map<string, Mascara> {
  const [mapa, setMapa] = useState(new Map<string, Mascara>())
  const ids = lugares.map((l) => l.id).join('|')
  useEffect(() => {
    let vivo = true
    Promise.all(lugares.map(async (l) => [l.id, await obtenerMascara(l)] as const)).then((pares) => vivo && setMapa(new Map(pares)))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  return mapa
}

type Calculado = { e: Escenario; resumen: ResumenPlan; vSol: Ventana[]; vTierra: Ventana[]; fin: number }

/** Columnas de la tabla: valor y si conviene más alto o más bajo. */
const COLUMNAS: Array<{ nombre: string; valor: (r: ResumenPlan) => number; texto: (r: ResumenPlan) => string; mejor: 'max' | 'min' }> = [
  { nombre: 'Sol visible', valor: (r) => r.fraccionSol, texto: (r) => pct(r.fraccionSol), mejor: 'max' },
  { nombre: 'Tierra visible', valor: (r) => r.fraccionTierra, texto: (r) => pct(r.fraccionTierra), mejor: 'max' },
  { nombre: 'Sol y Tierra', valor: (r) => r.fraccionAmbos, texto: (r) => pct(r.fraccionAmbos), mejor: 'max' },
  { nombre: 'Noche más larga', valor: (r) => r.nocheMasLargaH, texto: (r) => horas(r.nocheMasLargaH), mejor: 'min' },
  { nombre: 'Silencio más largo', valor: (r) => r.silencioMasLargoH, texto: (r) => horas(r.silencioMasLargoH), mejor: 'min' },
  { nombre: 'Panel medio', valor: (r) => r.panelMedioWm2, texto: (r) => `${r.panelMedioWm2.toFixed(0)} W/m²`, mejor: 'max' },
]

export function Comparacion(props: { tabla: TablaLuna; escenarios: Escenario[]; alQuitar: (id: string) => void; alVer: (e: Escenario) => void; alSimular?: (sitio: IdSitio, contactoMs: number) => void }) {
  const { tabla, escenarios } = props
  const mascaras = useMascaras(escenarios.map((e) => e.lugar))
  const calculados: Calculado[] = useMemo(
    () =>
      escenarios.flatMap((e) => {
        const m = mascaras.get(e.lugar.id)
        if (!m) return []
        const punto: PuntoPlan = { sitio: prepararSitio(e.lugar.latitudGrados, e.lugar.longitudEsteGrados), perfil: perfilDesde(m, e.altura) }
        const fin = Math.min(e.inicio + e.dias * DIA_MS, tabla.finMs)
        const b = barrer(tabla, punto, e.inicio, fin, PASO_MS)
        return [{ e, resumen: resumir(b), vSol: ventanas(b, 'sol'), vTierra: ventanas(b, 'tierra'), fin }]
      }),
    [escenarios, mascaras, tabla],
  )
  if (!escenarios.length) {
    return (
      <section className="plan__bloque" aria-label="Comparación de escenarios">
        <h2>Comparar escenarios</h2>
        <p className="nota">
          Con «Agregar a la comparación» se guarda el escenario de arriba (lugar, fecha, período y altura). Cambia la fecha o el lugar y agrega otro para
          verlos lado a lado.
        </p>
      </section>
    )
  }
  const mejores = COLUMNAS.map((c) => {
    const valores = calculados.map((x) => c.valor(x.resumen))
    return c.mejor === 'max' ? Math.max(...valores) : Math.min(...valores)
  })
  const diasMax = Math.max(...calculados.map((x) => (x.fin - x.e.inicio) / DIA_MS), 1)
  return (
    <section className="plan__bloque" aria-label="Comparación de escenarios">
      <h2>Comparar escenarios</h2>
      <div className="plan__tabla-marco">
        <table className="plan__tabla">
          <thead>
            <tr>
              <th>Escenario</th>
              {COLUMNAS.map((c) => (
                <th key={c.nombre}>{c.nombre}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {calculados.map((x) => (
              <tr key={x.e.id}>
                <td>
                  <button className="plan__enlace" onClick={() => props.alVer(x.e)} title="Ver este escenario arriba">
                    {x.e.lugar.nombre}
                  </button>
                  <span className="plan__detalle">
                    {fecha(x.e.inicio)} · {x.e.dias === 29.53 ? '1 día lunar' : `${x.e.dias} días`} · {alturaTexto(x.e.altura)}
                    {x.e.lugar.detalle === 'aproximado' ? ' · horizonte aproximado' : ''}
                  </span>
                </td>
                {COLUMNAS.map((c, i) => (
                  <td key={c.nombre} className={calculados.length > 1 && c.valor(x.resumen) === mejores[i] ? 'plan__mejor' : ''}>
                    {c.texto(x.resumen)}
                  </td>
                ))}
                <td>
                  {props.alSimular && x.e.lugar.id in SITIOS && (
                    <button
                      className="boton-texto"
                      onClick={() => props.alSimular!(x.e.lugar.id as IdSitio, primerAmbos(x.vSol, x.vTierra) ?? x.e.inicio)}
                      title="Simular el aterrizaje en 3D: primer instante del escenario con Sol y Tierra visibles"
                    >
                      3D
                    </button>
                  )}{' '}
                  <button className="boton-texto" onClick={() => props.alQuitar(x.e.id)} aria-label="Quitar escenario">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <svg className="plan__svg" viewBox={`-10 0 1020 ${calculados.length * 34 + 24}`} role="img" aria-label="Ventanas de cada escenario, alineadas desde su inicio">
        {calculados.map((x, i) => {
          const X = (ms: number) => ((ms - x.e.inicio) / DIA_MS / diasMax) * 1000
          const y = i * 34 + 4
          return (
            <g key={x.e.id}>
              <rect x={0} y={y} width={X(x.fin)} height={26} className="plan__fondo-fila" />
              {x.vSol.map((w, k) => (
                <rect key={`s${k}`} x={X(w.inicioMs)} y={y} width={Math.max(0.8, X(w.finMs) - X(w.inicioMs))} height={12} className="plan__barra--sol-fuerte" />
              ))}
              {x.vTierra.map((w, k) => (
                <rect key={`t${k}`} x={X(w.inicioMs)} y={y + 14} width={Math.max(0.8, X(w.finMs) - X(w.inicioMs))} height={12} className="plan__barra--tierra" />
              ))}
              <text x={6} y={y + 21} className="plan__eje plan__eje--sobre">
                {i + 1}
              </text>
            </g>
          )
        })}
        {Array.from({ length: Math.floor(diasMax / 5) + 1 }, (_, k) => k * 5).map((d) => (
          <text key={d} x={(d / diasMax) * 1000} y={calculados.length * 34 + 18} className="plan__eje" textAnchor="middle">
            {d} d
          </text>
        ))}
      </svg>
      <p className="nota">
        Cada fila empieza en el inicio de su escenario (días desde el inicio). Amarillo: Sol visible; azul: Tierra visible. En verde, la mejor cifra de
        cada columna.
      </p>
    </section>
  )
}

/** E25: el lugar y la altura elegidos, mes a mes en 2026–2030: Sol, Tierra y noche más larga por mes sinódico. */
export function MesAMes(props: { tabla: TablaLuna; punto: PuntoPlan; nombre: string; alElegir: (inicioMs: number) => void }) {
  const meses = useMemo(() => porMeses(props.tabla, props.punto, props.tabla.inicioMs, props.tabla.finMs), [props.tabla, props.punto])
  const ANCHO = 1000
  const ALTO = 160
  const w = ANCHO / meses.length
  const nocheMax = Math.max(...meses.map((m) => m.resumen.nocheMasLargaH), 1)
  const anios = [2026, 2027, 2028, 2029, 2030]
  return (
    <section className="plan__bloque" aria-label="Mes a mes">
      <h2>Mes a mes, 2026–2030 ({props.nombre})</h2>
      <svg className="plan__svg plan__svg--tiempo" viewBox={`-40 -10 ${ANCHO + 50} ${ALTO + 50}`} role="img" aria-label="Sol y Tierra visibles por mes">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={ANCHO} y1={ALTO - f * ALTO} y2={ALTO - f * ALTO} className="plan__rejilla" />
            <text x={-6} y={ALTO - f * ALTO + 4} className="plan__eje" textAnchor="end">
              {f * 100} %
            </text>
          </g>
        ))}
        {meses.map((m, i) => (
          <g key={m.inicioMs} className="plan__mes" onClick={() => props.alElegir(m.inicioMs)}>
            <title>
              {`${fecha(m.inicioMs)}: Sol ${pct(m.resumen.fraccionSol)}, Tierra ${pct(m.resumen.fraccionTierra)}, noche más larga ${horas(m.resumen.nocheMasLargaH)}`}
            </title>
            <rect x={i * w} y={0} width={w} height={ALTO} className="plan__mes-fondo" />
            <rect x={i * w + 1} y={ALTO - m.resumen.fraccionSol * ALTO} width={w / 2 - 1} height={m.resumen.fraccionSol * ALTO} className="plan__barra--sol-fuerte" />
            <rect x={i * w + w / 2} y={ALTO - m.resumen.fraccionTierra * ALTO} width={w / 2 - 1} height={m.resumen.fraccionTierra * ALTO} className="plan__barra--tierra" />
            <circle cx={i * w + w / 2} cy={ALTO - (m.resumen.nocheMasLargaH / nocheMax) * ALTO} r={2.2} className="plan__punto-noche" />
          </g>
        ))}
        {anios.map((a) => {
          const x = ((Date.UTC(a, 0, 1) - props.tabla.inicioMs) / (props.tabla.finMs - props.tabla.inicioMs)) * ANCHO
          return (
            <text key={a} x={x + 4} y={ALTO + 16} className="plan__eje">
              {a}
            </text>
          )
        })}
      </svg>
      <p className="nota">
        Por mes sinódico (29,53 d) desde el 2026-01-01. Barras: Sol visible (amarillo) y Tierra visible (azul). Puntos blancos: noche más larga del mes
        (relativa; máximo {horas(nocheMax)}). Clic en un mes para verlo arriba como período de un día lunar.
      </p>
    </section>
  )
}

/** Primer instante con Sol y Tierra visibles a la vez (o null). */
function primerAmbos(sol: Ventana[], tierra: Ventana[]): number | null {
  let mejor: number | null = null
  for (const s of sol) for (const t of tierra) {
    const a = Math.max(s.inicioMs, t.inicioMs)
    if (a < Math.min(s.finMs, t.finMs) && (mejor === null || a < mejor)) mejor = a
  }
  return mejor
}
