import { audience } from "../content"
import { Reveal } from "./Reveal"

export function Audience() {
  return (
    <section className="ln-sec">
      <div className="ln-wrap ln-audience">
        <Reveal as="blockquote" className="ln-quote">
          <p>&ldquo;{audience.quote}&rdquo;</p>
          <footer className="ln-mono">{audience.attribution}</footer>
        </Reveal>
        <Reveal delay={140}>
          <p className="ln-lede" style={{ marginTop: 0 }}>
            {audience.body}
          </p>
          <dl className="ln-measures">
            {audience.measures.map((measure) => (
              <div key={measure.term}>
                <dt>{measure.term}</dt>
                <dd>{measure.detail}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}
