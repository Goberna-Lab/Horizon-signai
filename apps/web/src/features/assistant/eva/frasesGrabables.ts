// Todo lo que EVA puede decir por su cuenta, reunido en una lista: los comentarios de cada pantalla, los eventos, el
// saludo, los recorridos y lo que dice al cumplir una sugerencia (guion.ts, recorridos.ts y sugerencias.ts). Con esta
// lista se graba su voz (apps/web/scripts/grabar-voz-eva.ts) y se comprueba qué oraciones del guion todavía no tienen
// grabación (vozGrabada.test.ts). Sin React ni DOM.
import { EVENTOS, fraseDe, guionDe, TEXTOS } from "./guion.ts"
import type { Idioma } from "./idioma"
import { frasesSueltas, RECORRIDOS } from "./recorridos.ts"
import { sugerenciasDe } from "./sugerencias.ts"
import { claveDe, enOraciones, sinVocativo } from "./vozGrabada.ts"

// Cada guion de pantalla que existe: la ruta y, dentro del Planificador, la página del prototipo (ver `guionDe`).
const PANTALLAS: [ruta: string, pagina: string][] = [
  ["/", ""],
  ["/planner", ""],
  ["/planner", "/lunar-map/index.html"],
  ["/planner", "/lunar-map/planificar.html"],
  ["/planificador/una-mision", ""],
  ["/dashboard", ""],
  ["/simulador", ""],
  ["/3d-map", ""],
]
const IDIOMAS: Idioma[] = ["en", "es"]

// Avisos que otras pantallas le mandan con su propio texto (`avisarEva("aviso-critico", texto)`). No se pueden importar
// (una feature no importa de otra), así que aquí van copiadas las oraciones fijas del simulador de alunizaje
// (features/simulator/alunizaje/landing.ts): con la voz grabada suenan al instante, que es cuando sirven. Las que
// llevan una cifra (metros, grados) no se pueden grabar y se piden en vivo. Si allá cambia un texto, aquí solo se
// pierde su grabación.
const AVISOS_AJENOS: Record<Idioma, string[]> = {
  en: [
    "Danger. Altitude error. We are falling.",
    "We are in shadow. I cannot see the ground, only the laser altimeter.",
    "Danger. The landing point has a large boulder. We could tip over.",
    "Caution.",
    "Danger. Below us there is a large boulder. We would tip over.",
    "Panels and antenna are misaligned.",
    "The landing gear may be damaged.",
    "The lander is tipping over. Mission lost.",
    "Impact. The descent stage ruptured and the propellant ignited. Mission lost.",
  ],
  es: [
    "Peligro. Error de altura. Estamos cayendo.",
    "Estamos en sombra. No veo el suelo, solo el altímetro láser.",
    "Peligro. En el punto de alunizaje hay una roca grande. Podríamos volcar.",
    "Cuidado.",
    "Peligro. Debajo hay una roca grande. Volcaríamos.",
    "Paneles y antena desalineados.",
    "El tren de aterrizaje puede estar dañado.",
    "La nave está volcando. Misión perdida.",
    "Impacto. La etapa de descenso se rompió y el propelente se encendió. Misión perdida.",
  ],
}

export type FraseDelGuion = {
  idioma: Idioma
  frase: string
  /** De dónde sale, para los avisos del script (p. ej. «comentario lm-hito», «recorrido planner 3»). */
  de: string
  /** En español no tiene traducción y `fraseDe` devolvería la frase en inglés: no se graba, se avisa. */
  sinTraducir?: boolean
}

/** Las frases completas del guion, en los dos idiomas. */
export function frasesDelGuion(): FraseDelGuion[] {
  const frases: FraseDelGuion[] = []
  const agregar = (idioma: Idioma, frase: string | null | undefined, de: string, sinTraducir = false) => {
    if (frase?.trim()) frases.push({ idioma, frase, de, ...(sinTraducir ? { sinTraducir } : {}) })
  }
  for (const idioma of IDIOMAS) {
    // Comentarios y eventos: la frase normal y la seria (con un aviso crítico a la vista).
    const variantes = (c: Parameters<typeof fraseDe>[0], de: string) => {
      for (const peligro of [false, true]) {
        const frase = fraseDe(c, peligro, idioma)
        agregar(idioma, frase, `${de}${peligro ? " (serio)" : ""}`, idioma === "es" && !!frase && frase === fraseDe(c, peligro, "en"))
      }
    }
    for (const [ruta, pagina] of PANTALLAS) for (const c of guionDe(ruta, pagina).comentarios) variantes(c, `comentario ${c.id}`)
    for (const [tipo, e] of Object.entries(EVENTOS)) variantes(e, `evento ${tipo}`)

    // El saludo y las respuestas hechas. Lo que lleva el nombre se graba sin él (ver `sinVocativo`).
    const T = TEXTOS[idioma]
    for (const clave of ["cualIdioma", "hola", "quien", "luego", "listo", "sinSenal", "olvide"] as const) agregar(idioma, T[clave], `texto ${clave}`)
    for (const clave of ["oferta", "deNuevo"] as const) {
      const [primera, ...resto] = enOraciones(T[clave]("Ana"))
      agregar(idioma, [sinVocativo(primera), ...resto].join(" "), `texto ${clave}`)
    }

    // Lo que dice al cumplir una sugerencia de su panel (las que son una acción: ./sugerencias.ts).
    for (const [ruta, pagina] of PANTALLAS) for (const s of sugerenciasDe(ruta, pagina)) agregar(idioma, s.dicho?.[idioma], `sugerencia «${s.texto.en}»`)

    for (const frase of AVISOS_AJENOS[idioma]) agregar(idioma, frase, "aviso del simulador")

    // Los recorridos guiados.
    for (const r of RECORRIDOS) {
      r.pasos.forEach((p, k) => agregar(idioma, p.texto[idioma], `recorrido ${r.id} ${k + 1}`))
      agregar(idioma, r.fin[idioma], `recorrido ${r.id} fin`)
    }
    // Lo demás del flujo de misiones: el saludo según quién llega, las respuestas del repaso y el cierre.
    for (const frase of frasesSueltas(idioma)) agregar(idioma, frase, "flujo de misiones")
  }
  return frases
}

export type OracionDelGuion = { idioma: Idioma; oracion: string; clave: string; de: string }

/** Las oraciones que hay que tener grabadas (cada una, una sola vez aunque aparezca en varias frases). */
export function oracionesDelGuion(): OracionDelGuion[] {
  const vistas = new Map<string, OracionDelGuion>()
  for (const f of frasesDelGuion()) {
    if (f.sinTraducir) continue
    for (const oracion of enOraciones(f.frase)) {
      const clave = claveDe(f.idioma, oracion)
      if (!vistas.has(clave)) vistas.set(clave, { idioma: f.idioma, oracion, clave, de: f.de })
    }
  }
  return [...vistas.values()]
}
