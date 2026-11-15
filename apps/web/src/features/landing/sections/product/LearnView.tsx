import { software } from "../../content"
import facts from "../../flight/data/facts.json"
import { PolarSky } from "./PolarSky"
import { sky } from "./sky"

const copy = software.learn
const earthSwing = Math.max(...sky.earth.el) - Math.min(...sky.earth.el)
const ridgeGround = Math.max(...sky.ground.horizon)
const ridgeMast = Math.max(...sky.mast.horizon)

/** La pantalla "Aprender": tres ideas del polo sur, cada una dibujada con los mismos datos del planificador. */
export function LearnView() {
  return (
    <div className="sw-view sw-learn">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{copy.title}</h3>
      </header>
      <div className="sw-cards">
        <article className="sw-card sw-card--learn">
          <PolarSky horizon={sky.ground.horizon} sun={sky.sun} variant="mini" label="The Sun's path around the horizon over one lunar day" />
          <h4 className="sw-card__name">{copy.cards.sun.title}</h4>
          <p className="sw-card__big">{facts.pole.sunMaxElevationDeg.toFixed(2)}°</p>
          <p className="sw-card__where">{copy.cards.sun.unit}</p>
        </article>
        <article className="sw-card sw-card--learn">
          <PolarSky horizon={sky.ground.horizon} earth={sky.earth} variant="mini" label="Earth's path over one lunar day: one bearing, moving up and down" />
          <h4 className="sw-card__name">{copy.cards.earth.title}</h4>
          <p className="sw-card__big">{earthSwing.toFixed(1)}°</p>
          <p className="sw-card__where">{copy.cards.earth.unit}</p>
        </article>
        <article className="sw-card sw-card--learn">
          <PolarSky horizon={sky.ground.horizon} other={sky.mast.horizon} variant="mini" label="Terrain horizon from the ground and from a 10 metre mast" />
          <h4 className="sw-card__name">{copy.cards.height.title}</h4>
          <p className="sw-card__big">
            {ridgeGround.toFixed(1)}° / {ridgeMast.toFixed(1)}°
          </p>
          <p className="sw-card__where">{copy.cards.height.unit}</p>
        </article>
      </div>
    </div>
  )
}
