// Lo que EVA dice por su cuenta. La interfaz va en inglés; cada frase lleva también su versión en español
// (`es`) para cuando la persona le habla en español. Cifras y definiciones: docs/04-planificador.md.
//
// Cómo se comporta (especificación de Estephano, 2026-11-15):
// - Empieza apagada. Cuando sale el Sol se enciende, se carga y, antes que nada, pregunta el idioma (dos botones:
//   English o Español). Luego saluda, pregunta el nombre y pregunta quién llega para dar su recorrido guiado
//   (ver TEXTOS y recorridos.ts).
// - Todo lo que dice por su cuenta está escrito aquí y en recorridos.ts, y su voz está grabada (vozGrabada.ts): para
//   decir el guion no se le pide nada al servidor. Si se cambia una frase, hay que volver a grabarla
//   (apps/web/scripts/grabar-voz-eva.ts; la prueba vozGrabada.test.ts avisa de las que faltan).
// - Juguetona cuando todo va bien: un dato real del entorno y un chiste corto al final (`texto`).
// - Seria cuando hay peligro: con un aviso crítico activo no bromea, solo dice el aviso (`serio`).
// - No parlanchina: fuera de la lección, como mucho un comentario cada 90 s, nunca encima de otra cosa, un
//   dado para no repetir siempre lo mismo, y la mayoría de los comentarios salen una sola vez (`repetible`
//   para los que no).
// - Qué comenta: cada pantalla (va a la parte de la que habla y la apunta con su rayo) y los momentos que
//   otras pantallas le avisan con un evento (ver EVENTOS y `avisarEva`).
import type { Idioma } from "./idioma"

type Frases = {
  texto: string
  /** Versión sin chiste para cuando hay un aviso crítico. Sin ella, con peligro no se dice. */
  serio?: string
}
export type Comentario = Frases & {
  /** Clave única: para decirlo una sola vez. */
  id: string
  /** Elemento al que va y que apunta mientras habla. Si no está a la vista, el comentario se salta. */
  selector?: string
  /** Lo mismo en español. */
  es?: Frases
  repetible?: boolean
}
export type Guion = {
  pantalla: string
  comentarios: Comentario[]
  /** Los selectores se buscan dentro de la pantalla incrustada (ver `marco`), no en la página. */
  enMarco?: boolean
}

/** La frase que toca: en el idioma de la conversación y, con peligro, la versión seria (null si no hay). */
export const fraseDe = (c: Frases & { es?: Frases }, peligro: boolean, idioma: Idioma): string | null => {
  const f = idioma === "es" && c.es ? c.es : c
  return peligro ? (f.serio ?? c.serio ?? null) : f.texto
}

/**
 * El documento de la pantalla incrustada, si la hay y se puede leer. El Planificador (`/planner`) es el prototipo
 * Lunar Map dentro de un iframe del mismo origen (features/lunar-map): con esto EVA sabe qué página muestra y
 * puede apuntar a sus partes.
 */
export const marco = (): Document | null => {
  try {
    return document.querySelector<HTMLIFrameElement>("iframe.lunar-map__frame")?.contentDocument ?? null
  } catch {
    return null
  }
}
/** Qué página muestra la pantalla incrustada (p. ej. `/lunar-map/index.html`); "" si no hay. */
export const paginaDelMarco = () => {
  try {
    return marco()?.location?.pathname ?? ""
  } catch {
    return ""
  }
}

/**
 * Hay un aviso crítico a la vista: una misión no cumple (barra de aviso o veredicto de la misión abierta) o,
 * en el Planificador, la zona elegida es NO GO.
 */
export const hayPeligro = () =>
  !!document.querySelector('.db-alert[data-state="bad"], .ws-right .ui-chip[data-state="bad"]') || !!marco()?.querySelector("#verdict.NOGO")

/** El guion de una pantalla. `pagina`: qué página muestra la pantalla incrustada, si la hay (ver `paginaDelMarco`). */
export function guionDe(ruta: string, pagina = ""): Guion {
  if (ruta.startsWith("/planner")) {
    // El prototipo Lunar Map: tres páginas dentro de un iframe. Lo que se afirma sale de su README
    // (prototipos/lunar-map/README.md); los selectores son los `id` de sus páginas. Si una parte cambia de
    // nombre o no está a la vista, ese comentario se salta solo.
    if (pagina.endsWith("/planificar.html")) {
      return {
        pantalla: "Planner, step 2: the walk (map layers, three routes, survival margins, elevation profile)",
        enMarco: true,
        comentarios: [
          {
            id: "lm-capas",
            selector: "#layerList",
            texto: "Layers for the walk. One honest note: the relief on this screen is generated to illustrate, not the real terrain model. Even robots have to confess.",
            serio: "Layers for the walk. Note: the relief on this screen is generated to illustrate, not the real terrain model.",
            es: {
              texto: "Capas para la caminata. Una nota honesta: el relieve de esta pantalla es generado para ilustrar, no es el modelo real del terreno. Hasta los robots tenemos que confesar.",
              serio: "Capas para la caminata. Nota: el relieve de esta pantalla es generado para ilustrar, no es el modelo real del terreno.",
            },
          },
          {
            id: "lm-rutas",
            selector: "#objectives",
            texto: "The walk plan compares three routes. Pick the one that leaves the most margin. Heroes are welcome, but margins get you home.",
            serio: "The walk plan compares three routes. Check each one against the survival margins.",
            es: {
              texto: "El plan de caminata compara tres rutas. Elige la que deje más margen. Los héroes son bienvenidos, pero el margen es el que te trae de vuelta.",
              serio: "El plan de caminata compara tres rutas. Revisa cada una contra los márgenes de supervivencia.",
            },
          },
          {
            id: "lm-perfil",
            selector: "#profSvg",
            texto: "The elevation profile of the route: every climb and drop along the way. In one sixth gravity, uphill is almost fun.",
            serio: "The elevation profile of the route: every climb and drop along the way.",
            es: {
              texto: "El perfil de elevación de la ruta: cada subida y cada bajada del camino. Con un sexto de gravedad, subir casi divierte.",
              serio: "El perfil de elevación de la ruta: cada subida y cada bajada del camino.",
            },
          },
        ],
      }
    }
    if (pagina.endsWith("/index.html")) {
      return {
        pantalla: "Planner, step 1: the landing (candidate zones, editable scenario, Go / No-Go verdict, real horizon, timeline)",
        enMarco: true,
        comentarios: [
          {
            id: "lm-veredicto",
            selector: "#verdict",
            texto: "The verdict: GO, REVIEW or NO GO. REVIEW means it passes, but the Sun or Earth barely clears the horizon at landing. Close calls make me nervous.",
            serio: "This zone is NO GO: it fails a requirement. See the list below and the ways to meet it.",
            es: {
              texto: "El veredicto: GO, REVIEW o NO GO. REVIEW quiere decir que cumple, pero el Sol o la Tierra apenas asoman sobre el horizonte al alunizar. Lo justo me pone nerviosa.",
              serio: "Esta zona es NO GO: no cumple un requisito. Mira la lista de abajo y las formas de cumplirlo.",
            },
          },
          {
            id: "lm-salidas",
            selector: "#ways",
            texto: "Ways to meet it: another date, another zone or more height. Apply one and watch the verdict change.",
            serio: "Ways to meet it: another date, another zone or more height. Apply one and check the verdict.",
            es: {
              texto: "Formas de cumplirlo: otra fecha, otra zona o más altura. Aplica una y mira cómo cambia el veredicto.",
              serio: "Formas de cumplirlo: otra fecha, otra zona o más altura. Aplica una y revisa el veredicto.",
            },
          },
          {
            id: "lm-zonas",
            selector: "#cards",
            texto: "Candidate zones near the south pole, taken from landing regions published in 2021. Pick one and I will stop hovering over it. Probably.",
            serio: "Candidate zones near the south pole. Pick another one to compare.",
            es: {
              texto: "Zonas candidatas cerca del polo sur, tomadas de regiones de alunizaje publicadas en 2021. Elige una y dejo de flotarle encima. Probablemente.",
              serio: "Zonas candidatas cerca del polo sur. Elige otra para comparar.",
            },
          },
          {
            id: "lm-horizonte",
            selector: "#hz",
            texto: "The real horizon around the zone, from NASA's lunar laser altimeter. The vertical scale is exaggerated, so the hills look scarier than they are.",
            serio: "The real horizon around the zone, from NASA's lunar laser altimeter. The vertical scale is exaggerated.",
            es: {
              texto: "El horizonte real alrededor de la zona, medido con el altímetro láser lunar de la NASA. La escala vertical está exagerada: los cerros asustan más de lo que son.",
              serio: "El horizonte real alrededor de la zona, medido con el altímetro láser lunar de la NASA. La escala vertical está exagerada.",
            },
          },
          {
            id: "lm-tiempo",
            selector: "#tl",
            texto: "The timeline runs from thirty days before landing to sixty days after, with the Sun and Earth where they really are. Nights included, sadly for my battery.",
            serio: "The timeline runs from thirty days before landing to sixty days after. Compare the nights with the battery.",
            es: {
              texto: "La línea de tiempo va de treinta días antes del alunizaje a sesenta días después, con el Sol y la Tierra donde realmente están. Noches incluidas, para tristeza de mi batería.",
              serio: "La línea de tiempo va de treinta días antes del alunizaje a sesenta días después. Compara las noches con la batería.",
            },
          },
        ],
      }
    }
    return {
      pantalla: "Planner: Mission control (next milestone, decisions waiting for sign-off, campaign calendar, missions)",
      enMarco: true,
      comentarios: [
        {
          id: "lm-hito",
          selector: "#steps",
          texto: "Mission control, with an example campaign. The next milestone and its countdown sit up here. Deadlines feel the same on the Moon, I checked.",
          es: { texto: "Control de misión, con una campaña de ejemplo. Aquí arriba están el próximo hito y su cuenta regresiva. Los plazos se sienten igual en la Luna, lo comprobé." },
        },
        {
          id: "lm-firma",
          selector: "#pending",
          texto: "This is where decisions wait for your sign-off. I would sign them myself, but I have no hands.",
          es: { texto: "Aquí esperan las decisiones que debes firmar. Las firmaría yo, pero no tengo manos." },
        },
        {
          id: "lm-calendario",
          selector: "#calw",
          texto: "The campaign calendar: every mission on one timeline, in UTC. The Moon does not do time zones.",
          es: { texto: "El calendario de la campaña: todas las misiones en una sola línea de tiempo, en UTC. La Luna no usa husos horarios." },
        },
        {
          id: "lm-misiones",
          selector: "#mlist",
          // Elegir una misión la resalta en esta página (bitácora, calendario y mapa); no abre el planificador.
          texto: "The missions of this example campaign. Pick one to see its log, its dates and its place on the map. To plan a landing, open Planner, up top.",
          es: { texto: "Las misiones de esta campaña de ejemplo. Elige una para ver su bitácora, sus fechas y su lugar en el mapa. Para planificar un alunizaje, abre Planificador, arriba." },
        },
      ],
    }
  }
  if (ruta.startsWith("/planificador/")) {
    return {
      pantalla: "Planner (one mission in detail)",
      comentarios: [
        {
          id: "pl-checks",
          selector: ".pl-checks",
          texto: "These checks say if the landing meets each requirement: Sun and Earth at touchdown, the battery, and Earth contact. Green is my favourite colour.",
          serio: "This mission fails at least one requirement. The checks show which one.",
          es: {
            texto: "Estas comprobaciones dicen si el alunizaje cumple cada requisito: Sol y Tierra al tocar suelo, la batería y el contacto con la Tierra. El verde es mi color favorito.",
            serio: "Esta misión no cumple al menos un requisito. Las comprobaciones muestran cuál.",
          },
        },
        {
          id: "pl-options",
          selector: ".pl-options",
          texto: "Ways out: another date, a place nearby, or taller equipment. Apply one and watch the verdict change. Very satisfying.",
          serio: "Ways out: another date, a place nearby, or taller equipment. Apply one and check the verdict.",
          es: {
            texto: "Salidas: otra fecha, un lugar cercano o equipo más alto. Aplica una y mira cómo cambia el veredicto. Muy satisfactorio.",
            serio: "Salidas: otra fecha, un lugar cercano o equipo más alto. Aplica una y revisa el veredicto.",
          },
        },
        {
          id: "pl-tl",
          selector: ".pl-tl",
          texto: "The timeline covers every hour of the stay. The gaps without Sun are nights. My battery gets nervous just looking at them.",
          serio: "The timeline shows the nights without Sun. Compare the longest one with the battery hours.",
          es: {
            texto: "La línea de tiempo cubre cada hora de la estadía. Los huecos sin Sol son noches. Mi batería se pone nerviosa de solo verlos.",
            serio: "La línea de tiempo muestra las noches sin Sol. Compara la más larga con las horas de batería.",
          },
        },
        {
          id: "pl-figures",
          selector: ".pl-figures",
          texto: "Sun in view means any part of its disc above the real horizon. Earth needs its centre above it. Earth is picky.",
          serio: "Sun in view means any part of its disc above the real horizon. Earth needs its centre above it.",
          es: {
            texto: "Sol a la vista quiere decir cualquier parte de su disco sobre el horizonte real. La Tierra necesita su centro por encima. La Tierra es exigente.",
            serio: "Sol a la vista quiere decir cualquier parte de su disco sobre el horizonte real. La Tierra necesita su centro por encima.",
          },
        },
      ],
    }
  }
  if (ruta.startsWith("/dashboard")) {
    return {
      pantalla: "Dashboard (all missions)",
      comentarios: [
        {
          id: "db-alert",
          selector: ".db-alert",
          texto: "All missions keep their Sun and their Earth. Nothing for me to worry about, which is suspicious.",
          serio: "A mission does not meet its requirements. Review it from this bar.",
          es: {
            texto: "Todas las misiones conservan su Sol y su Tierra. No tengo de qué preocuparme, lo cual es sospechoso.",
            serio: "Una misión no cumple sus requisitos. Revísala desde esta barra.",
          },
        },
        {
          id: "db-summary",
          selector: ".db-summary",
          texto: "Your missions at a glance: which ones keep the Sun for power and Earth for talking home. Like a weather report, for the Moon.",
          serio: "Your missions at a glance: which ones keep the Sun for power and Earth for contact.",
          es: {
            texto: "Tus misiones de un vistazo: cuáles conservan el Sol para la energía y la Tierra para hablar con casa. Como el pronóstico del tiempo, pero de la Luna.",
            serio: "Tus misiones de un vistazo: cuáles conservan el Sol para la energía y la Tierra para el contacto.",
          },
        },
        {
          id: "db-map",
          selector: ".pmap",
          texto: "The polar map. The south pole sits in the middle, and Earth is always toward the top. Handy, no compass needed.",
          serio: "The polar map. The south pole is in the middle; Earth is toward the top.",
          es: {
            texto: "El mapa polar. El polo sur está en el centro y la Tierra queda siempre hacia arriba. Práctico: no hace falta brújula.",
            serio: "El mapa polar. El polo sur está en el centro; la Tierra queda hacia arriba.",
          },
        },
        {
          id: "db-open",
          selector: ".db-mission",
          texto: "Open a mission to plan it in detail. I will be right here, floating. It is what I do.",
          serio: "Open the failing mission to see why and how to fix it.",
          es: {
            texto: "Abre una misión para planificarla en detalle. Yo estaré aquí, flotando. Es lo mío.",
            serio: "Abre la misión que falla para ver por qué y cómo arreglarla.",
          },
        },
      ],
    }
  }
  if (ruta.startsWith("/simulador")) {
    return {
      // El alunizaje del Apollo en el polo sur (features/simulator/LandingSimulator.tsx): lo vuela el guiado, sin control
      // manual; la cámara se gira arrastrando. Los avisos del descenso se los manda el simulador (`avisarEva`).
      pantalla: "Simulator: an automatic Apollo-style powered descent to the lunar south pole, with telemetry, a descent map and an altitude profile; the outcome depends on the terrain under the legs",
      comentarios: [
        {
          id: "sim",
          texto: "The simulator: an Apollo-style descent to the south pole. The guidance flies it, not you. Drag to orbit the lander. I will call out the terrain.",
          serio: "The simulator: an Apollo-style descent to the south pole. The guidance flies it. Drag to orbit the lander.",
          es: {
            texto: "El simulador: un descenso al estilo Apollo en el polo sur. Lo vuela el guiado, no tú. Arrastra para girar alrededor de la nave. Yo te aviso del terreno.",
            serio: "El simulador: un descenso al estilo Apollo en el polo sur. Lo vuela el guiado. Arrastra para girar alrededor de la nave.",
          },
        },
      ],
    }
  }
  if (ruta.startsWith("/3d-map")) {
    return {
      pantalla: "3D Moon map",
      comentarios: [
        {
          id: "m3d",
          texto: "A 3D Moon built from real laser altimeter relief. Drag to orbit. I always get a little dizzy.",
          serio: "A 3D Moon built from real laser altimeter relief. Drag to orbit.",
          es: {
            texto: "Una Luna en 3D hecha con relieve real de altímetro láser. Arrastra para orbitar. Yo siempre me mareo un poco.",
            serio: "Una Luna en 3D hecha con relieve real de altímetro láser. Arrastra para orbitar.",
          },
        },
        // Cifras del mapa: apps/web/src/features/map-3d/CLAUDE.md (62 sitios con su fuente, 8876 nombres IAU).
        {
          id: "m3d-sitios",
          texto: "Sixty-two landing sites are on this map, each with its source. Tap one to see its terrain, and the Sun and Earth for a date. I have visited none of them. Yet.",
          es: {
            texto: "En este mapa hay sesenta y dos sitios de alunizaje, cada uno con su fuente. Toca uno para ver su terreno, y el Sol y la Tierra en una fecha. Yo no he visitado ninguno. Todavía.",
          },
        },
        {
          id: "m3d-nombres",
          texto: "The place names come from the official IAU list: 8,876 of them. I know about twelve.",
          es: { texto: "Los nombres vienen de la lista oficial de la Unión Astronómica Internacional: 8876. Yo me sé unos doce." },
        },
      ],
    }
  }
  return {
    pantalla: "Landing page",
    comentarios: [
      {
        id: "ln-hola",
        selector: ".ln-title",
        texto: "I am named after a spacewalk, so yes, I float everywhere. Tap me anytime to ask anything.",
        es: { texto: "Me llamo así por las caminatas espaciales, así que sí, floto por todos lados. Tócame cuando quieras preguntar algo." },
      },
      {
        id: "ln-polo",
        texto: "At the Moon's south pole the Sun skims the horizon, so a small hill decides between power and darkness. Hills: small but dramatic.",
        es: { texto: "En el polo sur de la Luna el Sol roza el horizonte, así que un cerro pequeño decide entre energía y oscuridad. Cerros: pequeños pero dramáticos." },
      },
    ],
  }
}

/**
 * Momentos que otras pantallas le avisan a EVA (el simulador, el alunizaje paso a paso). Una feature no importa
 * otra: avisan con `avisarEva("aterrizaje-nominal")` de `@/shared/eva` (un CustomEvent en window). `critico`: se dice aunque no
 * hayan pasado 90 s, y siempre en serio. `festejo`: algo salió bien; al terminar pone ojos contentos en vez de guiñar.
 */
export const EVENTOS: Record<string, Frases & { es?: Frases; critico?: boolean; festejo?: boolean; repetible?: boolean }> = {
  "aterrizaje-nominal": { texto: "Welcome to the lunar south pole. Population: you.", es: { texto: "Bienvenido al polo sur lunar. Población: tú." }, festejo: true },
  "primeros-pasos": {
    texto: "Your first steps. Footprints here last millions of years, so no pressure on the style.",
    es: { texto: "Tus primeros pasos. Aquí las huellas duran millones de años, así que sin presión con el estilo." },
  },
  salto: {
    texto: "One sixth gravity. Right now you weigh about as much as a large dog. A well fed one.",
    es: { texto: "Un sexto de gravedad. Ahora mismo pesas más o menos lo que un perro grande. Uno bien alimentado." },
  },
  "muestra-sombra": {
    texto: "If there is ice in it, we are famous. If not, it is very expensive dirt.",
    es: { texto: "Si tiene hielo, somos famosos. Si no, es tierra carísima." },
  },
  lejos: {
    texto: "We are far from the lander now. I am not carrying you back.",
    serio: "You are far from the lander. Head back.",
    es: { texto: "Ya estamos lejos del módulo. No pienso cargarte de vuelta.", serio: "Estás lejos del módulo. Regresa." },
  },
  bandera: {
    texto: "It will not wave, there is no wind. Apollo used a horizontal rod to fake the breeze.",
    es: { texto: "No va a ondear: no hay viento. El Apolo usó una varilla horizontal para fingir la brisa." },
  },
  "tierra-a-la-vista": {
    texto: "Earth in view. Signal is up. Say hi to everyone back home.",
    es: { texto: "Tierra a la vista. Hay señal. Saluda a todos en casa." },
    repetible: true,
    festejo: true,
  },
  sombra: {
    texto: "Entering shadow. Panels off, battery on. Lamps help.",
    serio: "Entering shadow. Running on battery.",
    es: { texto: "Entrando a la sombra. Paneles apagados, batería encendida. Las lámparas ayudan.", serio: "Entrando a la sombra. Funcionando con batería." },
    repetible: true,
  },
  "tarea-hecha": {
    texto: "Done. Gold star. Next up.",
    serio: "Task complete. Next.",
    es: { texto: "Hecho. Estrella dorada. Siguiente.", serio: "Tarea completa. Siguiente." },
    repetible: true,
    festejo: true,
  },
  // Caminata con el casco (simulador de Jefferson: features/simulator/alunizaje/caminata.ts y tareas.ts). Ahí EVA vive
  // dentro del visor como holograma y es sarcástica cuando todo va bien; con peligro, la versión seria o nada.
  // Cifras: las del traje en la cabecera de caminata.ts (PLSS del Apollo / xEMU).
  galope: {
    texto: "Loping on the Moon. Apollo crews found it easier than running. Your oxygen does not agree.",
    es: { texto: "Galope lunar. Las tripulaciones del Apolo lo preferían a correr. Tu oxígeno no opina lo mismo." },
    repetible: true,
  },
  quieta: {
    texto: "Enjoying the view? Take your time. The oxygen will not.",
    es: { texto: "¿Disfrutando la vista? Tómate tu tiempo. El oxígeno no se lo toma." },
    repetible: true,
  },
  agotado: {
    texto: "You are exhausted. I suggest walking. Or breathing. Ideally both.",
    serio: "You are exhausted. Walk, and catch your breath.",
    es: { texto: "Estás agotado. Te sugiero caminar. O respirar. Idealmente las dos cosas.", serio: "Estás agotado. Camina y recupera el aliento." },
  },
  luces: {
    texto: "Lamps on. Now the shadows are only slightly terrifying.",
    es: { texto: "Luces encendidas. Ahora las sombras dan solo un poquito de miedo." },
  },
  "visor-solar": {
    texto: "Sun visor down. Very stylish. Also, you can see again.",
    es: { texto: "Visor solar abajo. Muy elegante. Y además vuelves a ver." },
  },
  recarga: {
    texto: "Suit recharged. Try not to spend it all on jumping this time.",
    es: { texto: "Traje recargado. Intenta no gastarlo todo en saltos esta vez." },
    repetible: true,
  },
  tiempo: {
    texto: "Time sped up. Your consumables noticed before you did.",
    es: { texto: "Tiempo acelerado. Tus consumibles se dieron cuenta antes que tú." },
  },
  pata: {
    texto: "The landing leg is fine. The lander is stable. Unlike your walking.",
    es: { texto: "La pata está bien. La nave está estable. A diferencia de tu forma de caminar." },
  },
  sismometro: {
    texto: "Seismometer listening. If the Moon says anything, you will be the second to know. After me.",
    es: { texto: "Sismómetro escuchando. Si la Luna dice algo, lo sabrás justo después de mí." },
  },
  panel: {
    texto: "Panel deployed, facing the Sun. At the pole that means almost vertical. Physics, not my idea.",
    es: { texto: "Panel desplegado, de cara al Sol. En el polo eso es casi vertical. Física, no idea mía." },
  },
  "muestra-sol": {
    texto: "Sample bagged. Regolith is as sharp as broken glass, by the way. Do not lick it.",
    es: { texto: "Muestra guardada. El regolito corta como vidrio roto, por cierto. No lo pruebes." },
  },
  "eva-completa": {
    texto: "All tasks done and you are back at the lander. I will pretend I never doubted you.",
    es: { texto: "Todas las tareas hechas y de vuelta en el módulo. Haré como que nunca dudé de ti." },
    festejo: true,
    repetible: true,
  },
  "aviso-critico": { texto: "", serio: "Warning.", es: { texto: "", serio: "Atención." }, critico: true, repetible: true },
}

/** El saludo al encenderse, el cambio de idioma y los rótulos de su globo y su panel, en los dos idiomas. */
export const TEXTOS = {
  en: {
    hola: "Hi, I am EVA. What is your name?",
    deNuevo: (nombre: string) => `Welcome back, ${nombre}. We have three missions to get ready, step by step. First, who is visiting today?`,
    oferta: (nombre: string) => (nombre ? `Nice to meet you, ${nombre}. We have three missions to get ready, step by step. First, who is visiting today?` : "We have three missions to get ready, step by step. First, who is visiting today?"),
    /** El recorrido guiado: la pregunta desde el panel y los botones de cada paso. */
    quien: "We have three missions to get ready, step by step. First, who is visiting today?",
    etapas: "Steps of the mission flow",
    escuchando: "Listening",
    teOigo: "I hear you…",
    noEntendi: "I did not catch that",
    lista: "ready",
    listas: "missions ready",
    /** Lo primero que pregunta, antes de saludar: en qué idioma seguir. Se contesta con dos botones. */
    cualIdioma: "English or Spanish?",
    /** Lo que muestra mientras toda la app pasa a este idioma (la página se recarga). */
    reconfigurando: "Reconfiguring language…",
    siguiente: "Next",
    parar: "Stop",
    /** El campo para preguntarle en medio de un recorrido: una pregunta la contesta la IA y el recorrido sigue donde iba. */
    duda: "Ask me about this…",
    dudaRotulo: "Your question for EVA about this step",
    recorrido: "Mission flow",
    leccion: "Great. This is Mission control. I will walk you through it, one part at a time.",
    luego: "No problem. Tap me whenever you want to talk.",
    /** Lo que dice, todavía en este idioma, al notar que le hablan en el otro. */
    detectado: "Spanish detected. Reconfiguring language…",
    /** Lo primero que dice ya en este idioma. */
    listo: "Done. I speak English again.",
    sinSenal: "My antenna lost the signal. Try again in a moment.",
    olvide: "Done. I forgot everything. Who are you again?",
    tuNombre: "Your name",
    ok: "OK",
    saltar: "Skip",
    si: "Yes, show me",
    no: "Not now",
    apagada: "EVA is powered off. Tap to wake her",
    abrir: "EVA, your guide. Tap to talk",
    cerrar: "Close EVA",
    panel: "Talk to EVA",
    titulo: "EVA · your guide",
    vozSi: "Voice on",
    vozNo: "Voice off",
    vozSiTitulo: "Mute my voice",
    vozNoTitulo: "Turn my voice on",
    otroIdioma: "Español",
    pregunta: "Ask me anything…",
    preguntaRotulo: "Your question for EVA",
    preguntar: "Ask",
    hablar: "Talk by voice",
    callar: "Stop talking",
    repetir: "Replay tips",
    olvidar: "Forget me",
    olvidarTitulo: "I keep your name and recent questions in this browser only",
    nota: "Synthetic voice. EVA can be wrong; figures come from the planner.",
  },
  es: {
    hola: "Hola, soy EVA. ¿Cómo te llamas?",
    deNuevo: (nombre: string) => `Hola de nuevo, ${nombre}. Tenemos tres misiones que preparar, paso a paso. Primero, ¿quién nos visita hoy?`,
    oferta: (nombre: string) => (nombre ? `Mucho gusto, ${nombre}. Tenemos tres misiones que preparar, paso a paso. Primero, ¿quién nos visita hoy?` : "Tenemos tres misiones que preparar, paso a paso. Primero, ¿quién nos visita hoy?"),
    quien: "Tenemos tres misiones que preparar, paso a paso. Primero, ¿quién nos visita hoy?",
    etapas: "Pasos del flujo de misión",
    escuchando: "Escuchando",
    teOigo: "Te escucho…",
    noEntendi: "no te entendí",
    lista: "lista",
    listas: "misiones listas",
    cualIdioma: "¿Inglés o español?",
    reconfigurando: "Reconfigurando idioma…",
    siguiente: "Siguiente",
    parar: "Parar",
    duda: "Pregúntame sobre esto…",
    dudaRotulo: "Tu pregunta para EVA sobre este paso",
    recorrido: "Flujo de misiones",
    leccion: "Genial. Este es el control de misión. Te lo muestro parte por parte.",
    luego: "No hay problema. Tócame cuando quieras hablar.",
    detectado: "Inglés detectado. Reconfigurando idioma…",
    listo: "Listo. Ahora hablo español.",
    sinSenal: "Mi antena perdió la señal. Prueba de nuevo en un momento.",
    olvide: "Listo. Lo olvidé todo. ¿Quién eras?",
    tuNombre: "Tu nombre",
    ok: "OK",
    saltar: "Saltar",
    si: "Sí, muéstrame",
    no: "Ahora no",
    apagada: "EVA está apagada. Tócala para encenderla",
    abrir: "EVA, tu guía. Tócala para hablar",
    cerrar: "Cerrar EVA",
    panel: "Hablar con EVA",
    titulo: "EVA · tu guía",
    vozSi: "Voz encendida",
    vozNo: "Voz apagada",
    vozSiTitulo: "Silenciar mi voz",
    vozNoTitulo: "Encender mi voz",
    otroIdioma: "English",
    pregunta: "Pregúntame lo que quieras…",
    preguntaRotulo: "Tu pregunta para EVA",
    preguntar: "Preguntar",
    hablar: "Hablar por voz",
    callar: "Dejar de hablar",
    repetir: "Repetir consejos",
    olvidar: "Olvídame",
    olvidarTitulo: "Guardo tu nombre y tus últimas preguntas solo en este navegador",
    nota: "Voz sintética. EVA puede equivocarse; las cifras salen del planificador.",
  },
} satisfies Record<Idioma, Record<string, string | ((nombre: string) => string)>>

/** Manos libres: qué puede decir la persona según lo que EVA espera (sale en su globo, junto a «Escuchando»). */
export const PISTAS: Record<"en" | "es", Record<string, string>> = {
  en: {
      nombre: "Say your name",
      oferta: "Say “I plan missions”, “I teach” or “I am curious”",
      mision: "Say the mission name or number",
      repaso: "Say your answer",
      paso: "Say “next”, “again” or ask me anything",
    },
  es: {
      nombre: "Di tu nombre",
      oferta: "Di «planifico misiones», «enseño» o «tengo curiosidad»",
      mision: "Di el nombre o el número de la misión",
      repaso: "Di tu respuesta",
      paso: "Di «siguiente», «otra vez» o pregúntame",
    },
}
