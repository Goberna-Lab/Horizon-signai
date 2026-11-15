/**
 * Las misiones que sigue quien planifica: las de ejemplo, los valores por defecto y su guardado en el navegador.
 * Sin React. El guardado se salta sin error donde no hay `localStorage` (pruebas con Node, modo privado).
 */
import type { Mission, Requirements } from "./types.ts"

/** Límites de la tabla de efemérides: 2026-01-01 a 2031-01-01 (docs/04-planificador.md, 3.1). */
export const TABLE_FROM_MS = Date.UTC(2026, 0, 1)
export const TABLE_TO_MS = Date.UTC(2031, 0, 1)
export const LIMITS = { stayDays: [1, 60], heightM: [0, 30], batteryH: [0, 720], minEarthPct: [0, 100] } as const

/**
 * Requisitos de ejemplo (**supuesto**, no salen de ninguna misión real): batería para 50 h sin Sol, la Tierra a la
 * vista al menos el 40 % de la estadía, y Sol y Tierra a la vista al aterrizar.
 */
export const DEFAULT_REQUIREMENTS: Requirements = { batteryH: 50, minEarthPct: 40, sunAtLanding: true, earthAtLanding: true }

const utc = (year: number, month: number, day: number, hour = 12) => Date.UTC(year, month - 1, day, hour)

/**
 * Misiones de ejemplo. Los nombres, las fechas, la estadía de 10 días y el equipo a 10 m son inventados para
 * mostrar la herramienta (**supuesto**); los lugares son del catálogo y las cifras las calcula el motor.
 * INTI-2 cuenta el caso de uso central: el aterrizaje se atrasó del 8 al 29 de marzo y dejó de cumplir.
 */
export const EXAMPLE_MISSIONS: Mission[] = [
  { id: "killa-1", name: "KILLA-1", siteId: "peak-near-shackleton", landingMs: utc(2027, 1, 14), stayDays: 10, panelHeightM: 10, antennaHeightM: 10, requirements: DEFAULT_REQUIREMENTS, example: true },
  { id: "inti-2", name: "INTI-2", siteId: "connecting-ridge", landingMs: utc(2027, 3, 29), movedFromMs: utc(2027, 3, 8), stayDays: 10, panelHeightM: 10, antennaHeightM: 10, requirements: DEFAULT_REQUIREMENTS, example: true },
  { id: "chaska-3", name: "CHASKA-3", siteId: "de-gerlache-rim", landingMs: utc(2027, 7, 24), stayDays: 10, panelHeightM: 10, antennaHeightM: 10, requirements: DEFAULT_REQUIREMENTS, example: true },
]

const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(Math.max(value, low), high)
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback)

/** Deja la misión dentro de los límites del motor: fechas dentro de la tabla, alturas y requisitos con sentido. */
export function sanitize(m: Mission): Mission {
  const stayDays = Math.round(clamp(finite(m.stayDays, 10), LIMITS.stayDays))
  return {
    ...m,
    name: String(m.name ?? "").slice(0, 40),
    stayDays,
    landingMs: clamp(finite(m.landingMs, TABLE_FROM_MS), [TABLE_FROM_MS, TABLE_TO_MS - stayDays * 86_400_000]),
    panelHeightM: clamp(finite(m.panelHeightM, 2), LIMITS.heightM),
    antennaHeightM: clamp(finite(m.antennaHeightM, 2), LIMITS.heightM),
    requirements: {
      batteryH: clamp(finite(m.requirements?.batteryH, DEFAULT_REQUIREMENTS.batteryH), LIMITS.batteryH),
      minEarthPct: clamp(finite(m.requirements?.minEarthPct, DEFAULT_REQUIREMENTS.minEarthPct), LIMITS.minEarthPct),
      sunAtLanding: m.requirements?.sunAtLanding !== false,
      earthAtLanding: m.requirements?.earthAtLanding !== false,
    },
  }
}

/** Una misión nueva: aterriza a las 12:00 UTC del día 30 desde hoy, con el equipo a 2 m (**supuesto**: un módulo pequeño). */
export function newMission(existing: Mission[], nowMs: number, siteId: string): Mission {
  let n = existing.length + 1
  while (existing.some((m) => m.name === `MISSION-${n}`)) n++
  const day = Math.floor((nowMs + 30 * 86_400_000) / 86_400_000) * 86_400_000
  return sanitize({ id: `m-${nowMs.toString(36)}-${n}`, name: `MISSION-${n}`, siteId, landingMs: day + 12 * 3_600_000, stayDays: 10, panelHeightM: 2, antennaHeightM: 2, requirements: DEFAULT_REQUIREMENTS })
}

const KEY = "horizon-signai.planner.missions.v1"

/** Las misiones guardadas en este navegador o, si no hay, las de ejemplo. Las que apuntan a un lugar desconocido se descartan. */
export function loadMissions(knownSites: Set<string>): Mission[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return EXAMPLE_MISSIONS
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return EXAMPLE_MISSIONS
    return list.filter((m) => m && typeof m.id === "string" && knownSites.has(m.siteId)).map(sanitize)
  } catch {
    return EXAMPLE_MISSIONS
  }
}

export function saveMissions(list: Mission[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list))
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): la sesión sigue, solo no se guarda.
  }
}
