/**
 * Todo el texto de la landing, en inglés (la entrega de Space Apps lo exige; ver docs/09-entrega.md) y en español.
 * Cada texto va con `tr(inglés, español)`: el idioma se fija al cargar la página (`@/shared/i18n`).
 *
 * Las cifras no están escritas a mano: salen de `flight/data/facts.json`, que genera
 * `apps/web/scripts/build-landing-data.ts` con el motor validado y los datos de la NASA. Las demás cifras citan su
 * documento en `docs/`.
 */
import { missionsPath, plannerPath, routes } from "@/app/routes"
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

/** Rótulos del bloque "por qué" de las escenas del Sol, la Tierra y la comparación. */
const whyLabel = {
  matters: tr("Why it matters", "Por qué importa"),
  use: tr("What it is for", "Para qué sirve"),
  gain: tr("What you gain", "Qué ganas"),
  impact: tr("How it changes the mission", "Cómo cambia la misión"),
}
/** El punto vecino de la misma cresta (RoI 6): la referencia de "los dos a la vez" de la escena de comparación. */
const roi6 = compare.find((site) => site.id === "connecting-ridge-roi-6")!

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
  /** Por qué importa lo que muestra la escena, para qué sirve y qué se gana: sale junto con la respuesta. */
  why?: Array<{ label: string; text: string }>
}

/**
 * La bitácora de misiones del vuelo: la campaña de ejemplo del planificador (`prototipos/lunar-map/campaign.js`) y,
 * como referencia, una misión real que aterrizó en la región. `site` es el id del sitio en la lámina (plate.json):
 * ahí se marca la misión sobre el terreno.
 */
export type MissionStatus = "go" | "pending" | "review" | "draft" | "done"
export const missionLog = {
  label: tr("01 · Organize · Example campaign", "01 · Organiza · Campaña de ejemplo"),
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
  label: tr("02 · Plan · Real sites of the region", "02 · Planifica · Sitios reales de la zona"),
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
  /** Al pie del punto de cerca, el último del vuelo: lo que sigue más abajo en la página. */
  next: tr("Keep scrolling: compare sites and have a plan B.", "Sigue bajando: compara sitios y ten un plan B."),
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
    rail: tr("Organize", "Organiza"),
    title: tr("Organize the campaign.", "Organiza la campaña."),
    body: tr(
      "Every mission of the example campaign on the real terrain, with its date and its status. Pick one to plan where it lands.",
      "Cada misión de la campaña de ejemplo sobre el relieve real, con su fecha y su estado. Elige una para planificar dónde aluniza.",
    ),
  },
  {
    id: "points",
    rail: tr("Plan", "Planifica"),
    title: tr("Three points per mission.", "Tres puntos por misión."),
    body: "",
  },
  // De cerca, el punto elegido de la misión (el contenido sale de `missionPoints` y de la lámina).
  { id: "point", rail: tr("Up close", "De cerca"), title: "", body: "" },
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
  /**
   * La sección de beneficios: lo que se gana con el sistema, dicho en verbos. Cada pestaña muestra la pantalla real
   * de la aplicación que lo hace (fotos de producción, `public/landing-tour/benefit-<id>-en|es.jpg`).
   */
  label: tr("What you gain", "Lo que ganas"),
  title: tr("Compare. Organize.", "Compara. Organiza."),
  titleAccent: tr("Have a plan B.", "Ten un plan B."),
  open: tr("Open this screen", "Abrir esta pantalla"),
  photoNote: tr(
    "Real screens of the application (16 Nov 2026). The campaign shown is sample data; sites, Sun and Earth are real.",
    "Pantallas reales de la aplicación (16 nov 2026). La campaña que se ve es de ejemplo; los sitios, el Sol y la Tierra son reales.",
  ),
  benefitList: [
    {
      id: "compare",
      tab: tr("Compare", "Compara"),
      text: tr(
        "Compare landing zones at a glance: when each one opens a landing window, how long it lasts and how many days it offers in the next six months.",
        "Compara las zonas de alunizaje de un vistazo: cuándo abre cada una su ventana, cuánto dura y cuántos días ofrece en los próximos seis meses.",
      ),
      alt: tr("Landing windows: four zones on one timeline, with the days each one can be landed on.", "Ventanas de aterrizaje: cuatro zonas en una línea de tiempo, con los días en que se puede alunizar en cada una."),
      to: missionsPath,
    },
    {
      id: "organize",
      tab: tr("Organize", "Organiza"),
      text: tr(
        "Organize the whole campaign: every mission on one calendar with its milestones, and every movement logged or scheduled.",
        "Organiza toda la campaña: cada misión en un solo calendario con sus hitos, y cada movimiento registrado o programado.",
      ),
      alt: tr("Tracking: the campaign calendar by mission and the list of movements.", "Seguimiento: el calendario de la campaña por misión y la lista de movimientos."),
      to: missionsPath,
    },
    {
      id: "planb",
      tab: tr("Have a plan B", "Ten un plan B"),
      text: tr(
        "When a plan fails, you see what fails and why, in plain words, and the planner finds the first date that works.",
        "Cuando un plan falla, ves qué falla y por qué, en palabras sencillas, y el planificador busca la primera fecha que cumple.",
      ),
      alt: tr("The planner's verdict for a mission, NO-GO, with each check explained and the button to find a date that works.", "El veredicto del planificador para una misión, NO-GO, con cada comprobación explicada y el botón para buscar una fecha que cumple."),
      to: routes.lunarMap,
    },
    {
      id: "anticipate",
      tab: tr("Anticipate", "Anticipa"),
      text: tr(
        "Know what comes next: the countdown to the next landing, the decision waiting for your sign-off and the key figures of each mission.",
        "Sabe qué viene: la cuenta atrás al próximo alunizaje, la decisión que espera tu firma y las cifras clave de cada misión.",
      ),
      alt: tr("Mission control: next milestone countdown, pending sign-off, mission sites and missions.", "Control de misión: cuenta atrás del próximo hito, firma pendiente, sitios de misión y misiones."),
      to: missionsPath,
    },
    {
      id: "locate",
      tab: tr("Locate", "Ubica"),
      text: tr(
        "Find every landing site on the real relief of the Moon: 62 sites, each with its source, and the Sun and Earth for any date.",
        "Ubica cada sitio de alunizaje sobre el relieve real de la Luna: 62 sitios, cada uno con su fuente, y el Sol y la Tierra para cualquier fecha.",
      ),
      alt: tr("The 3D Moon with the landing sites and place names.", "La Luna 3D con los sitios de alunizaje y los nombres de lugares."),
      to: routes.map3d,
    },
  ],
  tabs: {
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
      media: "plan",
      verb: tr("Plan", "Planea"),
      question: tr("Which missions still hold?", "¿Qué misiones siguen en pie?"),
      body: tr(
        "Give each mission a site, a date and its requirements. The dashboard keeps them together and flags the ones that stopped meeting their sunlight or Earth contact.",
        "Dale a cada misión un sitio, una fecha y sus requisitos. El dashboard las reúne y marca las que dejaron de cumplir su luz solar o su contacto con la Tierra.",
      ),
      action: actions.planner,
    },
    {
      media: "compare",
      verb: tr("Compare", "Compara"),
      question: tr("The date slipped. What now?", "La fecha se movió. ¿Y ahora?"),
      body: tr(
        "The planner lines up the ways out, another date, another site or a taller mast, with the same figures for each, and proposes the one that meets the requirements.",
        "El planificador pone en fila las salidas (otra fecha, otro sitio o un mástil más alto) con las mismas cifras para cada una, y propone la que cumple los requisitos.",
      ),
      action: null,
    },
    {
      media: "see",
      verb: tr("See", "Mira"),
      question: tr("Where is it, and what is the sky doing there?", "¿Dónde está y qué hace el cielo allí?"),
      body: tr(
        "Fly the 3D Moon built on LOLA relief: 62 landing sites, each with its source, and the Sun and Earth against the horizon for any date from 2026 to 2030. A polar site opens in the planner with one click.",
        "Vuela sobre la Luna 3D construida con el relieve de LOLA: 62 sitios de aterrizaje, cada uno con su fuente, y el Sol y la Tierra contra el horizonte para cualquier fecha de 2026 a 2030. Un sitio polar se abre en el planificador con un clic.",
      ),
      action: actions.map3d,
    },
    {
      media: "learn",
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
 * "Tu primera misión, paso a paso": el recorrido que EVA guía dentro de la aplicación, contado con capturas y vídeos
 * grabados de la propia app (`public/landing-tour/`, un archivo por idioma: `<media>-en|es`). El orden es el del
 * flujo guiado de EVA (features/assistant/eva/recorridos.ts): te recibe, ves la firma pendiente, decides la misión,
 * la ves alunizar, sales a caminar y después planificas las tuyas. La campaña que se ve es la de ejemplo.
 */
export const firstMission = {
  label: tr("Guided by EVA", "Con EVA de guía"),
  title: tr("Your first mission,", "Tu primera misión,"),
  titleAccent: tr("step by step.", "paso a paso."),
  body: tr(
    "Open the planner and EVA, the built-in AI guide, walks you through a whole mission. This is the route, recorded from the app itself.",
    "Abre el planificador y EVA, la guía de IA de la aplicación, te lleva por una misión entera. Este es el recorrido, grabado de la propia app.",
  ),
  evaSays: tr("EVA says", "EVA dice"),
  /** El botón que enciende y apaga la guía de EVA en esta sección. */
  guide: {
    on: tr("Explain this section", "Explícame esta sección"),
    off: tr("Turn off EVA's guide", "Apagar la guía de EVA"),
    hint: tr("EVA flies to each step and explains it as you scroll.", "EVA vuela a cada paso y lo explica mientras bajas."),
    active: tr("EVA is guiding you. Scroll through the steps.", "EVA te está guiando. Baja por los pasos."),
  },
  steps: [
    {
      media: "hello",
      kind: "image",
      title: tr("EVA greets you", "EVA te recibe"),
      text: tr(
        "She asks for your language and your name, and offers to take you through planning a mission to the Moon. From then on she leads, and you can skip her whenever you want.",
        "Te pide el idioma y tu nombre, y te propone acompañarte a planificar una misión a la Luna. Desde ahí ella guía, y puedes saltarla cuando quieras.",
      ),
      quote: tr("Hi, I am EVA. What is your name?", "Hola, soy EVA. ¿Cómo te llamas?"),
      alt: tr("EVA, a round white robot, asking for your name on the landing page.", "EVA, un robot blanco y redondo, pidiendo tu nombre en la landing."),
    },
    {
      media: "signoff",
      kind: "image",
      title: tr("A mission waits for your sign-off", "Una misión espera tu firma"),
      text: tr(
        "You arrive at mission control: the countdown to the next landing, every mission with its status, and one decision that is yours. The science walk CR-02 comes back with 26% oxygen against a 30% minimum. Approve it, or find out why first.",
        "Llegas al control de misión: la cuenta atrás al próximo alunizaje, cada misión con su estado y una decisión que es tuya. La caminata científica CR-02 vuelve con 26 % de oxígeno frente a un mínimo de 30 %. Apruébala, o averigua antes por qué.",
      ),
      quote: tr("This is where decisions wait for your sign-off. I would sign them myself, but I have no hands.", "Aquí esperan las decisiones que debes firmar. Las firmaría yo, pero no tengo manos."),
      alt: tr("Mission control with the next milestone countdown, the pending sign-off panel and EVA pointing at it.", "El control de misión con la cuenta atrás del próximo hito, el panel de firma pendiente y EVA señalándolo."),
    },
    {
      media: "plan",
      kind: "video",
      title: tr("Decide what the mission needs", "Decide qué necesita la misión"),
      text: tr(
        "Five questions: crewed, rover or fixed lander; where it lands; when, and for how long; how long the batteries last, how much Earth link you need and which power source; and the route of the walk. Every answer is checked against the real Sun and Earth of that place and date.",
        "Cinco preguntas: tripulada, rover o módulo fijo; dónde aluniza; cuándo y cuánto se queda; cuánto aguantan las baterías, cuánto enlace con la Tierra necesitas y qué fuente de energía; y la ruta de la caminata. Cada respuesta se comprueba contra el Sol y la Tierra reales de ese lugar y esa fecha.",
      ),
      quote: tr("At the Moon's south pole the Sun skims the horizon, so a small hill decides between power and darkness.", "En el polo sur de la Luna el Sol roza el horizonte, así que un cerro pequeño decide entre energía y oscuridad."),
      alt: tr("The mission form: type, zone, date with sunlight over the terrain, equipment and walk, ending in the verdict.", "El formulario de misión: tipo, zona, fecha con la luz sobre el relieve, equipo y caminata, hasta el veredicto."),
    },
    {
      media: "descent",
      kind: "video",
      title: tr("Watch it land", "Mírala alunizar"),
      text: tr(
        "The simulator flies an Apollo-style descent to Connecting Ridge, at the south pole, checked against the Apollo 11 flight plan, with the crew's radio calls on screen. Altitude, speed, thrust and fuel are live, and EVA calls out the terrain on the way down.",
        "El simulador vuela un descenso al estilo Apollo hasta Connecting Ridge, en el polo sur, comprobado contra el plan de vuelo del Apollo 11, con las llamadas de radio de la tripulación en pantalla. Altitud, velocidad, empuje y combustible van en vivo, y EVA va cantando el terreno durante la bajada.",
      ),
      quote: tr("The simulator: an Apollo-style descent to the south pole. The guidance flies it, not you.", "El simulador: un descenso al estilo Apollo en el polo sur. Lo vuela el guiado, no tú."),
      alt: tr("The lunar module descending over the south pole with altitude, speed and fuel readouts.", "El módulo lunar descendiendo sobre el polo sur con altitud, velocidad y combustible."),
    },
    {
      media: "walk",
      kind: "video",
      title: tr("Step outside", "Sal a la superficie"),
      text: tr(
        "After touchdown you see through the helmet: oxygen, carbon dioxide, water and battery on the left, Sun and Earth on the right. You follow the science route stop by stop, EVA warns you when something turns red, and you can ask her why each task matters.",
        "Tras el contacto ves por el casco: oxígeno, dióxido de carbono, agua y batería a la izquierda, Sol y Tierra a la derecha. Sigues la ruta científica parada a parada, EVA te avisa si algo se pone en rojo y puedes preguntarle por qué importa cada tarea.",
      ),
      quote: tr("Your suit is on the left: oxygen, the carbon dioxide filter, cooling water and battery. If anything turns red, I will tell you.", "Tu traje va a la izquierda: oxígeno, filtro de dióxido de carbono, agua de refrigeración y batería. Si algo se pone rojo, te aviso."),
      alt: tr("The view from inside the helmet while walking on the Moon, with EVA as a hologram.", "La vista desde dentro del casco caminando por la Luna, con EVA como holograma."),
    },
    {
      media: "result",
      kind: "image",
      title: tr("Then plan your own", "Después, planifica las tuyas"),
      text: tr(
        "Change the site, the date or the equipment and see what happens when there is not enough Sun or no link with Earth: the verdict names what fails and the planner proposes another date, another zone or a taller mast. Ask EVA anything along the way. She explains; the figures come from the engine and NASA data.",
        "Cambia el sitio, la fecha o el equipo y mira qué pasa cuando no hay suficiente Sol o no hay enlace con la Tierra: el veredicto dice qué falla y el planificador propone otra fecha, otra zona o un mástil más alto. Pregúntale a EVA lo que quieras por el camino. Ella explica; las cifras salen del motor y de los datos de la NASA.",
      ),
      quote: tr("Tap me anytime to ask anything.", "Tócame cuando quieras preguntar algo."),
      alt: tr("The planner's verdict for a mission, NO-GO, with the option to simulate it.", "El veredicto del planificador para una misión, NO-GO, con la opción de simularla."),
    },
  ],
  cta: tr("Start with EVA", "Empieza con EVA"),
  note: tr(
    "Recorded from the application on 15 Nov 2026. The campaign shown is sample data; sites, Sun and Earth are real (JPL Horizons DE441, LOLA terrain). The descent uses the Apollo 11 profile as an example vehicle.",
    "Grabado de la aplicación el 15 nov 2026. La campaña que se ve es de ejemplo; los sitios, el Sol y la Tierra son reales (JPL Horizons DE441, relieve LOLA). El descenso usa el perfil del Apollo 11 como nave de ejemplo.",
  ),
} as const

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
  /** El caso del retraso, dibujado: las dos fechas y, en cada una, qué zonas cumplen (cifras del planificador). */
  shift: {
    from: { date: tr("18 Dec 2026", "18 dic 2026"), label: tr("The plan", "El plan"), go: [true, true, true] },
    to: { date: tr("3 Apr 2027", "3 abr 2027"), label: tr("After the slip", "Tras el retraso"), go: [false, true, false] },
    delay: tr("+106 days", "+106 días"),
    same: tr("Same lander, same requirements", "Mismo módulo, mismos requisitos"),
    zones: [
      { letter: "A", place: "Connecting Ridge · RoI 6" },
      { letter: "B", place: "Peak near Shackleton · RoI 2" },
      { letter: "C", place: "Shackleton rim · RoI 4" },
    ],
    go: "GO",
    noGo: "NO GO",
  },
  /** Lo que comprueba el veredicto, en cuatro iconos. */
  checksTitle: tr("The verdict checks four things", "El veredicto comprueba cuatro cosas"),
  checks: [
    { icon: "sun", label: tr("Sun at landing", "Sol al aterrizar") },
    { icon: "earth", label: tr("Earth at landing", "Tierra al aterrizar") },
    { icon: "battery", label: tr("A night the battery survives", "Una noche que la batería aguante") },
    { icon: "signal", label: tr("Enough Earth contact", "Suficiente contacto con la Tierra") },
  ],
  open: tr("Try it in the planner", "Pruébalo en el planificador"),
  openTo: plannerPath(),
  featuresTitle: tr("Where they are, and for how long.", "Dónde están, y por cuánto tiempo."),
  features: [
    { icon: "horizon", big: "2026–2030", text: tr("Sun and Earth against the real horizon, any date and hour", "Sol y Tierra contra el horizonte real, cualquier fecha y hora") },
    { icon: "clock", big: tr("Time left", "Cuánto queda"), text: tr("Until sunset or Earthset, or until they rise again", "Hasta que se ponen el Sol o la Tierra, o hasta que vuelven a salir") },
    { icon: "ways", big: tr("3 ways out", "3 salidas"), text: tr("Another date, another zone or taller equipment, one click each", "Otra fecha, otra zona o equipo más alto, a un clic cada una") },
    { icon: "compare", big: tr("6 scenarios", "6 escenarios"), text: tr("Side by side, on a 90-day timeline", "Lado a lado, en una línea de tiempo de 90 días") },
    { icon: "link", big: tr("1 link", "1 enlace"), text: tr("Share a scenario: everyone sees the same numbers", "Comparte un escenario: todos ven los mismos números") },
  ],
  moonTitle: tr("Every landing site, on real relief.", "Cada sitio de aterrizaje, sobre relieve real."),
  moon: [
    { icon: "pin", big: tr("62 sites", "62 sitios"), text: tr("Apollo, Luna, Surveyor, Chang'e, Chandrayaan and more, each with its source", "Apollo, Luna, Surveyor, Chang'e, Chandrayaan y más, cada uno con su fuente") },
    { icon: "relief", big: tr("8,876 names", "8876 nombres"), text: tr("LOLA relief for the globe and the pole, with the official IAU names", "Relieve de LOLA para el globo y el polo, con los nombres oficiales de la UAI") },
    { icon: "calendar", big: tr("Any date", "Cualquier fecha"), text: tr("The real Sun, Earth and shadows at each site", "El Sol, la Tierra y las sombras reales en cada sitio") },
    { icon: "click", big: tr("1 click", "1 clic"), text: tr("A polar point opens in the planner", "Un punto polar se abre en el planificador") },
  ],
  definitions: tr(
    "How it counts: the Sun is in view if any part of its disc is above the terrain; Earth, by its centre. The solar panel is assumed vertical and Sun-tracking. The Moon has no atmosphere, so there is no refraction to add.",
    "Cómo cuenta: el Sol está a la vista si cualquier parte de su disco está sobre el terreno; la Tierra, por su centro. Se supone el panel solar vertical y siguiendo al Sol. La Luna no tiene atmósfera, así que no hay refracción que sumar.",
  ),
} as const

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
