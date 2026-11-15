// Lo que EVA dice por su cuenta. Inglés (la interfaz va en inglés). Cifras y definiciones: docs/04-planificador.md.
//
// Cómo se comporta (especificación de Estephano, 2026-11-15):
// - Juguetona cuando todo va bien: un dato real del entorno y un chiste corto al final (`texto`).
// - Seria cuando hay peligro: con un aviso crítico activo no bromea, solo dice el aviso (`serio`).
// - No parlanchina: como mucho un comentario cada 90 s, nunca encima de otra cosa, un dado para no repetir
//   siempre lo mismo, y la mayoría de los comentarios salen una sola vez (`repetible` para los que no).
// - Qué comenta: cada pantalla (va a la parte de la que habla) y los momentos que otras pantallas le avisan
//   con un evento (ver EVENTOS y `avisarEva`).

export type Comentario = {
  /** Clave única: para decirlo una sola vez. */
  id: string
  /** Elemento al que va y que marca mientras habla. Si no está a la vista, el comentario se salta. */
  selector?: string
  texto: string
  /** Versión sin chiste para cuando hay un aviso crítico. Sin ella, con peligro no se dice. */
  serio?: string
  repetible?: boolean
}
export type Guion = { pantalla: string; comentarios: Comentario[] }

/** Hay un aviso crítico a la vista: una misión no cumple (barra de aviso o veredicto de la misión abierta). */
export const hayPeligro = () => !!document.querySelector('.db-alert[data-state="bad"], .ws-right .ui-chip[data-state="bad"]')

export function guionDe(ruta: string): Guion {
  if (ruta.startsWith("/planificador/")) {
    return {
      pantalla: "Planner (one mission in detail)",
      comentarios: [
        {
          id: "pl-checks",
          selector: ".pl-checks",
          texto: "These checks say if the landing meets each requirement: Sun and Earth at touchdown, the battery, and Earth contact. Green is my favourite colour.",
          serio: "This mission fails at least one requirement. The checks show which one.",
        },
        {
          id: "pl-options",
          selector: ".pl-options",
          texto: "Ways out: another date, a place nearby, or taller equipment. Apply one and watch the verdict change. Very satisfying.",
          serio: "Ways out: another date, a place nearby, or taller equipment. Apply one and check the verdict.",
        },
        {
          id: "pl-tl",
          selector: ".pl-tl",
          texto: "The timeline covers every hour of the stay. The gaps without Sun are nights. My battery gets nervous just looking at them.",
          serio: "The timeline shows the nights without Sun. Compare the longest one with the battery hours.",
        },
        {
          id: "pl-figures",
          selector: ".pl-figures",
          texto: "Sun in view means any part of its disc above the real horizon. Earth needs its centre above it. Earth is picky.",
          serio: "Sun in view means any part of its disc above the real horizon. Earth needs its centre above it.",
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
        },
        {
          id: "db-summary",
          selector: ".db-summary",
          texto: "Your missions at a glance: which ones keep the Sun for power and Earth for talking home. Like a weather report, for the Moon.",
          serio: "Your missions at a glance: which ones keep the Sun for power and Earth for contact.",
        },
        {
          id: "db-map",
          selector: ".pmap",
          texto: "The polar map. The south pole sits in the middle, and Earth is always toward the top. Handy, no compass needed.",
          serio: "The polar map. The south pole is in the middle; Earth is toward the top.",
        },
        {
          id: "db-open",
          selector: ".db-mission",
          texto: "Open a mission to plan it in detail. I will be right here, floating. It is what I do.",
          serio: "Open the failing mission to see why and how to fix it.",
        },
      ],
    }
  }
  if (ruta.startsWith("/simulador")) {
    return {
      pantalla: "Simulator (rehearse the descent)",
      comentarios: [
        {
          id: "sim",
          texto: "The simulator. You rehearse the descent before the real thing. Lunar gravity is one sixth of Earth's, so be gentle with the throttle.",
          serio: "The simulator. Rehearse the descent before the real thing.",
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
        texto: "Hi, I am EVA. Named after a spacewalk, so yes, I float everywhere. Tap me anytime to ask anything.",
      },
      {
        id: "ln-polo",
        texto: "At the Moon's south pole the Sun skims the horizon, so a small hill decides between power and darkness. Hills: small but dramatic.",
      },
    ],
  }
}

/**
 * Momentos que otras pantallas le avisan a EVA (el simulador, el alunizaje paso a paso). Una feature no importa
 * otra: avisan con `avisarEva("aterrizaje-nominal")` de `@/shared/eva` (un CustomEvent en window). `critico`: se dice aunque no
 * hayan pasado 90 s, y siempre en serio.
 */
export const EVENTOS: Record<string, Omit<Comentario, "id" | "selector"> & { critico?: boolean }> = {
  "aterrizaje-nominal": { texto: "Welcome to the lunar south pole. Population: you." },
  "primeros-pasos": { texto: "Your first steps. Footprints here last millions of years, so no pressure on the style." },
  salto: { texto: "One sixth gravity. Right now you weigh about as much as a large dog. A well fed one." },
  "muestra-sombra": { texto: "If there is ice in it, we are famous. If not, it is very expensive dirt." },
  lejos: { texto: "We are far from the lander now. I am not carrying you back.", serio: "You are far from the lander. Head back." },
  bandera: { texto: "It will not wave, there is no wind. Apollo used a horizontal rod to fake the breeze." },
  "tierra-a-la-vista": { texto: "Earth in view. Signal is up. Say hi to everyone back home.", repetible: true },
  sombra: { texto: "Entering shadow. Panels off, battery on. Lamps help.", serio: "Entering shadow. Running on battery.", repetible: true },
  "tarea-hecha": { texto: "Done. Gold star. Next up.", serio: "Task complete. Next.", repetible: true },
  "aviso-critico": { texto: "", serio: "Warning.", critico: true, repetible: true },
}

