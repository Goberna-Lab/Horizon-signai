import { useState } from "react"
import { catalog as copy, software } from "../../content"
import data from "../data/catalog.json"
import positions from "../data/catalog-positions.json"
import plate from "../data/catalog-plate.webp"
import { type Figures, percent } from "./sky"

/**
 * La pantalla "Mapa": el catálogo sobre la lámina. La lámina es una captura del propio lienzo
 * (`scripts/capture-landing-plates.mjs`) y la posición de cada sitio se guardó al capturarla.
 */

type Metric = keyof Figures
const where: Record<string, number[]> = positions
const FORMAT: Record<Metric, (value: number) => string> = {
  sunPct: percent,
  earthPct: percent,
  bothPct: percent,
  longestNightH: (value) => `${Math.round(value)} h`,
  longestSilenceH: (value) => `${Math.round(value)} h`,
  meanPanelWm2: (value) => `${Math.round(value)} W/m²`,
}
const METRICS = Object.keys(copy.metrics) as Metric[]

export function MapView() {
  const [selected, setSelected] = useState("connecting-ridge")
  const site = data.sites.find((s) => s.id === selected) ?? data.sites[0]
  const regions = [...site.regions].sort((a, b) => b.sunPct - a.sunPct)

  return (
    <div className="sw-view sw-map">
      <header className="sw-view__head">
        <h3 className="sw-view__title">{software.map.title}</h3>
        <span className="sw-field">{copy.period}</span>
      </header>

      <div className="sw-map__main">
        <div className="sw-map__chart">
          <div className="sw-map__plate">
            <img src={plate} alt="Relief of the lunar south pole within 195 km, drawn from LOLA elevation." width={1200} height={1200} loading="lazy" decoding="async" />
            {data.sites.map((s) => (
              <button key={s.id} type="button" className="sw-pin" style={{ left: `${where[s.id][0] * 100}%`, top: `${where[s.id][1] * 100}%` }} aria-pressed={s.id === selected} aria-label={s.name} onClick={() => setSelected(s.id)}>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <ul className="sw-map__list" aria-label="Sites">
            {data.sites.map((s) => (
              <li key={s.id}>
                <button type="button" aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <article className="sw-map__panel" aria-live="polite">
          <p className="sw-label">{copy.kinds[site.kind as keyof typeof copy.kinds]}</p>
          <h4 className="sw-map__name">{site.name}</h4>
          <p className="sw-card__where">
            {Math.abs(site.lat).toFixed(3)}° S, {site.lon.toFixed(3)}° E, {site.heightM.toLocaleString("en-US")} m
          </p>

          <table className="sw-table">
            <thead>
              <tr>
                <td />
                <th scope="col">{copy.columns.ground}</th>
                <th scope="col">{copy.columns.mast}</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => (
                <tr key={metric}>
                  <th scope="row">{copy.metrics[metric]}</th>
                  <td>{FORMAT[metric](site.ground[metric])}</td>
                  <td>{FORMAT[metric](site.mast10m[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {regions.length > 0 && (
            <table className="sw-table sw-table--regions">
              <caption>{copy.regionsTitle}</caption>
              <thead>
                <tr>
                  {copy.regionColumns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => (
                  <tr key={region.id}>
                    <th scope="row">{region.name}</th>
                    <td>{percent(region.sunPct)}</td>
                    <td>{percent(region.earthPct)}</td>
                    <td>{Math.round(region.longestNightH)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="sw-note">
            {copy.horizon[site.horizon as keyof typeof copy.horizon]}.{site.kind === "site" ? ` ${copy.centreNote}` : ""}
          </p>
        </article>
      </div>
    </div>
  )
}
