import { software } from "../../content"
import product from "../data/product.json"
import { PolarSky } from "./PolarSky"
import { type Figures, inside, LAST, percent, verdictOf } from "./sky"

const copy = software.compare
const { sites, spanKm } = product.compare

/** Una frase con las cifras que explican el veredicto. */
function reason(f: Figures): string {
  const sun = f.longestNightH === 0 ? "Sunlight all lunar day" : `Sunlight ${percent(f.sunPct)} of the time, longest night ${Math.round(f.longestNightH)} h`
  const earth = f.earthPct === 0 ? "no direct view of Earth" : `Earth in view ${percent(f.earthPct)}`
  return `${sun}; ${earth}.`
}

/** La pantalla "Comparar sitios": tres puntos a menos de 12 km, el mismo día lunar. */
export function CompareView({ t }: { t: number }) {
  const first = sites[0]
  const last = sites[sites.length - 1]
  return (
    <div className="sw-view sw-compare">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{copy.title}</h3>
        <span className="sw-field">{copy.period}</span>
      </header>

      <div className="sw-cards">
        {sites.map((site) => {
          const verdict = verdictOf(site.figures)
          return (
            <article key={site.id} className="sw-card">
              <h4 className="sw-card__name">{site.name}</h4>
              <p className="sw-card__where">
                {Math.abs(site.lat).toFixed(2)}° S, {site.lon.toFixed(2)}° E
              </p>
              <div className="sw-card__main">
                <PolarSky horizon={site.horizon} sun={site.sun} earth={site.earth} step={product.stepH} windows={site.windows} t={t} variant="mini" label={`Sky at ${site.name}`} />
                <dl className="sw-card__figures">
                  <div>
                    <dt>{copy.sun}</dt>
                    <dd className="sw-card__big">{percent(site.figures.sunPct)}</dd>
                  </div>
                  <div>
                    <dt>{copy.night}</dt>
                    <dd>{Math.round(site.figures.longestNightH)} h</dd>
                    <dd className="sw-card__gauge" aria-hidden="true">
                      <i style={{ width: `${(site.figures.longestNightH / LAST) * 100}%` }} />
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="sw-card__earth">
                <p>
                  <span>{copy.earth}</span>
                  <span className="sw-key" data-key="earth">
                    {copy.visible}
                  </span>
                  <span className="sw-key" data-key="none">
                    {copy.hidden}
                  </span>
                </p>
                <div className="sw-strip" role="img" aria-label={`Earth in view ${percent(site.figures.earthPct)} of the lunar day`}>
                  {site.windows.earth
                    .filter(([a]) => a < LAST)
                    .map(([a, b]) => (
                      <i key={a} style={{ left: `${(a / LAST) * 100}%`, width: `${((Math.min(b, LAST) - a) / LAST) * 100}%` }} />
                    ))}
                  <b style={{ left: `${(t / LAST) * 100}%` }} data-seen={inside(site.windows.earth, t)} />
                </div>
              </div>
              <div className="sw-card__verdict">
                <span className="sw-chip" data-state={verdict === "viable" ? "on" : verdict === "limited" ? "limited" : "off"}>
                  {copy.verdicts[verdict]}
                </span>
                <p>{reason(site.figures)}</p>
              </div>
            </article>
          )
        })}
      </div>

      <p className="sw-pull">
        Move the landing {spanKm.toFixed(0)} km and sunlight drops from {percent(first.figures.sunPct)} to {percent(last.figures.sunPct)}.
      </p>
      <p className="sw-note">{copy.thresholds}</p>
    </div>
  )
}
