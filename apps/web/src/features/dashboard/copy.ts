/** Textos del Dashboard, en inglés y en español (`@/shared/i18n`). */
import { tr } from "@/shared/i18n"

const days = (n: number) => (n === 1 ? "día" : "días")

export const copy = {
  alert: {
    allGood: (n: number) =>
      tr(n === 1 ? "The mission meets its requirements." : `All ${n} missions meet their requirements.`, n === 1 ? "La misión cumple sus requisitos." : `Las ${n} misiones cumplen sus requisitos.`),
    some: (bad: number, n: number) =>
      tr(
        `${bad} of ${n} ${n === 1 ? "mission" : "missions"} ${bad === 1 ? "does" : "do"} not meet ${bad === 1 ? "its" : "their"} requirements.`,
        `${bad} de ${n} ${n === 1 ? "misión" : "misiones"} no ${bad === 1 ? "cumple" : "cumplen"} sus requisitos.`,
      ),
    none: tr("No missions yet. Add one to see its Sun and Earth windows.", "Aún no hay misiones. Agrega una para ver sus ventanas de Sol y de Tierra."),
    review: (name: string) => tr(`Review ${name}`, `Revisar ${name}`),
    undo: tr("Undo", "Deshacer"),
  },
  list: {
    kind: (k: "lander" | "rover" | "crewed", n: number) =>
      k === "rover" ? tr(`rover, ${n} ${n === 1 ? "drive" : "drives"}`, `rover, ${n} ${n === 1 ? "recorrido" : "recorridos"}`)
      : k === "crewed" ? tr(`crewed, ${n} ${n === 1 ? "walk" : "walks"}`, `tripulada, ${n} ${n === 1 ? "caminata" : "caminatas"}`)
      : tr("fixed lander", "módulo fijo"),
    title: tr("Upcoming missions", "Próximas misiones"),
    add: tr("New mission", "Nueva misión"),
    open: tr("View detail", "Ver detalle"),
    restore: tr("Restore examples", "Restaurar ejemplos"),
    example: tr("Example", "Ejemplo"),
    lands: (text: string) => tr(`Lands in ${text}`, `Aterriza en ${text}`),
    landed: tr("Landing date passed", "La fecha de aterrizaje ya pasó"),
    wait: tr("Calculating…", "Calculando…"),
    showOnMap: (name: string) => tr(`${name}: show on the map`, `${name}: mostrar en el mapa`),
    figures: (sun: string, earth: string, night: string) => tr(`Sun ${sun} · Earth ${earth} · longest night ${night}`, `Sol ${sun} · Tierra ${earth} · noche más larga ${night}`),
  },
  summary: {
    missions: tr("Missions", "Misiones"),
    onPlan: tr("On plan", "Cumplen"),
    needAttention: tr("Need attention", "Requieren atención"),
    nextLanding: tr("Next landing", "Próximo aterrizaje"),
    schedule: tr("Schedule", "Cronograma"),
    today: tr("Today", "Hoy"),
    months: tr(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]),
    mission: (name: string, landing: string, stayDays: number) => tr(`${name}: ${landing}, ${stayDays} days`, `${name}: ${landing}, ${stayDays} ${days(stayDays)}`),
  },
  link: {
    title: tr("Sun and link", "Sol y enlace"),
    sun: tr("Sun (power)", "Sol (energía)"),
    earth: tr("Earth (link)", "Tierra (enlace)"),
    both: tr("Both at once", "Ambos a la vez"),
    ofStay: (n: number) => tr(`${n}-day stay`, `estadía de ${n} ${days(n)}`),
    sunSet: tr("Sunset in", "El Sol se pone en"),
    sunRise: tr("Sunrise in", "El Sol sale en"),
    sunAlways: tr("Sun", "Sol"),
    earthSet: tr("Earthset in", "La Tierra se pone en"),
    earthRise: tr("Earthrise in", "La Tierra sale en"),
    earthAlways: tr("Earth", "Tierra"),
    fromLanding: tr("from landing", "desde el aterrizaje"),
    noChange: (visible: boolean) => tr(visible ? "In view, no set in 60 days" : "Hidden, no rise in 60 days", visible ? "A la vista, no se pone en 60 días" : "Fuera de vista, no sale en 60 días"),
    empty: tr("Select a mission to read its Sun and Earth time.", "Elige una misión para ver su tiempo de Sol y de Tierra."),
  },
}
