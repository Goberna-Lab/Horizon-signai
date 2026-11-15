// Los recorridos guiados de EVA: quién llega decide cuál. Están escritos, no los genera la IA: funcionan igual si los
// servidores de IA no contestan (sin voz, el texto sale en su globo). Cada paso puede hacer algo en la app (las mismas
// órdenes que usa la IA: ./acciones.ts), apuntar a una parte de la pantalla y decir una frase; la persona avanza con
// «Next». Pedido de Estephano (2026-11-15): «desde que llegas ella está ahí para asistirte y enseñarte, guiado;
// planeas, comparas, miras las simulaciones y aprendes», para los tres públicos del reto: quien planifica la misión,
// quien enseña y el público general (docs/02-problema-y-usuario.md).
//
// Lo que afirma cada paso sale de la pantalla que tiene delante o de un documento del repo:
// - El escenario de arranque es fijo (lo pone la primera orden): plan del 18 dic 2026 movido al 3 abr 2027, estadía de
//   3 días, equipo a 2 m, batería de 24 h, Tierra mínima 40 %. Con él, las zonas A y C no cumplen y la B sí
//   (prototipos/lunar-map/engine.js; la zona A: Sol oculto al aterrizar y noche de 29 h).
// - 1,59° de altura máxima del Sol en el polo, 2026 a 2030: features/landing/flight/data/facts.json.
// - 62 sitios en el mapa 3D: features/map-3d/CLAUDE.md.
// Si cambia el planificador (ids de sus partes) o el escenario, se actualiza aquí.
import type { AccionIA } from "@/prueba-ia/cliente"

type Bi = { en: string; es: string }

export type Paso = {
  /** Lo que EVA dice. Corto: se pronuncia. */
  texto: Bi
  /** Orden que se ejecuta antes de hablar (abrir una pantalla, cambiar el escenario…). */
  accion?: AccionIA
  /** Parte de la pantalla a la que apunta (en la página o en el planificador incrustado). Si no está, solo habla. */
  selector?: string
  /** Pausa tras la orden, para que la pantalla termine de dibujarse (ms). */
  espera?: number
}

export type Recorrido = { id: "planner" | "teacher" | "curious"; boton: Bi; fin: Bi; pasos: Paso[] }

/** El escenario con el que empiezan los recorridos: el plan de ejemplo con la fecha movida. */
// («save» y «reset» son órdenes solo de los recorridos: guardar el escenario en la comparación sin abrirla y vaciarla.)
const CAMBIO: AccionIA = { tipo: "planner", zone: "A", date: "2027-04-03", time: "09:00", stay: 3, panel: 2, antenna: 2, battery: 24, earth: 40 }

export const RECORRIDOS: Recorrido[] = [
  {
    id: "planner",
    boton: { en: "I plan missions", es: "Planifico misiones" },
    fin: {
      en: "That is the whole loop: plan, compare, rehearse, share. The controls are yours. Ask me anything.",
      es: "Ese es el ciclo completo: planear, comparar, ensayar y compartir. Los controles son tuyos. Pregúntame lo que quieras.",
    },
    pasos: [
      {
        accion: CAMBIO,
        espera: 1200,
        selector: "#slip",
        texto: {
          en: "Your launch slipped. The landing moved from the eighteenth of December to the third of April. Same lander, same requirements. Two of three zones no longer work.",
          es: "Tu lanzamiento se retrasó. El alunizaje pasó del dieciocho de diciembre al tres de abril. La misma nave, los mismos requisitos. Dos de tres zonas ya no sirven.",
        },
      },
      {
        selector: "#cards",
        texto: {
          en: "Each card is a candidate zone with its verdict for your stay: sunlight for power, Earth in view for the radio link, and the longest night. Zone B still passes.",
          es: "Cada tarjeta es una zona candidata con su veredicto para tu estadía: luz solar para la energía, Tierra a la vista para el enlace de radio y la noche más larga. La zona B todavía cumple.",
        },
      },
      {
        selector: "#hz",
        texto: {
          en: "This is the real horizon around zone A, with the Sun and Earth where they really are. Right below: how long until the Sun rises and until Earth sets.",
          es: "Este es el horizonte real alrededor de la zona A, con el Sol y la Tierra donde realmente están. Justo debajo: cuánto falta para que salga el Sol y para que se oculte la Tierra.",
        },
      },
      {
        selector: "#checkList",
        texto: {
          en: "And this is why zone A fails. The Sun is hidden at landing, and the night lasts longer than the battery.",
          es: "Y aquí está por qué falla la zona A. El Sol está oculto al aterrizar y la noche dura más que la batería.",
        },
      },
      {
        // guarda el escenario que falla, para que la comparación muestre el antes y el después
        accion: { tipo: "save" },
        espera: 200,
        selector: "#ways",
        texto: {
          en: "The planner proposes three ways out: another date, another zone, or taller equipment. Next, I will apply the new date.",
          es: "El planificador propone tres salidas: otra fecha, otra zona o un equipo más alto. Ahora voy a aplicar la nueva fecha.",
        },
      },
      {
        accion: { tipo: "fix", how: "date" },
        espera: 900,
        selector: "#verdict",
        texto: {
          en: "Done. The landing moved a few days and the verdict changed. That is a replan in one click.",
          es: "Listo. El alunizaje se movió unos días y el veredicto cambió. Eso es replanificar con un clic.",
        },
      },
      {
        accion: { tipo: "compare" },
        espera: 700,
        selector: "#cmpWrap",
        texto: {
          en: "Here are both plans side by side: the slipped date and the fix. Keep up to six scenarios; the best figure of each column is underlined.",
          es: "Aquí están los dos planes lado a lado: la fecha movida y el arreglo. Puedes guardar hasta seis escenarios; la mejor cifra de cada columna va subrayada.",
        },
      },
      {
        accion: { tipo: "simulate" },
        espera: 400,
        selector: "#relief",
        texto: {
          en: "Now the rehearsal: the descent to the zone, flown with the Apollo eleven profile as an example vehicle.",
          es: "Ahora el ensayo: el descenso a la zona, volado con el perfil del Apollo once como nave de ejemplo.",
        },
      },
      {
        accion: { tipo: "play" },
        espera: 300,
        selector: "#tl",
        texto: {
          en: "And the timeline: ninety days of sunlight and Earth contact around your landing, with the Sun moving along the horizon.",
          es: "Y la línea de tiempo: noventa días de luz solar y contacto con la Tierra alrededor de tu alunizaje, con el Sol moviéndose por el horizonte.",
        },
      },
      {
        selector: "#shareBtn",
        texto: {
          en: "Last one. This button copies a link to this exact scenario, so science and engineering look at the same numbers.",
          es: "Lo último. Este botón copia un enlace a este mismo escenario, para que ciencia e ingeniería miren las mismas cifras.",
        },
      },
    ],
  },
  {
    id: "teacher",
    boton: { en: "I teach", es: "Enseño" },
    fin: {
      en: "That is a class in four moves: guess, plan, fix, compare. Every figure cites NASA data, so students can check it.",
      es: "Esa es una clase en cuatro movimientos: adivinar, planear, arreglar y comparar. Cada cifra cita datos de la NASA, así que los estudiantes pueden comprobarla.",
    },
    pasos: [
      {
        accion: { tipo: "open", screen: "landing" },
        espera: 1500,
        texto: {
          en: "This works as a twenty minute class activity. Start on this page: scroll the flight, and let students answer each guess-first question before the data appears.",
          es: "Esto sirve como actividad de clase de veinte minutos. Empieza en esta página: recorre el vuelo y deja que los estudiantes respondan cada pregunta de adivinar antes de que aparezca el dato.",
        },
      },
      {
        accion: CAMBIO,
        espera: 1200,
        selector: "#slip",
        texto: {
          en: "Then give them a mission. The launch slipped to April. Ask the class: which zone still works, and why?",
          es: "Luego dales una misión. El lanzamiento se retrasó a abril. Pregunta a la clase: ¿qué zona todavía sirve y por qué?",
        },
      },
      {
        selector: "#hz",
        texto: {
          en: "The answer is in the sky. At the pole the Sun circles the horizon and never climbs above about one and a half degrees, so any hill can hide it.",
          es: "La respuesta está en el cielo. En el polo el Sol da la vuelta al horizonte y nunca sube más de un grado y medio, así que cualquier cerro puede taparlo.",
        },
      },
      {
        selector: "#ways",
        texto: {
          en: "Let them fix it three ways and argue the trade-off: wait for a better date, move to another zone, or build a taller mast.",
          es: "Deja que lo arreglen de tres formas y discutan qué conviene: esperar una fecha mejor, cambiar de zona o construir un mástil más alto.",
        },
      },
      {
        selector: "#shareBtn",
        texto: {
          en: "Share the same scenario with everyone using this link, so the whole class starts from the same numbers.",
          es: "Comparte el mismo escenario con todos usando este enlace, para que toda la clase parta de las mismas cifras.",
        },
      },
      {
        selector: "[data-lang-toggle]",
        texto: {
          en: "And every screen switches between English and Spanish here.",
          es: "Y todas las pantallas cambian entre inglés y español aquí.",
        },
      },
    ],
  },
  {
    id: "curious",
    boton: { en: "I am curious", es: "Tengo curiosidad" },
    fin: {
      en: "That is the whole idea: find light, keep contact. Try your own dates, or tap me and ask anything.",
      es: "Esa es toda la idea: encontrar luz y mantener el contacto. Prueba tus propias fechas, o tócame y pregunta lo que quieras.",
    },
    pasos: [
      {
        accion: { tipo: "open", screen: "landing" },
        espera: 1500,
        texto: {
          en: "The Moon's south pole may hold water ice, so that is where missions want to land. The catch: the Sun there never climbs above about one and a half degrees.",
          es: "El polo sur de la Luna puede tener hielo de agua, por eso las misiones quieren alunizar ahí. El problema: allí el Sol nunca sube más de un grado y medio.",
        },
      },
      {
        accion: CAMBIO,
        espera: 1200,
        selector: "#cards",
        texto: {
          en: "A lander needs sunlight for power and Earth in view to talk home. Each card says whether a landing zone gets both.",
          es: "Una nave necesita luz solar para la energía y ver la Tierra para hablar con casa. Cada tarjeta dice si una zona de alunizaje tiene las dos cosas.",
        },
      },
      {
        selector: "#hz",
        texto: {
          en: "This is what the lander sees: the real hills around it, the Sun grazing them, and Earth hanging low. A single ridge can block either one.",
          es: "Esto es lo que ve la nave: los cerros reales a su alrededor, el Sol rozándolos y la Tierra muy baja. Una sola cresta puede tapar cualquiera de los dos.",
        },
      },
      {
        selector: "#slip",
        texto: {
          en: "Now watch what one week does. Next, I will move the landing seven days later.",
          es: "Ahora mira lo que hace una semana. Voy a mover el alunizaje siete días más tarde.",
        },
      },
      {
        accion: { tipo: "shift", days: 7 },
        espera: 900,
        selector: "#cards",
        texto: {
          en: "Same places, one week later, different verdicts. At the pole, a few days or a few hundred metres change everything.",
          es: "Los mismos lugares, una semana después, y los veredictos cambian. En el polo, unos días o unos cientos de metros lo cambian todo.",
        },
      },
      {
        accion: { tipo: "play" },
        espera: 300,
        selector: "#hz",
        texto: {
          en: "Here is a lunar day at the pole: the Sun slides around the horizon without ever rising high.",
          es: "Así es un día lunar en el polo: el Sol se desliza por el horizonte sin subir nunca.",
        },
      },
      {
        accion: { tipo: "open", screen: "map" },
        espera: 2500,
        texto: {
          en: "And here is everywhere we have landed on the Moon: sixty-two sites on real NASA relief. Tap one to see its Sun and Earth on any date.",
          es: "Y aquí está cada lugar donde hemos alunizado: sesenta y dos sitios sobre relieve real de la NASA. Toca uno para ver su Sol y su Tierra en cualquier fecha.",
        },
      },
    ],
  },
]
