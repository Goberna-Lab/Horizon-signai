/** Textos del planificador de una misión, en inglés y en español (`@/shared/i18n`). */
import { tr } from "@/shared/i18n"

const days = (n: number) => (n === 1 ? "día" : "días")

export const copy = {
  wait: tr("Calculating…", "Calculando…"),
  detail: {
    back: tr("All missions", "Todas las misiones"),
    unnamed: tr("Mission", "Misión"),
    stay: (n: number) => tr(`${n}-day stay`, `estadía de ${n} ${days(n)}`),
    moved: (from: string) => tr(`Landing moved from ${from}`, `Aterrizaje movido desde el ${from}`),
    requirements: tr("Requirements", "Requisitos"),
    figures: tr("The stay in figures", "La estadía en cifras"),
    sun: tr("Sun in view", "Sol a la vista"),
    earth: tr("Earth in view", "Tierra a la vista"),
    both: tr("Both at once", "Ambos a la vez"),
    night: tr("Longest night", "Noche más larga"),
    silence: tr("Longest silence", "Silencio más largo"),
    panel: tr("Mean panel power", "Panel medio"),
    options: tr("Ways out", "Salidas"),
    optionsOk: tr("Alternatives", "Alternativas"),
    scenario: tr("Scenario", "Escenario"),
    equipment: tr("Equipment and assumptions", "Equipo y supuestos"),
    remove: tr("Delete mission", "Eliminar misión"),
    compare: tr("Compare zones and dates →", "Comparar zonas y fechas →"),
    approximate: tr(
      "Approximate horizon: this place has no 5 m terrain model, so nearby relief under about 500 m is missing. Decide with a catalogued landing region.",
      "Horizonte aproximado: este lugar no tiene modelo de terreno de 5 m, así que falta el relieve cercano de menos de unos 500 m. Decide con una zona de aterrizaje del catálogo.",
    ),
    centre: tr(
      "This marker is the centre of a terrain mosaic, not a chosen landing point. The candidate regions (RoI) are.",
      "Esta marca es el centro de un mosaico de terreno, no un punto de aterrizaje elegido. Las zonas candidatas (RoI) sí lo son.",
    ),
  },
  /** Lo que dice el aviso al aplicar una salida (se puede deshacer). */
  applied: {
    date: (name: string, date: string) => tr(`${name}: landing moved to ${date}.`, `${name}: aterrizaje movido al ${date}.`),
    site: (name: string, site: string) => tr(`${name}: moved to ${site}.`, `${name}: movida a ${site}.`),
    height: (name: string, m: number) => tr(`${name}: panel and antenna raised to ${m} m.`, `${name}: panel y antena subidos a ${m} m.`),
  },
  options: {
    columns: tr(["Option", "Sun", "Earth", "Longest night", ""], ["Opción", "Sol", "Tierra", "Noche más larga", ""]),
    current: tr("Current plan", "Plan actual"),
    date: (date: string) => tr(`Move the landing to ${date}`, `Mover el aterrizaje al ${date}`),
    dateNote: (from: string, to: string, slack: number) =>
      tr(
        `Window ${from} to ${to}${slack > 0 ? `; ${slack} ${slack === 1 ? "day" : "days"} of slack either side` : ""}`,
        `Ventana del ${from} al ${to}${slack > 0 ? `; ${slack} ${days(slack)} de margen a cada lado` : ""}`,
      ),
    noDate: tr("No landing date within 120 days meets the requirements here.", "Ninguna fecha de aterrizaje en 120 días cumple los requisitos aquí."),
    site: (name: string) => tr(`Move to ${name}`, `Mover a ${name}`),
    siteNote: (km: number) => {
      const distance = km < 10 ? km.toFixed(1) : Math.round(km)
      return tr(`${distance} km away, same date and equipment`, `A ${distance} km, misma fecha y equipo`)
    },
    noSite: tr("No catalogued place meets the requirements on this date.", "Ningún lugar del catálogo cumple los requisitos en esta fecha."),
    sitesLoading: tr("Checking the other catalogued places…", "Revisando los demás lugares del catálogo…"),
    height: (m: number) => tr(`Raise panel and antenna to ${m} m`, `Subir panel y antena a ${m} m`),
    heightNote: tr("Same place and date", "Mismo lugar y fecha"),
    noHeight: tr("Raising the equipment up to 30 m does not help on this date.", "Subir el equipo hasta 30 m no ayuda en esta fecha."),
    apply: tr("Apply", "Aplicar"),
    calendar: tr("Landing dates that meet the requirements", "Fechas de aterrizaje que cumplen los requisitos"),
    calendarKey: { ok: tr("Meets requirements", "Cumple los requisitos"), bad: tr("Does not", "No cumple"), now: tr("Current landing", "Aterrizaje actual") },
    months: tr(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]),
    meets: tr("meets the requirements", "cumple los requisitos"),
    fails: tr("does not meet the requirements", "no cumple los requisitos"),
  },
  activity: {
    title: tr("What the mission does", "Qué hace la misión"),
    kind: tr("Mission type", "Tipo de misión"),
    kinds: {
      lander: tr("Fixed lander: works where it lands", "Módulo fijo: trabaja donde se posa"),
      rover: tr("Rover: drives out to measure", "Rover: sale a medir"),
      crewed: tr("Crewed: astronauts walk out", "Tripulada: los astronautas salen a caminar"),
    },
    landerNote: tr(
      "A fixed lander runs its instruments for the whole stay: what decides it is the Sun for power and Earth for the link, above.",
      "Un módulo fijo opera sus instrumentos toda la estadía: lo que lo decide es el Sol para la energía y la Tierra para el enlace, arriba.",
    ),
    outings: { rover: tr("Drives", "Recorridos"), crewed: tr("Walks", "Caminatas") },
    none: { rover: tr("No drives yet. Add the first one.", "Aún no hay recorridos. Agrega el primero."), crewed: tr("No walks yet. Add the first one.", "Aún no hay caminatas. Agrega la primera.") },
    add: { rover: tr("Add a drive", "Agregar un recorrido"), crewed: tr("Add a walk", "Agregar una caminata") },
    remove: tr("Remove", "Quitar"),
    route: tr("Route", "Ruta"),
    routes: { science: tr("Scientific", "Científica"), safe: tr("Safe", "Segura"), short: tr("Short", "Corta") },
    afterH: tr("Starts, hours after landing", "Empieza, horas tras el aterrizaje"),
    when: (dayN: number, at: string) => tr(`Day ${dayN} · ${at}`, `Día ${dayN} · ${at}`),
    sun: (ok: boolean) => (ok ? tr("Sun in view", "Sol a la vista") : tr("No Sun", "Sin Sol")),
    earth: (ok: boolean) => (ok ? tr("Earth in view", "Tierra a la vista") : tr("No Earth link", "Sin enlace con la Tierra")),
    change: (body: "sun" | "earth", h: string, visible: boolean) =>
      body === "sun"
        ? visible ? tr(`the Sun sets in ${h}`, `el Sol se oculta en ${h}`) : tr(`the Sun rises in ${h}`, `el Sol sale en ${h}`)
        : visible ? tr(`Earth sets in ${h}`, `la Tierra se oculta en ${h}`) : tr(`Earth rises in ${h}`, `la Tierra sale en ${h}`),
    good: tr("Good time to go out", "Buen momento para salir"),
    bad: {
      rover: tr("A rover is driven from Earth and runs on sunlight: at this hour it would not move.", "Un rover se maneja desde la Tierra y vive del Sol: a esta hora no se movería."),
      crewed: tr("The crew would walk without light or without mission control following them.", "La tripulación caminaría sin luz o sin que el control de misión la siga."),
    },
    simulate: tr("Fly it guided in the simulator", "Volarla guiada en el simulador"),
  },
  form: {
    name: tr("Mission name", "Nombre de la misión"),
    site: tr("Landing place", "Lugar de aterrizaje"),
    landing: tr("Landing (UTC)", "Aterrizaje (UTC)"),
    stay: tr("Stay (days)", "Estadía (días)"),
    panel: tr("Solar panel height (m)", "Altura del panel solar (m)"),
    antenna: tr("Antenna height (m)", "Altura de la antena (m)"),
    battery: tr("Battery, hours without Sun", "Batería, horas sin Sol"),
    earth: tr("Earth contact, minimum (%)", "Contacto con la Tierra, mínimo (%)"),
    sunAtLanding: tr("Sun in view at landing", "Sol a la vista al aterrizar"),
    earthAtLanding: tr("Earth in view at landing", "Tierra a la vista al aterrizar"),
    groups: {
      roi: tr("Candidate landing regions (Barker et al. 2021)", "Zonas de aterrizaje candidatas (Barker et al. 2021)"),
      site: tr("South pole sites (mosaic centres)", "Sitios del polo sur (centros de mosaico)"),
      mission: tr("Missions", "Misiones"),
    },
  },
  facts: {
    panel: tr("Solar panel", "Panel solar"),
    panelAt: (m: number) => tr(`${m} m above the ground, looks at the Sun`, `${m} m sobre el suelo, mira al Sol`),
    antenna: tr("Antenna", "Antena"),
    antennaAt: (m: number) => tr(`${m} m above the ground, looks at Earth`, `${m} m sobre el suelo, mira a la Tierra`),
    terrain: tr("Terrain", "Terreno"),
    terrainOf: (height: string, slopeDeg: number, relief: string) =>
      tr(
        `${height} m high, ${slopeDeg}° slope, ${relief} m of relief within 2 km (240 m grid: a coarse indicator, not a hazard map)`,
        `${height} m de altura, ${slopeDeg}° de pendiente, ${relief} m de desnivel en 2 km (rejilla de 240 m: un indicador grueso, no un mapa de riesgos)`,
      ),
    horizon: tr("Horizon", "Horizonte"),
    detailed: tr("From the 5 m terrain model out to 4 km, then the 240 m and 960 m grids out to 150 km", "Del modelo de terreno de 5 m hasta 4 km; después, las rejillas de 240 m y 960 m hasta 150 km"),
    approximate: tr("From the 240 m grid only (approximate)", "Solo de la rejilla de 240 m (aproximado)"),
    ephemeris: tr("Ephemeris", "Efemérides"),
    sites: tr("Sites", "Sitios"),
  },
  assumptions: tr(
    [
      "The Sun is measured from the solar panel's height and Earth from the antenna's height, both at the same point of the terrain.",
      "Sun in view: any part of its disc above the terrain horizon. Earth in view: its centre above the terrain horizon.",
      "Link means a direct line of sight to Earth. No relay satellite is assumed.",
      "Panel power assumes a vertical panel that turns to face the Sun (an assumption: each mission has its own layout).",
      "The longest night counts only the hours inside the stay.",
      "Times are UTC. Dates from 2026 to 2030.",
    ],
    [
      "El Sol se mide desde la altura del panel solar y la Tierra desde la altura de la antena, los dos en el mismo punto del terreno.",
      "Sol a la vista: alguna parte de su disco sobre el horizonte del terreno. Tierra a la vista: su centro sobre el horizonte del terreno.",
      "Enlace significa línea de vista directa con la Tierra. No se supone ningún satélite de relevo.",
      "La potencia del panel supone un panel vertical que gira para mirar al Sol (un supuesto: cada misión tiene su propia disposición).",
      "La noche más larga cuenta solo las horas dentro de la estadía.",
      "Las horas son UTC. Fechas de 2026 a 2030.",
    ],
  ),
  timeline: {
    title: tr("Light and link during the stay", "Luz y enlace durante la estadía"),
    sun: tr("Sun", "Sol"),
    earth: tr("Earth", "Tierra"),
    both: tr("Both", "Ambos"),
    margin: tr("Above terrain", "Sobre terreno"),
    csv: tr("Export CSV", "Exportar CSV"),
    /** Encabezado del CSV: nombres de columna sin espacios ni tildes, para que cualquier programa los lea. */
    csvHeader: tr(
      "time_utc,sun_upper_edge_above_terrain_deg,earth_centre_above_terrain_deg,sun_in_view,earth_in_view,panel_w_m2",
      "hora_utc,borde_superior_sol_sobre_terreno_grados,centro_tierra_sobre_terreno_grados,sol_a_la_vista,tierra_a_la_vista,panel_w_m2",
    ),
    key: { sun: tr("Sun in view", "Sol a la vista"), earth: tr("Earth in view", "Tierra a la vista"), both: tr("Both", "Ambos"), none: tr("Not in view", "Fuera de vista") },
    without: (h: string, body: string) => tr(`${h} without ${body}`, `${h} sin ${body}`),
    batteryEmpty: (h: string) => tr(`Battery empty after ${h} without Sun`, `Batería agotada tras ${h} sin Sol`),
    moment: tr("Moment of the stay", "Momento de la estadía"),
    landing: tr("Landing", "Aterrizaje"),
    hint: tr("Drag across the chart to read any moment of the stay.", "Arrastra sobre el gráfico para leer cualquier momento de la estadía."),
    panel: "Panel",
  },
}
