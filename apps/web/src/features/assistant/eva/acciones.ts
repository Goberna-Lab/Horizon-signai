// Las órdenes de la IA, ejecutadas en la app. El modelo las escribe al final de su respuesta, el API las valida contra
// una lista cerrada (apps/api/src/acciones.ts) y aquí se cumplen: navegar entre pantallas, cambiar el idioma o manejar
// el planificador. El planificador es una página en un iframe del mismo origen (features/lunar-map) que expone
// `LunarPlanner.run(orden)` y `LunarPlanner.text()` (prototipos/lunar-map/index.html): esta feature no importa a la
// otra, solo le habla por esa puerta. El modelo no calcula: cada orden deja que el motor del planificador recalcule.
import { plannerPath, routes } from "@/app/routes"
import type { AccionIA } from "@/prueba-ia/cliente"
import { lang, setLang } from "@/shared/i18n"
import { marco } from "./guion"

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
    // En el simulador: qué se vuela y lo que muestra (fase del descenso, o el casco y las tareas de la caminata), para
    // que la IA conteste «¿por qué la antena primero?» o «¿para qué la roca?» sobre lo que la persona está viendo.
    if (location.pathname.startsWith(routes.simulator)) {
      const ver = (sel: string) => (document.querySelector<HTMLElement>(sel)?.innerText ?? "").replace(/\s+/g, " ").trim()
      const partes = [
        "Simulator: the real Apollo 11 descent profile and radio log (July 1969), flown over Connecting Ridge at the lunar south pole; the Apollo lunar module is an example ship, not a CLPS lander.",
        ver('[data-f="phase"]') && `Descent phase: ${ver('[data-f="phase"]')}.`,
        ver(".sim-vh-feed") && `Moonwalk tasks on screen: ${ver(".sim-vh-feed")}.`,
        ver(".sim-vh-rows") && `Suit readings: ${ver(".sim-vh-rows")}.`,
      ]
      return partes.filter(Boolean).join(" ").slice(0, 1200)
    }
    return planificador()?.text() ?? ""
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
  apollo: `${routes.simulator}?nominal`, // el flujo guiado: el Apollo 11 se posa sin error de navegación ni fallos
  walk: `${routes.lunarMap}#walk`,
  // Solo la usa el flujo guiado: el Planificador de misiones (una página aparte, fuera de React) en su formulario.
  "new-mission": `/planificar-mision.html?nueva&lang=${lang}`,
}

/** Ejecuta una orden. Devuelve si se pudo (p. ej. «fix» no se puede si la zona ya cumple). */
export async function ejecutarAccion(a: AccionIA, navegar: (a: string) => void | Promise<void>): Promise<boolean> {
  if (a.tipo === "open") {
    const destino = PANTALLAS[String(a.screen)]
    if (!destino) return false
    if (destino.includes(".html")) location.assign(destino) // fuera de la app: se carga la página entera
    else await navegar(destino)
    return true
  }
  // Solo la usa el flujo guiado (recorridos.ts), la IA no tiene esta orden: espera hasta ~50 s a que aparezca un botón
  // de la pantalla (p. ej. «Salir a caminar» al terminar el alunizaje), en la página o en la pantalla incrustada
  // (el dashboard de /planner), y lo pulsa.
  // «esperar» hace lo mismo sin pulsar: el flujo no dice «ya estamos abajo» hasta que de verdad lo estamos.
  if (a.tipo === "clic" || a.tipo === "esperar") {
    const selector = String(a.selector)
    for (let k = 0; k < 200; k++) {
      const el = document.querySelector<HTMLElement>(selector) ?? marco()?.querySelector<HTMLElement>(selector)
      if (el) {
        if (a.tipo === "clic") el.click()
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
