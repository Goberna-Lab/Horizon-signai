// El flujo guiado de EVA (ideas del equipo y su «guion resumido», 2026-11-15): se presenta, pregunta el nombre y ofrece
// vivir la experiencia de planificar una misión lunar. Es una sola historia: tienes una misión que firmar, aprendes qué
// se decide (los pasos 2 a 7 del guion, en el orden del Planificador), ves una misión real de la NASA (pasos 8 a 10) y
// quedas libre para probar. Regla del equipo: fiel a los datos, nada inventado, con un 10-15 % de personalidad, y
// siempre se le puede preguntar algo más específico.
//
// Cómo es:
// - La oferta (OFERTA). «Solo quiero ver la landing» recorre la landing (LANDING) y al final vuelve a ofrecer.
// - CONTROL: EVA abre el control de misión (el dashboard) y cuenta la situación: tu próxima misión es en N días (la
//   cuenta regresiva de la pantalla, dicha con voz grabada: ver `cuandoEs`), cómo va, y que antes hay una caminata
//   pendiente de tu firma. Pregunta si quieres ver qué se decide para aprobarla.
// - DECIDIR: lo que se decide en un plan de misión (los pasos del Planificador de misiones), y por qué la caminata espera
//   tu firma. La firma la pone la persona, no EVA. Luego ofrece ver una misión real.
// - REAL: el descenso del Apollo 11 (1969) con su bitácora de radio real, volado sobre nuestro sitio del polo sur (el
//   simulador de features/simulator). Mientras baja, EVA narra lo que pasa (la alarma 1202, el control manual, el
//   contacto) cuando el simulador le avisa (`narra`). Luego la caminata y sus tareas. Al final, modo libre y el menú.
// - ELEGIR: el menú de siempre (CAMINOS): ver una misión, crear una nueva (el tutorial y el Planificador) o la misión
//   real otra vez. Se elige con un botón, diciéndolo o tocando la parte en el dashboard.
// - En cualquier paso se le puede preguntar (escrito o con la voz): la IA contesta, más técnica, y el guion sigue en el
//   mismo paso. Varios pasos lo invitan en voz alta.
// - Está escrito, no lo genera la IA: funciona aunque los servidores de IA no contesten, y su voz está grabada
//   (./vozGrabada.ts).
//
// De dónde sale cada afirmación (si cambia la pantalla, se vuelve a comprobar):
// - Dashboard: prototipos/lunar-map/inicio.html y campaign.js (CR-01 próximo hito, contacto el 18 dic 2026; pasos «Zone
//   confirmed», «Descent simulated», «Walk approved», «Final Flight Director Go»; CR-02 por firmar con O₂ al volver
//   26 % contra 30 %; la fila de CR-01 trae Sol y Tierra al alunizar, días de margen y contacto).
// - Planificador de misiones: apps/web/public/planificar-mision.html, en los pasos de la instrucción de Francisco
//   (features/assistant/CLAUDE.md, «EVA y el Planificador»).
// - Simulador: la tarjeta al posarse (velocidad de contacto, inclinación de las patas, combustible, enlace con la
//   Tierra); el casco (O₂, CO₂, H₂O, BAT: el O₂ y el CO₂ van con el esfuerzo, el agua se gasta más al Sol y la batería más
//   con las luces: caminata.ts); la caminata sin plan sigue la ruta científica de CR-02 (tareas.ts: muestra al Sol en el
//   borde, muestra en sombra permanente, posible hielo, con luces, y regreso obligatorio); teclas en visorHud.ts. El
//   simulador no tiene desplegar la antena ni el panel solar (pasos 8 y 9 del guion): EVA no lo dice.
// - Apollo 11: el simulador vuela su perfil de descenso (guiado R-695, NASA TN D-6846) y frases de su transcripción
//   (features/simulator/alunizaje/landing.ts). La alarma 1202 (sobrecarga de la computadora de guiado, Houston dio
//   «go») y el control manual de Armstrong para evitar un campo de rocas son hechos de la misión de julio de 1969.
// - Landing: features/landing/content.ts (el Sol no pasa de 1,59° sobre el polo entre 2026 y 2030).
//
// Voz: cada oración se graba por separado y por su texto exacto. Las oraciones que se repiten están escritas igual a
// propósito; los números van en letras. Tras cambiar un texto: `node apps/web/scripts/grabar-voz-eva.ts`.
import type { AccionIA } from "@/prueba-ia/cliente"

type Bi = { en: string; es: string }
type Idioma = "en" | "es"

/** Las cuatro etapas del flujo, en orden (el riel del globo). El número de etapa de cada paso es su posición aquí. */
export const ETAPAS: Bi[] = [
  { en: "Mission control", es: "Control de misión" },
  { en: "What you decide", es: "Qué se decide" },
  { en: "Real mission", es: "Misión real" },
  { en: "Your turn", es: "Tu turno" },
]

/** La pregunta de repaso de un paso: hay que acertarla para seguir. */
export type Repaso = { opciones: Bi[]; correcta: number; acierto: Bi; fallo: Bi }

/**
 * Una opción de un paso que pregunta (`elige`). Lleva a un recorrido o, sin recorrido, EVA dice `dicho` y el flujo
 * termina. `palabras`: además de las del botón, para reconocerla por voz. `toque`: tocar esa parte del dashboard
 * también la elige (si es un enlace, EVA lo intercepta).
 */
export type Opcion = { id: string; boton: Bi; palabras: string[]; recorrido?: Recorrido; dicho?: Bi; toque?: string }

export type Paso = {
  /** A qué etapa pertenece (1 a 4). Sin etapa (el recorrido de la landing) no hay riel. */
  etapa?: number
  /** Lo que EVA dice. Corto: se pronuncia. Con `cuenta`, «{cuando}» se cambia por `cuandoEs`. */
  texto: Bi
  /** Orden que se ejecuta antes de hablar (abrir una pantalla, pulsar un botón…). */
  accion?: AccionIA
  /** Parte de la pantalla a la que apunta (en la página o en la pantalla incrustada). Si no está, solo habla. */
  selector?: string
  /** Pausa tras la orden, para que la pantalla termine de dibujarse (ms). */
  espera?: number
  /** Dónde leer los días que faltan (el número de la cuenta regresiva) para decir «{cuando}». */
  cuenta?: string
  /** En este paso no hay «Next»: se sigue eligiendo una de estas opciones. */
  elige?: Opcion[]
  /** En este paso no hay «Next»: se sigue acertando la pregunta. */
  repaso?: Repaso
  /** Avisos del simulador (EVENTOS de ./guion.ts) que EVA narra mientras espera en este paso. */
  narra?: string[]
}

export type Recorrido = {
  id: string
  /** Lo que dice al terminar (vacío: nada). */
  fin: Bi
  pasos: Paso[]
  /** Qué sigue al terminar: volver a ofrecer el flujo o el menú de caminos. */
  luego?: "oferta" | "elegir"
  /** Orden que se ejecuta al terminar, después de `fin` (p. ej. abrir el Planificador). */
  alFin?: AccionIA
}

// ----- La cuenta regresiva, dicha en letras («en treinta y dos días») -----
const UNIDADES = {
  en: "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" "),
  es: "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve".split(" "),
}
const DECENAS = {
  en: ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"],
  es: ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"],
}
/** Un número de 0 a 99 en letras. En español, delante de «días» va «un» («veintiún días», «treinta y un días»). */
export function enLetras(n: number, idioma: Idioma): string {
  const u = UNIDADES[idioma]
  if (n < u.length) return idioma === "es" ? u[n]!.replace(/uno$/, "ún").replace(/^ún$/, "un") : u[n]!
  const d = DECENAS[idioma][Math.floor(n / 10)]!
  const r = n % 10
  if (!r) return d
  return idioma === "en" ? `${d}-${u[r]}` : `${d} y ${u[r] === "uno" ? "un" : u[r]}`
}
/** Hasta cuántos días se graba la frase de la cuenta regresiva (más allá, la pide en vivo). */
export const DIAS_GRABADOS = 40
/** Cuándo es: «today», «tomorrow», «in thirty-two days»; sin número legible, «coming up soon». */
export function cuandoEs(dias: number | null, idioma: Idioma): string {
  if (dias === null || !Number.isFinite(dias) || dias < 0) return idioma === "en" ? "coming up soon" : "muy pronto"
  if (dias === 0) return idioma === "en" ? "today" : "hoy"
  if (dias === 1) return idioma === "en" ? "tomorrow" : "mañana"
  return idioma === "en" ? `in ${enLetras(dias, "en")} days` : `en ${enLetras(dias, "es")} días`
}
/** El texto de un paso en un idioma, con los días ya puestos si el paso los lleva. */
export const textoDePaso = (p: Paso, idioma: Idioma, dias: number | null = null) =>
  p.cuenta ? p.texto[idioma].replace("{cuando}", cuandoEs(dias, idioma)) : p.texto[idioma]

/** La oferta, tras el nombre. Las palabras para reconocerla por voz están en ./escucha.ts (PALABRAS_OFERTA). */
export const OFERTA: { id: "si" | "landing"; boton: Bi }[] = [
  { id: "si", boton: { en: "Yes, let us go", es: "Sí, vamos" } },
  { id: "landing", boton: { en: "Just show me the landing", es: "Solo quiero ver la landing" } },
]

// ----- Frases que se repiten (misma oración, misma grabación) -----
const QUE_HACER: Bi = {
  en: "You can see a mission that already exists, create a new one, or fly the real mission again.",
  es: "Puedes ver una misión que ya existe, crear una nueva, o volar otra vez la misión real.",
}
const PREGUNTAME: Bi = {
  en: "If you want the technical detail of any step, just ask me.",
  es: "Si quieres el detalle técnico de algún paso, solo pregúntame.",
}
const LIBRE: Bi = {
  en: "From here on, I am with you to try anything: a lander that comes down badly, a zone without enough sunlight, a zone with no link to Earth. Ask me whatever you want.",
  es: "Desde aquí, estoy contigo para probar lo que quieras: una nave que baja mal, una zona sin suficiente Sol, una zona sin enlace con la Tierra. Pregúntame lo que quieras.",
}
// Los pasos del Planificador de misiones (apps/web/public/planificar-mision.html: TIPOS, ZONAS, el estudio de luz, ENERGIAS,
// PLANIF.alturas, RUTAS y el resultado), en su orden.
const CIERRE: Bi = {
  en: "If the dates or the needs change, we evaluate the alternatives again. Horizon Signal, by Goberna: plan, compare and simulate, to understand every decision better.",
  es: "Si cambian las fechas o las necesidades, volvemos a evaluar las alternativas. Horizon Signal, de Goberna: planificar, comparar y simular, para comprender mejor cada decisión.",
}
const TIPO: Bi = {
  en: "First, the name and the type of mission: crewed, robotic rover or static lander.",
  es: "Primero, el nombre y el tipo de misión: tripulada, rover robótico o módulo fijo.",
}
const ZONA: Bi = {
  en: "Then, the landing zone: A, Connecting Ridge; B, the peak near Shackleton; or C, the rim of Shackleton, the closest to the pole. Each one shows its real slope, measured by LOLA.",
  es: "Luego, la zona de alunizaje: A, Connecting Ridge; B, el pico junto a Shackleton; o C, el borde de Shackleton, el más cercano al polo. Cada una muestra su pendiente real, medida por LOLA.",
}
const FECHA: Bi = {
  en: "Next, the date and the stay, from one to fourteen days. Drag the timeline and you see light and shadow on the real terrain; let go, and you land at that moment.",
  es: "Después, la fecha y la estadía, de uno a catorce días. Arrastras la línea de tiempo y ves la luz y la sombra sobre el relieve real; al soltar, alunizas en ese momento.",
}
const SOL_Y_TIERRA: Bi = {
  en: "Right there you see how much of the stay has Sun, how much has Earth in view, and the longest night. If the work needs solar power and a direct link at the same time, look for the hours when both line up.",
  es: "Ahí mismo ves cuánto de la estadía tiene Sol, cuánto tiene la Tierra a la vista, y la noche más larga. Si el trabajo necesita energía solar y enlace directo a la vez, busca las horas en que coinciden.",
}
const EQUIPO: Bi = {
  en: "Then, the equipment. Power: solar with batteries, nuclear with an RTG, or batteries only, like the Apollo seventeen lander. The Planner recommends one for your plan. And you set how long your batteries last without Sun, the minimum link with Earth, and the height of the panel and the antenna: two or ten metres.",
  es: "Luego, el equipo. La energía: solar con baterías, nuclear con un RTG, o solo baterías, como el módulo del Apollo diecisiete. El Planificador te recomienda una para tu plan. Y ajustas cuántas horas aguantan tus baterías sin Sol, el enlace mínimo con la Tierra, y la altura del panel y la antena: dos o diez metros.",
}
const RUTA: Bi = {
  en: "Last, the route over the real terrain, from the landing spot to the science stops: safe, short or science, each with its distance and its stops.",
  es: "Por último, la ruta sobre el relieve real, del punto de alunizaje a las paradas de trabajo científico: segura, corta o científica, cada una con su distancia y sus paradas.",
}
const RESULTADO: Bi = {
  en: "And the result: go or no go, with each check, the indicators and the same plan compared in the three zones. Whatever fails, you adjust.",
  es: "Y el resultado: go o no go, con cada comprobación, los indicadores y el mismo plan comparado en las tres zonas. Lo que no cumple, se ajusta.",
}

/** El recorrido de la landing: sección por sección. Al final vuelve a ofrecer el flujo. */
export const LANDING: Recorrido = {
  id: "landing",
  fin: { en: "That is the landing.", es: "Esa es la landing." },
  luego: "oferta",
  pasos: [
    {
      accion: { tipo: "open", screen: "landing" },
      espera: 300,
      selector: "#problem .ln-title",
      texto: {
        en: "Okay, let us see the landing. It starts with the problem: the launch slipped, so is the site still good? At the south pole, the Sun and Earth sit on the horizon, and a ridge can hide them for days.",
        es: "Muy bien, veamos la landing. Empieza con el problema: el lanzamiento se atrasó, ¿el sitio sigue sirviendo? En el polo sur, el Sol y la Tierra van a ras del horizonte, y una cresta puede taparlos durante días.",
      },
    },
    {
      selector: "#problem .ln-stats",
      texto: {
        en: "Three numbers sum it up. The Sun never climbs much more than one and a half degrees over the pole. Two points on the same ridge get very different sunlight. And today the answer is spread over three tools.",
        es: "Tres cifras lo resumen. El Sol nunca sube mucho más de un grado y medio sobre el polo. Dos puntos de una misma cresta reciben una luz muy distinta. Y hoy la respuesta está repartida en tres herramientas.",
      },
    },
    {
      selector: "#software .ln-title",
      texto: {
        en: "Here you see the software working, with real data: the lander, the site comparison, the calendar and the map.",
        es: "Aquí ves el software funcionando, con datos reales: el módulo, la comparación de sitios, el calendario y el mapa.",
      },
    },
    {
      selector: "#planner-demo .ln-title",
      texto: {
        en: "Move the date and see which sites still work. That is the heart of the tool: replanning when the schedule changes.",
        es: "Mueve la fecha y mira qué sitios siguen sirviendo. Ese es el corazón de la herramienta: replanificar cuando el calendario cambia.",
      },
    },
    {
      selector: "#product .ln-title",
      texto: {
        en: "One workflow: plan, compare, see it in three dimensions, and learn. From the first plan to the replan.",
        es: "Un solo flujo: planea, compara, míralo en tres dimensiones y aprende. Del primer plan al nuevo plan.",
      },
    },
    {
      selector: "#validation .ln-title",
      texto: {
        en: "Every number is checked against outside sources, and the limits are stated honestly.",
        es: "Cada cifra está comprobada con fuentes externas, y los límites están dichos con honestidad.",
      },
    },
    {
      selector: "#data .ln-title",
      texto: {
        en: "And these are the open NASA data we use, each one cited.",
        es: "Y estos son los datos abiertos de la NASA que usamos, cada uno citado.",
      },
    },
  ],
}

/** La misión real: el descenso del Apollo 11 con su bitácora de radio, y la caminata. Al final, modo libre y el menú. */
const REAL: Recorrido = {
  id: "real",
  fin: { en: `Mission complete. ${CIERRE.en} ${LIBRE.en}`, es: `Misión cumplida. ${CIERRE.es} ${LIBRE.es}` },
  luego: "elegir",
  pasos: [
    {
      etapa: 3,
      accion: { tipo: "open", screen: "apollo" },
      espera: 900,
      narra: ["apolo-1202", "apolo-p66", "aterrizaje-nominal"],
      texto: {
        en: "This is Apollo eleven, July nineteen sixty-nine: the first crewed landing on the Moon. We fly its real descent and its real radio log, over our site at the south pole. Listen to the radio: something interesting is about to happen. Say next when we are down.",
        es: "Este es el Apollo once, julio de mil novecientos sesenta y nueve: el primer alunizaje con tripulación. Volamos su descenso real y su bitácora de radio real, sobre nuestro sitio del polo sur. Escucha la radio: algo interesante está por pasar. Di siguiente cuando estemos abajo.",
      },
    },
    {
      etapa: 3,
      accion: { tipo: "esperar", selector: '.sim-lfp-end [data-act="out"]' }, // habla cuando la nave ya se posó
      espera: 300,
      selector: ".sim-lfp-end",
      texto: {
        en: "We are down. Before going out, we check the lander: the contact speed, the tilt of the legs, the fuel left, and the link with Earth.",
        es: "Ya estamos abajo. Antes de salir, revisamos el módulo: la velocidad de contacto, la inclinación de las patas, el combustible que queda y el enlace con la Tierra.",
      },
    },
    {
      // La caminata del simulador (features/simulator/alunizaje: caminata.ts, tareas.ts, visorHud.ts): al posarse,
      // la tarjeta final ofrece «Salir a caminar»; EVA la pulsa y el astronauta baja por la escalera.
      etapa: 3,
      accion: { tipo: "clic", selector: '.sim-lfp-end [data-act="out"]' },
      espera: 2500,
      texto: {
        en: "Now the best part: we step outside. The astronaut climbs down the ladder, and you look through the helmet.",
        es: "Ahora lo mejor: salimos. El astronauta baja por la escalera, y tú miras a través del casco.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-rows",
      texto: {
        en: "This is the screen inside your helmet: oxygen, the carbon dioxide filter, cooling water and battery. Oxygen and the filter go with your effort, the water goes faster in the Sun, and the battery goes faster with the lamps on. So no sprinting, please.",
        es: "Esta es la pantalla dentro de tu casco: oxígeno, filtro de dióxido de carbono, agua de refrigeración y batería. El oxígeno y el filtro se gastan con el esfuerzo, el agua más rápido al Sol, y la batería más con las luces encendidas. Así que nada de correr, por favor.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-feed",
      texto: {
        en: "Your walk follows the science route of mission CR-02. At the first stop, a sample on the sunlit rim. At the second, a sample in permanent shadow, which could hold water ice: turn on the lamps there. Then, a mandatory return to the lander. If you wonder why any of it matters, ask me.",
        es: "Tu caminata sigue la ruta científica de la misión CR-02. En la primera parada, una muestra en el borde iluminado. En la segunda, una muestra en sombra permanente, que podría tener hielo: ahí enciende las luces. Después, regreso obligatorio al módulo. Si te preguntas por qué importa algo de esto, pregúntame.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-keys",
      texto: {
        en: "Walk with the arrow keys and look around with the mouse. E collects, L turns on the lamps, and G lowers the sun visor. Say next when you are done.",
        es: "Camina con las flechas y mira alrededor con el ratón. Con E recoges, con L enciendes las luces y con G bajas el visor solar. Di siguiente cuando termines.",
      },
    },
  ],
}

/** Qué se decide para aprobar una misión: los pasos del Planificador de misiones, contados desde el dashboard. */
const DECIDIR: Recorrido = {
  id: "decidir",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 2,
      texto: {
        en: `To approve a mission, you decide the same things as when you create one in the Planner. ${TIPO.en} ${PREGUNTAME.en}`,
        es: `Para aprobar una misión, decides lo mismo que al crearla en el Planificador. ${TIPO.es} ${PREGUNTAME.es}`,
      },
    },
    { etapa: 2, texto: ZONA },
    { etapa: 2, texto: FECHA },
    { etapa: 2, texto: SOL_Y_TIERRA },
    { etapa: 2, texto: EQUIPO },
    { etapa: 2, texto: { en: `${RUTA.en} ${RESULTADO.en}`, es: `${RUTA.es} ${RESULTADO.es}` } },
    {
      etapa: 2,
      selector: "#pending",
      texto: {
        en: "Now the walk makes sense. Its oxygen on the way back is under the margin, so that check fails: that is why it is waiting for you. Approving it is your call.",
        es: "Ahora la caminata se entiende. Su oxígeno al volver está bajo el margen, así que esa comprobación falla: por eso espera tu firma. Aprobarla es tu decisión.",
      },
    },
    {
      etapa: 3,
      texto: {
        en: "Would you like to see how a real NASA mission went? We will fly the descent of Apollo eleven, with its real radio log.",
        es: "¿Quieres ver cómo fue una misión real de la NASA? Vamos a volar el descenso del Apollo once, con su bitácora de radio real.",
      },
      elige: [
        { id: "real", boton: { en: "Yes, the real mission", es: "Sí, la misión real" }, palabras: ["real", "apollo", "nasa", "fly", "volar", "simulation", "simulacion"], recorrido: REAL },
        {
          id: "libre",
          boton: { en: "I will explore on my own", es: "Exploraré por mi cuenta" },
          palabras: ["explore", "own", "myself", "alone", "explorar", "explorare", "cuenta", "sola", "solo"],
          dicho: { en: `Sure. ${LIBRE.en}`, es: `Claro. ${LIBRE.es}` },
        },
      ],
    },
  ],
}

/** «Sí»: el control de misión (el dashboard) como una situación: la próxima misión y la firma que te espera. */
export const CONTROL: Recorrido = {
  id: "control",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 1,
      accion: { tipo: "open", screen: "missions" },
      espera: 800,
      selector: ".next",
      cuenta: "#cdD",
      texto: {
        en: "Great, let us begin. You are in mission control, the main window of the platform. Your next mission, the landing of CR-01 at Connecting Ridge, is {cuando}.",
        es: "Genial, comencemos. Estás en el control de misión, la ventana principal de la plataforma. Tu próxima misión, el alunizaje de CR-01 en Connecting Ridge, es {cuando}.",
      },
    },
    {
      etapa: 1,
      selector: "#steps",
      texto: {
        en: "Below, how that mission is going. The zone is confirmed and the descent is simulated. Still missing: the walk approval and the final go from the flight director.",
        es: "Debajo, cómo va esa misión. La zona está confirmada y el descenso, simulado. Faltan la aprobación de la caminata y el visto bueno final del director de vuelo.",
      },
    },
    {
      etapa: 1,
      selector: ".sites",
      texto: {
        en: "Here is where each mission lands, on a radar of the south pole at real distance, and next to it every mission with its status: go, under review, waiting for sign-off, or draft. The calendar is in the tracking tab.",
        es: "Aquí ves dónde aluniza cada misión, en un radar del polo sur a distancia real, y al lado cada misión con su estado: go, en revisión, pendiente de firma o borrador. El calendario está en la pestaña de seguimiento.",
      },
    },
    {
      etapa: 1,
      selector: "#pending",
      texto: {
        en: "But first, something is waiting for your signature: the science walk of CR-02, to the rim of Shackleton. You have to approve it. Watch the oxygen on the way back: twenty-six percent, under the thirty percent margin.",
        es: "Pero antes, algo espera tu firma: la caminata científica de CR-02, al borde de Shackleton. Tienes que aprobarla. Ojo con el oxígeno al volver: veintiséis por ciento, bajo el margen de treinta.",
      },
    },
    {
      etapa: 1,
      texto: { en: "Would you like to see what you have to decide before you approve it?", es: "¿Quieres ver qué tienes que decidir antes de aprobarla?" },
      elige: [
        { id: "decidir", boton: { en: "Yes, show me", es: "Sí, muéstrame" }, palabras: ["show", "decide", "steps", "muestrame", "decidir", "pasos"], recorrido: DECIDIR },
        { id: "real", boton: { en: "Skip to the real mission", es: "Saltar a la misión real" }, palabras: ["skip", "real", "apollo", "nasa", "saltar", "salta"], recorrido: REAL },
      ],
    },
  ],
}

/** Ver una misión que ya existe: CR-01 en el dashboard. */
const VER: Recorrido = {
  id: "ver",
  fin: { en: "", es: "" },
  luego: "elegir",
  pasos: [
    {
      etapa: 4,
      accion: { tipo: "clic", selector: '.mrow[data-id="CR-01"]' },
      espera: 300,
      selector: '.mrow[data-id="CR-01"]',
      texto: {
        en: "Let us look at CR-01, the landing at Connecting Ridge. Its row has what matters: the Sun and Earth at landing, how many days it can slip and stay in its window, and the date of contact.",
        es: "Veamos CR-01, el alunizaje en Connecting Ridge. Su fila trae lo que importa: el Sol y la Tierra al alunizar, cuántos días puede atrasarse sin salir de su ventana, y la fecha de contacto.",
      },
    },
    {
      etapa: 4,
      selector: ".sites",
      texto: {
        en: "When you pick it, the radar marks its site, and the tracking tab filters its calendar and its log.",
        es: "Al elegirla, el radar marca su sitio, y la pestaña de seguimiento filtra su calendario y su bitácora.",
      },
    },
    {
      etapa: 4,
      accion: { tipo: "clic", selector: "#tab-win" },
      espera: 400,
      selector: "#win-p",
      texto: {
        en: "In the landing windows tab you see, site by site, when you can land, when there is Sun but Earth is hidden, and when there is no Sun or the night outlasts the battery.",
        es: "En la pestaña de ventanas de aterrizaje ves, sitio por sitio, cuándo se puede alunizar, cuándo hay Sol pero la Tierra está oculta, y cuándo no hay Sol o la noche dura más que la batería.",
      },
    },
    {
      etapa: 4,
      accion: { tipo: "clic", selector: "#tab-det" },
      espera: 300,
      selector: "#mlist",
      texto: {
        en: "The missions of this campaign are examples, to look at. The ones you create are kept in the Planner, under My missions, and you edit them there.",
        es: "Las misiones de esta campaña son de ejemplo, para mirarlas. Las que tú creas se guardan en el Planificador, en Mis misiones, y ahí las editas.",
      },
    },
  ],
}

/** Crear una misión nueva: el tutorial del Planificador de misiones, contado desde el dashboard, y luego se abre. */
const CREAR: Recorrido = {
  id: "crear",
  fin: { en: "Ready. I am opening the Planner for you. Good luck, commander.", es: "Listo. Te abro el Planificador. Mucha suerte, comandante." },
  alFin: { tipo: "open", screen: "new-mission" },
  pasos: [
    {
      etapa: 4,
      selector: ".addm",
      texto: {
        en: "To create a mission you use this button, New mission. It opens the Planner with a form, step by step. Let me tell you the steps before we go in.",
        es: "Para crear una misión se usa este botón, Nueva misión. Abre el Planificador con un formulario, paso a paso. Te cuento los pasos antes de entrar.",
      },
    },
    { etapa: 4, texto: { en: `${TIPO.en} ${ZONA.en}`, es: `${TIPO.es} ${ZONA.es}` } },
    { etapa: 4, texto: { en: `${FECHA.en} ${SOL_Y_TIERRA.en}`, es: `${FECHA.es} ${SOL_Y_TIERRA.es}` } },
    { etapa: 4, texto: EQUIPO },
    { etapa: 4, texto: { en: `${RUTA.en} ${RESULTADO.en} Save the mission and, if you like, simulate it.`, es: `${RUTA.es} ${RESULTADO.es} Guarda la misión y, si quieres, simúlala.` } },
  ],
}

/** El menú, tras la misión real o tras ver una misión. */
export const CAMINOS: Opcion[] = [
  {
    id: "ver",
    boton: { en: "See a mission", es: "Ver una misión" },
    palabras: ["see", "view", "look", "existing", "exists", "review", "edit", "open", "ver", "mirar", "existe", "existente", "revisar", "editar", "abrir", "realizada", "hecha"],
    recorrido: VER,
    toque: ".mrow[data-id]",
  },
  {
    id: "crear",
    boton: { en: "Create a new mission", es: "Crear una misión nueva" },
    palabras: ["create", "new", "make", "plan", "build", "crear", "nueva", "nuevo", "generar", "planear", "armar", "hacer"],
    recorrido: CREAR,
    toque: ".addm",
  },
  {
    id: "real",
    boton: { en: "Fly the real mission", es: "Volar la misión real" },
    palabras: ["simulation", "simulate", "simulator", "real", "apollo", "fly", "again", "simulacion", "simular", "simulador", "volar", "otra"],
    recorrido: REAL,
  },
]

/** El menú: tras la misión real o tras ver una misión, de vuelta en el control de misión. */
export const ELEGIR: Recorrido = {
  id: "elegir",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 4,
      accion: { tipo: "open", screen: "missions" },
      espera: 500,
      elige: CAMINOS,
      texto: { en: `What else would you like to do? ${QUE_HACER.en}`, es: `¿Qué más quieres hacer? ${QUE_HACER.es}` },
    },
  ],
}

/** Todos los recorridos del flujo (para grabar su voz y para las pruebas). */
export const RECORRIDOS: Recorrido[] = [LANDING, CONTROL, DECIDIR, REAL, ELEGIR, VER, CREAR]

/** Las frases sueltas del flujo que no están en los pasos ni en `fin`: lo que se dice al elegir y el repaso. */
export const frasesSueltas = (idioma: Idioma): string[] =>
  RECORRIDOS.flatMap((r) =>
    r.pasos.flatMap((p) => [
      ...(p.elige ?? []).flatMap((o) => (o.dicho ? [o.dicho[idioma]] : [])),
      ...(p.repaso ? [p.repaso.acierto[idioma], p.repaso.fallo[idioma]] : []),
    ]),
  )

/** Las variantes de un paso con cuenta regresiva que se graban (0 a DIAS_GRABADOS días y la de sin número). */
export const variantesDePaso = (p: Paso, idioma: Idioma): string[] =>
  p.cuenta ? [null, ...Array.from({ length: DIAS_GRABADOS + 1 }, (_, k) => k)].map((d) => textoDePaso(p, idioma, d)) : [p.texto[idioma]]

// ----- Retomar tras recargar (pedido de Manuel, 2026-11-15) -----
// En la landing, recargar empieza de cero. Desde que se entra a una sección del recorrido, EVA la guarda (sessionStorage,
// ver EvaCompanera); si la página se recarga ahí, saluda, dice dónde quedaron y ofrece seguir desde el inicio de esa
// sección o empezar el recorrido de nuevo.
const DONDE: Record<string, Bi> = {
  control: { en: "We left off at mission control.", es: "Nos quedamos en el control de misión." },
  decidir: { en: "We left off at what you decide to approve a mission.", es: "Nos quedamos en lo que se decide para aprobar una misión." },
  real: { en: "We left off at the real mission, Apollo eleven.", es: "Nos quedamos en la misión real, el Apollo once." },
  elegir: { en: "We left off at your turn: see, create or fly.", es: "Nos quedamos en tu turno: ver, crear o volar." },
}
DONDE.ver = DONDE.elegir!
DONDE.crear = DONDE.elegir!
const SEGUIR_DESDE_AHI: Bi = { en: "Shall we pick up from there?", es: "¿Seguimos desde ahí?" }

/** Las secciones que se guardan para retomar (las de la landing no: ahí se empieza de cero). */
export const seGuarda = (id: string) => id in DONDE

/** El paso que ofrece retomar la sección `id`; con `nombre`, empieza con «Welcome back, …» (esa oración va en vivo). */
export function recorridoParaRetomar(id: string, nombre = ""): Recorrido | null {
  const seccion = RECORRIDOS.find((r) => r.id === (id === "ver" || id === "crear" ? "elegir" : id))
  const donde = DONDE[id]
  if (!seccion || !donde) return null
  const hola = { en: nombre ? `Welcome back, ${nombre}. ` : "", es: nombre ? `Hola de nuevo, ${nombre}. ` : "" }
  return {
    id: "retomar",
    fin: { en: "", es: "" },
    pasos: [
      {
        texto: { en: `${hola.en}${donde.en} ${SEGUIR_DESDE_AHI.en}`, es: `${hola.es}${donde.es} ${SEGUIR_DESDE_AHI.es}` },
        elige: [
          { id: "seguir", boton: { en: "Yes, let us continue", es: "Sí, sigamos" }, palabras: ["continue", "there", "seguir", "sigamos", "seguimos", "ahi"], recorrido: seccion },
          { id: "cero", boton: { en: "Start the tour over", es: "Empezar el recorrido de nuevo" }, palabras: ["over", "start", "again", "scratch", "empezar", "nuevo", "cero", "inicio"], recorrido: CONTROL },
        ],
      },
    ],
  }
}

/** Las variantes de retomar sin nombre (para grabar su voz). */
export const retomadas = (): Recorrido[] => Object.keys(DONDE).flatMap((id) => recorridoParaRetomar(id) ?? [])
