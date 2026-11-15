// Preguntas frecuentes de EVA con su respuesta escrita (y grabada): cuando alguien le habla y lo que dice se parece a
// una de estas preguntas, EVA contesta al instante con la voz grabada, sin esperar a la IA. Lo que no se parece a
// ninguna va a la IA, con una frase de puente grabada mientras piensa. Pedido de Estephano (2026-11-15): «que te
// responda, te dé tiempo de hablar de lo que te pregunto, derivarlo a otro audio parecido».
//
// - Lo comparten el API (que busca la pregunta más parecida con embeddings: apps/api/src/assistant/parecidas.ts), la
//   web (que dice la respuesta) y el script que graba la voz (apps/web/scripts/grabar-voz-eva.ts, vía frasesGrabables).
// - Cada `variantes` son formas de preguntar lo mismo, en los dos idiomas: más variantes, mejor coincidencia.
// - Las respuestas son cortas porque se pronuncian, con los números en letras. Cada afirmación sale de README.md,
//   docs/ o de los datos del motor (features/landing/flight/data/facts.json); no se inventa nada aquí. Si se cambia
//   un texto, se vuelve a grabar (`node apps/web/scripts/grabar-voz-eva.ts`).
// - Sin importaciones: lo leen node (pruebas y scripts) y el navegador tal cual.

type Bi = { en: string; es: string }

export type PreguntaFrecuente = { id: string; variantes: Bi[]; respuesta: Bi }

export const PREGUNTAS: PreguntaFrecuente[] = [
  {
    id: "polo",
    variantes: [
      { en: "Why is the south pole so hard?", es: "¿Por qué es tan difícil el polo sur?" },
      { en: "Why is it hard to land at the south pole?", es: "¿Por qué cuesta tanto alunizar en el polo sur?" },
      { en: "What makes the lunar south pole special?", es: "¿Qué tiene de especial el polo sur de la Luna?" },
    ],
    respuesta: {
      en: "Because the Sun never climbs there. It circles the horizon, so every hill throws a shadow kilometres long, and Earth hangs at the edge of the sky too. Light and radio both depend on the terrain.",
      es: "Porque allí el Sol nunca sube. Da la vuelta al horizonte, así que cada cerro lanza una sombra de kilómetros, y la Tierra también está en el borde del cielo. La luz y la radio dependen del relieve.",
    },
  },
  {
    id: "agua",
    variantes: [
      { en: "Why do missions want to go to the south pole?", es: "¿Por qué las misiones quieren ir al polo sur?" },
      { en: "Is there water at the south pole?", es: "¿Hay agua en el polo sur?" },
      { en: "Is there ice on the Moon?", es: "¿Hay hielo en la Luna?" },
    ],
    respuesta: {
      en: "Because some crater floors there never see the Sun, and they may hold water ice. Water means drinking water, air and rocket fuel for future crews.",
      es: "Porque allí hay fondos de cráter que nunca ven el Sol, y pueden guardar hielo de agua. El agua significa agua para beber, aire y combustible para futuras tripulaciones.",
    },
  },
  {
    id: "sol-alto",
    variantes: [
      { en: "How high does the Sun get at the pole?", es: "¿Qué tan alto sube el Sol en el polo?" },
      { en: "Does the Sun ever rise high?", es: "¿El Sol llega a subir alto?" },
    ],
    respuesta: {
      en: "Barely. Between twenty twenty-six and twenty thirty it never climbs more than about one and a half degrees over the pole. Hold your arm out: that is about the width of your thumb.",
      es: "Casi nada. Entre dos mil veintiséis y dos mil treinta nunca sube más de un grado y medio sobre el polo. Estira el brazo: es más o menos el ancho de tu pulgar.",
    },
  },
  {
    id: "veredicto",
    variantes: [
      { en: "What does go and no go mean?", es: "¿Qué significa go y no go?" },
      { en: "What is review?", es: "¿Qué significa revisar?" },
      { en: "How do you decide the verdict?", es: "¿Cómo decides el veredicto?" },
    ],
    respuesta: {
      en: "Go means the plan meets every requirement. No go means at least one fails. Review means it passes, but the Sun or Earth clears the horizon by less than half a degree at landing, so it is a close call.",
      es: "Go quiere decir que el plan cumple todos los requisitos. No go, que falla al menos uno. Revisar quiere decir que cumple, pero el Sol o la Tierra pasan el horizonte por menos de medio grado al alunizar, así que está justo.",
    },
  },
  {
    id: "requisitos",
    variantes: [
      { en: "What are the requirements?", es: "¿Cuáles son los requisitos?" },
      { en: "What does the mission need?", es: "¿Qué necesita la misión?" },
    ],
    respuesta: {
      en: "Four things. The Sun in view at landing, Earth in view at landing, no night longer than the battery lasts, and Earth in view for enough of the stay.",
      es: "Cuatro cosas. El Sol a la vista al alunizar, la Tierra a la vista al alunizar, ninguna noche más larga que lo que dura la batería, y la Tierra a la vista durante suficiente parte de la estadía.",
    },
  },
  {
    id: "datos",
    variantes: [
      { en: "Where does the data come from?", es: "¿De dónde salen los datos?" },
      { en: "What NASA data do you use?", es: "¿Qué datos de la NASA usas?" },
      { en: "Is this real data?", es: "¿Estos datos son reales?" },
    ],
    respuesta: {
      en: "The Sun and Earth positions come from NASA JPL Horizons, and the terrain from NASA's lunar laser altimeter, LOLA. The missions are examples, but the sky and the hills are real.",
      es: "Las posiciones del Sol y la Tierra salen de JPL Horizons de la NASA, y el relieve del altímetro láser lunar de la NASA, LOLA. Las misiones son ejemplos, pero el cielo y los cerros son reales.",
    },
  },
  {
    id: "precision",
    variantes: [
      { en: "How accurate is it?", es: "¿Qué tan preciso es?" },
      { en: "How do you know the numbers are right?", es: "¿Cómo sabes que las cifras están bien?" },
      { en: "Is this accurate?", es: "¿Es exacto?" },
    ],
    respuesta: {
      en: "We checked it against independent sources. Our Sun and Earth directions differ from JPL Horizons by less than a hundredth of a degree, and our sunlight at Connecting Ridge lands within two points of published maps.",
      es: "Lo comprobamos contra fuentes independientes. Nuestras direcciones del Sol y la Tierra difieren de JPL Horizons en menos de una centésima de grado, y nuestra luz solar en Connecting Ridge queda a menos de dos puntos de los mapas publicados.",
    },
  },
  {
    id: "tierra",
    variantes: [
      { en: "Why do we need to see Earth?", es: "¿Por qué necesitamos ver la Tierra?" },
      { en: "How does the lander talk to Earth?", es: "¿Cómo se comunica la nave con la Tierra?" },
    ],
    respuesta: {
      en: "To talk home directly. Radio needs a straight line of sight to Earth. If a hill is in the way, there is no link unless a relay satellite helps.",
      es: "Para hablar con casa directamente. La radio necesita una línea de vista recta hasta la Tierra. Si hay un cerro en medio, no hay enlace, salvo que ayude un satélite de relevo.",
    },
  },
  {
    id: "tierra-mueve",
    variantes: [
      { en: "Why does Earth move up and down?", es: "¿Por qué la Tierra sube y baja?" },
      { en: "Does Earth move in the lunar sky?", es: "¿La Tierra se mueve en el cielo lunar?" },
    ],
    respuesta: {
      en: "The Moon wobbles a little as it orbits. That is called libration. From the pole, Earth drifts between about seven degrees below and seven degrees above the horizon, roughly once a month.",
      es: "La Luna se bambolea un poco al girar alrededor de la Tierra. Eso se llama libración. Desde el polo, la Tierra va de unos siete grados bajo el horizonte a unos siete sobre él, más o menos una vez al mes.",
    },
  },
  {
    id: "noche",
    variantes: [
      { en: "What is the longest night?", es: "¿Qué es la noche más larga?" },
      { en: "Why does the battery matter?", es: "¿Por qué importa la batería?" },
    ],
    respuesta: {
      en: "It is the longest stretch without Sun during the stay. The battery has to last through it. If the night is longer than the battery, the lander freezes.",
      es: "Es el tramo más largo sin Sol durante la estadía. La batería tiene que aguantarlo. Si la noche dura más que la batería, la nave se congela.",
    },
  },
  {
    id: "altura",
    variantes: [
      { en: "Why does the height of the panel matter?", es: "¿Por qué importa la altura del panel?" },
      { en: "What does raising the antenna do?", es: "¿Para qué sirve subir la antena?" },
    ],
    respuesta: {
      en: "Height buys horizon. The Sun is measured from the solar panel and Earth from the antenna, so a few metres of mast can see over a nearby hill.",
      es: "La altura compra horizonte. El Sol se mide desde el panel solar y la Tierra desde la antena, así que unos metros de mástil pueden ver por encima de un cerro cercano.",
    },
  },
  {
    id: "dia-lunar",
    variantes: [
      { en: "How long is a day on the Moon?", es: "¿Cuánto dura un día en la Luna?" },
      { en: "What is a lunar day?", es: "¿Qué es un día lunar?" },
      { en: "How long is a day there?", es: "¿Cuánto dura un día allá?" },
    ],
    respuesta: {
      en: "About twenty-nine and a half Earth days, from one sunrise to the next. At the pole, that is how long the Sun takes to go once around the horizon.",
      es: "Unos veintinueve días y medio de la Tierra, de un amanecer al siguiente. En el polo, es lo que tarda el Sol en dar una vuelta al horizonte.",
    },
  },
  {
    id: "zonas",
    variantes: [
      { en: "What are the candidate zones?", es: "¿Qué son las zonas candidatas?" },
      { en: "Where do the zones come from?", es: "¿De dónde salen las zonas?" },
    ],
    respuesta: {
      en: "They are landing regions published with NASA's five metre terrain models of the south pole. Zone A is on Connecting Ridge, zone B is the peak near Shackleton, and zone C is the Shackleton rim.",
      es: "Son regiones de alunizaje publicadas con los modelos de terreno de cinco metros de la NASA para el polo sur. La zona A está en Connecting Ridge, la B es el pico cerca de Shackleton y la C es el borde de Shackleton.",
    },
  },
  {
    id: "descenso",
    variantes: [
      { en: "What is the descent simulation?", es: "¿Qué es la simulación del descenso?" },
      { en: "Is that a real lander?", es: "¿Esa es una nave real?" },
    ],
    respuesta: {
      en: "It flies the Apollo eleven descent profile as an example ship, checked against NASA's own report. It is not the lander of a real mission.",
      es: "Vuela el perfil de descenso del Apollo once como nave de ejemplo, comprobado contra el informe de la NASA. No es la nave de una misión real.",
    },
  },
  {
    id: "comparar",
    variantes: [
      { en: "How do I compare scenarios?", es: "¿Cómo comparo escenarios?" },
      { en: "What is the comparison table?", es: "¿Qué es la tabla de comparación?" },
      { en: "How do I compare?", es: "¿Cómo comparo?" },
    ],
    respuesta: {
      en: "Save up to six scenarios and see them side by side: sunlight, Earth, both at once, longest night, longest silence and panel power. The best of each column is underlined.",
      es: "Guarda hasta seis escenarios y míralos lado a lado: luz solar, Tierra, las dos a la vez, noche más larga, silencio más largo y potencia del panel. La mejor cifra de cada columna va subrayada.",
    },
  },
  {
    id: "panel",
    variantes: [
      { en: "What is the panel power?", es: "¿Qué es la potencia del panel?" },
      { en: "How much energy does the panel get?", es: "¿Cuánta energía recibe el panel?" },
    ],
    respuesta: {
      en: "It is the sunlight that reaches a vertical panel turning to face the Sun, in watts per square metre. Full sunlight is about one thousand three hundred sixty.",
      es: "Es la luz solar que llega a un panel vertical que gira hacia el Sol, en vatios por metro cuadrado. A pleno Sol son unos mil trescientos sesenta.",
    },
  },
  {
    id: "clps",
    variantes: [
      { en: "What is CLPS?", es: "¿Qué es CLPS?" },
      { en: "Who sends landers to the Moon?", es: "¿Quién manda naves a la Luna?" },
    ],
    respuesta: {
      en: "CLPS is NASA's Commercial Lunar Payload Services. NASA buys rides to the Moon from companies, and each landing needs a site and a date that work. That is what this tool helps choose.",
      es: "CLPS es el programa de NASA de servicios comerciales de carga lunar. La NASA compra viajes a la Luna a empresas, y cada alunizaje necesita un sitio y una fecha que funcionen. Eso es lo que esta herramienta ayuda a elegir.",
    },
  },
  {
    id: "eva",
    variantes: [
      { en: "Who are you?", es: "¿Quién eres?" },
      { en: "What does your name mean?", es: "¿Qué significa tu nombre?" },
    ],
    respuesta: {
      en: "I am EVA, the guide of Horizon Signai. My name comes from extravehicular activity, the astronaut word for a spacewalk. My voice is synthetic, and the numbers always come from the planner, not from me.",
      es: "Soy EVA, la guía de Horizon Signai. Mi nombre viene de actividad extravehicular, la palabra de los astronautas para una caminata espacial. Mi voz es sintética, y las cifras siempre salen del planificador, no de mí.",
    },
  },
  {
    id: "equipo",
    variantes: [
      { en: "Who made this?", es: "¿Quién hizo esto?" },
      { en: "Is this from NASA?", es: "¿Esto es de la NASA?" },
    ],
    respuesta: {
      en: "Team Hinomaru Signal, from Lima, Peru, for the NASA Space Apps Challenge twenty twenty-six. It uses public NASA data, but NASA does not endorse it.",
      es: "El equipo Hinomaru Signal, de Lima, Perú, para el NASA Space Apps Challenge dos mil veintiséis. Usa datos públicos de la NASA, pero la NASA no lo respalda.",
    },
  },
  {
    id: "ayuda",
    variantes: [
      { en: "What can I say?", es: "¿Qué puedo decir?" },
      { en: "How do I use this?", es: "¿Cómo se usa esto?" },
      { en: "Help", es: "Ayuda" },
    ],
    respuesta: {
      en: "Just talk to me. Say next to move on, again to hear it once more, or stop to make me quiet. You can also ask me anything about the Moon or the planner.",
      es: "Solo háblame. Di siguiente para avanzar, otra vez para oírlo de nuevo, o para para que me calle. También puedes preguntarme lo que quieras sobre la Luna o el planificador.",
    },
  },
]

/**
 * El murmullo que EVA dice al instante cuando le preguntan algo (grabado: suena sin esperar al servidor). Al azar, sin
 * repetir el anterior. En inglés es corto porque detrás viene el eco, que nombra el tema (packages/shared/src/eco.ts):
 * dos rellenos por turno como mucho. En español no hay eco (la voz en vivo tarda 3-5 s por frase), así que el murmullo
 * es más largo y ocupa él solo el silencio. Nada de «great question» ni de prometer lo que no hace. En español, «Emm» y
 * «Umm», nunca «Mmm»: Piper (espeak) lee «Mmm» como «eme-eme-eme» (medido).
 */
export const PUENTES: Record<"en" | "es", string[]> = {
  en: ["Mmm.", "Hmm.", "Ooh.", "Mmm, let's see.", "Hmm, let's see.", "Oh, okay."],
  es: [
    "Emm, a ver. Déjame revisar mis notas.",
    "Ajá. Dame un segundo, lo reviso.",
    "Umm, veamos. Ya te cuento.",
    "A ver, déjame consultar mis notas.",
    "Emm. Un momento, lo busco.",
    "Ajá, déjame ver qué tengo.",
  ],
}

/** Si la respuesta tarda mucho (ver RESCATE_MS en EvaCompanera.tsx): una vez, para que el silencio no parezca un cuelgue. */
export const RESCATE: Record<"en" | "es", string> = {
  en: "Still working on it, one more second.",
  es: "Sigo en eso, un segundo más.",
}

/** Tras contestar una pregunta en medio del flujo, para volver al paso. */
export const SEGUIMOS: Record<"en" | "es", string> = { en: "Now, back to where we were.", es: "Bueno, sigamos donde íbamos." }
