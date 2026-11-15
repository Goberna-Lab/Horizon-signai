import { Link } from "react-router"
import { actions, closing } from "../content"
import plate from "./data/catalog-plate.webp"
import { Reveal } from "./Reveal"

export function Closing() {
  const [first, second] = closing.title.split(". ")
  return (
    <section className="ln-sec ln-closing">
      {/* La lámina vuelve al final, detrás del titular: la página termina donde empezó. */}
      <img className="ln-closing__plate" src={plate} alt="" width={1200} height={1200} loading="lazy" decoding="async" />
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-closing__title" wipe>
          <span>{first}.</span> <span>{second}</span>
        </Reveal>
        <Reveal className="ln-closing__row" delay={120}>
          <p className="ln-lede" style={{ marginTop: 0 }}>
            {closing.body}
          </p>
          <div className="ln-closing__actions">
            <Link className="btn btn--primary" to={actions.planner.to}>
              {actions.planner.label}
            </Link>
            <Link className="btn" to={actions.simulator.to}>
              {actions.simulator.label}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
