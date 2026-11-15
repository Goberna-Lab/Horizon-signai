import { sources } from "../content"
import { Reveal } from "./Reveal"

export function Sources() {
  return (
    <section className="ln-sec" id="data">
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {sources.title}
        </Reveal>
        <Reveal as="p" className="ln-lede" delay={80}>
          {sources.body}
        </Reveal>
        <div className="ln-ledger">
          {sources.groups.map((group) => (
            <Reveal key={group.name} className="ln-ledger__group">
              <h3 className="ln-mono">{group.name}</h3>
              <ul className="ln-ledger__items">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <a href={item.href} target="_blank" rel="noreferrer">
                      {item.name}
                    </a>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
