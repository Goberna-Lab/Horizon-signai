// El flujo guiado de EVA: un solo camino, con orden fijo, para preparar varias misiones.
//
// Pedido de Estephano (2026-11-15): «al principio debería preguntar para preparar todo; un flujo claro, inamovible,
// insaltable, para que se entienda: dashboard -> eliges la misión a planificar, comparas, simulas, aprendes, revisas
// otras misiones; hay que prepararnos para varias misiones, con un guion divertido y que se aprenda fácil».
//
// Cómo es:
// - Seis etapas, siempre en este orden (ETAPAS): 1 Missions, 2 Plan, 3 Compare, 4 Simulate, 5 Learn, 6 Next mission.
//   No se saltan: se avanza con «Next», eligiendo una misión o contestando la pregunta de repaso.
// - Tres misiones de ejemplo, cada una con un problema distinto y una salida distinta, para que cada una enseñe una
//   sola idea: la FECHA (el Sol), la ALTURA (el enlace con la Tierra) y el LUGAR.
// - Está escrito, no lo genera la IA: funciona aunque los servidores de IA no contesten, y su voz está grabada
//   (./vozGrabada.ts). Cada paso puede hacer algo en la app (las órdenes de ./acciones.ts), apuntar a una parte de la
//   pantalla y decir una frase. Una pregunta de la persona la contesta la IA y el flujo sigue en el mismo paso.
//
// De dónde sale cada afirmación (comprobado en la página con el motor del planificador, prototipos/lunar-map/engine.js,
// el 2026-11-15; si cambia el motor, los datos o estos escenarios, se vuelve a comprobar):
// - CR-01, zona A, plan 18 dic 2026 movido al 3 abr 2027 09:00, estadía 3 d, equipo 2 m, batería 24 h: A y C NO GO,
//   B GO. A: Sol 1,1° bajo el relieve al aterrizar y noche de 29 h. Salida «fecha»: 9 abr 2027 (6 días después), GO.
// - PS-03, zona B, 10 ene 2027 03:00, mismo equipo: B NO GO porque la Tierra está 0,4° bajo el relieve al aterrizar
//   (el Sol, a +4,0°). Salida «altura»: equipo a 5 m, la Tierra queda a +0,4°: cumple, con veredicto REVIEW.
// - SR-05, zona C, 5 may 2027 09:00: C NO GO (Sol 0,9° bajo el relieve y noche de 26 h contra 24 h); A y B GO.
//   Salida «zona»: zona A el mismo día, GO. A y C están a unos 10 km (89,47° S 222,6° E y 89,78° S 204,0° E).
// - El Sol no pasa de 1,59° sobre el polo entre 2026 y 2030: features/landing/flight/data/facts.json.
// - El simulador 3D (features/simulator) aluniza en Connecting Ridge RoI 6, la zona A: por eso va en la misión CR-01, con
//   la caminata de después (tareas reales de una EVA de Artemis: tareas.ts; el traje: visorHud.ts).
//
// Voz: cada oración se graba por separado y por su texto exacto. Las oraciones que se repiten entre misiones están
// escritas igual a propósito; los números van en letras. Tras cambiar un texto: `node apps/web/scripts/grabar-voz-eva.ts`.
import type { AccionIA } from "@/prueba-ia/cliente"

type Bi = { en: string; es: string }

/** Las seis etapas del flujo, en orden. El número de etapa de cada paso es su posición aquí (desde 1). */
export const ETAPAS: Bi[] = [
  { en: "Missions", es: "Misiones" },
  { en: "Plan", es: "Planear" },
  { en: "Compare", es: "Comparar" },
  { en: "Simulate", es: "Simular" },
  { en: "Learn", es: "Aprender" },
  { en: "Next mission", es: "Siguiente" },
]

/** La pregunta de repaso de una misión: hay que acertarla para seguir. */
export type Repaso = { opciones: Bi[]; correcta: number; acierto: Bi; fallo: Bi }

export type Paso = {
  /** A qué etapa pertenece (1 a 6). */
  etapa: number
  /** Lo que EVA dice. Corto: se pronuncia. */
  texto: Bi
  /** Orden que se ejecuta antes de hablar (abrir una pantalla, cambiar el escenario…). */
  accion?: AccionIA
  /** Parte de la pantalla a la que apunta (en la página o en el planificador incrustado). Si no está, solo habla. */
  selector?: string
  /** Pausa tras la orden, para que la pantalla termine de dibujarse (ms). */
  espera?: number
  /** En este paso no hay «Next»: se sigue eligiendo una misión. */
  elige?: true
  /** En este paso no hay «Next»: se sigue acertando la pregunta. */
  repaso?: Repaso
}

export type Recorrido = { id: string; fin: Bi; pasos: Paso[] }

/** Quién llega: la pregunta de preparación. Solo cambia la primera frase; el camino es el mismo para todos. */
export const PERFILES: { id: "planner" | "teacher" | "curious"; boton: Bi; saludo: Bi }[] = [
  {
    id: "planner",
    boton: { en: "I plan missions", es: "Planifico misiones" },
    saludo: { en: "A professional. I will keep it short and precise.", es: "Alguien del oficio. Seré breve y precisa." },
  },
  {
    id: "teacher",
    boton: { en: "I teach", es: "Enseño" },
    saludo: { en: "A teacher. Each mission ends with a question you can reuse in class.", es: "Alguien que enseña. Cada misión termina con una pregunta que puedes usar en clase." },
  },
  {
    id: "curious",
    boton: { en: "I am curious", es: "Tengo curiosidad" },
    saludo: { en: "A curious mind. No jargon, I promise. Well, almost none.", es: "Una mente curiosa. Nada de jerga, lo prometo. Bueno, casi nada." },
  },
]

// ----- Frases que se repiten (misma oración, misma grabación) -----
const DESCENSO: Bi = {
  en: "Time to rehearse. This is the descent, flown with the Apollo eleven profile as our example ship.",
  es: "Hora de ensayar. Este es el descenso, volado con el perfil del Apollo once como nave de ejemplo.",
}
const NOVENTA: Bi = {
  en: "And these are ninety days on the surface. Red is sunlight. White is Earth in view. Watch the Sun slide along the horizon.",
  es: "Y estos son noventa días en la superficie. Rojo es luz solar. Blanco es Tierra a la vista. Mira cómo el Sol se desliza por el horizonte.",
}
const SALIDAS: Bi = {
  en: "Do not panic. The planner offers three ways out: another date, another zone, or taller equipment.",
  es: "Que no cunda el pánico. El planificador ofrece tres salidas: otra fecha, otra zona o un equipo más alto.",
}
const VUELTA_TEXTO: Bi = {
  en: "Back at mission control. Pick the next mission.",
  es: "De vuelta en el control de misión. Elige la siguiente misión.",
}

const equipo = { stay: 3, panel: 2, antenna: 2, battery: 24, earth: 40 }

export type Mision = {
  /** El id de la misión en el dashboard (prototipos/lunar-map/campaign.js). */
  id: string
  nombre: Bi
  /** Una línea: qué va a enseñar. Sale en el botón para elegirla. */
  tema: Bi
  recorrido: Recorrido
}

export const MISIONES: Mision[] = [
  {
    id: "CR-01",
    nombre: { en: "Connecting Ridge", es: "Connecting Ridge" },
    tema: { en: "the launch slipped", es: "el lanzamiento se atrasó" },
    recorrido: {
      id: "CR-01",
      fin: {
        en: "Lesson one: at the south pole, the date decides the sunlight. Mission one is ready.",
        es: "Lección uno: en el polo sur, la fecha decide la luz. La misión uno está lista.",
      },
      pasos: [
        {
          etapa: 2,
          accion: { tipo: "planner", reset: true, plan: "2026-12-18T09:00", zone: "A", date: "2027-04-03", time: "09:00", ...equipo },
          espera: 350,
          selector: "#slip",
          texto: {
            en: "Mission one. The rocket was late, so the landing slid from the eighteenth of December to the third of April. Same lander, same needs. Let us see if the Moon still agrees.",
            es: "Misión uno. El cohete se atrasó, así que el alunizaje pasó del dieciocho de diciembre al tres de abril. La misma nave, las mismas necesidades. Veamos si la Luna sigue de acuerdo.",
          },
        },
        {
          etapa: 2,
          selector: "#cards",
          texto: {
            en: "Three candidate zones. Each card answers one question: go, or no go. Ours is zone A, and it just turned red.",
            es: "Tres zonas candidatas. Cada tarjeta responde una pregunta: go, o no go. La nuestra es la zona A, y acaba de ponerse roja.",
          },
        },
        {
          etapa: 2,
          selector: "#hz",
          texto: {
            en: "Here is why. This black shape is the real horizon around zone A. On landing day the Sun is hiding behind that terrain. No Sun, no power.",
            es: "Aquí está el porqué. Esta forma negra es el horizonte real alrededor de la zona A. El día del alunizaje el Sol se esconde detrás de ese relieve. Sin Sol no hay energía.",
          },
        },
        {
          etapa: 2,
          selector: "#checkList",
          texto: {
            en: "It gets worse. The night lasts twenty-nine hours, and our battery lasts twenty-four. I did the math so you do not have to: we freeze.",
            es: "Y se pone peor. La noche dura veintinueve horas y nuestra batería dura veinticuatro. Hice la cuenta para que no tengas que hacerla: nos congelamos.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "save" },
          espera: 200,
          selector: "#ways",
          texto: { en: `${SALIDAS.en} Let us try the date.`, es: `${SALIDAS.es} Probemos con la fecha.` },
        },
        {
          etapa: 3,
          accion: { tipo: "fix", how: "date" },
          espera: 250,
          selector: "#verdict",
          texto: {
            en: "Six days later, and zone A is go again. The Sun came back around the horizon. That is a replan in one click.",
            es: "Seis días después, y la zona A vuelve a ser go. El Sol dio la vuelta por el horizonte. Eso es replanificar con un clic.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "compare" },
          espera: 250,
          selector: "#cmpWrap",
          texto: {
            en: "Now compare. Two rows, same place, six days apart. One fails, one passes. This table is how you defend a decision.",
            es: "Ahora compara. Dos filas, el mismo lugar, seis días de diferencia. Una falla y la otra cumple. Con esta tabla se defiende una decisión.",
          },
        },
        { etapa: 4, accion: { tipo: "simulate" }, espera: 200, selector: "#relief", texto: DESCENSO },
        { etapa: 4, accion: { tipo: "play" }, espera: 150, selector: "#tl", texto: NOVENTA },
        {
          etapa: 4,
          accion: { tipo: "open", screen: "simulator" },
          espera: 900,
          texto: {
            en: "Now the full ride, in three dimensions. The descent flies itself. Drag to look around. Say next when we are down.",
            es: "Ahora el viaje completo, en tres dimensiones. El descenso vuela solo. Arrastra para mirar alrededor. Di siguiente cuando estemos abajo.",
          },
        },
        {
          // La caminata del simulador (features/simulator/alunizaje: caminata.ts, tareas.ts, visorHud.ts): al posarse,
          // la tarjeta final ofrece «Salir a caminar»; EVA la pulsa y el astronauta baja por la escalera.
          etapa: 4,
          accion: { tipo: "clic", selector: '.sim-lfp-end [data-act="out"]' },
          espera: 2500,
          texto: {
            en: "We are down. Now the best part: we step outside. The astronaut climbs down the ladder, and you look through the helmet.",
            es: "Ya estamos abajo. Ahora lo mejor: salimos. El astronauta baja por la escalera, y tú miras a través del casco.",
          },
        },
        {
          etapa: 4,
          selector: ".sim-vh-rows",
          texto: {
            en: "This is the screen inside your helmet. Oxygen, the carbon dioxide filter, cooling water and battery all drain as you work, faster in the shade.",
            es: "Esta es la pantalla dentro de tu casco. El oxígeno, el filtro de dióxido de carbono, el agua de refrigeración y la batería se gastan mientras trabajas, más rápido en la sombra.",
          },
        },
        {
          etapa: 4,
          selector: ".sim-vh-feed",
          texto: {
            en: "Your tasks are real moonwalk jobs: check a landing leg, plant a seismometer far from the lander, put a solar panel where the Sun really shines, and collect samples in light and in shadow.",
            es: "Tus tareas son trabajos reales de una caminata lunar: revisar una pata, instalar un sismómetro lejos de la nave, poner un panel solar donde de verdad dé el Sol y tomar muestras en la luz y en la sombra.",
          },
        },
        {
          etapa: 4,
          selector: ".sim-vh-keys",
          texto: {
            en: "Walk with the arrow keys and look around with the mouse. Take a stroll if you like. Say next when you are ready for the quiz.",
            es: "Camina con las flechas y mira alrededor con el ratón. Da un paseo si quieres. Di siguiente cuando estés listo para el repaso.",
          },
        },
        {
          etapa: 5,
          texto: {
            en: "Quick check. Why did zone A fail on the third of April?",
            es: "Repaso rápido. ¿Por qué falló la zona A el tres de abril?",
          },
          repaso: {
            opciones: [
              { en: "The Sun was behind the terrain", es: "El Sol estaba detrás del relieve" },
              { en: "The Moon was too far away", es: "La Luna estaba muy lejos" },
              { en: "The lander was too heavy", es: "La nave pesaba demasiado" },
            ],
            correcta: 0,
            acierto: {
              en: "Exactly. At the pole the Sun never climbs. It circles the horizon, and a hill is enough to hide it.",
              es: "Exacto. En el polo el Sol nunca sube. Da la vuelta al horizonte, y un cerro basta para taparlo.",
            },
            fallo: {
              en: "Not quite. Think of the horizon: the Sun was hiding behind the terrain. Try again.",
              es: "No exactamente. Piensa en el horizonte: el Sol se escondía detrás del relieve. Prueba otra vez.",
            },
          },
        },
      ],
    },
  },
  {
    id: "PS-03",
    nombre: { en: "Peak near Shackleton", es: "Pico cerca de Shackleton" },
    tema: { en: "can we call home?", es: "¿podemos llamar a casa?" },
    recorrido: {
      id: "PS-03",
      fin: {
        en: "Lesson two: no line of sight to Earth, no direct link. Height buys you horizon. Mission two is ready.",
        es: "Lección dos: sin línea de vista a la Tierra no hay enlace directo. La altura te compra horizonte. La misión dos está lista.",
      },
      pasos: [
        {
          etapa: 2,
          accion: { tipo: "planner", reset: true, plan: "2027-01-10T03:00", zone: "B", date: "2027-01-10", time: "03:00", ...equipo },
          espera: 350,
          selector: "#cards",
          texto: {
            en: "Mission two. A survey on the peak next to Shackleton, on the tenth of January. Plenty of sunlight up there. So what could go wrong?",
            es: "Misión dos. Un reconocimiento en el pico junto a Shackleton, el diez de enero. Allá arriba sobra luz solar. Entonces, ¿qué podría salir mal?",
          },
        },
        {
          etapa: 2,
          selector: "#checkList",
          texto: {
            en: "This. The Sun is fine, but Earth is hiding just under the horizon at landing. No Earth, no radio. We would land and nobody would know.",
            es: "Esto. El Sol está bien, pero la Tierra se esconde justo bajo el horizonte al alunizar. Sin Tierra no hay radio. Alunizaríamos y nadie se enteraría.",
          },
        },
        {
          etapa: 2,
          selector: "#hz",
          texto: {
            en: "From the pole, Earth never rises high. It bobs up and down at the edge of the sky, about once a month. Right now it is tucked behind the terrain.",
            es: "Desde el polo, la Tierra nunca sube mucho. Sube y baja en el borde del cielo, más o menos una vez al mes. Ahora mismo está metida detrás del relieve.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "save" },
          espera: 200,
          selector: "#ways",
          texto: { en: `${SALIDAS.en} This time, let us raise the equipment.`, es: `${SALIDAS.es} Esta vez, subamos el equipo.` },
        },
        {
          etapa: 3,
          accion: { tipo: "fix", how: "height" },
          espera: 250,
          selector: "#verdict",
          texto: {
            en: "Antenna up to five metres, and Earth peeks over the hill. It passes, but only just. The planner says review, because Earth barely clears the horizon.",
            es: "La antena a cinco metros, y la Tierra asoma sobre el cerro. Cumple, pero por poco. El planificador dice revisar, porque la Tierra apenas pasa el horizonte.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "compare" },
          espera: 250,
          selector: "#cmpWrap",
          texto: {
            en: "Same day, same place. At two metres, no contact. At five metres, contact. Three metres of mast saved the mission.",
            es: "El mismo día, el mismo lugar. A dos metros, sin contacto. A cinco metros, contacto. Tres metros de mástil salvaron la misión.",
          },
        },
        { etapa: 4, accion: { tipo: "simulate" }, espera: 200, selector: "#relief", texto: DESCENSO },
        { etapa: 4, accion: { tipo: "play" }, espera: 150, selector: "#tl", texto: NOVENTA },
        {
          etapa: 5,
          texto: { en: "Quick check. Why did we raise the antenna?", es: "Repaso rápido. ¿Por qué subimos la antena?" },
          repaso: {
            opciones: [
              { en: "To make the lander lighter", es: "Para que la nave pese menos" },
              { en: "To see Earth over the terrain", es: "Para ver la Tierra por encima del relieve" },
              { en: "To look taller in photos", es: "Para salir más alta en las fotos" },
            ],
            correcta: 1,
            acierto: {
              en: "Right. Earth sits at the horizon, so a few metres of height can win the line of sight.",
              es: "Correcto. La Tierra está en el horizonte, así que unos metros de altura pueden ganar la línea de vista.",
            },
            fallo: {
              en: "Not quite. Think of the radio: it needs to see Earth over the terrain. Try again.",
              es: "No exactamente. Piensa en la radio: necesita ver la Tierra por encima del relieve. Prueba otra vez.",
            },
          },
        },
      ],
    },
  },
  {
    id: "SR-05",
    nombre: { en: "Shackleton rim", es: "Borde de Shackleton" },
    tema: { en: "the wrong spot", es: "el lugar equivocado" },
    recorrido: {
      id: "SR-05",
      fin: {
        en: "Lesson three: at the pole, where you land matters as much as when. Mission three is ready.",
        es: "Lección tres: en el polo, dónde alunizas importa tanto como cuándo. La misión tres está lista.",
      },
      pasos: [
        {
          etapa: 2,
          accion: { tipo: "planner", reset: true, plan: "2027-05-05T09:00", zone: "C", date: "2027-05-05", time: "09:00", ...equipo },
          espera: 350,
          selector: "#cards",
          texto: {
            en: "Mission three. The science team wants the rim of Shackleton crater, on the fifth of May. Bold choice. Let us check.",
            es: "Misión tres. El equipo de ciencia quiere el borde del cráter Shackleton, el cinco de mayo. Una elección audaz. Vamos a revisar.",
          },
        },
        {
          etapa: 2,
          selector: "#checkList",
          texto: {
            en: "No go. The Sun is behind the terrain at landing, and the night beats the battery by two hours.",
            es: "No go. El Sol está detrás del relieve al alunizar, y la noche le gana a la batería por dos horas.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "save" },
          espera: 200,
          selector: "#cards",
          texto: {
            en: "But look at the neighbours. Same day, about ten kilometres away, zone A is go. Let us move.",
            es: "Pero mira a los vecinos. El mismo día, a unos diez kilómetros, la zona A es go. Mudémonos.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "fix", how: "zone" },
          espera: 250,
          selector: "#verdict",
          texto: {
            en: "Zone A, same day: go. We did not touch the date or the lander. We only changed the address.",
            es: "Zona A, el mismo día: go. No tocamos la fecha ni la nave. Solo cambiamos de dirección.",
          },
        },
        {
          etapa: 3,
          accion: { tipo: "compare" },
          espera: 250,
          selector: "#cmpWrap",
          texto: {
            en: "Two rows, same date, ten kilometres apart. One in the dark, one in the light.",
            es: "Dos filas, la misma fecha, diez kilómetros de distancia. Una a oscuras y la otra con luz.",
          },
        },
        { etapa: 4, accion: { tipo: "simulate" }, espera: 200, selector: "#relief", texto: DESCENSO },
        { etapa: 4, accion: { tipo: "play" }, espera: 150, selector: "#tl", texto: NOVENTA },
        {
          etapa: 5,
          texto: {
            en: "Quick check. Two sites, ten kilometres apart, on the same day. Do they get the same sunlight?",
            es: "Repaso rápido. Dos sitios, a diez kilómetros, el mismo día. ¿Reciben la misma luz solar?",
          },
          repaso: {
            opciones: [
              { en: "Yes, the Moon is small", es: "Sí, la Luna es pequeña" },
              { en: "Only on weekends", es: "Solo los fines de semana" },
              { en: "No, the terrain decides", es: "No, el relieve decide" },
            ],
            correcta: 2,
            acierto: {
              en: "Yes. With the Sun that low, every ridge throws a shadow many kilometres long.",
              es: "Sí. Con el Sol tan bajo, cada cresta lanza una sombra de muchos kilómetros.",
            },
            fallo: {
              en: "Not quite. Think of the low Sun and the long shadows: the terrain decides. Try again.",
              es: "No exactamente. Piensa en el Sol bajo y las sombras largas: el relieve decide. Prueba otra vez.",
            },
          },
        },
      ],
    },
  },
]

/** Etapa 1, la primera vez: el dashboard, y a elegir misión. */
export const INICIO: Recorrido = {
  id: "inicio",
  fin: { en: "", es: "" },
  pasos: [
    {
      etapa: 1,
      accion: { tipo: "open", screen: "missions" },
      espera: 400,
      selector: "#mlist",
      texto: {
        en: "This is mission control. Three landings are waiting, and all three have a problem. We will fix them one at a time.",
        es: "Este es el control de misión. Hay tres alunizajes esperando, y los tres tienen un problema. Los vamos a arreglar uno por uno.",
      },
    },
    {
      etapa: 1,
      selector: "#mlist",
      elige: true,
      texto: {
        en: "Every mission follows the same six steps: pick it, plan it, compare, simulate, learn, and on to the next. Pick your first mission.",
        es: "Cada misión sigue los mismos seis pasos: elegirla, planearla, comparar, simular, aprender y a la siguiente. Elige tu primera misión.",
      },
    },
  ],
}

/** Etapa 6, tras cada misión mientras queden otras: de vuelta al dashboard, a elegir la siguiente. */
export const VUELTA: Recorrido = {
  id: "vuelta",
  fin: { en: "", es: "" },
  pasos: [{ etapa: 6, accion: { tipo: "open", screen: "missions" }, espera: 400, selector: "#mlist", elige: true, texto: VUELTA_TEXTO }],
}

/** Cuando ya no quedan misiones. */
export const FINAL: Bi = {
  en: "All three missions are ready. You moved a date, raised an antenna and changed a site. That is mission planning. The controls are yours now. Tap me if you need me.",
  es: "Las tres misiones están listas. Moviste una fecha, subiste una antena y cambiaste de sitio. Eso es planificar una misión. Ahora los controles son tuyos. Tócame si me necesitas.",
}

/** Eligieron en el dashboard una misión que no tiene alunizaje que planear (la caminata, el borrador). */
export const NO_ESA: Bi = {
  en: "Not that one. It has no landing to plan yet. Pick one of the three with a landing date.",
  es: "Esa no. Todavía no tiene un alunizaje que planear. Elige una de las tres con fecha de alunizaje.",
}
/** Eligieron una misión que ya prepararon. */
export const YA_LISTA: Bi = { en: "That one is ready. Pick another.", es: "Esa ya está lista. Elige otra." }

/** Todos los recorridos del flujo (para grabar su voz y para las pruebas). */
export const RECORRIDOS: Recorrido[] = [INICIO, VUELTA, ...MISIONES.map((m) => m.recorrido)]

/** Las frases sueltas del flujo que no están en los pasos: también se graban. */
export const frasesSueltas = (idioma: "en" | "es"): string[] => [
  ...PERFILES.map((p) => p.saludo[idioma]),
  FINAL[idioma],
  NO_ESA[idioma],
  YA_LISTA[idioma],
  ...MISIONES.flatMap((m) => m.recorrido.pasos.flatMap((p) => (p.repaso ? [p.repaso.acierto[idioma], p.repaso.fallo[idioma]] : []))),
]
