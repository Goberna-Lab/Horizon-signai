// E20: sitios del motor. El sitio activo se elige al arrancar (parámetro ?sitio= de la página, o LUNA_SITIO en las
// pruebas y los scripts) y los módulos del motor cargan los datos de ese sitio antes de exportar nada, así que el motor
// sigue siendo puro y síncrono. Cambiar de sitio recarga la página (decisión de Estephano, 2026-11-06).

export type IdSitio = 'apollo17' | 'connecting-ridge'

export type DefinicionSitio = {
  id: IdSitio
  nombre: string
  latitudGrados: number
  longitudEsteGrados: number
  fuenteCoordenadas: string
  /**
   * Cómo se cortan los días lunares (E18/E20): 'salida' = de una salida astronómica del Sol a la siguiente; 'medianoche'
   * = de un paso del Sol por el antimeridiano al siguiente (FA cap. 11.4, pp. 252–254), para sitios polares donde el Sol
   * puede no salir ni ponerse en meses.
   */
  definicionDia: 'salida' | 'medianoche'
  /** Reflectancia lambertiana del regolito del sitio (ENV-009). */
  albedo: number
  fuenteAlbedo: string
  /** Textos cortos para la interfaz: de dónde salen el relieve local, el horizonte y el valle, y qué es el punto central. */
  textos: { relieve: string; horizonte: string; valle: string; centro: string }
  /** Datos que solo existen para algunos sitios. */
  tieneOrtofoto: boolean
  tieneHapkeWac: boolean
  tieneEquipos: boolean
}

export const SITIOS: Record<IdSitio, DefinicionSitio> = {
  apollo17: {
    id: 'apollo17',
    nombre: 'Apollo 17 (Taurus-Littrow)',
    latitudGrados: 20.1911,
    longitudEsteGrados: 30.7723,
    fuenteCoordenadas: 'LROC, "Coordinates of Lunar Anthropogenic Targets" (2016); Wagner et al., Icarus 283 (2017)',
    definicionDia: 'salida',
    albedo: 0.085,
    fuenteAlbedo: 'mar con manto oscuro: LSB p. 631, p. 59 (7–10 %), fig. 7.10 p. 308 (E8)',
    textos: {
      relieve: 'DTM NAC de LROC, 2 m',
      horizonte: 'macizos, SLDEM2015',
      valle: 'SLDEM2015 cada 125 m hasta 25 km; albedo por altura (0,085 → 0,15, transición supuesta)',
      centro: 'sitio real del LM (LROC)',
    },
    tieneOrtofoto: true,
    tieneHapkeWac: true,
    tieneEquipos: true,
  },
  'connecting-ridge': {
    id: 'connecting-ridge',
    nombre: 'Polo sur: Connecting Ridge',
    // Centro del mosaico de 5 m de PGDA Site01 (x = −11 000 m, y = −12 000 m en estereográfica polar sur con
    // R = 1737,4 km y escala 1 en el polo; etiqueta GeoTIFF del producto): ρ = 16 278,8 m.
    latitudGrados: -89.46316,
    longitudEsteGrados: 222.5104,
    fuenteCoordenadas:
      'Centro del DTM de 5 m de LOLA "Site01: Connecting ridge" (PGDA, Barker et al. 2021, Planet. Space Sci. 203, 105119); numeración de Mazarico et al. 2011',
    definicionDia: 'medianoche',
    // Supuesto (aprobado por Estephano el 2026-11-06): tierras altas, 11–18 % (LSB A3.2, p. 59); sin medición propia del sitio.
    albedo: 0.15,
    fuenteAlbedo: 'tierras altas, 11–18 % (LSB p. 59); supuesto para el sitio',
    textos: {
      relieve: 'DTM LOLA de 5 m (PGDA), remuestreado a 2 m',
      horizonte: 'LOLA 5 m (PGDA) y LDEM_75S_120M hasta 150 km',
      valle: 'LOLA 5 m (PGDA) y LDEM_75S_120M cada 125 m hasta 25 km; albedo 0,15 (supuesto)',
      centro: 'centro del sitio (mosaico de PGDA)',
    },
    tieneOrtofoto: false,
    tieneHapkeWac: false,
    tieneEquipos: false,
  },
}

function leerIdSitio(): IdSitio {
  let id: string | null | undefined
  if (typeof location !== 'undefined') id = new URLSearchParams(location.search).get('sitio')
  if (!id) id = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LUNA_SITIO
  return id && id in SITIOS ? (id as IdSitio) : 'apollo17'
}

/** Sitio activo de esta sesión. */
export const SITIO_ACTIVO: DefinicionSitio = SITIOS[leerIdSitio()]
