import { problem } from "../content"
import { Reveal } from "./Reveal"

/** El problema en tres cifras: por qué el polo sur es difícil y por qué hoy cuesta responder. */
export function Problem() {
  return (
    <section className="ln-sec" id="problem">
      <div className="ln-wrap">
        <div className="ln-problem__head">
          <div>
            <p className="ln-kicker ln-mono">{problem.label}</p>
            <Reveal as="h2" className="ln-title" wipe>
              {problem.title} <span className="ln-accent">{problem.ask}</span>
            </Reveal>
            <Reveal as="p" className="ln-lede" delay={80}>
              {problem.body}
            </Reveal>
            <Reveal as="p" className="ln-when__slip" delay={160}>
              <strong>{problem.when.slip.lead}</strong> {problem.when.slip.text}
            </Reveal>
          </div>
          <Reveal as="figure" className="ln-problem__sketch" delay={160}>
            <HorizonSketch />
            <figcaption className="ln-mono">{problem.sketch.caption}</figcaption>
            <DayStrip />
          </Reveal>
        </div>
        <div className="ln-stats">
          {problem.stats.map((stat, i) => (
            <Reveal as="article" key={stat.value} className="ln-stat" delay={i * 80}>
              <strong className="ln-stat__value">{stat.value}</strong>
              <p className="ln-stat__label">{stat.label}</p>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" className="ln-stats__close" delay={240}>
          {problem.close} <strong>{problem.closeStrong}</strong>
        </Reveal>
        <p className="ln-note ln-mono">{problem.note}</p>
      </div>
    </section>
  )
}

/**
 * Lo que hace el producto, en pequeño: un día lunar real de Connecting Ridge a ras del suelo, con los tramos en que se
 * ven el Sol y la Tierra. Cada tramo mide lo que dura (horas del motor, `facts.day`).
 */
function DayStrip() {
  const w = problem.when
  const sun = spans(w.day.sun)
  const earth = spans(w.day.earth)
  const total = sun.at(-1)?.[1] ?? 1
  // Tramos con los dos a la vista, y el instante del dibujo: el Sol tapado mientras la Tierra se ve.
  const both = overlap(sun, earth)
  const moment = overlap(
    sun.filter(([, , on]) => !on).map(([a, b]) => [a, b, true] as Span),
    earth,
  )[0]
  const rows = [
    { key: "sun", label: w.sun, value: w.sunPct, spans: sun },
    { key: "earth", label: w.earth, value: w.earthPct, spans: earth },
    { key: "both", label: w.both, value: w.bothPct, spans: fill(both, total) },
  ]
  return (
    <div className="ln-when">
      <p className="ln-when__title">{w.title}</p>
      <p className="ln-when__body">{w.body}</p>
      <div className="ln-when__chart">
        {rows.map((row) => (
          <div key={row.key} className="ln-when__row" data-row={row.key}>
            <span className="ln-when__label">
              {row.label} <b>{row.value}</b>
            </span>
            <span className="ln-when__bar" role="img" aria-label={`${row.label}: ${row.value}`}>
              {row.spans.map(([a, b, on], i) => (
                <i key={i} data-on={on || undefined} style={{ flexGrow: (b - a) / total }} />
              ))}
            </span>
          </div>
        ))}
        {moment && (
          <span
            className="ln-when__moment"
            style={{ "--from": moment[0] / total, "--to": moment[1] / total } as React.CSSProperties}
          >
            <span className="ln-mono">↑ {w.moment}</span>
          </span>
        )}
      </div>
      <div className="ln-when__axis ln-mono">
        <span>{w.start}</span>
        <span className="ln-when__key">
          <i data-on /> <i data-on="earth" /> {w.shown} <i /> {w.hidden}
        </span>
        <span>{w.end}</span>
      </div>
      <p className="ln-when__both">{w.bothNote}</p>
    </div>
  )
}

/** Un tramo del día: [desde, hasta, a la vista], en horas desde el comienzo. */
type Span = [number, number, boolean]

/** Los tramos [visible, horas] de `facts.day`, como intervalos con su comienzo y su fin. */
function spans(runs: ReadonlyArray<ReadonlyArray<number>>): Span[] {
  let t = 0
  return runs.map(([on, h]) => {
    const span: Span = [t, t + h, on === 1]
    t += h
    return span
  })
}

/** Los intervalos en que las dos series están a la vista. */
function overlap(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  for (const [a0, a1, aOn] of a)
    for (const [b0, b1, bOn] of b) {
      const from = Math.max(a0, b0)
      const to = Math.min(a1, b1)
      if (aOn && bOn && to > from) out.push([from, to, true])
    }
  return out
}

/** Completa los huecos entre intervalos visibles con tramos fuera de vista, de 0 a `total`. */
function fill(on: Span[], total: number): Span[] {
  const out: Span[] = []
  let t = 0
  for (const [from, to] of on) {
    if (from > t) out.push([t, from, false])
    out.push([from, to, true])
    t = to
  }
  if (t < total) out.push([t, total, false])
  return out
}

/**
 * Corte del horizonte, sin escala: el módulo en su meseta, una cresta delante, el Sol rasante detrás de ella (está
 * sobre el horizonte, pero el módulo no lo ve) y la Tierra más alta, con enlace directo. Explica el párrafo de al lado.
 */
function HorizonSketch() {
  const s = problem.sketch
  return (
    <svg viewBox="0 40 520 250" role="img" aria-label={s.caption}>
      {/* Nivel del horizonte (0°) */}
      <line className="ln-sk__level" x1="0" y1="232" x2="520" y2="232" />
      <text className="ln-sk__text ln-sk__text--soft" x="150" y="226">
        {s.level}
      </text>

      {/* El Sol: sobre el horizonte, detrás de la cresta */}
      <g className="ln-sk__sun">
        <circle cx="468" cy="206" r="15" />
        <path d="M468 180v-8M468 232v8M442 206h-8M494 206h8M450 188l-6-6M486 188l6-6" />
      </g>
      <text className="ln-sk__text" x="516" y="160" textAnchor="end">
        {s.sun}
      </text>

      {/* La Tierra, más alta: se ve */}
      <g className="ln-sk__earth">
        <circle cx="300" cy="96" r="19" />
        <path d="M285 88c8 4 18 2 24-6M290 106c6-3 14-1 20 4" />
      </g>
      <text className="ln-sk__text" x="326" y="72">
        {s.earth}
      </text>

      {/* Líneas de visión desde la antena del módulo */}
      <line className="ln-sk__ray ln-sk__ray--ok" x1="74" y1="214" x2="282" y2="104" />
      <line className="ln-sk__ray ln-sk__ray--blocked" x1="74" y1="214" x2="372" y2="197" />
      <text className="ln-sk__text" x="150" y="140" transform="rotate(-28 150 140)">
        {s.link}
      </text>

      {/* El terreno: meseta del módulo y la cresta */}
      <path className="ln-sk__ground" d="M0 246 L150 244 L210 238 L290 214 L350 196 L384 186 L410 198 L452 222 L520 236 L520 290 L0 290 Z" />
      <path className="ln-sk__x" d="M364 189l16 16M380 189l-16 16" />
      <text className="ln-sk__text ln-sk__text--signal" x="376" y="180" textAnchor="end">
        {s.blocked}
      </text>

      <text className="ln-sk__text ln-sk__text--paper" x="384" y="222" textAnchor="middle">
        {s.ridge}
      </text>

      {/* El módulo */}
      <g className="ln-sk__lander">
        <path d="M60 244l6-14M88 244l-6-14" />
        <rect x="62" y="220" width="24" height="12" />
        <path d="M74 220v-6M70 214h8" />
      </g>
      <text className="ln-sk__text ln-sk__text--paper" x="74" y="272" textAnchor="middle">
        {s.lander}
      </text>
    </svg>
  )
}
