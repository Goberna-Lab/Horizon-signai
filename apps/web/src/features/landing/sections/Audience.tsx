import { audience, audienceGroups } from "../content"
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
      {/* Para quién es: tres públicos, cada uno con lo que gana. */}
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {audienceGroups.title} <span className="ln-accent">{audienceGroups.accent}</span>
        </Reveal>
        <div className="ln-groups">
          {audienceGroups.groups.map((group, i) => (
            <Reveal as="article" key={group.name} className="ln-group" delay={i * 80}>
              <h3>{group.name}</h3>
              <p>{group.detail}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
