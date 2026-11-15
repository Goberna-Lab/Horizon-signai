import { validation } from "../content"
import { Reveal } from "./Reveal"

const TONES = ["ln-tile--ink", "", "ln-tile--screen", ""]

export function Validation() {
  return (
    <section className="ln-sec" id="validation">
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {validation.title}
        </Reveal>
        <Reveal as="p" className="ln-lede" delay={80}>
          {validation.body}
        </Reveal>
        <div className="ln-tiles">
          {validation.tiles.map((tile, i) => (
            <Reveal as="article" key={tile.label} className={`ln-tile ${TONES[i]}`} delay={i * 70}>
              <data className="ln-tile__value" value={tile.value}>
                {tile.value}
              </data>
              <div>
                <h3 className="ln-tile__label">{tile.label}</h3>
                <p className="ln-tile__detail">{tile.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <details className="ln-checks">
          <summary>{validation.moreLabel}</summary>
          <div className="ln-checks__body">
            <dl className="ln-checks__list">
              {validation.checks.map((check) => (
                <div key={check.claim}>
                  <dt>{check.claim}</dt>
                  <dd className="ln-checks__against">{check.against}</dd>
                  <dd>{check.result}</dd>
                </div>
              ))}
            </dl>
            <div className="ln-checks__limits">
              <h3 className="ln-mono">{validation.limitsTitle}</h3>
              <ul>
                {validation.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
