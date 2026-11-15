/**
 * Las misiones de quien planifica: una sola lista para toda la aplicación (vista general, planificador, simulador
 * y asistente), guardada en este navegador. Cualquier pantalla la lee con `useMissions()` y la cambia con
 * `missionStore`; todas se enteran del cambio.
 */
import { useSyncExternalStore } from "react"
import { sites } from "./data/load.ts"
import { EXAMPLE_MISSIONS, loadMissions, sanitize, saveMissions } from "./model/missions.ts"
import type { Mission } from "./model/types.ts"

let missions: Mission[] = loadMissions(new Set(sites.map((s) => s.id)))
const listeners = new Set<() => void>()

function set(next: Mission[]) {
  missions = next
  saveMissions(missions)
  for (const listener of listeners) listener()
}

export const missionStore = {
  get: () => missions,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  add: (mission: Mission) => set([...missions, sanitize(mission)]),
  /** Cambia campos de una misión. Las demás conservan su identidad: sus cifras no se recalculan. */
  update: (id: string, patch: Partial<Mission>) => set(missions.map((m) => (m.id === id ? sanitize({ ...m, ...patch }) : m))),
  /** Devuelve una misión a un estado anterior (deshacer). */
  replace: (mission: Mission) => set(missions.map((m) => (m.id === mission.id ? mission : m))),
  remove: (id: string) => set(missions.filter((m) => m.id !== id)),
  restoreExamples: () => set(EXAMPLE_MISSIONS),
}

export const useMissions = () => useSyncExternalStore(missionStore.subscribe, missionStore.get)
