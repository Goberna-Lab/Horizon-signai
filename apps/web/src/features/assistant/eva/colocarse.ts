// Dónde se pone EVA para apuntar a una parte de la pantalla y hacia qué lado abre su globo. Regla pura, con prueba.
//
// Lo que se busca, en este orden: que quede al lado de la parte, con aire entre las dos para que el rayo se vea; que
// su globo se abra hacia el lado contrario, para no tapar lo que señala; y que nada se salga de la ventana. Las
// medidas con que se probó son las del planificador (prototipos/lunar-map/index.html) a 1440×900 y 1280×720: una
// columna a cada lado, el mapa al centro y la línea de tiempo abajo.

export type Caja = { left: number; top: number; right: number; bottom: number }
export type Sitio = {
  /** Esquina de arriba a la izquierda de EVA. */
  x: number
  y: number
  /** Hacia qué lado de EVA se abre el globo. */
  globo: "derecha" | "izquierda"
}

const MARGEN = 16
/** Ancho máximo del globo (eva.css: 320 px) más un respiro. */
const GLOBO = 328
/** El globo nace a esta fracción del ancho de EVA, medida desde el lado contrario (eva.css: `right: 78%`). */
const ARRANQUE = 0.78

const acotar = (v: number, a: number, b: number) => Math.max(a, Math.min(Math.max(a, b), v))

/**
 * @param r      la parte a la que apunta, en la ventana
 * @param vista  tamaño de la ventana
 * @param eva    tamaño de EVA
 * @param aire   separación entre EVA y la parte (lo que mide el rayo cuando queda al lado)
 */
export function dondePonerse(r: Caja, vista: { ancho: number; alto: number }, eva: { ancho: number; alto: number }, aire: number): Sitio {
  const yLado = acotar(r.top + Math.min(r.bottom - r.top, 260) / 2 - eva.alto / 2, MARGEN, vista.alto - eva.alto - MARGEN)
  const sitioDer = vista.ancho - r.right
  const sitioIzq = r.left
  const der = {
    x: r.right + aire,
    cabe: r.right + aire + eva.ancho + MARGEN <= vista.ancho,
    // con ella a la derecha, el globo se aleja abriéndose a la derecha
    globoLejos: r.right + aire + eva.ancho * ARRANQUE + GLOBO <= vista.ancho,
  }
  const izq = {
    x: r.left - aire - eva.ancho,
    cabe: r.left - aire - eva.ancho >= MARGEN,
    globoLejos: r.left - aire - eva.ancho * ARRANQUE - GLOBO >= 0,
  }
  const aLaDerecha = (): Sitio => ({ x: der.x, y: yLado, globo: der.globoLejos ? "derecha" : "izquierda" })
  const aLaIzquierda = (): Sitio => ({ x: izq.x, y: yLado, globo: izq.globoLejos ? "izquierda" : "derecha" })

  const bienDer = der.cabe && der.globoLejos
  const bienIzq = izq.cabe && izq.globoLejos
  if (bienDer && bienIzq) return sitioDer >= sitioIzq ? aLaDerecha() : aLaIzquierda()
  if (bienDer) return aLaDerecha()
  if (bienIzq) return aLaIzquierda()
  // Cabe ella pero no su globo del lado contrario (la parte es ancha): al lado con más sitio; el globo irá hacia la parte.
  if (der.cabe && izq.cabe) return sitioDer >= sitioIzq ? aLaDerecha() : aLaIzquierda()
  if (der.cabe) return aLaDerecha()
  if (izq.cabe) return aLaIzquierda()

  // No cabe a ningún lado (la parte ocupa casi todo el ancho, o es un teléfono): encima, debajo o, si no, sobre su borde.
  const x = acotar((r.left + r.right) / 2 - eva.ancho / 2, MARGEN, vista.ancho - eva.ancho - MARGEN)
  const globo = x + eva.ancho / 2 < vista.ancho / 2 ? "derecha" : "izquierda"
  const encima = r.top - aire * 0.6 - eva.alto
  if (encima >= MARGEN) return { x, y: encima, globo }
  const debajo = r.bottom + aire * 0.6
  if (debajo + eva.alto + MARGEN <= vista.alto) return { x, y: debajo, globo }
  return { x: acotar(r.right - eva.ancho, MARGEN, vista.ancho - eva.ancho - MARGEN), y: yLado, globo }
}
