import { team } from "../content"
import { Reveal } from "./Reveal"

/** El equipo y lo que sigue. */
export function Team() {
  return (
    <section className="ln-sec" id="team">
      <div className="ln-wrap ln-team">
        <Reveal>
          <p className="ln-kicker ln-mono">{team.label}</p>
          <h2 className="ln-team__name">{team.name}</h2>
          <p className="ln-team__place ln-mono">{team.place}</p>
          <ul className="ln-team__members">
            {team.members.map((member) => (
              <li key={member}>{member}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <h3 className="ln-feature-cols__title">{team.nextTitle}</h3>
          <ol className="ln-team__next">
            {team.next.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  )
}
