/** El contexto de una misión para el asistente con IA: las cifras del motor en el formato del contrato compartido. */
import type { MissionContext } from "@horizon-signai/shared"
import type { MissionRow } from "./hooks.ts"
import { describe } from "./model/format.ts"

const round = (value: number, digits = 1) => Number(value.toFixed(digits))

/** `null` mientras la misión no esté calculada. */
export function missionContext(row: MissionRow): MissionContext | null {
  const { mission, site, evaluation } = row
  if (!evaluation) return null
  const f = evaluation.figures
  return {
    mission: {
      name: mission.name,
      site: site.name,
      latDeg: site.lat,
      lonEastDeg: site.lon,
      landingUTC: new Date(mission.landingMs).toISOString(),
      stayDays: mission.stayDays,
      panelHeightM: mission.panelHeightM,
      antennaHeightM: mission.antennaHeightM,
    },
    requirements: mission.requirements,
    figures: {
      sunPct: round(f.sunPct),
      earthPct: round(f.earthPct),
      bothPct: round(f.bothPct),
      longestNightH: round(f.longestNightH),
      longestSilenceH: round(f.longestSilenceH),
      meanPanelWm2: Math.round(f.meanPanelWm2),
    },
    landing: { sunMarginDeg: round(evaluation.landing.sunMarginDeg, 2), earthMarginDeg: round(evaluation.landing.earthMarginDeg, 2) },
    verdict: { ok: evaluation.ok, failed: evaluation.checks.filter((c) => !c.ok).map((c) => `${describe(c).title}: ${describe(c).detail}`) },
    horizon: site.horizon,
  }
}
