/**
 * Todo el texto de la landing, en inglés (la entrega de Space Apps lo exige; ver docs/09-entrega.md).
 *
 * Las cifras no están escritas a mano: salen de `flight/data/facts.json`, que genera
 * `apps/web/scripts/build-landing-data.ts` con el motor validado y los datos de la NASA. Las demás cifras citan su
 * documento en `docs/`.
 */
import { routes } from "@/app/routes"
import facts from "./flight/data/facts.json"

const { featured, pole, compare, pairDistanceM, descent } = facts
/** "0.8% low" o "0.8% high": cuánto se aparta una cifra del plan. */
const off = (pct: number) => `${Math.abs(pct)}% ${pct < 0 ? "low" : "high"}`
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
export const opening = {
  /**
   * La marca animada: se escribe "Horizon Signal", se borra "al" y se escribe "AI" en rojo: queda "Horizon SignAI".
   */
  brand: { keep: "Horizon Sign", erase: "al", write: "AI" },
  title: [{ text: "The agile lunar mission planner with " }, { text: "AI built in", mark: true }, { text: "." }] as Array<{ text: string; mark?: boolean }>,
  /** Lecturas del módulo en el sitio destacado: los valores salen de sky.json en FlightStage.tsx. */
  status: {
    title: "lander status",
    link: "Earth link",
    linked: "Connection established",
    unlinked: "No connection",
    earth: "Earth above level",
    power: "Solar power",
    sunLeft: "Sunlight left",
    sunIn: "Sunrise in",
    earthLeft: "Earth contact left",
    earthIn: "Earthrise in",
    when: "Mission time, UT",
  },
}

/** Una etiqueta por intención: se usa igual en la barra, el inicio y el cierre. */
export const actions = {
  planner: { label: "Open the planner", to: routes.lunarMap },
  simulator: { label: "Open the simulator", to: routes.simulator },
}

/** La barra superior lleva a las pantallas de la aplicación. */
export const nav = [
  { label: "Simulator", to: routes.simulator },
  { label: "Planner", to: routes.lunarMap },
  { label: "3D Map", to: routes.map3d },
]

export type Fact = { value: string; label: string }

/** Una pregunta para adivinar antes de ver el dato de la escena: tres respuestas y cuál es la buena. */
export type Quiz = { ask: string; options: string[]; right: number }

/** Rótulos de las preguntas del vuelo. */
export const guess = { label: "Guess first", right: "Right.", wrong: "Not quite.", show: "Show the answer" }

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
    rail: "South pole",
    title: "Find light. Keep contact.",
    body: "Compare lunar south pole landing sites and dates, with the Sun and Earth measured against the real horizon.",
  },
  {
    id: "sun",
    rail: "Low Sun",
    title: "The Sun never climbs.",
    body: `At the south pole it circles the horizon and peaks at ${pole.sunMaxElevationDeg.toFixed(2)} degrees. Every ridge throws a shadow many kilometres long.`,
    facts: [
      { value: `${pole.sunMaxElevationDeg.toFixed(2)}°`, label: "Highest Sun over the pole, 2026 to 2030" },
      { value: `${facts.lunarDayDays.toFixed(1)} d`, label: "One turn around the horizon" },
    ],
    quiz: { ask: "How high does the Sun climb at the south pole?", options: ["Straight overhead", "About halfway up the sky", "Under 2 degrees"], right: 2 },
  },
  {
    id: "power",
    rail: "Power",
    title: "Sunlight is the power budget.",
    body: `${featured.name}, lunar day from 1 December 2026: the Sun is in view ${pct(featured.ground.sunPct)} of the time at ground level, ${pct(featured.mast10m.sunPct)} from a 10 m mast.`,
    facts: [
      { value: pct(featured.ground.sunPct), label: "Sun in view, ground level" },
      { value: pct(featured.mast10m.sunPct), label: "Sun in view, 10 m mast" },
      { value: hours(featured.ground.longestNightH), label: "Longest night, ground level" },
    ],
    quiz: { ask: "Raise the solar panel on a 10 m mast. How much more sunlight?", options: ["Almost twice as much", "A few percent more", "None: the Sun is the same"], right: 0 },
  },
  {
    id: "earth",
    rail: "Earth link",
    title: "Earth hangs at the horizon.",
    body: `From the pole, Earth drifts between ${Math.abs(pole.earthMinElevationDeg).toFixed(1)}° below and ${pole.earthMaxElevationDeg.toFixed(1)}° above the horizon. Terrain decides when a direct link is possible.`,
    facts: [
      { value: pct(featured.ground.earthPct), label: "Earth in view, ground level" },
      { value: pct(featured.mast10m.earthPct), label: "Earth in view, 10 m mast" },
      { value: hours(featured.ground.longestSilenceH), label: "Longest silence, ground level" },
    ],
    note: "Red hatching: direct line of sight to Earth at this hour.",
    quiz: { ask: "Can a lander at the pole always see Earth?", options: ["Always", "Only part of the time", "Never"], right: 1 },
  },
  {
    id: "compare",
    rail: "Compare",
    title: `${pairDistanceM} metres change the mission.`,
    body: `Two points on the same ridge, the same lunar day. One gets sunlight ${pct(featured.ground.sunPct)} of the time, the other never loses it. That is why a lunar plan has to be compared again every time the site or the date moves.`,
    quiz: { ask: `Two sites ${pairDistanceM} m apart on the same ridge. Same sunlight?`, options: ["Nearly the same", "A few percent apart", "One never loses the Sun"], right: 2 },
  },
]

/** Tabla de la última escena: los mismos sitios, el mismo día lunar, a ras del suelo. */
export const comparison = {
  caption: "Lunar day from 1 December 2026, ground level",
  columns: ["Site", "Sun", "Earth"],
  rows: compare.map((site) => ({
    id: site.id,
    name: site.name,
    sun: pct(site.ground.sunPct),
    earth: pct(site.ground.earthPct),
    approximate: site.horizon === "approximate",
  })),
  footnote: "Approximate horizon (240 m grid).",
}

/** Rótulos del tablero inferior. */
export const hud = {
  time: "Mission time, UTC",
  sun: "Sun over the pole",
  earth: "Earth over the pole",
  site: `${featured.name}, ground level`,
}

/**
 * La ventana del producto: las pantallas del software, funcionando dentro de la landing con datos reales
 * (sections/data/sky.json, product.json y catalog.json).
 */
export const software = {
  title: "The planner's engine, live on this page.",
  body: `Not a screenshot. These are the planner's own views running on real ephemeris and terrain: one lunar day at ${featured.name}, from 1 December 2026. Move the date and watch the plan respond.`,
  tabs: { lander: "Lander", compare: "Compare", calendar: "Calendar", map: "Map", planb: "Plan B", learn: "Learn" },
  lander: {
    title: "Lander",
    power: { on: "Power", off: "No power" },
    signal: { on: "Signal", limited: "Limited signal", off: "No signal" },
    sun: { set: "Sunset in", rise: "Sunrise in", always: "Sun in view" },
    earth: { set: "Earthset in", rise: "Earthrise in", always: "Earth in view" },
    whole: "All lunar day",
    stats: { sun: "Solar elevation", panel: "Panel power", earth: "Earth elevation" },
    window: "Window, 29.5 days",
    now: "Now",
    below: "below the horizon",
    legend: { sun: "Sun above the horizon", earth: "Earth above the horizon", none: "Not in view" },
    rows: { sun: "Sun", earth: "Earth" },
    note: "Radial scale: elevation, from 5° below level at the rim to 15° above at the centre. Dashed line: the horizon from the other observer height. Sun and Earth are not drawn to scale. Limited signal: Earth less than 1° above the terrain.",
  },
  compare: {
    title: "Compare sites",
    period: "1 to 30 Dec 2026",
    sun: "Sun in view",
    night: "Longest night",
    earth: "Earth visibility, lunar day",
    visible: "In view",
    hidden: "Hidden",
    verdicts: { viable: "Viable", limited: "Limited", no: "Not viable" },
    thresholds: "Verdicts use example requirements: viable from 75% sunlight and 25% Earth contact; not viable under 35% sunlight or 5% contact. In the planner you set your own.",
  },
  calendar: { title: "Calendar" },
  map: { title: "Map" },
  planb: {
    title: "Plan B",
    body: "The date slipped, or the site has to move. Each row is one way out, measured against the plan.",
    columns: ["Option", "Sun in view", "Earth in view", "Both at once", "Longest night", "Verdict"],
    baseline: `${featured.name}, 1 December 2026, ground level`,
    baselineTag: "The plan",
    move: "Move the landing",
    wait: "Wait one lunar month",
    mast: "Raise the array to 10 m",
  },
  learn: {
    title: "Learn",
    cards: {
      sun: { title: "The Sun circles the horizon.", unit: "highest Sun over the pole, 2026 to 2030" },
      earth: { title: "Earth rocks in place.", unit: "swing of Earth's elevation in one lunar day" },
      height: { title: "Height buys sunlight.", unit: "highest ridge on the horizon, ground level against a 10 m mast" },
    },
  },
}

/** La pestaña "Map": el catálogo sobre la lámina (sections/data/catalog.json). */
export const catalog = {
  period: "Lunar day from 1 December 2026",
  columns: { ground: "Ground level", mast: "10 m mast" },
  metrics: {
    sunPct: "Sun in view",
    earthPct: "Earth in view",
    bothPct: "Both at once",
    longestNightH: "Longest night",
    longestSilenceH: "Longest silence",
    meanPanelWm2: "Mean panel power",
  },
  regionsTitle: "Candidate landing regions, ground level",
  regionColumns: ["Region", "Sun", "Earth", "Longest night"],
  horizon: { detailed: "Horizon from the 5 m terrain model", approximate: "Horizon from the 240 m grid (approximate)" },
  kinds: { site: "South pole site", mission: "CLPS mission landing" },
  centreNote: "The marker is the centre of the terrain mosaic, not a chosen landing point. The candidate regions are.",
}

/** La pestaña "Calendar": mes a mes, 2026 a 2030. */
export const months = {
  body: `Same place, same horizon. Across 61 lunar months the share of sunlight at ${featured.name} swings with the lunar seasons, and Earth comes and goes with libration.`,
  caption: `${featured.name}, ground level, each lunar month from 2026 to 2030`,
  sun: "Sun in view",
  earth: "Earth in view",
  hint: "Point at a bar to read a month.",
}

/**
 * El recorrido del producto en cuatro pasos, uno por pantalla del flujo del equipo (docs/11-flujo-y-arquitectura.md):
 * Dashboard, Planificador, Simulación y el asistente de IA.
 */
export const product = {
  title: "One workflow, from the first plan to the replan.",
  steps: [
    {
      verb: "Plan",
      question: "Which missions still hold?",
      body: "Give each mission a site, a date and its requirements. The dashboard keeps them together and flags the ones that stopped meeting their sunlight or Earth contact.",
      action: actions.planner,
    },
    {
      verb: "Compare",
      question: "The date slipped. What now?",
      body: "The planner lines up the ways out, another date, another site or a taller mast, with the same figures for each, and proposes the one that meets the requirements.",
      action: null,
    },
    {
      verb: "See",
      question: "Does the landing work from start to finish?",
      body: "Take the chosen plan to the simulator and rehearse it: the descent, the touchdown and the days on the surface, with the same Sun and Earth windows.",
      action: actions.simulator,
    },
    {
      verb: "Learn",
      question: "Why did the plan change?",
      body: "Ask the AI assistant. It explains the figures the engine computed and cites its sources; it never invents a number. In the simulator it teaches why the pole is different.",
      action: null,
    },
  ],
}

export const audience = {
  quote: "The date slipped. Is the site still viable? Which alternative is better?",
  attribution: "The question a mission planner has to answer, again and again",
  body: "Built for the person who picks a landing site and date, and picks again when the schedule moves. Agile planning for lunar missions, with an AI assistant on hand. Open to educators and to anyone curious about why the lunar south pole is so hard.",
  measures: [
    { term: "Technical innovation", detail: "A validated engine on LOLA terrain and JPL ephemeris, with an AI assistant that explains its figures" },
    { term: "Educational value", detail: "Guess-first questions, live views and an assistant that teaches why the pole is different" },
    { term: "Mission impact", detail: "A replan in minutes, not weeks, when the schedule moves" },
  ],
}

/** Cada cifra viene de docs/07-pruebas-y-validacion.md y docs/04-planificador.md (suite del 2026-11-14). */
export const validation = {
  title: "Checked against the record.",
  body: "A fast replan is only useful if its numbers hold. Every calculation is tested against an independent source. The suite ran on 14 November 2026.",
  moreLabel: "All checks and stated limits",
  /** docs/04-planificador.md (sección 5), docs/07-pruebas-y-validacion.md y luna-recursos/LEEME.md. */
  checks: [
    { claim: "Sun and Earth direction", against: "JPL Horizons tables computed per site", result: "Worst error 0.0065°. The test allows 0.01°." },
    { claim: "Planner figures", against: "The independent 3D scene engine, same site and lunar day", result: "Within 0.5 points: 54.05% against 53.98% sunlight." },
    { claim: "Polar terrain height", against: "The 5 m model at Connecting Ridge", result: "The 240 m grid lands 2.3 m away. The test allows 5 m." },
    { claim: "Candidate landing regions", against: "Barker et al. (2021): regions 4 to 6 exceed 70% sunlight at 1 m", result: "The engine gives 88.0%, 85.0% and 90.3%." },
    { claim: "Earth visibility", against: "Mazarico et al. (2011), 26 points, 18.6 years", result: "Mean error 4.3 points. The test allows 5." },
    { claim: "Powered descent", against: "Apollo 11 mission plan, NASA TN D-6846", result: `Touchdown at ${descent.contactS} s against ${descent.planContactS} s. Velocity change ${off(descent.deltaVPct)}, propellant ${off(descent.fuelPct)}.` },
  ],
  limitsTitle: "Stated limits",
  limits: [
    "Dates run from 2026 to 2030, in UTC.",
    "Custom points exist only within 190 km of the south pole, and their horizon comes from the 240 m grid: relief under about 500 m does not appear.",
    "At ground level, sunlight figures differ from the 60 m maps by about 14 points: 5 m terrain sees bumps that coarser maps smooth out.",
    "The Sun is a uniform disc, annual aberration (0.006°) is not applied, and the vertical tracking panel is an assumption.",
  ],
  tiles: [
    { value: "113 / 113", label: "Automated tests passing", detail: "175,879 assertions across the ephemeris, horizon, planner and descent engines." },
    { value: "0.0065°", label: "Worst Sun and Earth direction error", detail: "Against per-site tables from JPL Horizons, 2026 to 2030." },
    { value: "4.3 pts", label: "Mean Earth visibility error", detail: "Against the 18.6-year maps of Mazarico et al. (2011), 26 points." },
    { value: `${descent.contactS} s`, label: "Simulated Apollo 11 touchdown", detail: `The mission plan says ${descent.planContactS} s (NASA TN D-6846).` },
  ],
}

/** Productos y enlaces de docs/08-datos-y-fuentes.md. */
export const sources = {
  title: "Open NASA data, cited.",
  body: "Nothing is queried live: each product was downloaded once, trimmed, and stored with its provenance.",
  groups: [
    {
      name: "Sun and Earth",
      items: [
        {
          name: "JPL Horizons, DE441",
          detail: "Sub-solar and sub-Earth points in the Moon-fixed frame, every 3 hours, 2026 to 2030.",
          href: "https://ssd.jpl.nasa.gov/horizons/",
        },
      ],
    },
    {
      name: "Terrain",
      items: [
        {
          name: "LRO LOLA polar elevation, 240 m and 120 m",
          detail: "LDEM_75S grids from the PDS Geosciences Node. The relief on this page.",
          href: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/",
        },
        {
          name: "LOLA 5 m south pole site models",
          detail: "NASA GSFC Planetary Geodesy Data Archive, Barker et al. (2021), with candidate landing regions.",
          href: "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README",
        },
        {
          name: "LROC NAC terrain model, Apollo 17, 2 m",
          detail: "Arizona State University for NASA. The detailed scene of the simulator.",
          href: "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/",
        },
      ],
    },
    {
      name: "Checks",
      items: [
        {
          name: "Polar illumination maps",
          detail: "Mazarico et al. (2011), 60 m, 18.6 years. Used only to validate.",
          href: "https://pgda.gsfc.nasa.gov/products/69",
        },
        {
          name: "Apollo 11 descent record",
          detail: "NASA TN D-6846, Bennett (1972). Used only to validate the descent.",
          href: "https://ntrs.nasa.gov/citations/19720018205",
        },
      ],
    },
  ],
}

export const closing = {
  title: "Plan the mission. Replan in minutes.",
  body: "Start a mission at the south pole, move the date and watch the plan respond. The assistant is there when you ask why.",
}

export const footer = {
  disclaimer: "Independent project by participants in the NASA Space Apps Challenge 2026. It uses public NASA data and cites every source. It is not endorsed by NASA.",
  ai: "Built with AI assistance: the code and the copy were drafted with an AI coding assistant (Claude Code) and reviewed by the team. Every figure is computed from the cited data.",
  plate: "The relief on this page is LOLA elevation drawn live in your browser. Its shadows follow the real Sun direction for the date shown; they are a preview, and the figures come from the validated engine.",
}
