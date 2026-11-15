/**
 * Las paradas del vuelo, una por escena de `content.ts` y en el mismo orden.
 *
 * Los días cuentan desde el 2026-12-01 00:00 UTC, el día lunar del ejemplo del SPEC E23. Están elegidos sobre las
 * efemérides reales: el Sol sale en Connecting Ridge el día 3,4 y se pone el 20,1; la Tierra se ve allí entre el
 * 17,4 y el 23,2. El rumbo de cada parada mira hacia el cuerpo del que habla la escena, y la cámara vuela baja
 * para que el Sol y la Tierra se vean donde están: pegados al horizonte.
 */
import type { Stop } from "./engine/story"

/** Sitio destacado en la proyección (km): centro del mosaico de Connecting Ridge. */
export const FEATURED_SITE: [number, number] = [-11, -12]

export const STOPS: Stop[] = [
  // La lámina completa, vista desde arriba: 0° E (la Tierra) hacia arriba.
  { at: [0, 0], lift: 0, bearing: 0, tilt: 0, distance: 2600, frameKm: 392, fov: 9.6, shift: [0.2, 0], day: 3, earth: 0, ring: 0 },
  // Sol rasante: la cámara baja al polo y mira hacia el Sol.
  { at: [-6, -16], lift: 0, bearing: 207, tilt: 85, distance: 34, fov: 44, shift: [0.1, 0.1], day: 6, earth: 0, ring: 0, arc: 0.22 },
  // Connecting Ridge con el Sol alto en su horizonte.
  { at: [-11, -12], lift: 0, bearing: 300, tilt: 64, distance: 30, fov: 36, shift: [0.14, 0], day: 11, earth: 0, ring: 1, arc: 0.3 },
  // Giro hacia la Tierra, que asoma sobre el relieve a 0° E.
  { at: [-11, -12], lift: 0, bearing: 353, tilt: 85, distance: 30, fov: 48, shift: [0.1, 0.1], day: 18.2, earth: 1, ring: 1 },
  // De vuelta a la lámina para comparar sitios.
  { at: [0, 0], lift: 0, bearing: 0, tilt: 0, distance: 1500, frameKm: 392, fov: 12, shift: [0.2, 0], day: 26, earth: 0, ring: 0 },
]
