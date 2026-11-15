import { Link } from "react-router"
import { plannerDemo } from "../content"
import { Reveal } from "./Reveal"

/**
 * El planificador con el caso del reto: el plan de ejemplo, el retraso y qué zonas siguen aterrizando; lo que hace
 * cada herramienta, la Luna 3D y cómo cuenta el Sol y la Tierra.
 */
export function PlannerDemo() {
  return (
    <section className="ln-sec" id="planner-demo">
      <div className="ln-wrap">
        <p className="ln-kicker ln-mono">{plannerDemo.label}</p>
        <Reveal as="h2" className="ln-title" wipe>
          {plannerDemo.title} <span className="ln-accent">{plannerDemo.accent}</span>
        </Reveal>
        <div className="ln-slip">
          <Reveal as="ol" className="ln-slip__steps" delay={80}>
            <li>{plannerDemo.plan}</li>
            <li>
              {plannerDemo.slip}
              <span className="ln-zones">
                {plannerDemo.zones.map((zone) => (
                  <span key={zone.place} className="ln-zone" data-go={zone.go || undefined} title={zone.place}>
                    {zone.zone} · {zone.go ? "GO" : "NO GO"}
                  </span>
                ))}
              </span>
            </li>
            <li>{plannerDemo.verdictWhy}</li>
          </Reveal>
          <Reveal delay={160}>
            <Link className="btn btn--primary" to={plannerDemo.openTo}>
              {plannerDemo.open}
            </Link>
          </Reveal>
        </div>

        <div className="ln-feature-cols">
          <Reveal as="div" delay={80}>
            <h3 className="ln-feature-cols__title">{plannerDemo.featuresTitle}</h3>
            <ul className="ln-bullets">
              {plannerDemo.features.map((item) => (
                <li key={item.strong}>
                  <strong>{item.strong}</strong> {item.rest}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal as="div" delay={160}>
            <h3 className="ln-feature-cols__title">{plannerDemo.moonTitle}</h3>
            <ul className="ln-bullets">
              {plannerDemo.moon.map((item) => (
                <li key={item.strong}>
                  <strong>{item.strong}</strong> {item.rest}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <p className="ln-note ln-mono">{plannerDemo.definitions}</p>
      </div>
    </section>
  )
}
