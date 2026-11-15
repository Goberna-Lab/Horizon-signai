/**
 * Los datos del motor dentro de React: la tabla de efemérides, las máscaras de horizonte de los lugares que se
 * piden y la evaluación de cada misión. Lo usan todas las pantallas que muestran cifras de una misión.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { loadMask, loadTable, siteById } from "./data/load.ts"
import type { TablaLuna } from "./engine/efemeridesLuna.ts"
import type { Mascara } from "./engine/mascara.ts"
import { evaluate, station, type Evaluation } from "./model/evaluate.ts"
import type { Mission, Site } from "./model/types.ts"

/** La tabla global de efemérides. `failed` si no se pudo bajar. */
export function useTable(): { table: TablaLuna | null; failed: boolean } {
  const [state, setState] = useState<{ table: TablaLuna | null; failed: boolean }>({ table: null, failed: false })
  useEffect(() => {
    let alive = true
    loadTable().then(
      (table) => alive && setState({ table, failed: false }),
      () => alive && setState({ table: null, failed: true }),
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** Máscaras ya bajadas en esta sesión: al volver a una pantalla no se vuelve a esperar. */
const loaded = new Map<string, Mascara>()

/** Las máscaras de horizonte de los lugares pedidos. Las que faltan se bajan y aparecen juntas al terminar. */
export function useMasks(siteIds: string[]): { masks: Record<string, Mascara>; failed: boolean } {
  const key = [...new Set(siteIds)].sort().join(",")
  const [version, setVersion] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    const missing = key.split(",").filter((id) => id && !loaded.has(id))
    if (missing.length === 0) return
    Promise.all(missing.map((id) => loadMask(id).then((mask) => loaded.set(id, mask)))).then(
      () => alive && setVersion((n) => n + 1),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [key])
  const masks = useMemo(() => {
    const out: Record<string, Mascara> = {}
    for (const id of key.split(",")) {
      const mask = loaded.get(id)
      if (mask) out[id] = mask
    }
    return out
    // `version` cambia cuando termina una tanda de descargas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])
  return { masks, failed }
}

/** Una misión con su lugar y su evaluación. `wait`: todavía no hay datos para calcularla. */
export type MissionRow = { mission: Mission; site: Site; evaluation: Evaluation | null; state: "ok" | "bad" | "wait" }

/** Evalúa cada misión con el motor. Solo recalcula las que cambiaron. */
export function useEvaluations(table: TablaLuna | null, masks: Record<string, Mascara>, missions: Mission[]): MissionRow[] {
  const cache = useRef(new Map<string, { mission: Mission; mask: Mascara; evaluation: Evaluation }>())
  return useMemo(() => {
    const next = new Map<string, { mission: Mission; mask: Mascara; evaluation: Evaluation }>()
    const rows = missions.flatMap((mission): MissionRow[] => {
      const site = siteById.get(mission.siteId)
      if (!site) return []
      const mask = masks[mission.siteId]
      if (!table || !mask) return [{ mission, site, evaluation: null, state: "wait" }]
      const hit = cache.current.get(mission.id)
      const evaluation = hit && hit.mission === mission && hit.mask === mask ? hit.evaluation : evaluate(table, station(site, mask, mission.panelHeightM, mission.antennaHeightM), mission)
      next.set(mission.id, { mission, mask, evaluation })
      return [{ mission, site, evaluation, state: evaluation.ok ? "ok" : "bad" }]
    })
    cache.current = next
    return rows
  }, [table, masks, missions])
}
