import { missionLog, missionPoints } from "../content"
import type { SiteInfo } from "./createFlight"

/** Las misiones que tienen puntos (la misión real de referencia no los tiene). */
export const pointMissions = missionLog.missions.filter((mission) => mission.points.length > 0)

const pct = (value: number | undefined) => (value === undefined ? "–" : `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`)
const hours = (value: number | undefined) => (value === undefined ? "–" : `${Math.round(value)} h`)

/**
 * Los tres puntos de la misión elegida, con el estilo de los paneles del vuelo: arriba se cambia de misión; cada
 * punto lleva su nombre y sus cifras reales (Sol, Tierra, noche más larga) y, al elegirlo, el vuelo se acerca a él
 * en el mismo mapa. Las cifras llegan con la lámina (`sites`); mientras tanto se ven guiones.
 */
export function MissionPoints({
  selected,
  sites,
  onSelect,
  onFocus,
  onPick,
}: {
  selected: string
  sites: Record<string, SiteInfo> | null
  onSelect: (id: string) => void
  onFocus: (id: string | null) => void
  onPick: (index: number) => void
}) {
  const mission = pointMissions.find((m) => m.id === selected) ?? pointMissions[0]
  return (
    <div className="fl-points">
      <p className="fl-quiz__label">{missionPoints.label}</p>
      <div className="fl-points__tabs" role="tablist" aria-label={missionLog.label}>
        {pointMissions.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === mission.id} onClick={() => onSelect(m.id)}>
            {m.id}
          </button>
        ))}
      </div>
      <h2 className="fl-scene__title">{mission.name}</h2>
      <p className="fl-log__intro">
        {mission.when} · {mission.place}
      </p>
      <p className="fl-points__intro">{missionPoints.intro}</p>
      <ol className="fl-points__list">
        {mission.points.map((id, n) => {
          const site = sites?.[id]
          return (
            <li key={id}>
              <button
                type="button"
                className="fl-points__item"
                onClick={() => onPick(n)}
                onPointerEnter={() => onFocus(id)}
                onPointerLeave={() => onFocus(null)}
                onFocus={() => onFocus(id)}
                onBlur={() => onFocus(null)}
              >
                <span className="fl-points__n">{n + 1}</span>
                <span className="fl-points__main">
                  <strong>{site?.name ?? id}</strong>
                  <span className="fl-points__figures">
                    <span>
                      {missionPoints.sun} <b>{pct(site?.sunPct)}</b>
                    </span>
                    <span>
                      {missionPoints.earth} <b>{pct(site?.earthPct)}</b>
                    </span>
                    <span>
                      {missionPoints.night} <b>{hours(site?.longestNightH)}</b>
                    </span>
                  </span>
                </span>
                <span className="fl-points__go">{missionPoints.open}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Un punto de la misión, de cerca: su nombre, dónde está y todas sus cifras reales a ras de suelo. */
export function PointDetail({
  index,
  selected,
  sites,
  onBack,
}: {
  index: number
  selected: string
  sites: Record<string, SiteInfo> | null
  onBack: () => void
}) {
  const mission = pointMissions.find((m) => m.id === selected) ?? pointMissions[0]
  const id = mission.points[index] ?? mission.points[0]
  const site = sites?.[id]
  const home = sites?.[mission.points[0]]
  const away = site && home ? Math.hypot(site.xKm - home.xKm, site.yKm - home.yKm) : 0
  const rows: Array<[string, string]> = [
    [missionPoints.sun, pct(site?.sunPct)],
    [missionPoints.earth, pct(site?.earthPct)],
    [missionPoints.both, pct(site?.bothPct)],
    [missionPoints.night, hours(site?.longestNightH)],
    [missionPoints.silence, hours(site?.longestSilenceH)],
    [missionPoints.panel, site ? `${Math.round(site.meanPanelWm2)} W/m²` : "–"],
  ]
  return (
    <div className="fl-point">
      <p className="fl-quiz__label">
        {mission.id} · {missionPoints.point} {index + 1} {missionPoints.of} {mission.points.length}
      </p>
      <h2 className="fl-scene__title">
        <span className="fl-points__n">{index + 1}</span> {site?.name ?? id}
      </h2>
      <p className="fl-log__intro">
        {missionPoints.position} {site ? `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}°` : "–"} · {missionPoints.height}{" "}
        {site ? `${Math.round(site.heightM)} m` : "–"}
        {index > 0 && away > 0 && ` · ${away.toFixed(1)} km ${missionPoints.fromSite}`}
      </p>
      <dl className="fl-point__grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="fl-point__note">{missionPoints.note}</p>
      <div className="fl-point__nav">
        <button type="button" onClick={onBack}>
          ← {missionPoints.back}
        </button>
      </div>
    </div>
  )
}
