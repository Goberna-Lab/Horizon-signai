import { tr } from "@/shared/i18n"
import { software } from "../../content"
import { PolarSky } from "./PolarSky"
import { at, type HeightId, horizonAt, LAST, sky, span, stamp, stateOf } from "./sky"
import { Timeline } from "./Timeline"

const copy = software.lander
const HEIGHTS: Array<[HeightId, string]> = [
  ["ground", tr("Ground level", "A ras del suelo")],
  ["mast", tr("10 m mast", "Mástil de 10 m")],
]

type LanderProps = {
  t: number
  height: HeightId
  playing: boolean
  onTime: (t: number) => void
  onPlay: () => void
  onHeight: (height: HeightId) => void
}

/** La pantalla "Lander": dónde están el Sol y la Tierra ahora, cuánto falta para que se oculten y sus ventanas. */
export function LanderView({ t, height, playing, onTime, onPlay, onHeight }: LanderProps) {
  const view = sky[height]
  const other = sky[height === "ground" ? "mast" : "ground"]
  const [, sunEl] = at(sky.sun, t)
  const [earthAz, earthEl] = at(sky.earth, t)
  const sun = stateOf(view.windows.sun, t)
  const earth = stateOf(view.windows.earth, t)
  const earthAbove = earthEl - horizonAt(view.horizon, earthAz)
  const signal = !earth.visible ? "off" : earthAbove < 1 ? "limited" : "on"

  const countdown = (body: "sun" | "earth", state: { visible: boolean; hours: number | null }, labels: { set: string; rise: string; always: string }) => (
    <div className="sw-count" data-body={body}>
      <span>{state.hours === null ? labels.always : state.visible ? labels.set : labels.rise}</span>
      <strong>{state.hours === null ? copy.whole : span(state.hours)}</strong>
    </div>
  )

  return (
    <div className="sw-view sw-lander">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{copy.title}</h3>
        <div className="sw-seg" role="group" aria-label={tr("Observer height", "Altura de observación")}>
          {HEIGHTS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={height === id} onClick={() => onHeight(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="sw-lander__main">
        <div className="sw-lander__sky">
          <PolarSky
            horizon={view.horizon}
            other={other.horizon}
            sun={sky.sun}
            earth={sky.earth}
            windows={view.windows}
            t={t}
            below={copy.below}
            label={tr(
              `Sky at ${sky.site.name}: the Sun is ${sun.visible ? "above" : "below"} the terrain horizon and Earth is ${earth.visible ? "above" : "below"} it.`,
              `Cielo en ${sky.site.name}: el Sol está ${sun.visible ? "por encima" : "por debajo"} del horizonte del relieve y la Tierra está ${earth.visible ? "por encima" : "por debajo"}.`,
            )}
          />
        </div>
        <div className="sw-lander__side">
          <div className="sw-chips">
            <span className="sw-chip" data-state={sun.visible ? "on" : "off"}>
              {sun.visible ? copy.power.on : copy.power.off}
            </span>
            <span className="sw-chip" data-state={signal}>
              {copy.signal[signal]}
            </span>
          </div>
          {countdown("sun", sun, copy.sun)}
          {countdown("earth", earth, copy.earth)}
          <dl className="sw-stats">
            <div>
              <dt>{copy.stats.sun}</dt>
              <dd>{sunEl.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>{copy.stats.panel}</dt>
              <dd>
                {view.panelWm2[Math.min(Math.round(t), LAST)]} <small>W/m²</small>
              </dd>
            </div>
            <div>
              <dt>{copy.stats.earth}</dt>
              <dd>{earthEl.toFixed(1)}°</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="sw-lander__foot">
        <button type="button" className="sw-play" data-playing={playing} onClick={onPlay} aria-label={playing ? tr("Pause", "Pausar") : tr("Play", "Reproducir")}>
          <i />
        </button>
        <output className="sw-lander__date">{stamp(t)}</output>
        <span className="sw-label">{copy.window}</span>
        <ul className="sw-legend" aria-hidden="true">
          <li data-key="sun">{copy.legend.sun}</li>
          <li data-key="earth">{copy.legend.earth}</li>
          <li data-key="none">{copy.legend.none}</li>
        </ul>
      </div>
      <Timeline windows={view.windows} t={t} onTime={onTime} names={copy.rows} now={copy.now} />
    </div>
  )
}
