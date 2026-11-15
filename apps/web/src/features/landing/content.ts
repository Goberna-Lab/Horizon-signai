/**
 * Todo el texto de la landing, en inglés (la entrega de Space Apps lo exige; ver docs/09-entrega.md) y en español.
 * Cada texto va con `tr(inglés, español)`: el idioma se fija al cargar la página (`@/shared/i18n`).
 *
 * Las cifras no están escritas a mano: salen de `flight/data/facts.json`, que genera
 * `apps/web/scripts/build-landing-data.ts` con el motor validado y los datos de la NASA. Las demás cifras citan su
 * documento en `docs/`.
 */
import { plannerPath, routes } from "@/app/routes"
import { tr } from "@/shared/i18n"
import facts from "./flight/data/facts.json"

const { featured, pole, compare, pairDistanceM, descent } = facts
/** "0.8% low" o "0.8% high" ("0.8% por debajo" o "0.8% por encima"): cuánto se aparta una cifra del plan. */
const off = (pct: number) => `${Math.abs(pct)}% ${pct < 0 ? tr("low", "por debajo") : tr("high", "por encima")}`
const pct = (value: number) => `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`
const hours = (value: number) => `${Math.round(value)} h`

export const brand = {
  /** Nombre provisional: el del repositorio. El definitivo está pendiente (docs/03-producto.md, "Decisiones abiertas"). */
  name: "Horizon Signai",
  challenge: "Lunar Landing Site Navigator",
  event: "NASA Space Apps Challenge 2026",
  repository: "https://github.com/goberna-lab/Horizon-signai",
  challengeUrl: "https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/",
}

/**
 * El inicio. El titular dice qué es el producto: un planificador ágil de misiones lunares con IA integrada. La
 * parte marcada va en el rojo de señal, el único color del emblema del equipo.
 */
/** La pantalla de carga del inicio: un paso por cada parte de la carga y la fuente del relieve. */
export const loading = {
  title: "Lunar south pole",
  steps: {
    engine: "Starting the 3D engine",
    terrain: "Downloading the terrain",
    mesh: "Building the relief",
    light: "Computing sunlight and shadows",
    done: "Ready",
  },
  source: "Elevation: NASA LRO, LOLA",
}

export const opening = {
  /**
   * La marca animada: se escribe "Horizon Signal", se borra "al" y se escribe "AI" en rojo: queda "Horizon SignAI".
   * No se traduce.
   */
  brand: { keep: "Horizon Sign", erase: "al", write: "AI" },
  title: tr<Array<{ text: string; mark?: boolean }>>(
    [{ text: "The agile lunar mission planner with " }, { text: "AI built in", mark: true }, { text: "." }],
    [{ text: "El planificador ágil de misiones lunares con " }, { text: "IA integrada", mark: true }, { text: "." }],
  ),
  /** Lecturas del módulo en el sitio destacado: los valores salen de sky.json en FlightStage.tsx. */
  status: {
    title: tr("lander status", "estado del módulo"),
    link: tr("Earth link", "Enlace con la Tierra"),
    linked: tr("Connection restored", "Conexión establecida"),
    unlinked: tr("No connection", "Sin conexión"),
    earth: tr("Earth above level", "Elevación de la Tierra"),
    power: tr("Solar power", "Potencia solar"),
    sunLeft: tr("Sunlight left", "Luz solar restante"),
    sunIn: tr("Sunrise in", "El Sol sale en"),
    earthLeft: tr("Earth contact left", "Contacto restante"),
    earthIn: tr("Earthrise in", "La Tierra sale en"),
    when: tr("Mission time, UT", "Hora de la misión, UT"),
    /** Lo que dice el HUD mientras se reinicia con el Sol. */
    noSignal: tr("No signal", "Sin señal"),
    seeking: tr("Reconnecting…", "Reconectando…"),
    sunriseIn: tr("Sunrise in", "El Sol sale en"),
    sunsetIn: tr("Sunset in", "El Sol se pone en"),
    site: tr("Site", "Sitio"),
  },
}

/**
 * Una etiqueta por intención: se usa igual en la barra, el inicio y el cierre. `short` es la de la barra en un teléfono.
 * "Open the planner" lleva primero a Missions (`/planner`, la campaña); desde ahí se entra al planificador.
 */
export const actions = {
  planner: { label: tr("Open the planner", "Abrir el planificador"), short: tr("Planner", "Planear"), to: routes.lunarMap },
  map3d: { label: tr("Open the 3D map", "Abrir el mapa 3D"), to: routes.map3d },
}

/** La barra superior lleva a las pantallas de la aplicación. */
export const nav = [
  { label: tr("Planner", "Planificador"), to: plannerPath() },
  { label: tr("Missions", "Misiones"), to: routes.lunarMap },
  { label: tr("3D Map", "Mapa 3D"), to: routes.map3d },
]

export type Fact = { value: string; label: string }

/** Una pregunta para adivinar antes de ver el dato de la escena: tres respuestas y cuál es la buena. */
export type Quiz = { ask: string; options: string[]; right: number }

/** Rótulos de las preguntas del vuelo. */
export const guess = {
  label: tr("Guess first", "Adivina primero"),
  right: tr("Right.", "Correcto."),
  wrong: tr("Not quite.", "No del todo."),
  show: tr("Show the answer", "Ver la respuesta"),
}

export type Scene = {
  id: string
  /** Nombre corto para el riel de la derecha. */
  rail: string
  title: string
  body: string
  facts?: Fact[]
  note?: string
  quiz?: Quiz
}

/** Las escenas del vuelo, en orden. La primera es el inicio de la página. */
export const scenes: Scene[] = [
  {
    id: "pole",
    rail: tr("South pole", "Polo sur"),
    title: tr("Find light. Keep contact.", "Encuentra luz. Mantén el contacto."),
    body: tr(
      "Compare lunar south pole landing sites and dates, with the Sun and Earth measured against the real horizon.",
      "Compara sitios y fechas de aterrizaje en el polo sur lunar, con el Sol y la Tierra medidos contra el horizonte real.",
    ),
  },
  {
    id: "horizon",
    rail: "Horizon",
    title: "The horizon decides.",
    body: "At the pole the Sun and Earth never climb: they skim the horizon. A ridge in the way means no sunlight for the panels and no line of sight to Earth. Horizon AI measures both against the real terrain, hour by hour.",
  },
  {
    id: "sun",
    rail: tr("Low Sun", "Sol bajo"),
    title: tr("The Sun never climbs.", "El Sol nunca sube."),
    body: tr(
      `At the south pole it circles the horizon and peaks at ${pole.sunMaxElevationDeg.toFixed(2)} degrees. Every ridge throws a shadow many kilometres long.`,
      `En el polo sur da la vuelta al horizonte y llega como máximo a ${pole.sunMaxElevationDeg.toFixed(2)} grados. Cada cresta proyecta una sombra de muchos kilómetros.`,
    ),
    facts: [
      { value: `${pole.sunMaxElevationDeg.toFixed(2)}°`, label: tr("Highest Sun over the pole, 2026 to 2030", "Sol más alto sobre el polo, 2026 a 2030") },
      { value: `${facts.lunarDayDays.toFixed(1)} d`, label: tr("One turn around the horizon", "Una vuelta al horizonte") },
    ],
    quiz: {
      ask: tr("How high does the Sun climb at the south pole?", "¿Qué tan alto sube el Sol en el polo sur?"),
      options: tr(["Straight overhead", "About halfway up the sky", "Under 2 degrees"], ["Justo sobre la cabeza", "Hasta la mitad del cielo", "Menos de 2 grados"]),
      right: 2,
    },
  },
  {
    id: "power",
    rail: tr("Power", "Energía"),
    title: tr("Sunlight is the power budget.", "La luz solar es el presupuesto de energía."),
    body: tr(
      `${featured.name}, lunar day from 1 December 2026: the Sun is in view ${pct(featured.ground.sunPct)} of the time at ground level, ${pct(featured.mast10m.sunPct)} from a 10 m mast.`,
      `${featured.name}, día lunar desde el 1 de diciembre de 2026: el Sol está a la vista el ${pct(featured.ground.sunPct)} del tiempo a ras del suelo y el ${pct(featured.mast10m.sunPct)} desde un mástil de 10 m.`,
    ),
    facts: [
      { value: pct(featured.ground.sunPct), label: tr("Sun in view, ground level", "Sol a la vista, a ras del suelo") },
      { value: pct(featured.mast10m.sunPct), label: tr("Sun in view, 10 m mast", "Sol a la vista, mástil de 10 m") },
      { value: hours(featured.ground.longestNightH), label: tr("Longest night, ground level", "Noche más larga, a ras del suelo") },
    ],
    quiz: {
      ask: tr("Raise the solar panel on a 10 m mast. How much more sunlight?", "Sube el panel solar a un mástil de 10 m. ¿Cuánta más luz?"),
      options: tr(["Almost twice as much", "A few percent more", "None: the Sun is the same"], ["Casi el doble", "Un pequeño porcentaje más", "Ninguna: el Sol es el mismo"]),
      right: 0,
    },
  },
  {
    id: "earth",
    rail: tr("Earth link", "Enlace"),
    title: tr("Earth hangs at the horizon.", "La Tierra se queda en el horizonte."),
    body: tr(
      `From the pole, Earth drifts between ${Math.abs(pole.earthMinElevationDeg).toFixed(1)}° below and ${pole.earthMaxElevationDeg.toFixed(1)}° above the horizon. Terrain decides when a direct link is possible.`,
      `Desde el polo, la Tierra oscila entre ${Math.abs(pole.earthMinElevationDeg).toFixed(1)}° por debajo y ${pole.earthMaxElevationDeg.toFixed(1)}° por encima del horizonte. El relieve decide cuándo es posible un enlace directo.`,
    ),
    facts: [
      { value: pct(featured.ground.earthPct), label: tr("Earth in view, ground level", "Tierra a la vista, a ras del suelo") },
      { value: pct(featured.mast10m.earthPct), label: tr("Earth in view, 10 m mast", "Tierra a la vista, mástil de 10 m") },
      { value: hours(featured.ground.longestSilenceH), label: tr("Longest silence, ground level", "Silencio más largo, a ras del suelo") },
    ],
    note: tr("Red hatching: direct line of sight to Earth at this hour.", "Rayado rojo: línea de vista directa con la Tierra a esta hora."),
    quiz: {
      ask: tr("Can a lander at the pole always see Earth?", "¿Un módulo en el polo ve siempre la Tierra?"),
      options: tr(["Always", "Only part of the time", "Never"], ["Siempre", "Solo parte del tiempo", "Nunca"]),
      right: 1,
    },
  },
  {
    id: "compare",
    rail: tr("Compare", "Comparar"),
    title: tr(`${pairDistanceM} metres change the mission.`, `${pairDistanceM} metros cambian la misión.`),
    body: tr(
      `Two points on the same ridge, the same lunar day. One gets sunlight ${pct(featured.ground.sunPct)} of the time, the other never loses it. That is why a lunar plan has to be compared again every time the site or the date moves.`,
      `Dos puntos en la misma cresta, el mismo día lunar. Uno recibe luz solar el ${pct(featured.ground.sunPct)} del tiempo; el otro nunca la pierde. Por eso un plan lunar hay que compararlo de nuevo cada vez que se mueve el sitio o la fecha.`,
    ),
    quiz: {
      ask: tr(`Two sites ${pairDistanceM} m apart on the same ridge. Same sunlight?`, `Dos sitios a ${pairDistanceM} m en la misma cresta. ¿La misma luz solar?`),
      options: tr(["Nearly the same", "A few percent apart", "One never loses the Sun"], ["Casi la misma", "Unos puntos de diferencia", "Uno nunca pierde el Sol"]),
      right: 2,
    },
  },
]

/** Tabla de la última escena: los mismos sitios, el mismo día lunar, a ras del suelo. */
export const comparison = {
  caption: tr("Lunar day from 1 December 2026, ground level", "Día lunar desde el 1 de diciembre de 2026, a ras del suelo"),
  columns: tr(["Site", "Sun", "Earth"], ["Sitio", "Sol", "Tierra"]),
  rows: compare.map((site) => ({
    id: site.id,
    name: site.name,
    sun: pct(site.ground.sunPct),
    earth: pct(site.ground.earthPct),
    approximate: site.horizon === "approximate",
  })),
  footnote: tr("Approximate horizon (240 m grid).", "Horizonte aproximado (malla de 240 m)."),
}

/** Rótulos del tablero inferior. */
export const hud = {
  time: tr("Mission time, UTC", "Hora de la misión, UTC"),
  sun: tr("Sun over the pole", "Sol sobre el polo"),
  earth: tr("Earth over the pole", "Tierra sobre el polo"),
  site: tr(`${featured.name}, ground level`, `${featured.name}, a ras del suelo`),
}

/**
 * La ventana del producto: las pantallas del software, funcionando dentro de la landing con datos reales
 * (sections/data/sky.json, product.json y catalog.json).
 */
export const software = {
  title: tr("The planner's engine, live on this page.", "El motor del planificador, en vivo en esta página."),
  body: tr(
    `Not a screenshot. These are the planner's own views running on real ephemeris and terrain: one lunar day at ${featured.name}, from 1 December 2026. Move the date and watch the plan respond.`,
    `No es una captura. Son las vistas del propio planificador, funcionando con efemérides y relieve reales: un día lunar en ${featured.name}, desde el 1 de diciembre de 2026. Mueve la fecha y mira cómo responde el plan.`,
  ),
  tabs: {
    lander: tr("Lander", "Módulo"),
    compare: tr("Compare", "Comparar"),
    calendar: tr("Calendar", "Calendario"),
    map: tr("Map", "Mapa"),
    planb: "Plan B",
    learn: tr("Learn", "Aprender"),
  },
  lander: {
    title: tr("Lander", "Módulo"),
    power: { on: tr("Power", "Energía"), off: tr("No power", "Sin energía") },
    signal: { on: tr("Signal", "Señal"), limited: tr("Limited signal", "Señal limitada"), off: tr("No signal", "Sin señal") },
    sun: { set: tr("Sunset in", "El Sol se pone en"), rise: tr("Sunrise in", "El Sol sale en"), always: tr("Sun in view", "Sol a la vista") },
    earth: { set: tr("Earthset in", "La Tierra se pone en"), rise: tr("Earthrise in", "La Tierra sale en"), always: tr("Earth in view", "Tierra a la vista") },
    whole: tr("All lunar day", "Todo el día lunar"),
    stats: { sun: tr("Solar elevation", "Elevación solar"), panel: tr("Panel power", "Potencia del panel"), earth: tr("Earth elevation", "Elevación de la Tierra") },
    window: tr("Window, 29.5 days", "Ventana, 29.5 días"),
    now: tr("Now", "Ahora"),
    below: tr("below the horizon", "bajo el horizonte"),
    legend: {
      sun: tr("Sun above the horizon", "Sol sobre el horizonte"),
      earth: tr("Earth above the horizon", "Tierra sobre el horizonte"),
      none: tr("Not in view", "Fuera de vista"),
    },
    rows: { sun: tr("Sun", "Sol"), earth: tr("Earth", "Tierra") },
    note: tr(
      "Radial scale: elevation, from 5° below level at the rim to 15° above at the centre. Dashed line: the horizon from the other observer height. Sun and Earth are not drawn to scale. Limited signal: Earth less than 1° above the terrain.",
      "Escala radial: elevación, desde 5° bajo la horizontal en el borde hasta 15° sobre ella en el centro. Línea a trazos: el horizonte desde la otra altura de observación. El Sol y la Tierra no están a escala. Señal limitada: la Tierra a menos de 1° sobre el relieve.",
    ),
  },
  compare: {
    title: tr("Compare sites", "Comparar sitios"),
    period: tr("1 to 30 Dec 2026", "1 al 30 dic 2026"),
    sun: tr("Sun in view", "Sol a la vista"),
    night: tr("Longest night", "Noche más larga"),
    earth: tr("Earth visibility, lunar day", "Visibilidad de la Tierra, día lunar"),
    visible: tr("In view", "A la vista"),
    hidden: tr("Hidden", "Oculta"),
    verdicts: { viable: "Viable", limited: tr("Limited", "Limitado"), no: tr("Not viable", "No viable") },
    thresholds: tr(
      "Verdicts use example requirements: viable from 75% sunlight and 25% Earth contact; not viable under 35% sunlight or 5% contact. In the planner you set your own.",
      "Los veredictos usan requisitos de ejemplo: viable desde 75% de luz solar y 25% de contacto con la Tierra; no viable con menos de 35% de luz solar o 5% de contacto. En el planificador pones los tuyos.",
    ),
  },
  calendar: { title: tr("Calendar", "Calendario") },
  map: { title: tr("Map", "Mapa") },
  planb: {
    title: "Plan B",
    body: tr(
      "The date slipped, or the site has to move. Each row is one way out, measured against the plan.",
      "La fecha se movió, o hay que cambiar de sitio. Cada fila es una salida, medida contra el plan.",
    ),
    columns: tr(
      ["Option", "Sun in view", "Earth in view", "Both at once", "Longest night", "Verdict"],
      ["Opción", "Sol a la vista", "Tierra a la vista", "Los dos a la vez", "Noche más larga", "Veredicto"],
    ),
    baseline: tr(`${featured.name}, 1 December 2026, ground level`, `${featured.name}, 1 de diciembre de 2026, a ras del suelo`),
    baselineTag: tr("The plan", "El plan"),
    move: tr("Move the landing", "Mover el aterrizaje"),
    wait: tr("Wait one lunar month", "Esperar un mes lunar"),
    mast: tr("Raise the array to 10 m", "Subir el panel a 10 m"),
  },
  learn: {
    title: tr("Learn", "Aprender"),
    cards: {
      sun: {
        title: tr("The Sun circles the horizon.", "El Sol da la vuelta al horizonte."),
        unit: tr("highest Sun over the pole, 2026 to 2030", "Sol más alto sobre el polo, 2026 a 2030"),
      },
      earth: {
        title: tr("Earth rocks in place.", "La Tierra se mece en su sitio."),
        unit: tr("swing of Earth's elevation in one lunar day", "oscilación de la elevación de la Tierra en un día lunar"),
      },
      height: {
        title: tr("Height buys sunlight.", "La altura compra luz solar."),
        unit: tr("highest ridge on the horizon, ground level against a 10 m mast", "cresta más alta del horizonte, a ras del suelo frente a un mástil de 10 m"),
      },
    },
  },
}

/** La pestaña "Map": el catálogo sobre la lámina (sections/data/catalog.json). */
export const catalog = {
  period: tr("Lunar day from 1 December 2026", "Día lunar desde el 1 dic 2026"),
  columns: { ground: tr("Ground level", "A ras del suelo"), mast: tr("10 m mast", "Mástil de 10 m") },
  metrics: {
    sunPct: tr("Sun in view", "Sol a la vista"),
    earthPct: tr("Earth in view", "Tierra a la vista"),
    bothPct: tr("Both at once", "Los dos a la vez"),
    longestNightH: tr("Longest night", "Noche más larga"),
    longestSilenceH: tr("Longest silence", "Silencio más largo"),
    meanPanelWm2: tr("Mean panel power", "Potencia media"),
  },
  regionsTitle: tr("Candidate landing regions, ground level", "Regiones candidatas de aterrizaje, a ras del suelo"),
  regionColumns: tr(["Region", "Sun", "Earth", "Longest night"], ["Región", "Sol", "Tierra", "Noche más larga"]),
  horizon: {
    detailed: tr("Horizon from the 5 m terrain model", "Horizonte del modelo de terreno de 5 m"),
    approximate: tr("Horizon from the 240 m grid (approximate)", "Horizonte de la malla de 240 m (aproximado)"),
  },
  kinds: { site: tr("South pole site", "Sitio del polo sur"), mission: tr("CLPS mission landing", "Aterrizaje de misión CLPS") },
  centreNote: tr(
    "The marker is the centre of the terrain mosaic, not a chosen landing point. The candidate regions are.",
    "El marcador es el centro del mosaico de terreno, no un punto de aterrizaje elegido. Las regiones candidatas sí lo son.",
  ),
}

/** La pestaña "Calendar": mes a mes, 2026 a 2030. */
export const months = {
  body: tr(
    `Same place, same horizon. Across 61 lunar months the share of sunlight at ${featured.name} swings with the lunar seasons, and Earth comes and goes with libration.`,
    `El mismo lugar, el mismo horizonte. A lo largo de 61 meses lunares, la proporción de luz solar en ${featured.name} varía con las estaciones lunares, y la Tierra va y viene con la libración.`,
  ),
  caption: tr(`${featured.name}, ground level, each lunar month from 2026 to 2030`, `${featured.name}, a ras del suelo, cada mes lunar de 2026 a 2030`),
  sun: tr("Sun in view", "Sol a la vista"),
  earth: tr("Earth in view", "Tierra a la vista"),
  hint: tr("Point at a bar to read a month.", "Señala una barra para leer un mes."),
}

/**
 * El recorrido del producto en cuatro pasos, uno por pantalla del flujo del equipo (docs/11-flujo-y-arquitectura.md):
 * Dashboard, Planificador, Simulación y el asistente de IA.
 */
export const product = {
  // En español el título evita palabras largas: va en mayúsculas grandes y no deben pasar del ancho de un teléfono.
  title: tr("One workflow, from the first plan to the replan.", "Un solo flujo, del primer plan al nuevo plan."),
  steps: [
    {
      // Los verbos van en letras enormes y están medidos para ocho letras como mucho (landing.css, `.ln-step__verb`).
      verb: tr("Plan", "Planea"),
      question: tr("Which missions still hold?", "¿Qué misiones siguen en pie?"),
      body: tr(
        "Give each mission a site, a date and its requirements. The dashboard keeps them together and flags the ones that stopped meeting their sunlight or Earth contact.",
        "Dale a cada misión un sitio, una fecha y sus requisitos. El dashboard las reúne y marca las que dejaron de cumplir su luz solar o su contacto con la Tierra.",
      ),
      action: actions.planner,
    },
    {
      verb: tr("Compare", "Compara"),
      question: tr("The date slipped. What now?", "La fecha se movió. ¿Y ahora?"),
      body: tr(
        "The planner lines up the ways out, another date, another site or a taller mast, with the same figures for each, and proposes the one that meets the requirements.",
        "El planificador pone en fila las salidas (otra fecha, otro sitio o un mástil más alto) con las mismas cifras para cada una, y propone la que cumple los requisitos.",
      ),
      action: null,
    },
    {
      verb: tr("See", "Mira"),
      question: tr("Where is it, and what is the sky doing there?", "¿Dónde está y qué hace el cielo allí?"),
      body: tr(
        "Fly the 3D Moon built on LOLA relief: 62 landing sites, each with its source, and the Sun and Earth against the horizon for any date from 2026 to 2030. A polar site opens in the planner with one click.",
        "Vuela sobre la Luna 3D construida con el relieve de LOLA: 62 sitios de aterrizaje, cada uno con su fuente, y el Sol y la Tierra contra el horizonte para cualquier fecha de 2026 a 2030. Un sitio polar se abre en el planificador con un clic.",
      ),
      action: actions.map3d,
    },
    {
      verb: tr("Learn", "Aprende"),
      question: tr("Why did the plan change?", "¿Por qué cambió el plan?"),
      body: tr(
        "Ask the AI assistant. It explains the figures the engine computed and cites its sources; it never invents a number. EVA, the guide robot, walks you through the planner step by step.",
        "Pregúntale al asistente de IA. Explica las cifras que calculó el motor y cita sus fuentes; nunca inventa un número. EVA, el robot guía, te lleva por el planificador paso a paso.",
      ),
      action: null,
    },
  ],
}

export const audience = {
  quote: tr("The date slipped. Is the site still viable? Which alternative is better?", "La fecha se movió. ¿El sitio sigue siendo viable? ¿Qué alternativa es mejor?"),
  attribution: tr("The question a mission planner has to answer, again and again", "La pregunta que quien planifica la misión debe responder una y otra vez"),
  body: tr(
    "Built for the person who picks a landing site and date, and picks again when the schedule moves. Agile planning for lunar missions, with an AI assistant on hand. Open to educators and to anyone curious about why the lunar south pole is so hard.",
    "Hecho para la persona que elige el sitio y la fecha de aterrizaje, y vuelve a elegir cuando el calendario se mueve. Planificación ágil para misiones lunares, con un asistente de IA a la mano. Abierto a docentes y a cualquiera con curiosidad por saber por qué el polo sur lunar es tan difícil.",
  ),
  measures: [
    {
      term: tr("Technical innovation", "Innovación técnica"),
      detail: tr(
        "A validated engine on LOLA terrain and JPL ephemeris, with an AI assistant that explains its figures",
        "Un motor validado sobre el relieve de LOLA y las efemérides de JPL, con un asistente de IA que explica sus cifras",
      ),
    },
    {
      term: tr("Educational value", "Valor educativo"),
      detail: tr(
        "Guess-first questions, live views and an assistant that teaches why the pole is different",
        "Preguntas para adivinar primero, vistas en vivo y un asistente que enseña por qué el polo es distinto",
      ),
    },
    {
      term: tr("Mission impact", "Impacto en la misión"),
      detail: tr("A replan in minutes, not weeks, when the schedule moves", "Replanificar en minutos, no en semanas, cuando el calendario se mueve"),
    },
  ],
}

/** Cada cifra viene de docs/07-pruebas-y-validacion.md y docs/04-planificador.md (suite del 2026-11-14). */
export const validation = {
  title: tr("Checked against the record.", "Comprobado con fuentes externas."),
  body: tr(
    "A fast replan is only useful if its numbers hold. Every calculation is tested against an independent source. The suite ran on 14 November 2026.",
    "Replanificar rápido solo sirve si los números se sostienen. Cada cálculo se prueba contra una fuente independiente. La suite corrió el 14 de noviembre de 2026.",
  ),
  moreLabel: tr("All checks and stated limits", "Todas las comprobaciones y los límites declarados"),
  /** docs/04-planificador.md (sección 5), docs/07-pruebas-y-validacion.md y luna-recursos/LEEME.md. */
  checks: [
    {
      claim: tr("Sun and Earth direction", "Dirección del Sol y la Tierra"),
      against: tr("JPL Horizons tables computed per site", "Tablas de JPL Horizons calculadas por sitio"),
      result: tr("Worst error 0.0065°. The test allows 0.01°.", "Peor error: 0.0065°. La prueba admite 0.01°."),
    },
    {
      claim: tr("Planner figures", "Cifras del planificador"),
      against: tr("The independent 3D scene engine, same site and lunar day", "El motor independiente de la escena 3D, mismo sitio y día lunar"),
      result: tr("Within 0.5 points: 54.05% against 53.98% sunlight.", "Dentro de 0.5 puntos: 54.05% frente a 53.98% de luz solar."),
    },
    {
      claim: tr("Polar terrain height", "Altura del terreno polar"),
      against: tr("The 5 m model at Connecting Ridge", "El modelo de 5 m en Connecting Ridge"),
      result: tr("The 240 m grid lands 2.3 m away. The test allows 5 m.", "La malla de 240 m queda a 2.3 m. La prueba admite 5 m."),
    },
    {
      claim: tr("Candidate landing regions", "Regiones candidatas de aterrizaje"),
      against: tr("Barker et al. (2021): regions 4 to 6 exceed 70% sunlight at 1 m", "Barker et al. (2021): las regiones 4 a 6 superan el 70% de luz solar a 1 m"),
      result: tr("The engine gives 88.0%, 85.0% and 90.3%.", "El motor da 88.0%, 85.0% y 90.3%."),
    },
    {
      claim: tr("Earth visibility", "Visibilidad de la Tierra"),
      against: tr("Mazarico et al. (2011), 26 points, 18.6 years", "Mazarico et al. (2011), 26 puntos, 18.6 años"),
      result: tr("Mean error 4.3 points. The test allows 5.", "Error medio: 4.3 puntos. La prueba admite 5."),
    },
    {
      claim: tr("Powered descent", "Descenso propulsado"),
      against: tr("Apollo 11 mission plan, NASA TN D-6846", "Plan de misión del Apollo 11, NASA TN D-6846"),
      result: tr(
        `Touchdown at ${descent.contactS} s against ${descent.planContactS} s. Velocity change ${off(descent.deltaVPct)}, propellant ${off(descent.fuelPct)}.`,
        `Alunizaje a los ${descent.contactS} s frente a ${descent.planContactS} s. Cambio de velocidad ${off(descent.deltaVPct)}, propelente ${off(descent.fuelPct)}.`,
      ),
    },
  ],
  limitsTitle: tr("Stated limits", "Límites declarados"),
  limits: tr(
    [
      "Dates run from 2026 to 2030, in UTC.",
      "Custom points exist only within 190 km of the south pole, and their horizon comes from the 240 m grid: relief under about 500 m does not appear.",
      "At ground level, sunlight figures differ from the 60 m maps by about 14 points: 5 m terrain sees bumps that coarser maps smooth out.",
      "The Sun is a uniform disc, annual aberration (0.006°) is not applied, and the vertical tracking panel is an assumption.",
    ],
    [
      "Las fechas van de 2026 a 2030, en UTC.",
      "Los puntos propios solo existen a menos de 190 km del polo sur, y su horizonte sale de la malla de 240 m: el relieve de menos de unos 500 m no aparece.",
      "A ras del suelo, las cifras de luz solar difieren de los mapas de 60 m en unos 14 puntos: el terreno de 5 m ve relieves que los mapas más gruesos suavizan.",
      "El Sol es un disco uniforme, no se aplica la aberración anual (0.006°) y el panel vertical que sigue al Sol es un supuesto.",
    ],
  ),
  tiles: [
    {
      value: "113 / 113",
      label: tr("Automated tests passing", "Pruebas automáticas aprobadas"),
      detail: tr(
        "175,879 assertions across the ephemeris, horizon, planner and descent engines.",
        "175 879 aserciones en los motores de efemérides, horizonte, planificador y descenso.",
      ),
    },
    {
      value: "0.0065°",
      label: tr("Worst Sun and Earth direction error", "Peor error de dirección del Sol y la Tierra"),
      detail: tr("Against per-site tables from JPL Horizons, 2026 to 2030.", "Frente a tablas por sitio de JPL Horizons, 2026 a 2030."),
    },
    {
      value: "4.3 pts",
      label: tr("Mean Earth visibility error", "Error medio de visibilidad de la Tierra"),
      detail: tr("Against the 18.6-year maps of Mazarico et al. (2011), 26 points.", "Frente a los mapas de 18.6 años de Mazarico et al. (2011), 26 puntos."),
    },
    {
      value: `${descent.contactS} s`,
      label: tr("Simulated Apollo 11 touchdown", "Alunizaje simulado del Apollo 11"),
      detail: tr(`The mission plan says ${descent.planContactS} s (NASA TN D-6846).`, `El plan de misión dice ${descent.planContactS} s (NASA TN D-6846).`),
    },
  ],
}

/** Productos y enlaces de docs/08-datos-y-fuentes.md. Los nombres propios de productos, archivos y citas no se traducen. */
export const sources = {
  title: tr("Open NASA data, cited.", "Datos abiertos de la NASA, citados."),
  body: tr(
    "Nothing is queried live: each product was downloaded once, trimmed, and stored with its provenance.",
    "Nada se consulta en vivo: cada producto se descargó una vez, se recortó y se guardó con su procedencia.",
  ),
  groups: [
    {
      name: tr("Sun and Earth", "Sol y Tierra"),
      items: [
        {
          name: "JPL Horizons, DE441",
          detail: tr(
            "Sub-solar and sub-Earth points in the Moon-fixed frame, every 3 hours, 2026 to 2030.",
            "Puntos subsolar y subterrestre en el marco fijo a la Luna, cada 3 horas, 2026 a 2030.",
          ),
          href: "https://ssd.jpl.nasa.gov/horizons/",
        },
      ],
    },
    {
      name: tr("Terrain", "Terreno"),
      items: [
        {
          name: tr("LRO LOLA polar elevation, 240 m and 120 m", "Elevación polar de LRO LOLA, 240 m y 120 m"),
          detail: tr("LDEM_75S grids from the PDS Geosciences Node. The relief on this page.", "Mallas LDEM_75S del PDS Geosciences Node. El relieve de esta página."),
          href: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/",
        },
        {
          name: tr("LOLA 5 m south pole site models", "Modelos LOLA de 5 m de sitios del polo sur"),
          detail: tr(
            "NASA GSFC Planetary Geodesy Data Archive, Barker et al. (2021), with candidate landing regions.",
            "NASA GSFC Planetary Geodesy Data Archive, Barker et al. (2021), con regiones candidatas de aterrizaje.",
          ),
          href: "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README",
        },
        {
          name: tr("LROC NAC terrain model, Apollo 17, 2 m", "Modelo de terreno LROC NAC, Apollo 17, 2 m"),
          detail: tr("Arizona State University for NASA. The detailed scene of the simulator.", "Arizona State University para la NASA. La escena detallada del simulador."),
          href: "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/",
        },
      ],
    },
    {
      name: tr("Checks", "Comprobaciones"),
      items: [
        {
          name: tr("Polar illumination maps", "Mapas de iluminación polar"),
          detail: tr("Mazarico et al. (2011), 60 m, 18.6 years. Used only to validate.", "Mazarico et al. (2011), 60 m, 18.6 años. Solo se usan para validar."),
          href: "https://pgda.gsfc.nasa.gov/products/69",
        },
        {
          name: tr("Apollo 11 descent record", "Registro del descenso del Apollo 11"),
          detail: tr("NASA TN D-6846, Bennett (1972). Used only to validate the descent.", "NASA TN D-6846, Bennett (1972). Solo se usa para validar el descenso."),
          href: "https://ntrs.nasa.gov/citations/19720018205",
        },
      ],
    },
  ],
}

export const closing = {
  /** `sections/Closing.tsx` parte el título por ". ": en los dos idiomas son dos frases, con un solo ". " entre ellas. */
  title: tr("Plan the mission. Replan in minutes.", "Planea la misión. Replanea en minutos."),
  body: tr(
    "Start a mission at the south pole, move the date and watch the plan respond. The assistant is there when you ask why.",
    "Empieza una misión en el polo sur, mueve la fecha y mira cómo responde el plan. El asistente está ahí cuando preguntes por qué.",
  ),
}

export const footer = {
  disclaimer: tr(
    "Independent project by participants in the NASA Space Apps Challenge 2026. It uses public NASA data and cites every source. It is not endorsed by NASA.",
    "Proyecto independiente de participantes del NASA Space Apps Challenge 2026. Usa datos públicos de la NASA y cita cada fuente. No cuenta con el respaldo de la NASA.",
  ),
  ai: tr(
    "Built with AI assistance: the code and the copy were drafted with an AI coding assistant (Claude Code) and reviewed by the team. Every figure is computed from the cited data.",
    "Hecho con ayuda de IA: el código y los textos se redactaron con un asistente de programación con IA (Claude Code) y los revisó el equipo. Cada cifra se calcula a partir de los datos citados.",
  ),
  plate: tr(
    "The relief on this page is LOLA elevation drawn live in your browser. Its shadows follow the real Sun direction for the date shown; they are a preview, and the figures come from the validated engine.",
    "El relieve de esta página es la elevación de LOLA dibujada en vivo en tu navegador. Sus sombras siguen la dirección real del Sol para la fecha mostrada; son una vista previa, y las cifras salen del motor validado.",
  ),
}
