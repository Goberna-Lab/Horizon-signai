import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { missionPath, plannerPath, routes } from "@/app/routes"
import { AssistantDock } from "@/features/assistant"
import { AlertBar, MissionList, Summary, SunLink } from "@/features/dashboard"
import { MissionDetail, StayTimeline } from "@/features/mission-planner"
import { PolarMap, type MapSky } from "@/shared/map"
import {
  missionContext,
  missionStore,
  newMission,
  sites,
  useEvaluations,
  useMasks,
  useMissions,
  useTable,
  type Mission,
  type MissionRow,
} from "@/shared/planning"
import { copy } from "./copy"
import "./workspace.css"

/**
 * El escritorio de misiones: Dashboard (`/dashboard`) y Planificador (`/planificador/<id>`) en una sola pantalla.
 * Aquí solo se compone: los datos vienen de `@/shared/planning`, las piezas de cada feature. Al abrir una misión la
 * columna del Dashboard se cierra, el mapa se acerca al lugar y el detalle entra por la derecha.
 * Dueño: quien coordina (ver CLAUDE.md de la raíz).
 */
export function Workspace() {
  const { missionId } = useParams()
  const navigate = useNavigate()
  const missions = useMissions()
  const { table, failed } = useTable()
  // En el detalle hacen falta todas las máscaras (para proponer otro lugar); en la lista, solo las de las misiones.
  const ids = missionId ? sites.map((s) => s.id) : missions.map((m) => m.siteId)
  const { masks, failed: masksFailed } = useMasks(ids)
  const rows = useEvaluations(table, masks, missions)
  const sorted = useMemo(() => [...rows].sort((a, b) => a.mission.landingMs - b.mission.landingMs), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ text: string; mission: Mission } | null>(null)
  const [cursorMs, setCursorMs] = useState(0)
  const nowMs = useMemo(() => Date.now(), [])

  const open = sorted.find((r) => r.mission.id === missionId) ?? null
  const selected = open ?? sorted.find((r) => r.mission.id === selectedId) ?? sorted.find((r) => r.state === "bad") ?? sorted[0] ?? null

  // El instante elegido vuelve al aterrizaje cuando cambia la misión o su fecha.
  useEffect(() => setCursorMs(open?.mission.landingMs ?? 0), [open?.mission.id, open?.mission.landingMs])

  const pins = sorted.map((r) => ({ id: r.mission.id, name: r.mission.name, site: r.site, state: r.state }))
  const sky = open?.evaluation ? skyAt(open, cursorMs) : null
  const goOpen = (id: string) => navigate(missionPath(id))

  const apply = (row: MissionRow, patch: Partial<Mission>, text: string) => {
    setUndo({ text, mission: row.mission })
    missionStore.update(row.mission.id, patch)
  }

  return (
    <section className="screen ws" data-view={open ? "mission" : "list"}>
      <header className="ws-bar">
        <Link className="ws-bar__brand" to={routes.landing}>
          {copy.brand}
        </Link>
        <nav className="ws-bar__nav" aria-label={copy.nav.label}>
          <Link to={routes.dashboard} aria-current={!open ? "page" : undefined}>
            {copy.nav.dashboard}
          </Link>
          <Link to={plannerPath()}>{copy.nav.planner}</Link>
          <Link to={routes.map3d}>{copy.nav.map3d}</Link>
        </nav>
      </header>

      {failed || masksFailed ? (
        <p className="ws-state">{copy.failed}</p>
      ) : (
        <>
          <AlertBar
            rows={sorted}
            undo={undo?.text ?? null}
            onUndo={() => {
              if (undo) missionStore.replace(undo.mission)
              setUndo(null)
            }}
            onReview={goOpen}
          />
          {missionId && !open && missions.length > 0 && <p className="ws-state">{copy.missing}</p>}

          <div className="ws-main">
            <aside className="ws-left" aria-hidden={open ? true : undefined}>
              <MissionList
                rows={sorted}
                selectedId={selected?.mission.id ?? null}
                nowMs={nowMs}
                canRestore={!missions.some((m) => m.example)}
                onSelect={setSelectedId}
                onOpen={goOpen}
                onAdd={() => {
                  const m = newMission(missions, Date.now(), "connecting-ridge-roi-6")
                  missionStore.add(m)
                  goOpen(m.id)
                }}
                onRestore={missionStore.restoreExamples}
              />
              <SunLink row={selected} />
            </aside>

            <div className="ws-centre">
              {!open && <Summary rows={sorted} nowMs={nowMs} selectedId={selected?.mission.id ?? null} onSelect={setSelectedId} />}
              <PolarMap pins={pins} selectedId={selected?.mission.id ?? null} focusId={open?.mission.id ?? null} sky={sky} onSelect={setSelectedId} onOpen={goOpen} />
              {open?.evaluation && <StayTimeline evaluation={open.evaluation} batteryH={open.mission.requirements.batteryH} cursorMs={cursorMs} onCursor={setCursorMs} name={open.mission.name} />}
              {!table && <p className="ws-state">{copy.loading}</p>}
            </div>

            <aside className="ws-right">
              {open && table && (
                <MissionDetail
                  row={open}
                  table={table}
                  masks={masks}
                  onChange={(patch) => missionStore.update(open.mission.id, patch)}
                  onApply={(patch, text) => apply(open, patch, text)}
                  onBack={() => navigate(routes.dashboard)}
                  onRemove={() => {
                    setUndo(null)
                    missionStore.remove(open.mission.id)
                    navigate(routes.dashboard)
                  }}
                />
              )}
            </aside>
          </div>
          <p className="ws-foot">{copy.foot}</p>
        </>
      )}
      <AssistantDock mode="assistant" context={open ? missionContext(open) : null} />
    </section>
  )
}

/**
 * Hacia dónde quedan el Sol y la Tierra en el mapa desde el lugar, en el instante elegido. En la estereográfica
 * polar sur, el norte local apunta lejos del polo: (sin λ, cos λ); el este, (cos λ, −sin λ).
 */
function skyAt(row: MissionRow, cursorMs: number): MapSky {
  const e = row.evaluation!
  const b = e.sweep
  const k = Math.min(Math.max(Math.round((cursorMs - e.fromMs) / b.pasoMs), 0), b.n - 1)
  const lon = (row.site.lon * Math.PI) / 180
  const bearing = (azDeg: number) => {
    const a = (azDeg * Math.PI) / 180
    const x = Math.cos(a) * Math.sin(lon) + Math.sin(a) * Math.cos(lon)
    const y = Math.cos(a) * Math.cos(lon) - Math.sin(a) * Math.sin(lon)
    return (Math.atan2(x, y) * 180) / Math.PI
  }
  return {
    sunBearingDeg: bearing(b.solAzimut[k]),
    sunVisible: b.solSobreHorizonte[k] + 0.266 > 0,
    earthBearingDeg: bearing(b.tierraAzimut[k]),
    earthVisible: b.tierraSobreHorizonte[k] > 0,
  }
}
