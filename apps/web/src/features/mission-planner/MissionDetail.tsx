import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import { plannerPath, routes } from "@/app/routes"
import {
  coordinates,
  day,
  describe,
  fromInput,
  hours,
  LIMITS,
  MAX_OUTINGS,
  OUTING_ROUTES,
  outcome,
  outingChecks,
  percent,
  provenance,
  reasons,
  scanDates,
  shortDay,
  sites,
  stamp,
  station,
  suggestDate,
  suggestHeight,
  TABLE_FROM_MS,
  TABLE_TO_MS,
  toInput,
  type DayOption,
  type Figures,
  type Mascara,
  type Mission,
  type MissionKind,
  type MissionRow,
  type Outing,
  type TablaLuna,
} from "@/shared/planning"
import { copy } from "./copy"
import { Verdict } from "@/shared/ui/Verdict"

/**
 * El planificador de una misión: primero la respuesta (cumple o no, y por qué), después las salidas comparadas
 * con el plan (otra fecha, otro lugar, más altura), las cifras de la estadía, el escenario editable y los
 * supuestos. Todo se recalcula con el motor al cambiar cualquier dato.
 */

type MissionDetailProps = {
  row: MissionRow
  table: TablaLuna
  /** Las máscaras que ya se bajaron. Para proponer otro lugar hacen falta todas. */
  masks: Record<string, Mascara>
  /** Edición del escenario. */
  onChange: (patch: Partial<Mission>) => void
  /** Una salida aplicada: se puede deshacer desde el aviso. */
  onApply: (patch: Partial<Mission>, text: string) => void
  onBack: () => void
  onRemove: () => void
}

const GROUPS = ["roi", "site", "mission"] as const

export function MissionDetail({ row, table, masks, onChange, onApply, onBack, onRemove }: MissionDetailProps) {
  const { mission, site, evaluation } = row
  const mask = masks[site.id]
  const failing = evaluation ? !evaluation.ok : false

  const st = useMemo(() => (mask ? station(site, mask, mission.panelHeightM, mission.antennaHeightM) : null), [site, mask, mission.panelHeightM, mission.antennaHeightM])
  const days = useMemo(() => (st ? scanDates(table, st, mission) : []), [table, st, mission])
  const dateOption = useMemo(() => suggestDate(days, mission.landingMs), [days, mission.landingMs])
  const heightOption = useMemo(() => (failing && mask ? suggestHeight(table, site, mask, mission, mission.panelHeightM, mission.antennaHeightM) : null), [failing, table, site, mask, mission])
  const allLoaded = sites.every((s) => masks[s.id])
  // Qué hace la misión: su tipo y sus salidas (caminatas o recorridos), cada una contra las ventanas de Sol y Tierra
  const kind: MissionKind = mission.kind ?? "lander"
  const outings = useMemo(() => mission.outings ?? [], [mission.outings])
  const checks = useMemo(() => (evaluation ? outingChecks(evaluation, outings) : []), [evaluation, outings])
  const setOuting = (i: number, patch: Partial<Outing>) => onChange({ outings: outings.map((o, k) => (k === i ? { ...o, ...patch } : o)) })
  // Los dos lugares más cercanos del catálogo que cumplen en la misma fecha y con el mismo equipo.
  const siteOptions = useMemo(() => {
    if (!failing || !allLoaded) return null
    return sites
      .filter((s) => s.id !== site.id)
      .map((s) => ({ site: s, km: Math.hypot(s.xKm - site.xKm, s.yKm - site.yKm), ...outcome(table, station(s, masks[s.id], mission.panelHeightM, mission.antennaHeightM), mission) }))
      .filter((option) => option.ok)
      .sort((a, b) => a.km - b.km)
      .slice(0, 2)
  }, [failing, allLoaded, masks, site, table, mission])

  const moveTo = (option: DayOption) => onApply({ landingMs: option.landingMs, movedFromMs: mission.movedFromMs ?? mission.landingMs }, copy.applied.date(mission.name, day(option.landingMs)))
  const cells = (f: Figures) => (
    <>
      <td>{percent(f.sunPct)}</td>
      <td>{percent(f.earthPct)}</td>
      <td>{hours(f.longestNightH)}</td>
    </>
  )

  return (
    <div className="pl-detail__in">
      <button type="button" className="ui-btn ui-btn--small pl-detail__back" onClick={onBack}>
        ← {copy.detail.back}
      </button>

      <header className="pl-detail__head">
        <h2 className="pl-detail__title">{mission.name || copy.detail.unnamed}</h2>
        <Verdict state={row.state} />
      </header>
      <p className="pl-detail__where">
        {site.name} · {coordinates(site.lat, site.lon)}
      </p>
      <p className="pl-detail__when">
        {stamp(mission.landingMs)} · {copy.detail.stay(mission.stayDays)}
        {mission.movedFromMs !== undefined && mission.movedFromMs !== mission.landingMs && <em>{copy.detail.moved(day(mission.movedFromMs))}</em>}
      </p>

      {!evaluation ? (
        <p className="ui-card__empty">{copy.wait}</p>
      ) : (
        <>
          <section className="pl-block" aria-label={copy.detail.requirements}>
            <h3 className="ui-label">{copy.detail.requirements}</h3>
            <ul className="pl-checks">
              {evaluation.checks.map((c) => {
                const text = describe(c)
                return (
                  <li key={c.id} data-ok={c.ok}>
                    <i aria-hidden="true" />
                    <strong>{text.title}</strong>
                    <span>{text.detail}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="pl-block" aria-label={failing ? copy.detail.options : copy.detail.optionsOk}>
            <h3 className="ui-label">{failing ? copy.detail.options : copy.detail.optionsOk}</h3>
            <table className="pl-options">
              <thead>
                <tr>
                  {copy.options.columns.map((column, i) => (
                    <th key={i} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr data-current="true">
                  <th scope="row">
                    {copy.options.current}
                    <small>
                      {site.name}, {day(mission.landingMs)}
                    </small>
                  </th>
                  {cells(evaluation.figures)}
                  <td>
                    <Verdict state={row.state} />
                  </td>
                </tr>
                {dateOption ? (
                  <tr>
                    <th scope="row">
                      {copy.options.date(day(dateOption.day.landingMs))}
                      <small>{copy.options.dateNote(shortDay(dateOption.window.fromMs), shortDay(dateOption.window.toMs), dateOption.slackDays)}</small>
                    </th>
                    {cells(dateOption.day.figures)}
                    <td>
                      <button type="button" className={failing ? "ui-btn ui-btn--small ui-btn--cta" : "ui-btn ui-btn--small"} onClick={() => moveTo(dateOption.day)}>
                        {copy.options.apply}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr data-none="true">
                    <td colSpan={5}>{copy.options.noDate}</td>
                  </tr>
                )}
                {failing &&
                  (siteOptions === null ? (
                    <tr data-none="true">
                      <td colSpan={5}>{copy.options.sitesLoading}</td>
                    </tr>
                  ) : siteOptions.length === 0 ? (
                    <tr data-none="true">
                      <td colSpan={5}>{copy.options.noSite}</td>
                    </tr>
                  ) : (
                    siteOptions.map((option) => (
                      <tr key={option.site.id}>
                        <th scope="row">
                          {copy.options.site(option.site.name)}
                          <small>{copy.options.siteNote(option.km)}</small>
                        </th>
                        {cells(option.figures)}
                        <td>
                          <button type="button" className="ui-btn ui-btn--small" onClick={() => onApply({ siteId: option.site.id }, copy.applied.site(mission.name, option.site.name))}>
                            {copy.options.apply}
                          </button>
                        </td>
                      </tr>
                    ))
                  ))}
                {failing &&
                  (heightOption ? (
                    <tr>
                      <th scope="row">
                        {copy.options.height(heightOption.heightM)}
                        <small>{copy.options.heightNote}</small>
                      </th>
                      {cells(heightOption.figures)}
                      <td>
                        <button
                          type="button"
                          className="ui-btn ui-btn--small"
                          onClick={() =>
                            onApply(
                              { panelHeightM: Math.max(mission.panelHeightM, heightOption.heightM), antennaHeightM: Math.max(mission.antennaHeightM, heightOption.heightM) },
                              copy.applied.height(mission.name, heightOption.heightM),
                            )
                          }
                        >
                          {copy.options.apply}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr data-none="true">
                      <td colSpan={5}>{copy.options.noHeight}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {days.length > 0 && <Calendar days={days} landingMs={mission.landingMs} onPick={moveTo} />}
          </section>

          <section className="pl-block" aria-label={copy.detail.figures}>
            <h3 className="ui-label">{copy.detail.figures}</h3>
            <dl className="pl-figures">
              <div data-body="sun">
                <dt>{copy.detail.sun}</dt>
                <dd>
                  {percent(evaluation.figures.sunPct)} <small>{hours(evaluation.figures.sunH)}</small>
                </dd>
              </div>
              <div data-body="earth">
                <dt>{copy.detail.earth}</dt>
                <dd>
                  {percent(evaluation.figures.earthPct)} <small>{hours(evaluation.figures.earthH)}</small>
                </dd>
              </div>
              <div>
                <dt>{copy.detail.both}</dt>
                <dd>
                  {percent(evaluation.figures.bothPct)} <small>{hours(evaluation.figures.bothH)}</small>
                </dd>
              </div>
              <div>
                <dt>{copy.detail.night}</dt>
                <dd>{hours(evaluation.figures.longestNightH)}</dd>
              </div>
              <div>
                <dt>{copy.detail.silence}</dt>
                <dd>{hours(evaluation.figures.longestSilenceH)}</dd>
              </div>
              <div>
                <dt>{copy.detail.panel}</dt>
                <dd>
                  {Math.round(evaluation.figures.meanPanelWm2)} <small>W/m²</small>
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <section className="pl-block" aria-label={copy.detail.scenario}>
        <h3 className="ui-label">{copy.detail.scenario}</h3>
        <div className="pl-form">
          <label className="pl-field">
            <span>{copy.form.name}</span>
            <input type="text" value={mission.name} maxLength={40} onChange={(event) => onChange({ name: event.target.value })} />
          </label>
          <label className="pl-field">
            <span>{copy.form.site}</span>
            <select value={mission.siteId} onChange={(event) => onChange({ siteId: event.target.value })}>
              {GROUPS.map((kind) => (
                <optgroup key={kind} label={copy.form.groups[kind]}>
                  {sites
                    .filter((s) => s.kind === kind)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="pl-field">
            <span>{copy.form.landing}</span>
            <input
              type="datetime-local"
              value={toInput(mission.landingMs)}
              min={toInput(TABLE_FROM_MS)}
              max={toInput(TABLE_TO_MS - mission.stayDays * 86_400_000)}
              step={600}
              onChange={(event) => {
                const ms = fromInput(event.target.value)
                if (ms !== null) onChange({ landingMs: ms })
              }}
            />
          </label>
          <NumberField label={copy.form.stay} value={mission.stayDays} limits={LIMITS.stayDays} onCommit={(stayDays) => onChange({ stayDays })} />
          <NumberField label={copy.form.panel} value={mission.panelHeightM} limits={LIMITS.heightM} step={0.5} onCommit={(panelHeightM) => onChange({ panelHeightM })} />
          <NumberField label={copy.form.antenna} value={mission.antennaHeightM} limits={LIMITS.heightM} step={0.5} onCommit={(antennaHeightM) => onChange({ antennaHeightM })} />
          <NumberField label={copy.form.battery} value={mission.requirements.batteryH} limits={LIMITS.batteryH} onCommit={(batteryH) => onChange({ requirements: { ...mission.requirements, batteryH } })} />
          <NumberField label={copy.form.earth} value={mission.requirements.minEarthPct} limits={LIMITS.minEarthPct} onCommit={(minEarthPct) => onChange({ requirements: { ...mission.requirements, minEarthPct } })} />
          <label className="pl-toggle">
            <input type="checkbox" checked={mission.requirements.sunAtLanding} onChange={(event) => onChange({ requirements: { ...mission.requirements, sunAtLanding: event.target.checked } })} />
            <span>{copy.form.sunAtLanding}</span>
          </label>
          <label className="pl-toggle">
            <input type="checkbox" checked={mission.requirements.earthAtLanding} onChange={(event) => onChange({ requirements: { ...mission.requirements, earthAtLanding: event.target.checked } })} />
            <span>{copy.form.earthAtLanding}</span>
          </label>
        </div>
      </section>

      <section className="pl-block" aria-label={copy.activity.title}>
        <h3 className="ui-label">{copy.activity.title}</h3>
        <div className="pl-form">
          <label className="pl-field">
            <span>{copy.activity.kind}</span>
            <select value={kind} onChange={(event) => onChange({ kind: event.target.value as MissionKind, outings })}>
              {(["lander", "rover", "crewed"] as const).map((k) => (
                <option key={k} value={k}>
                  {copy.activity.kinds[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {kind === "lander" ? (
          <p className="pl-note">{copy.activity.landerNote}</p>
        ) : (
          <>
            <h4 className="ui-label">{copy.activity.outings[kind]}</h4>
            {outings.length === 0 && <p className="pl-note">{copy.activity.none[kind]}</p>}
            <ol className="pl-outings">
              {outings.map((o, i) => {
                const c = checks[i]
                return (
                  <li key={i} className={c && !c.ok ? "pl-outing is-bad" : "pl-outing"}>
                    <div className="pl-form">
                      <label className="pl-field">
                        <span>{copy.activity.route}</span>
                        <select value={o.route} onChange={(event) => setOuting(i, { route: event.target.value as Outing["route"] })}>
                          {OUTING_ROUTES.map((r) => (
                            <option key={r} value={r}>
                              {copy.activity.routes[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <NumberField label={copy.activity.afterH} value={o.afterH} limits={[0, mission.stayDays * 24]} onCommit={(afterH) => setOuting(i, { afterH })} />
                    </div>
                    {c && (
                      <p className="pl-outing__when">
                        <b>{copy.activity.when(Math.floor(o.afterH / 24) + 1, stamp(c.ms))}</b> · {copy.activity.sun(c.sun)}
                        {c.sunChangeH !== null && ` (${copy.activity.change("sun", hours(c.sunChangeH), c.sun)})`} · {copy.activity.earth(c.earth)}
                        {c.earthChangeH !== null && ` (${copy.activity.change("earth", hours(c.earthChangeH), c.earth)})`}
                      </p>
                    )}
                    {c && <p className="pl-note">{c.ok ? copy.activity.good : copy.activity.bad[kind]}</p>}
                    <button type="button" className="ui-btn ui-btn--small" onClick={() => onChange({ outings: outings.filter((_, k) => k !== i) })}>
                      {copy.activity.remove}
                    </button>
                  </li>
                )
              })}
            </ol>
            {outings.length < MAX_OUTINGS && (
              <button type="button" className="ui-btn ui-btn--small" onClick={() => onChange({ outings: [...outings, { route: "science", afterH: Math.min(mission.stayDays * 24, (outings.at(-1)?.afterH ?? 0) + 24) }] })}>
                {copy.activity.add[kind]}
              </button>
            )}
          </>
        )}
        <Link className="ui-btn ui-btn--small" to={`${routes.simulator}?mission=${encodeURIComponent(mission.id)}&guia=1`}>
          {copy.activity.simulate}
        </Link>
      </section>

      <section className="pl-block" aria-label={copy.detail.equipment}>
        <h3 className="ui-label">{copy.detail.equipment}</h3>
        <dl className="pl-facts">
          <div>
            <dt>{copy.facts.panel}</dt>
            <dd>{copy.facts.panelAt(mission.panelHeightM)}</dd>
          </div>
          <div>
            <dt>{copy.facts.antenna}</dt>
            <dd>{copy.facts.antennaAt(mission.antennaHeightM)}</dd>
          </div>
          <div>
            <dt>{copy.facts.terrain}</dt>
            <dd>{copy.facts.terrainOf(site.heightM.toLocaleString("en-US"), site.slopeDeg, site.reliefM.toLocaleString("en-US"))}</dd>
          </div>
          <div>
            <dt>{copy.facts.horizon}</dt>
            <dd>{site.horizon === "detailed" ? copy.facts.detailed : copy.facts.approximate}</dd>
          </div>
        </dl>
        {site.horizon === "approximate" && <p className="pl-warning">{copy.detail.approximate}</p>}
        {site.kind === "site" && <p className="pl-note">{copy.detail.centre}</p>}
        <ul className="pl-assumptions">
          {copy.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p className="pl-note">
          {copy.facts.ephemeris}: <a href={provenance.ephemeris.url}>{provenance.ephemeris.product}</a>. {copy.facts.sites}: <a href={provenance.sites.url}>{provenance.sites.product}</a>. {copy.facts.terrain}:{" "}
          <a href={provenance.terrain.url}>{provenance.terrain.product}</a>.
        </p>
      </section>

      <footer className="pl-detail__foot">
        {/* La fecha, el equipo y los requisitos de esta misión, en el planificador de escenarios, para compararlos en sus tres zonas.
            El lugar solo viaja por su id: si es una de esas zonas queda elegida. No se mandan coordenadas, porque el planificador
            calcularía ese punto con el horizonte aproximado de 240 m y daría cifras distintas de las de esta pantalla (5 m). */}
        <Link
          className="ui-btn ui-btn--small"
          to={plannerPath({
            site: site.id,
            t: new Date(mission.landingMs).toISOString().slice(0, 16),
            stay: mission.stayDays,
            panel: mission.panelHeightM,
            antenna: mission.antennaHeightM,
            battery: mission.requirements.batteryH,
            earth: mission.requirements.minEarthPct,
            sun: mission.requirements.sunAtLanding ? 1 : 0,
            el: mission.requirements.earthAtLanding ? 1 : 0,
          })}
        >
          {copy.detail.compare}
        </Link>
        <button type="button" className="ui-link" onClick={onRemove}>
          {copy.detail.remove}
        </button>
      </footer>
    </div>
  )
}

type CalendarProps = { days: DayOption[]; landingMs: number; onPick: (option: DayOption) => void }

/** Cada día candidato de aterrizaje, 30 días antes y 120 después: relleno si cumple. Un clic mueve el aterrizaje. */
function Calendar({ days, landingMs, onPick }: CalendarProps) {
  const marks = days.map((d, i) => ({ i, date: new Date(d.landingMs) })).filter(({ date }) => date.getUTCDate() === 1)
  return (
    <div className="pl-cal">
      <p className="pl-cal__title">{copy.options.calendar}</p>
      <div className="pl-cal__months" aria-hidden="true">
        {marks.map(({ i, date }) => (
          <span key={i} style={{ left: `${(i / days.length) * 100}%` }}>
            {copy.options.months[date.getUTCMonth()]}
            {date.getUTCMonth() === 0 ? ` ${date.getUTCFullYear()}` : ""}
          </span>
        ))}
      </div>
      <div className="pl-cal__days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <button
            key={d.landingMs}
            type="button"
            data-ok={d.ok}
            data-now={d.landingMs === landingMs}
            tabIndex={d.ok ? 0 : -1}
            title={`${day(d.landingMs)}: ${d.ok ? copy.options.meets : reasons(d.checks)}`}
            aria-label={`${day(d.landingMs)}: ${d.ok ? copy.options.meets : copy.options.fails}`}
            onClick={() => onPick(d)}
          />
        ))}
      </div>
      <ul className="ui-keys" aria-hidden="true">
        <li data-key="ok">{copy.options.calendarKey.ok}</li>
        <li data-key="none">{copy.options.calendarKey.bad}</li>
        <li data-key="now">{copy.options.calendarKey.now}</li>
      </ul>
    </div>
  )
}

type NumberFieldProps = { label: string; value: number; limits: readonly [number, number]; step?: number; onCommit: (value: number) => void }

/**
 * Un número editable. Mientras se escribe manda el texto de quien escribe (se puede borrar y volver a teclear sin
 * que el campo salte al límite); al salir muestra el valor que quedó en la misión.
 */
function NumberField({ label, value, limits, step = 1, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (document.activeElement !== input.current) setText(String(value))
  }, [value])
  return (
    <label className="pl-field">
      <span>{label}</span>
      <input
        ref={input}
        type="number"
        inputMode="decimal"
        value={text}
        min={limits[0]}
        max={limits[1]}
        step={step}
        onChange={(event) => {
          setText(event.target.value)
          const number = Number(event.target.value)
          if (event.target.value !== "" && Number.isFinite(number)) onCommit(number)
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  )
}
