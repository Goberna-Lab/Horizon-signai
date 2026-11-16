// El flujo guiado de EVA (pedido de Manuel, 2026-11-15): se presenta, pregunta el nombre y ofrece enseñar a hacer una
// misión lunar.
//
// Cómo es:
// - La oferta (OFERTA): «¿Quieres aprender a hacer una misión lunar?». «Sí» lleva al control de misión (CONTROL);
//   «Solo quiero ver la landing» recorre la landing (LANDING) y al final vuelve a ofrecer.
// - CONTROL: EVA abre el dashboard (Missions) y señala cada parte: el próximo hito con su cuenta regresiva, cómo va esa
//   misión, la misión que espera tu aprobación, el radar de sitios y la lista de misiones. Al final pregunta qué quieres
//   hacer, con tres caminos (CAMINOS), que se eligen con un botón, diciéndolo o tocando la parte en el dashboard:
//   ver una misión (VER), crear una nueva (CREAR: el tutorial del Planificador de misiones, que luego se abre) o ir
//   directo a la simulación (SIMULAR). Al terminar VER o SIMULAR, vuelve a preguntar (ELEGIR).
// - Está escrito, no lo genera la IA: funciona aunque los servidores de IA no contesten, y su voz está grabada
//   (./vozGrabada.ts). Cada paso puede hacer algo en la app (las órdenes de ./acciones.ts), apuntar a una parte de la
//   pantalla y decir una frase. Una pregunta de la persona la contesta la IA y el flujo sigue en el mismo paso.
//
// De dónde sale cada afirmación (si cambia la pantalla, se vuelve a comprobar):
// - Dashboard: prototipos/lunar-map/inicio.html y campaign.js (CR-01 próximo hito; pasos «Zone confirmed», «Descent
//   simulated», «Walk approved», «Final Flight Director Go»; CR-02 por firmar con O₂ al volver 26 % contra 30 %; estados
//   GO, por firmar, en revisión y borrador; la fila de CR-01 trae Sol y Tierra al alunizar, días de margen y contacto).
// - Planificador de misiones: apps/web/public/planificar-mision.html, en los pasos de la instrucción de Francisco
//   (features/assistant/CLAUDE.md, «EVA y el Planificador»).
// - Landing: features/landing/content.ts (el Sol no pasa de 1,59° sobre el polo entre 2026 y 2030).
// - El simulador 3D (features/simulator) aluniza en Connecting Ridge, la zona de CR-01, con la caminata de después
//   (tareas reales de una EVA de Artemis: tareas.ts; el traje: visorHud.ts).
//
// Voz: cada oración se graba por separado y por su texto exacto. Las oraciones que se repiten están escritas igual a
// propósito; los números van en letras. Tras cambiar un texto: `node apps/web/scripts/grabar-voz-eva.ts`.
import type { AccionIA } from "@/prueba-ia/cliente"

type Bi = { en: string; es: string }

/** Las tres etapas del flujo, en orden (el riel del globo). El número de etapa de cada paso es su posición aquí (desde 1). */
export const ETAPAS: Bi[] = [
  { en: "Mission control", es: "Control de misión" },
  { en: "Your choice", es: "Tu elección" },
  { en: "Hands on", es: "Manos a la obra" },
]

/** La pregunta de repaso de un paso: hay que acertarla para seguir. */
export type Repaso = { opciones: Bi[]; correcta: number; acierto: Bi; fallo: Bi }

export type Paso = {
  /** A qué etapa pertenece (1 a 3). Sin etapa (el recorrido de la landing) no hay riel. */
  etapa?: number
  /** Lo que EVA dice. Corto: se pronuncia. */
  texto: Bi
  /** Orden que se ejecuta antes de hablar (abrir una pantalla, pulsar un botón…). */
  accion?: AccionIA
  /** Parte de la pantalla a la que apunta (en la página o en la pantalla incrustada). Si no está, solo habla. */
  selector?: string
  /** Pausa tras la orden, para que la pantalla termine de dibujarse (ms). */
  espera?: number
  /** En este paso no hay «Next»: se sigue eligiendo uno de los CAMINOS. */
  elige?: true
  /** En este paso no hay «Next»: se sigue acertando la pregunta. */
  repaso?: Repaso
}

export type Recorrido = {
  id: string
  /** Lo que dice al terminar (vacío: nada). */
  fin: Bi
  pasos: Paso[]
  /** Qué sigue al terminar: volver a ofrecer el flujo o volver a elegir camino. */
  luego?: "oferta" | "elegir"
  /** Orden que se ejecuta al terminar, después de `fin` (p. ej. abrir el Planificador). */
  alFin?: AccionIA
}

/** La oferta, tras el nombre. Las palabras para reconocerla por voz están en ./escucha.ts (PALABRAS_OFERTA). */
export const OFERTA: { id: "si" | "landing"; boton: Bi }[] = [
  { id: "si", boton: { en: "Yes, teach me", es: "Sí, enséñame" } },
  { id: "landing", boton: { en: "Just show me the landing", es: "Solo quiero ver la landing" } },
]

// ----- Frases que se repiten (misma oración, misma grabación) -----
const QUE_HACER: Bi = {
  en: "You can see a mission that already exists, create a new one, or do something more exciting: go straight to the simulation.",
  es: "Puedes ver una misión que ya existe, crear una nueva, o algo más emocionante: ir directo a la simulación.",
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

/** «Sí»: el control de misión (el dashboard), parte por parte, y la pregunta de qué hacer. */
export const CONTROL: Recorrido = {
  id: "control",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 1,
      accion: { tipo: "open", screen: "missions" },
      espera: 600,
      selector: ".next",
      texto: {
        en: "Great, let us begin. This is mission control. Up top, the next milestone: the landing of CR-01 at Connecting Ridge, with the countdown to contact.",
        es: "Genial, comencemos. Este es el control de misión. Arriba, el próximo hito: el alunizaje de CR-01 en Connecting Ridge, con la cuenta regresiva hasta el contacto.",
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
      selector: "#pending",
      texto: {
        en: "Here, a mission is waiting for your approval: the science walk of CR-02 to the rim of Shackleton. Watch the oxygen on the way back: twenty-six percent, under the thirty percent margin. You can open it to review it, or approve it.",
        es: "Aquí hay una misión esperando tu aprobación: la caminata científica de CR-02 al borde de Shackleton. Ojo con el oxígeno al volver: veintiséis por ciento, bajo el margen de treinta. Puedes abrirla para revisarla, o aprobarla.",
      },
    },
    {
      etapa: 1,
      selector: ".sites",
      texto: {
        en: "These are the mission sites, on a radar of the south pole, at their real distance. The colour of each point is the status of its mission.",
        es: "Estos son los sitios de las misiones, en un radar del polo sur, a su distancia real. El color de cada punto es el estado de su misión.",
      },
    },
    {
      etapa: 1,
      selector: "#mlist",
      texto: {
        en: "And here are all the missions of the campaign, each in its own status: ready, to sign, under review or draft.",
        es: "Y aquí están todas las misiones de la campaña, cada una en su estado: lista, por firmar, en revisión o borrador.",
      },
    },
    {
      etapa: 2,
      elige: true,
      texto: { en: `What would you like to do? ${QUE_HACER.en}`, es: `¿Qué quieres hacer? ${QUE_HACER.es}` },
    },
  ],
}

/** De vuelta en el control de misión, tras VER o SIMULAR: a elegir otra vez. */
export const ELEGIR: Recorrido = {
  id: "elegir",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 2,
      accion: { tipo: "open", screen: "missions" },
      espera: 500,
      elige: true,
      texto: { en: `What else would you like to do? ${QUE_HACER.en}`, es: `¿Qué más quieres hacer? ${QUE_HACER.es}` },
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
      etapa: 3,
      accion: { tipo: "clic", selector: '.mrow[data-id="CR-01"]' },
      espera: 300,
      selector: '.mrow[data-id="CR-01"]',
      texto: {
        en: "Let us look at CR-01, the landing at Connecting Ridge. Its row has what matters: the Sun and Earth at landing, how many days it can slip and stay in its window, and the date of contact.",
        es: "Veamos CR-01, el alunizaje en Connecting Ridge. Su fila trae lo que importa: el Sol y la Tierra al alunizar, cuántos días puede atrasarse sin salir de su ventana, y la fecha de contacto.",
      },
    },
    {
      etapa: 3,
      selector: ".sites",
      texto: {
        en: "When you pick it, the radar marks its site, and the tracking tab filters its calendar and its log.",
        es: "Al elegirla, el radar marca su sitio, y la pestaña de seguimiento filtra su calendario y su bitácora.",
      },
    },
    {
      etapa: 3,
      accion: { tipo: "clic", selector: "#tab-win" },
      espera: 400,
      selector: "#win-p",
      texto: {
        en: "In the landing windows tab you see, day by day and site by site, when you can land: with Sun and Earth, with Sun only, or with neither.",
        es: "En la pestaña de ventanas de aterrizaje ves, día por día y sitio por sitio, cuándo se puede alunizar: con Sol y Tierra, solo con Sol, o con ninguno.",
      },
    },
    {
      etapa: 3,
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
      etapa: 3,
      selector: ".addm",
      texto: {
        en: "To create a mission you use this button, New mission. It opens the Planner with a form, step by step. Let me tell you the steps before we go in.",
        es: "Para crear una misión se usa este botón, Nueva misión. Abre el Planificador con un formulario, paso a paso. Te cuento los pasos antes de entrar.",
      },
    },
    {
      etapa: 3,
      texto: {
        en: "First, the name and the type of mission: crewed, robotic rover or fixed lander. Then, the zone where you land: A, B or C.",
        es: "Primero, el nombre y el tipo de misión: tripulada, rover robótico o módulo fijo. Luego, la zona donde alunizar: A, B o C.",
      },
    },
    {
      etapa: 3,
      texto: {
        en: "Next, the date and the stay. The light study shows when there is Sun and when there is Earth: drag the timeline until you have both.",
        es: "Después, la fecha y la estadía. El estudio de luz muestra cuándo hay Sol y cuándo hay Tierra: arrastra la línea de tiempo hasta tener los dos.",
      },
    },
    {
      etapa: 3,
      texto: {
        en: "Then, the equipment: the power, the battery hours, the minimum link with Earth and the height of the panel and the antenna. And the route of the walk, over the real terrain.",
        es: "Luego, el equipo: la energía, las horas de batería, el enlace mínimo con la Tierra y la altura del panel y la antena. Y la ruta de la caminata, sobre el relieve real.",
      },
    },
    {
      etapa: 3,
      texto: {
        en: "At the end, the result: go or no go, with each check and the comparison in the three zones. Save the mission and, if you like, simulate it.",
        es: "Al final, el resultado: go o no go, con cada comprobación y la comparación en las tres zonas. Guarda la misión y, si quieres, simúlala.",
      },
    },
  ],
}

/** Directo a la simulación: el alunizaje 3D en Connecting Ridge y la caminata. */
const SIMULAR: Recorrido = {
  id: "simular",
  fin: { en: "That is how you rehearse a mission. Back to mission control.", es: "Así se ensaya una misión. Volvamos al control de misión." },
  luego: "elegir",
  pasos: [
    {
      etapa: 3,
      accion: { tipo: "open", screen: "simulator" },
      espera: 900,
      texto: {
        en: "Something more exciting, then. This is the landing at Connecting Ridge, in three dimensions. The descent flies itself. Drag to look around. Say next when we are down.",
        es: "Algo más emocionante, entonces. Este es el alunizaje en Connecting Ridge, en tres dimensiones. El descenso vuela solo. Arrastra para mirar alrededor. Di siguiente cuando estemos abajo.",
      },
    },
    {
      // La caminata del simulador (features/simulator/alunizaje: caminata.ts, tareas.ts, visorHud.ts): al posarse,
      // la tarjeta final ofrece «Salir a caminar»; EVA la pulsa y el astronauta baja por la escalera.
      etapa: 3,
      accion: { tipo: "clic", selector: '.sim-lfp-end [data-act="out"]' },
      espera: 2500,
      texto: {
        en: "We are down. Now the best part: we step outside. The astronaut climbs down the ladder, and you look through the helmet.",
        es: "Ya estamos abajo. Ahora lo mejor: salimos. El astronauta baja por la escalera, y tú miras a través del casco.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-rows",
      texto: {
        en: "This is the screen inside your helmet. Oxygen, the carbon dioxide filter, cooling water and battery all drain as you work, faster in the shade.",
        es: "Esta es la pantalla dentro de tu casco. El oxígeno, el filtro de dióxido de carbono, el agua de refrigeración y la batería se gastan mientras trabajas, más rápido en la sombra.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-feed",
      texto: {
        en: "Your tasks are real moonwalk jobs: check a landing leg, plant a seismometer far from the lander, put a solar panel where the Sun really shines, and collect samples in light and in shadow.",
        es: "Tus tareas son trabajos reales de una caminata lunar: revisar una pata, instalar un sismómetro lejos de la nave, poner un panel solar donde de verdad dé el Sol y tomar muestras en la luz y en la sombra.",
      },
    },
    {
      etapa: 3,
      selector: ".sim-vh-keys",
      texto: {
        en: "Walk with the arrow keys and look around with the mouse. Take a stroll if you like. Say next when you are done.",
        es: "Camina con las flechas y mira alrededor con el ratón. Da un paseo si quieres. Di siguiente cuando termines.",
      },
    },
  ],
}

/** Los tres caminos tras el control de misión. `palabras`: además de las del botón, para reconocerlos por voz. */
export const CAMINOS: { id: "ver" | "crear" | "simular"; boton: Bi; palabras: string[]; recorrido: Recorrido }[] = [
  {
    id: "ver",
    boton: { en: "See a mission", es: "Ver una misión" },
    palabras: ["see", "view", "look", "existing", "exists", "review", "edit", "open", "ver", "mirar", "existe", "existente", "revisar", "editar", "abrir", "realizada", "hecha"],
    recorrido: VER,
  },
  {
    id: "crear",
    boton: { en: "Create a new mission", es: "Crear una misión nueva" },
    palabras: ["create", "new", "make", "plan", "build", "crear", "nueva", "nuevo", "generar", "planear", "armar", "hacer"],
    recorrido: CREAR,
  },
  {
    id: "simular",
    boton: { en: "Straight to the simulation", es: "Directo a la simulación" },
    palabras: ["simulation", "simulate", "simulator", "exciting", "straight", "descent", "land", "simulacion", "simular", "simulador", "emocionante", "directo", "descenso", "alunizar", "alunizaje"],
    recorrido: SIMULAR,
  },
]

/** Todos los recorridos del flujo (para grabar su voz y para las pruebas). */
export const RECORRIDOS: Recorrido[] = [LANDING, CONTROL, ELEGIR, ...CAMINOS.map((c) => c.recorrido)]

/** Las frases sueltas del flujo que no están en los pasos ni en `fin` (las respuestas del repaso): también se graban. */
export const frasesSueltas = (idioma: "en" | "es"): string[] =>
  RECORRIDOS.flatMap((r) => r.pasos.flatMap((p) => (p.repaso ? [p.repaso.acierto[idioma], p.repaso.fallo[idioma]] : [])))
