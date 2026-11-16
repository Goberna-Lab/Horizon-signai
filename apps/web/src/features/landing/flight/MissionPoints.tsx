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

/** Iconos simples de trazo para cada cifra del punto de cerca. */
const ICONS = {
  sun: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  ),
  earth: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5M12 3.5C9.4 5.9 8.2 8.7 8.2 12s1.2 6.1 3.8 8.5" />
    </svg>
  ),
  both: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="9" r="3.5" />
      <path d="M8 2.5v1.5M8 14v1.5M1.5 9H3M13 9h1.5" />
      <circle cx="16" cy="15.5" r="5" />
      <path d="M11 15.5h10" />
    </svg>
  ),
  night: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 15.5A8 8 0 0 1 8.5 5a8 8 0 1 0 10.5 10.5Z" />
      <rect x="15" y="3" width="6" height="3.5" rx="0.8" />
    </svg>
  ),
  silence: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20v-7M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9.2 9.2 0 0 1 13 0" />
      <path d="M4 4l16 16" />
    </svg>
  ),
  panel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 15l3-9h12l3 9Z" />
      <path d="M9 6l-1 9M15 6l1 9M4.5 10.5h15M12 15v5M8 20h8" />
    </svg>
  ),
}

/** La duración en palabras sencillas: días (con un decimal) si pasa de dos días, si no horas. */
const span = (h: number) =>
  h >= 48 ? `${(h / 24).toFixed(1)} ${missionPoints.days}` : `${Math.round(h)} ${missionPoints.hoursWord}`

/** El día lunar del relato en horas: las barras de tiempo se miden contra él. */
const LUNAR_DAY_H = 709

/**
 * Un punto de la misión, de cerca, explicado para quien no sabe del tema: un veredicto en una frase (los mismos
 * requisitos de ejemplo que la ventana "Compare") y, por cada cifra, un icono, una barra y qué significa en la
 * práctica. Todas las cifras son reales: motor del proyecto, a ras de suelo.
 */
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
  const verdict = site ? (site.sunPct >= 75 && site.earthPct >= 25 ? "viable" : site.sunPct < 35 || site.earthPct < 5 ? "no" : "limited") : null
  const say = (text: string, value: string) => text.replace("{n}", value)
  const rows: Array<{ key: keyof typeof ICONS; label: string; value: string; fill: number; tone: string; text: string }> = site
    ? [
        { key: "sun", label: missionPoints.sun, value: pct(site.sunPct), fill: site.sunPct / 100, tone: "sun", text: say(missionPoints.explain.sun, pct(site.sunPct)) },
        { key: "earth", label: missionPoints.earth, value: pct(site.earthPct), fill: site.earthPct / 100, tone: "earth", text: say(missionPoints.explain.earth, pct(site.earthPct)) },
        { key: "both", label: missionPoints.both, value: pct(site.bothPct), fill: site.bothPct / 100, tone: "both", text: say(missionPoints.explain.both, pct(site.bothPct)) },
        {
          key: "night",
          label: missionPoints.night,
          value: site.longestNightH > 0 ? span(site.longestNightH) : "0",
          fill: site.longestNightH / LUNAR_DAY_H,
          tone: "dark",
          text: site.longestNightH > 0 ? say(missionPoints.explain.night, span(site.longestNightH)) : missionPoints.explain.nightNone,
        },
        { key: "silence", label: missionPoints.silence, value: span(site.longestSilenceH), fill: site.longestSilenceH / LUNAR_DAY_H, tone: "dark", text: say(missionPoints.explain.silence, span(site.longestSilenceH)) },
        {
          key: "panel",
          label: missionPoints.panel,
          value: `${Math.round(site.meanPanelWm2)} W/m²`,
          fill: site.meanPanelWm2 / 1361,
          tone: "sun",
          text: say(missionPoints.explain.panel, pct(Math.round((site.meanPanelWm2 / 1361) * 100))),
        },
      ]
    : []
  return (
    <div className="fl-point">
      <div className="fl-point__top">
        <p className="fl-quiz__label">
          {mission.id} · {missionPoints.point} {index + 1} {missionPoints.of} {mission.points.length}
        </p>
        <button type="button" className="fl-quiz__show" onClick={onBack}>
          ← {missionPoints.back}
        </button>
      </div>
      <h2 className="fl-scene__title">
        <span className="fl-points__n">{index + 1}</span> {site?.name ?? id}
      </h2>
      <p className="fl-log__intro">
        {missionPoints.position} {site ? `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}°` : "–"} · {missionPoints.height}{" "}
        {site ? `${Math.round(site.heightM)} m` : "–"}
        {index > 0 && away > 0 && ` · ${away.toFixed(1)} km ${missionPoints.fromSite}`}
      </p>
      {verdict && (
        <p className="fl-point__verdict" data-verdict={verdict}>
          <strong>{missionPoints.verdict[verdict].label}</strong>
          <span>{missionPoints.verdict[verdict].say}</span>
        </p>
      )}
      <p className="fl-point__day">{missionPoints.lunarDay}</p>
      <ul className="fl-point__rows">
        {rows.map((row) => (
          <li key={row.key} className="fl-point__row" data-tone={row.tone}>
            <span className="fl-point__icon">{ICONS[row.key]}</span>
            <span className="fl-point__body">
              <span className="fl-point__head">
                <span>{row.label}</span>
                <b>{row.value}</b>
              </span>
              <span className="fl-point__bar" aria-hidden="true">
                <i style={{ width: `${Math.min(Math.max(row.fill, 0), 1) * 100}%` }} />
              </span>
              <span className="fl-point__text">{row.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="fl-point__note">{missionPoints.note}</p>
      <p className="fl-point__next">{missionPoints.next} ↓</p>
    </div>
  )
}
