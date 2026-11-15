// Las órdenes de la IA, ejecutadas en la app. El modelo las escribe al final de su respuesta, el API las valida contra
// una lista cerrada (apps/api/src/acciones.ts) y aquí se cumplen: navegar entre pantallas, cambiar el idioma o manejar
// el planificador. El planificador es una página en un iframe del mismo origen (features/lunar-map) que expone
// `LunarPlanner.run(orden)` y `LunarPlanner.text()` (prototipos/lunar-map/index.html): esta feature no importa a la
// otra, solo le habla por esa puerta. El modelo no calcula: cada orden deja que el motor del planificador recalcule.
import { plannerPath, routes } from "@/app/routes"
import type { AccionIA } from "@/prueba-ia/cliente"
import { setLang } from "@/shared/i18n"

type Planificador = { text(): string; run(a: AccionIA): boolean }

/** El planificador abierto en la pantalla /planner, si lo está (no la campaña de ejemplo ni la caminata). */
const planificador = (): Planificador | null => {
  try {
    const w = document.querySelector<HTMLIFrameElement>("iframe.lunar-map__frame")?.contentWindow as (Window & { LunarPlanner?: Planificador }) | null | undefined
    return w?.LunarPlanner ?? null
  } catch {
    return null
  }
}

/** Lo que la pantalla muestra ahora, en texto, con las cifras del motor: va a la IA como contexto de cada pregunta. */
export const estadoDePantalla = (): string => {
  try {
    // En /simulador, lo que muestra el simulador (casco, rover, informe): features/simulator/alunizaje/paraEva.ts
    return planificador()?.text() ?? (window as Window & { HorizonSimulador?: { text(): string } }).HorizonSimulador?.text() ?? ""
  } catch {
    return ""
  }
}

const esperarPlanificador = (limiteMs = 7000) =>
  new Promise<Planificador | null>((listo) => {
    const t0 = Date.now()
    const mirar = () => {
      const p = planificador()
      if (p) listo(p)
      else if (Date.now() - t0 > limiteMs) listo(null)
      else setTimeout(mirar, 150)
    }
    mirar()
  })

const PANTALLAS: Record<string, string> = {
  landing: routes.landing,
  planner: plannerPath(),
  missions: routes.lunarMap,
  map: routes.map3d,
  simulator: routes.simulator, // solo la usa el flujo guiado (la IA no tiene esta orden)
  walk: `${routes.lunarMap}#walk`,
}

/** Ejecuta una orden. Devuelve si se pudo (p. ej. «fix» no se puede si la zona ya cumple). */
export async function ejecutarAccion(a: AccionIA, navegar: (a: string) => void | Promise<void>): Promise<boolean> {
  if (a.tipo === "open") {
    const destino = PANTALLAS[String(a.screen)]
    if (!destino) return false
    await navegar(destino)
    return true
  }
  // Solo la usa el flujo guiado (recorridos.ts), la IA no tiene esta orden: espera hasta ~50 s a que aparezca un botón
  // de la pantalla (p. ej. «Salir a caminar» al terminar el alunizaje) y lo pulsa.
  if (a.tipo === "clic") {
    const selector = String(a.selector)
    for (let k = 0; k < 200; k++) {
      const el = document.querySelector<HTMLElement>(selector)
      if (el) {
        el.click()
        return true
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    return false
  }
  if (a.tipo === "language") {
    if (a.to !== "en" && a.to !== "es") return false
    setLang(a.to) // recarga la página en ese idioma
    return true
  }
  // Lo demás es del planificador: si no está abierto, se abre y se espera a que cargue.
  let p = planificador()
  if (!p) {
    await navegar(plannerPath())
    p = await esperarPlanificador()
  }
  try {
    return p ? p.run(a) : false
  } catch {
    return false
  }
}
