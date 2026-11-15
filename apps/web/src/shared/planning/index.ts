/**
 * Núcleo de planificación: el motor validado, las misiones y los datos, con una sola puerta de entrada.
 *
 * Lo usan la vista general y el planificador (`features/mission-planner`), el simulador (`features/simulator`) y
 * el asistente con IA. Ninguna pantalla calcula por su cuenta: todas leen de aquí, así las cifras coinciden.
 * Guía: `CLAUDE.md` de esta carpeta. Cálculo: docs/04-planificador.md.
 */
export type { Mission, Requirements, Site, SiteKind } from "./model/types.ts"
export { DAY_MS, HOUR_MS, RAISE_TO_M, STEP_MS, check, dateWindows, evaluate, figures, outcome, scanDates, station, suggestDate, suggestHeight, sweep } from "./model/evaluate.ts"
export type { Check, CheckId, DateWindow, DayOption, Evaluation, Figures, HeightOption, Outcome, Scenario, Station } from "./model/evaluate.ts"
export { against, clock, coordinates, day, describe, fromInput, hours, percent, reasons, shortDay, span, stamp, toInput } from "./model/format.ts"
export { DEFAULT_REQUIREMENTS, EXAMPLE_MISSIONS, LIMITS, TABLE_FROM_MS, TABLE_TO_MS, newMission, sanitize } from "./model/missions.ts"
export { margenSol, margenTierra } from "./engine/planificador.ts"
export type { Barrido, Ventana } from "./engine/planificador.ts"
export type { TablaLuna } from "./engine/efemeridesLuna.ts"
export type { Mascara, PerfilHorizonte } from "./engine/mascara.ts"
export { horizonteEn, perfilDesde } from "./engine/mascara.ts"
export { loadMask, loadTable, plate, provenance, siteById, sites } from "./data/load.ts"
export { missionStore, useMissions } from "./store.ts"
export { useEvaluations, useMasks, useTable, type MissionRow } from "./hooks.ts"
export { missionContext } from "./context.ts"
