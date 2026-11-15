import { problem } from "../content"
import { Reveal } from "./Reveal"

/** El problema en tres cifras: por qué el polo sur es difícil y por qué hoy cuesta responder. */
export function Problem() {
  return (
    <section className="ln-sec" id="problem">
      <div className="ln-wrap">
        <p className="ln-kicker ln-mono">{problem.label}</p>
        <Reveal as="h2" className="ln-title" wipe>
          {problem.title} <span className="ln-accent">{problem.ask}</span>
        </Reveal>
        <Reveal as="p" className="ln-lede" delay={80}>
          {problem.body}
        </Reveal>
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
