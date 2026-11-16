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

const { featured, pole, compare, pairDistanceM, descent, day } = facts
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
  title: tr("Lunar south pole", "Polo sur lunar"),
  steps: {
    engine: tr("Starting the 3D engine", "Arrancando el motor 3D"),
    terrain: tr("Downloading the terrain", "Descargando el relieve"),
    mesh: tr("Building the relief", "Construyendo el relieve"),
    light: tr("Computing sunlight and shadows", "Calculando luz y sombras"),
    done: tr("Ready", "Listo"),
  },
  source: tr("Elevation: NASA LRO, LOLA", "Altimetría: NASA LRO, LOLA"),
}

/** El modal de idioma de cada visita, con el estilo de las preguntas del vuelo: en inglés, para que lo lea cualquiera. */
export const chooseLanguage = {
  label: "Language · Idioma",
  title: "For a better experience, choose your language",
  options: [
    { lang: "en", name: "English" },
    { lang: "es", name: "Spanish" },
  ] as Array<{ lang: "en" | "es"; name: string }>,
  skip: "Not now",
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
    linked: tr("Connection restored", "Conexión restablecida"),
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

/**
 * La bitácora de misiones del vuelo: la campaña de ejemplo del planificador (`prototipos/lunar-map/campaign.js`) y,
 * como referencia, una misión real que aterrizó en la región. `site` es el id del sitio en la lámina (plate.json):
 * ahí se marca la misión sobre el terreno.
 */
export type MissionStatus = "go" | "pending" | "review" | "draft" | "done"
export const missionLog = {
  label: tr("Example campaign · Planner", "Campaña de ejemplo · Planificador"),
  status: {
    go: "GO",
    pending: tr("Pending sign-off", "Pendiente de firma"),
    review: tr("Review", "En revisión"),
    draft: tr("Draft", "Borrador"),
    done: tr("Real mission", "Misión real"),
  } as Record<MissionStatus, string>,
  missions: [
    { id: "CR-01", name: tr("Landing at Connecting Ridge", "Alunizaje en Connecting Ridge"), when: tr("18 Dec 2026 · 09:00 UTC", "18 dic 2026 · 09:00 UTC"), status: "go", site: "connecting-ridge-roi-6", place: "Connecting Ridge · RoI 6", points: ["connecting-ridge-roi-6", "de-gerlache-rim-roi-1", "peak-near-shackleton-roi-1"] },
    { id: "CR-02", name: tr("Science walk to the Shackleton rim", "Caminata científica al borde de Shackleton"), when: tr("19 Dec 2026 · 10:00 UTC", "19 dic 2026 · 10:00 UTC"), status: "pending", site: "connecting-ridge-roi-6", place: "Connecting Ridge → Shackleton rim", points: ["connecting-ridge-roi-6", "shackleton-rim-roi-4", "peak-near-shackleton-roi-2"] },
    { id: "PS-03", name: tr("Survey of the peak next to Shackleton", "Reconocimiento del pico junto a Shackleton"), when: tr("Jan 2027 · date to be chosen", "ene 2027 · fecha por elegir"), status: "review", site: "peak-near-shackleton-roi-2", place: "Peak near Shackleton · RoI 2", points: ["peak-near-shackleton-roi-1", "connecting-ridge-roi-6", "de-gerlache-rim-roi-1"] },
    { id: "SR-05", name: tr("Landing at the Shackleton rim", "Alunizaje en el borde de Shackleton"), when: tr("5 May 2027 · 09:00 UTC", "5 may 2027 · 09:00 UTC"), status: "review", site: "shackleton-rim-roi-4", place: "Shackleton rim · RoI 4", points: ["shackleton-rim-roi-4", "de-gerlache-rim-roi-1", "peak-near-shackleton-roi-2"] },
    { id: "DG-04", name: tr("Sampling at the de Gerlache rim", "Muestreo en el borde de de Gerlache"), when: tr("No date · science team draft", "Sin fecha · borrador del equipo científico"), status: "draft", site: "de-gerlache-rim", place: "de Gerlache rim", points: ["de-gerlache-rim-roi-1", "connecting-ridge-roi-6", "peak-near-shackleton-roi-1"] },
    { id: "IM-2", name: tr("Athena lander (Intuitive Machines)", "Módulo Athena (Intuitive Machines)"), when: tr("6 Mar 2025 · landed on its side", "6 mar 2025 · quedó de lado"), status: "done", site: "im-2", place: "Mons Mouton", points: [] },
  ] as Array<{ id: string; name: string; when: string; status: MissionStatus; site: string; place: string; points: string[] }>,
  /** Lo que dice cada fila: elegir la misión lleva a sus tres puntos. */
  choose: tr("See its 3 points", "Ver sus 3 puntos"),
}

/**
 * Los tres puntos de la misión elegida: su sitio y otros dos sitios reales de la zona (a kilómetros entre sí, para que
 * se distingan desde lejos), con las cifras del motor a ras de suelo
 * (las trae la lámina, `plate.json`). Al hacer clic se abre el planificador en ese punto.
 */
export const missionPoints = {
  label: tr("Mission points · real sites of the region", "Puntos de la misión · sitios reales de la zona"),
  intro: tr(
    "The mission's site and two other real sites of the region, kilometres apart, each measured against its own horizon for the lunar day from 1 December 2026, at ground level. Click one, or keep scrolling, to fly closer.",
    "El sitio de la misión y otros dos sitios reales de la zona, a kilómetros entre sí, cada uno medido contra su propio horizonte en el día lunar desde el 1 de diciembre de 2026, a ras de suelo. Haz clic en uno, o sigue bajando, para acercarte.",
  ),
  sun: tr("Sun", "Sol"),
  earth: tr("Earth", "Tierra"),
  night: tr("Longest night", "Noche más larga"),
  open: tr("See up close", "Ver de cerca"),
  /** El panel de un punto de cerca. */
  point: tr("Point", "Punto"),
  of: tr("of", "de"),
  position: tr("Position", "Posición"),
  height: tr("Height", "Altura"),
  both: tr("Sun and Earth at once", "Sol y Tierra a la vez"),
  silence: tr("Longest silence (no Earth)", "Silencio más largo (sin Tierra)"),
  panel: tr("Mean solar power", "Potencia solar media"),
  fromSite: tr("from the mission site", "del sitio de la misión"),
  note: tr(
    "Ground level, lunar day from 1 December 2026. Computed with the project's engine: JPL Horizons DE441 and LOLA terrain.",
    "A ras de suelo, día lunar desde el 1 de diciembre de 2026. Calculado con el motor del proyecto: JPL Horizons DE441 y relieve LOLA.",
  ),
  back: tr("All three points", "Los tres puntos"),
  /**
   * El punto de cerca explicado para quien no sabe del tema: un veredicto en una frase y, por cada cifra, qué
   * significa en la práctica. `{n}` es la cifra ya escrita (porcentaje o días).
   */
  lunarDay: tr(
    `A day on the Moon lasts ${facts.lunarDayDays.toFixed(1)} Earth days. This is how this spot does over one of them.`,
    `Un día en la Luna dura ${facts.lunarDayDays.toFixed(1)} días terrestres. Así le va a este lugar durante uno.`,
  ),
  verdict: {
    viable: { label: tr("Good spot", "Buen sitio"), say: tr("Plenty of sunlight and regular contact with Earth.", "Mucha luz solar y contacto frecuente con la Tierra.") },
    limited: { label: tr("Usable, with limits", "Usable, con límites"), say: tr("It works, but the mission has to plan around the dark or the silences.", "Sirve, pero la misión tiene que organizarse alrededor de la oscuridad o de los silencios.") },
    no: { label: tr("Not a good spot", "Mal sitio"), say: tr("Too little sunlight or almost no contact with Earth.", "Muy poca luz solar o casi ningún contacto con la Tierra.") },
  },
  explain: {
    sun: tr("Of the lunar day, the solar panels get sunlight {n} of the time.", "Del día lunar, los paneles solares reciben luz el {n} del tiempo."),
    earth: tr("Earth is above the horizon {n} of the time: that is when the lander can talk to mission control directly.", "La Tierra está sobre el horizonte el {n} del tiempo: es cuando el módulo puede hablar directamente con el control de misión."),
    both: tr("Power and radio at the same time {n} of the time: the best hours to work.", "Energía y radio a la vez el {n} del tiempo: las mejores horas para trabajar."),
    night: tr("The longest stretch in the dark: {n}. The batteries must last that long.", "El tramo más largo a oscuras: {n}. Las baterías tienen que aguantar todo ese tiempo."),
    nightNone: tr("It never gets dark here during this lunar day: no long night for the batteries.", "Aquí no oscurece en todo este día lunar: las baterías no pasan una noche larga."),
    silence: tr("The longest time without seeing Earth: {n} with no direct radio contact.", "El tiempo más largo sin ver la Tierra: {n} sin contacto directo por radio."),
    panel: tr("Average sunlight on the panel: {n} of the strongest sunlight there is (1361 W/m²).", "Luz media sobre el panel: el {n} de la luz solar más fuerte que existe (1361 W/m²)."),
  },
  day: tr("day", "día"),
  days: tr("days", "días"),
  hoursWord: tr("hours", "horas"),
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
    id: "missions",
    rail: tr("Missions", "Misiones"),
    title: tr("Mission log", "Bitácora de misiones"),
    body: tr(
      "The example campaign in the planner, on the real terrain. Each mission is checked against the horizon of its own site.",
      "La campaña de ejemplo del planificador, sobre el relieve real. Cada misión se comprueba contra el horizonte de su propio sitio.",
    ),
  },
  {
    id: "points",
    rail: tr("Points", "Puntos"),
    title: tr("Three points per mission.", "Tres puntos por misión."),
    body: "",
  },
  // De cerca, el punto elegido de la misión (el contenido sale de `missionPoints` y de la lámina).
  { id: "point", rail: tr("Up close", "De cerca"), title: "", body: "" },
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
  title: tr("The planner's views, right on this page.", "Las vistas del planificador, en esta misma página."),
  body: tr(
    `Not a screenshot. These are the planner's own views running on real ephemeris and terrain: one lunar day at ${featured.name}, from 1 December 2026. Move the date and watch the plan respond.`,
    `No es una captura. Son las vistas del propio planificador, funcionando con efemérides y relieve reales: un día lunar en ${featured.name}, desde el 1 de diciembre de 2026. Mueve la fecha y mira cómo responde el plan.`,
  ),
  tabs: {
    // Comparar va primero: es lo que se ve al llegar a la ventana del software.
    compare: tr("Compare", "Comparar"),
    lander: tr("Lander", "Módulo"),
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

/**
 * Qué pasa si el lanzamiento se retrasa: la luz solar del mismo sitio el mes lunar del relato y los dos siguientes
 * (`facts.months`, a ras del suelo).
 */
function slipLine() {
  const start = Date.parse(facts.lunarDayStartUTC)
  const i = Math.max(0, facts.months.findIndex(([t], k) => t <= start && (facts.months[k + 1]?.[0] ?? Infinity) > start))
  const [a, b, c] = [0, 1, 2].map((k) => pct(facts.months[i + k][1]))
  return {
    lead: tr("If the launch slips:", "Si el lanzamiento se retrasa:"),
    text: tr(
      `sunlight here goes from ${a} to ${b} one month later, and ${c} two months later.`,
      `aquí la luz solar pasa del ${a} al ${b} un mes después, y al ${c} dos meses después.`,
    ),
  }
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
        "Ask the AI assistant. It explains the figures the engine computed and cites its sources; it is instructed never to invent a number, and the figures on screen are the reference. EVA, the guide robot, walks you through the planner step by step.",
        "Pregúntale al asistente de IA. Explica las cifras que calculó el motor y cita sus fuentes; tiene la instrucción de no inventar números, y las cifras en pantalla son la referencia. EVA, el robot guía, te lleva por el planificador paso a paso.",
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
    "A fast replan is only useful if its numbers hold. The key calculations are checked against an independent source. The suite ran on 14 November 2026.",
    "Replanificar rápido solo sirve si los números se sostienen. Los cálculos clave se comprueban contra una fuente independiente. La suite corrió el 14 de noviembre de 2026.",
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
      claim: tr("Sunlight at Connecting Ridge", "Luz solar en Connecting Ridge"),
      against: tr("Mazarico et al. (2011), ground level, 18.6 years", "Mazarico et al. (2011), a ras de suelo, 18.6 años"),
      result: tr("The engine gives 36.6%; the published maps give 38.5%. The test allows 5 points.", "El motor da 36.6%; los mapas publicados dan 38.5%. La prueba admite 5 puntos."),
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
          detail: tr("Arizona State University for NASA. The detailed scene used to validate the engine.", "Arizona State University para la NASA. La escena detallada con la que se validó el motor."),
          href: "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/",
        },
      ],
    },
    {
      name: tr("Sites and names of the 3D Moon", "Sitios y nombres de la Luna 3D"),
      items: [
        {
          name: tr("NSSDCA lunar landing records", "Registros de alunizajes del NSSDCA"),
          detail: tr("NASA Space Science Data Coordinated Archive. The landing sites of the 3D Moon, checked by a script.", "Archivo coordinado de datos de ciencia espacial de la NASA. Los sitios de la Luna 3D, comprobados con un script."),
          href: "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html",
        },
        {
          name: tr("Gazetteer of Planetary Nomenclature", "Nomenclátor de nombres planetarios"),
          detail: tr("IAU / USGS. The 8,876 official place names of the 3D Moon.", "UAI / USGS. Los 8876 nombres oficiales de lugares de la Luna 3D."),
          href: "https://planetarynames.wr.usgs.gov/",
        },
        {
          name: "NASA Blue Marble",
          detail: tr("The Earth seen from the 3D Moon.", "La Tierra que se ve desde la Luna 3D."),
          href: "https://visibleearth.nasa.gov/collection/1484/blue-marble",
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

/**
 * El problema, en tres cifras (diapositiva 2 de la presentación, `apps/web/public/demo.html`): el Sol más alto sobre
 * el polo, dos puntos de una misma cresta y las herramientas con las que hoy se responde.
 */
export const problem = {
  label: tr("The problem", "El problema"),
  title: tr("The launch slipped.", "El lanzamiento se retrasó."),
  ask: tr("Is the site still viable?", "¿El sitio sigue siendo viable?"),
  body: tr(
    "A lander at the Moon's south pole needs the Sun for power and Earth for a direct radio link. There, both sit at the horizon, so a ridge can hide either one for days.",
    "Un módulo en el polo sur de la Luna necesita el Sol para tener energía y la Tierra para un enlace de radio directo. Allí los dos están a ras del horizonte, así que una cresta puede tapar cualquiera de ellos durante días.",
  ),
  stats: [
    {
      value: `${pole.sunMaxElevationDeg.toFixed(2)}°`,
      label: tr("Highest the Sun climbs over the pole between 2026 and 2030", "Lo más alto que sube el Sol sobre el polo entre 2026 y 2030"),
    },
    {
      value: `${pairDistanceM} m`,
      label: tr(
        `Between two points on one ridge: one has sunlight ${pct(featured.ground.sunPct)} of the lunar day, the other never loses it`,
        `Entre dos puntos de una misma cresta: uno tiene luz solar el ${pct(featured.ground.sunPct)} del día lunar y el otro nunca la pierde`,
      ),
    },
    {
      value: tr("3 tools", "3 herramientas"),
      label: tr(
        "Quickmap, Moon Trek and JPL Horizons hold the answer today, as raw data, one site and date at a time",
        "Quickmap, Moon Trek y JPL Horizons tienen hoy la respuesta, como datos en bruto, un sitio y una fecha cada vez",
      ),
    },
  ],
  sketch: {
    caption: tr("Cross-section, not to scale.", "Corte sin escala."),
    level: tr("Horizon 0°", "Horizonte 0°"),
    sun: tr(`Sun · ≤ ${pole.sunMaxElevationDeg.toFixed(2)}°`, `Sol · ≤ ${pole.sunMaxElevationDeg.toFixed(2)}°`),
    earth: tr("Earth", "Tierra"),
    blocked: tr("Sun blocked", "Sol tapado"),
    link: tr("Radio link", "Enlace de radio"),
    ridge: tr("Ridge", "Cresta"),
    lander: tr("Lander", "Módulo"),
  },
  /** La franja bajo el dibujo: un día lunar real de Connecting Ridge, tramo a tramo (`facts.day`). */
  when: {
    title: tr("Horizon SignAI tells you when.", "Horizon SignAI te dice cuándo."),
    body: tr(
      `For every site and every date: the hours with the Sun and with Earth in view. Here, one lunar day at ${featured.name}.`,
      `Para cada punto y cada fecha: las horas con el Sol y con la Tierra a la vista. Aquí, un día lunar en ${featured.name}.`,
    ),
    day,
    sun: tr("Sun", "Sol"),
    earth: tr("Earth", "Tierra"),
    sunPct: pct(featured.ground.sunPct),
    earthPct: pct(featured.ground.earthPct),
    shown: tr("In view", "A la vista"),
    hidden: tr("Not in view", "Fuera de vista"),
    both: tr("Both", "Los dos"),
    bothPct: pct(featured.ground.bothPct),
    bothNote: tr("Power and radio at the same time: what a lander needs.", "Energía y radio a la vez: lo que necesita un módulo."),
    moment: tr("The drawing", "El dibujo"),
    slip: slipLine(),
    start: tr("1 Dec 2026", "1 dic 2026"),
    end: tr(`${facts.lunarDayDays.toFixed(1)} days`, `${facts.lunarDayDays.toFixed(1)} días`),
  },
  close: tr("Mission planners have to answer this again every time a schedule moves.", "Quien planifica la misión tiene que responder esto otra vez cada vez que el calendario se mueve."),
  closeStrong: tr("We made it one screen.", "Lo hicimos una sola pantalla."),
  note: tr(
    "Figures: our engine on JPL Horizons DE441 and LOLA terrain, lunar day from 1 Dec 2026, ground level.",
    "Cifras: nuestro motor con JPL Horizons DE441 y el relieve de LOLA, día lunar desde el 1 dic 2026, a ras de suelo.",
  ),
}

/**
 * El planificador con el caso del reto (diapositivas 3 a 5): el plan de ejemplo, el retraso de 106 días y qué zonas
 * siguen aterrizando, lo que hace cada herramienta y la Luna 3D. Los veredictos son los del planificador
 * (`prototipos/lunar-map/index.html`, escenario SLIP); el resto, de docs/SUBMISSION.md.
 */
export const plannerDemo = {
  label: tr("The planner", "El planificador"),
  title: tr("Move the date.", "Mueve la fecha."),
  accent: tr("See who still lands.", "Mira quién sigue aterrizando."),
  plan: tr("The example plan lands on 18 Dec 2026: all three candidate zones pass.", "El plan de ejemplo aterriza el 18 dic 2026: las tres zonas candidatas cumplen."),
  slip: tr("Slip it 106 days, same lander, same requirements:", "Retrásalo 106 días, mismo módulo, mismos requisitos:"),
  zones: [
    { zone: tr("Zone A", "Zona A"), place: "Connecting Ridge · RoI 6", go: false },
    { zone: tr("Zone B", "Zona B"), place: "Peak near Shackleton · RoI 2", go: true },
    { zone: tr("Zone C", "Zona C"), place: "Shackleton rim · RoI 4", go: false },
  ],
  verdictWhy: tr(
    "The verdict checks the mission's own needs: Sun and Earth at landing, a night the battery survives, enough Earth contact.",
    "El veredicto comprueba lo que necesita la misión: Sol y Tierra al aterrizar, una noche que la batería aguante y suficiente contacto con la Tierra.",
  ),
  open: tr("Try it in the planner", "Pruébalo en el planificador"),
  openTo: plannerPath(),
  featuresTitle: tr("Where they are, and for how long.", "Dónde están, y por cuánto tiempo."),
  features: [
    { strong: tr("Sun and Earth against the real horizon", "El Sol y la Tierra contra el horizonte real"), rest: tr("of the site, for any date and time from 2026 to 2030.", "del sitio, para cualquier fecha y hora de 2026 a 2030.") },
    { strong: tr("Time left", "El tiempo que queda"), rest: tr("until sunset or Earthset, or until they rise again.", "hasta que se ponen el Sol o la Tierra, o hasta que vuelven a salir.") },
    { strong: tr("When a plan fails, three ways out,", "Cuando un plan falla, tres salidas,"), rest: tr("each one click: another date, another zone, taller equipment.", "cada una a un clic: otra fecha, otra zona, equipo más alto.") },
    { strong: tr("Compare up to six scenarios", "Compara hasta seis escenarios"), rest: tr("side by side, on a 90-day timeline of sunlight and Earth contact.", "lado a lado, en una línea de tiempo de 90 días de luz solar y contacto con la Tierra.") },
    { strong: tr("Share a scenario with a link,", "Comparte un escenario con un enlace,"), rest: tr("so science and engineering look at the same numbers.", "para que ciencia e ingeniería miren los mismos números.") },
  ],
  moonTitle: tr("Every landing site, on real relief.", "Cada sitio de aterrizaje, sobre relieve real."),
  moon: [
    {
      strong: tr("62 sites:", "62 sitios:"),
      rest: tr(
        "Apollo, Luna, Surveyor, Chang'e, Chandrayaan, commercial deliveries and south pole candidate regions, each with its source.",
        "Apollo, Luna, Surveyor, Chang'e, Chandrayaan, entregas comerciales y regiones candidatas del polo sur, cada uno con su fuente.",
      ),
    },
    { strong: tr("LOLA relief", "Relieve de LOLA"), rest: tr("for the globe and the south pole, with 8,876 official place names (IAU).", "para todo el globo y el polo sur, con 8876 nombres oficiales de lugares (UAI).") },
    { strong: tr("Pick a date:", "Elige una fecha:"), rest: tr("the real Sun, Earth and shadows, and each site's Sun and Earth against its horizon.", "el Sol, la Tierra y las sombras reales, y el Sol y la Tierra de cada sitio contra su horizonte.") },
    { strong: tr("A polar point opens in the planner", "Un punto polar se abre en el planificador"), rest: tr("with one click.", "con un clic.") },
  ],
  definitions: tr(
    "How it counts: the Sun is in view if any part of its disc is above the terrain; Earth, by its centre. The solar panel is assumed vertical and Sun-tracking. The Moon has no atmosphere, so there is no refraction to add.",
    "Cómo cuenta: el Sol está a la vista si cualquier parte de su disco está sobre el terreno; la Tierra, por su centro. Se supone el panel solar vertical y siguiendo al Sol. La Luna no tiene atmósfera, así que no hay refracción que sumar.",
  ),
}

/** Para quién es (diapositiva 7): tres públicos, cada uno con lo que gana. */
export const audienceGroups = {
  title: tr("A replan in minutes,", "Replanificar en minutos,"),
  accent: tr("for more than specialists.", "para más que especialistas."),
  groups: [
    {
      name: tr("Mission planners", "Quien planifica misiones"),
      detail: tr(
        "Re-check a site and date the moment the schedule moves, and send the scenario to the team as a link.",
        "Vuelve a comprobar un sitio y una fecha en cuanto se mueve el calendario, y manda el escenario al equipo con un enlace.",
      ),
    },
    {
      name: tr("Science and engineering", "Ciencia e ingeniería"),
      detail: tr("One set of figures and definitions for both: light, link, longest night, longest silence.", "Un mismo juego de cifras y definiciones para los dos: luz, enlace, noche más larga, silencio más largo."),
    },
    {
      name: tr("Educators and the public", "Docentes y público"),
      detail: tr(
        "EVA, a guide robot, gives each visitor a guided tour, answers from the project's own notes and can run the planner when asked. In English or Spanish.",
        "EVA, un robot guía, le da a cada visitante un recorrido guiado, responde con las notas del propio proyecto y puede manejar el planificador cuando se lo piden. En inglés o en español.",
      ),
    },
  ],
}

/** El equipo y lo que sigue (diapositivas 1 y 7). Los nombres propios no se traducen. */
export const team = {
  label: tr("The team", "El equipo"),
  name: "Team Hinomaru Signal",
  place: tr("Lima, Peru", "Lima, Perú"),
  members: [
    "Estephano Orbegoso Franceschi",
    "Francisco Daniel Gonzales Vargas",
    "Manuel Antonio Espinoza Melgarejo",
    "Jean Pierre Alcantara Mestanza",
    "Angel Baldeon",
    "Jefferson Erick Abendaño Cordova",
  ],
  nextTitle: tr("Next", "Lo que sigue"),
  next: [
    tr("5 m horizons for every candidate region", "Horizontes de 5 m para cada región candidata"),
    tr("Real LOLA relief inside the planner map", "Relieve real de LOLA dentro del mapa del planificador"),
    tr("A 3D rehearsal of the days on the surface", "Un ensayo en 3D de los días en la superficie"),
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
  eva: tr(
    "EVA's answers are generated by AI and her voice is synthesized; the figures on screen are the reference.",
    "Las respuestas de EVA las genera una IA y su voz es sintetizada; las cifras en pantalla son la referencia.",
  ),
  plate: tr(
    "The relief on this page is LOLA elevation drawn live in your browser. Its shadows follow the real Sun direction for the date shown; they are a preview, and the figures come from the validated engine.",
    "El relieve de esta página es la elevación de LOLA dibujada en vivo en tu navegador. Sus sombras siguen la dirección real del Sol para la fecha mostrada; son una vista previa, y las cifras salen del motor validado.",
  ),
}
