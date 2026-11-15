// El idioma de toda la aplicación: inglés (por defecto; la entrega de Space Apps lo exige) o español.
//
// - Una sola preferencia: localStorage «horizon-signai.lang» («en» o «es»). La leen también las páginas del planificador
//   (prototipos/lunar-map/i18n.js) y el mapa 3D (apps/web/scripts/mapa-3d/mapa.src.html), que van en un iframe del
//   mismo origen. «?lang=es» en la dirección también la fija.
// - Se lee una vez, al cargar. Cambiar de idioma recarga la página (`setLang`): así cada texto se elige al construirse,
//   con `tr("English", "Español")`, sin contexto de React ni textos que se queden en el idioma anterior.
// - Si el cambio viene de otra pantalla (un iframe, otra pestaña), el aviso «storage» también recarga.
// - Sin navegador (las pruebas con node) el idioma es inglés.
//
// Este módulo no importa nada, para que cualquier archivo (también los que cargan las pruebas con node) pueda
// importarlo por ruta relativa con la extensión `.ts`.

export type Lang = "en" | "es"

const KEY = "horizon-signai.lang"

function read(): Lang {
  if (typeof window === "undefined") return "en"
  try {
    const asked = new URLSearchParams(window.location.search).get("lang")
    if (asked === "en" || asked === "es") {
      window.localStorage.setItem(KEY, asked)
      return asked
    }
    return window.localStorage.getItem(KEY) === "es" ? "es" : "en"
  } catch {
    return "en"
  }
}

/** El idioma de esta carga de la página. */
export const lang: Lang = read()

/** El texto en el idioma de la página: `tr("Open the planner", "Abrir el planificador")`. Vale para cualquier valor, no solo cadenas. */
export const tr = <T>(en: T, es: T): T => (lang === "es" ? es : en)

/**
 * Cambia el idioma de toda la aplicación y recarga la página. Elegir el idioma que ya está lo guarda como elegido,
 * sin recargar.
 */
export function setLang(next: Lang) {
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    return // sin almacenamiento no hay preferencia que recordar
  }
  if (next === lang) return
  // Si la dirección traía `?lang=`, se quita: si no, al recargar volvería a mandar ella.
  const url = new URL(window.location.href)
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang")
    window.location.replace(url.toString())
  } else window.location.reload()
}

if (typeof window !== "undefined") {
  document.documentElement.lang = lang
  window.addEventListener("storage", (event) => {
    if (event.key === KEY && (event.newValue === "es" ? "es" : "en") !== lang) window.location.reload()
  })
}
