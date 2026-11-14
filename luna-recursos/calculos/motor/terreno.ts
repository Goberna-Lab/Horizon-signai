// ENV-008: el suelo no es plano. Relieve real alrededor del módulo lunar del Apollo 17, recortado del
// NAC DTM de LROC (2 m/píxel) por scripts/dtm.ts. Funciones puras, sin React ni three.
//
// Ejes de la escena (ENV-004): +X este, −Z norte, +Y arriba; 1 unidad = 1 m. El origen es el módulo lunar
// y la altura 0 es la del DTM en ese punto. Simplificación: se ignora la curvatura lunar (en 200 m el suelo
// cae 200²/(2·1 737 400) ≈ 1,2 cm respecto del plano tangente). Radio 1737,4 km: el de la esfera de referencia
// del DTM y de Horizons (LSB tabla 3.1, p. 28, da 1738 km; FA tabla B.1, p. 671, da 1737,1 km).
import { SITIO_ACTIVO } from './sitio'

// E20: relieve del sitio activo (src/data/relieve-<sitio>.json).
type Relieve = typeof import('../data/relieve-apollo17.json')
const relieve: Relieve = (await import(`../data/relieve-${SITIO_ACTIVO.id}.json`)).default

/** Muestras por lado (201) y paso entre muestras (m). */
export const MUESTRAS = relieve.muestras
export const PASO_ESTE_M = relieve.pasoEsteM
export const PASO_NORTE_M = relieve.pasoNorteM
export const CENTRO_RELIEVE = relieve.centro
export const PROCEDENCIA_RELIEVE = relieve.procedencia

const MEDIO = (MUESTRAS - 1) / 2
const ALTURA_CENTRO = relieve.alturasM[MEDIO * MUESTRAS + MEDIO]

/** Alturas relativas al centro, filas de norte a sur y columnas de oeste a este. */
const ALTURAS = Float32Array.from(relieve.alturasM, (h) => h - ALTURA_CENTRO)

/** Lado del terreno en metros (este-oeste y norte-sur). */
export const LADO_ESTE_M = (MUESTRAS - 1) * PASO_ESTE_M
export const LADO_NORTE_M = (MUESTRAS - 1) * PASO_NORTE_M

/** Altura mínima y máxima del terreno relativas al centro. */
export const ALTURA_MIN_M = ALTURAS.reduce((a, b) => Math.min(a, b), Infinity)
export const ALTURA_MAX_M = ALTURAS.reduce((a, b) => Math.max(a, b), -Infinity)

/** Altura de la muestra (fila, columna), con las coordenadas limitadas al borde. */
export function alturaMuestra(fila: number, columna: number): number {
  const f = Math.min(Math.max(fila, 0), MUESTRAS - 1)
  const c = Math.min(Math.max(columna, 0), MUESTRAS - 1)
  return ALTURAS[f * MUESTRAS + c]
}

/** Posición (x, z) de la muestra (fila, columna) en la escena. */
export function posicionMuestra(fila: number, columna: number): [number, number] {
  return [(columna - MEDIO) * PASO_ESTE_M, (fila - MEDIO) * PASO_NORTE_M]
}

/** true si (x, z) cae dentro del terreno cargado. */
export function dentroDelTerreno(x: number, z: number): boolean {
  return Math.abs(x) <= LADO_ESTE_M / 2 && Math.abs(z) <= LADO_NORTE_M / 2
}

/**
 * Altura del suelo en (x, z), interpolada bilinealmente entre las cuatro muestras vecinas.
 * Fuera del terreno usa el borde más cercano.
 */
export function alturaSuelo(x: number, z: number): number {
  const c = x / PASO_ESTE_M + MEDIO
  const f = z / PASO_NORTE_M + MEDIO
  const c0 = Math.floor(c)
  const f0 = Math.floor(f)
  const tc = c - c0
  const tf = f - f0
  const h00 = alturaMuestra(f0, c0)
  const h01 = alturaMuestra(f0, c0 + 1)
  const h10 = alturaMuestra(f0 + 1, c0)
  const h11 = alturaMuestra(f0 + 1, c0 + 1)
  return (h00 * (1 - tc) + h01 * tc) * (1 - tf) + (h10 * (1 - tc) + h11 * tc) * tf
}

/** Pendiente del suelo en grados en (x, z), por diferencias centradas a un paso de distancia. */
export function pendienteGrados(x: number, z: number): number {
  const dx = (alturaSuelo(x + PASO_ESTE_M, z) - alturaSuelo(x - PASO_ESTE_M, z)) / (2 * PASO_ESTE_M)
  const dz = (alturaSuelo(x, z + PASO_NORTE_M) - alturaSuelo(x, z - PASO_NORTE_M)) / (2 * PASO_NORTE_M)
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI
}

/**
 * ENV-008: dónde toca el suelo real el rayo de sombra que pasa por el borde lejano de la tapa del poste.
 * El poste (altura h, radio r) está en el origen, con su base a la altura del suelo ahí. El rayo baja con
 * pendiente tan(α) a lo largo de la dirección horizontal de la sombra (sx, sz). Se avanza en pasos de
 * 5 cm hasta que el suelo queda por encima del rayo y se refina por bisección.
 * Devuelve la distancia horizontal desde el BORDE del poste (como longitudSombra en suelo plano), o
 * Infinity si el rayo sale del terreno sin tocarlo.
 */
export function largoSombraSobreTerreno(
  alturaM: number,
  radioM: number,
  elevacionGrados: number,
  sx: number,
  sz: number,
): number {
  if (elevacionGrados <= 1e-6) return Infinity
  const tanAlfa = Math.tan((elevacionGrados * Math.PI) / 180)
  const base = alturaSuelo(0, 0)
  // d = distancia horizontal desde el borde del poste; el rayo arranca en el borde de la tapa.
  const sobreSuelo = (d: number) => {
    const x = sx * (radioM + d)
    const z = sz * (radioM + d)
    return base + alturaM - d * tanAlfa - alturaSuelo(x, z)
  }
  const PASO = 0.05
  let anterior = 0
  for (let d = PASO; ; d += PASO) {
    const x = sx * (radioM + d)
    const z = sz * (radioM + d)
    if (!dentroDelTerreno(x, z)) return Infinity
    if (sobreSuelo(d) <= 0) {
      let bajo = anterior
      let alto = d
      for (let i = 0; i < 40; i++) {
        const medio = (bajo + alto) / 2
        if (sobreSuelo(medio) > 0) bajo = medio
        else alto = medio
      }
      return alto
    }
    anterior = d
  }
}

/** Límites de la sombra del poste sobre el terreno real (distancias horizontales desde el borde del poste). */
export type LimitesSombraTerreno = {
  /** Sombra del centro del disco solar sobre el terreno real. */
  centroM: number
  finNucleoM: number
  finPenumbraM: number
  anchoPenumbraM: number
  /** Desnivel del suelo en la punta respecto de la base del poste (+ = más alto). */
  desnivelPuntaM: number
}

/**
 * ENV-007 + ENV-008: como limitesSombra (suelo plano), pero cada borde se busca donde el rayo correspondiente
 * toca el terreno real: centro con α, fin del núcleo con α + θ/2, fin de la penumbra con α − θ/2.
 * El núcleo también termina donde el poste (diámetro D) deja de tapar el disco: a una distancia d₀ = D/θ a lo
 * largo del rayo, o sea d₀·cos α − r en horizontal (no depende del suelo).
 */
export function limitesSombraSobreTerreno(
  alturaM: number,
  diametroPosteM: number,
  elevacionGrados: number,
  diametroAngularGrados: number,
  sx: number,
  sz: number,
): LimitesSombraTerreno {
  const r = diametroPosteM / 2
  const semi = diametroAngularGrados / 2
  const centroM = largoSombraSobreTerreno(alturaM, r, elevacionGrados, sx, sz)
  const nucleoTapa = elevacionGrados + semi >= 90 ? 0 : largoSombraSobreTerreno(alturaM, r, elevacionGrados + semi, sx, sz)
  const finPenumbraM = elevacionGrados - semi > 1e-6 ? largoSombraSobreTerreno(alturaM, r, elevacionGrados - semi, sx, sz) : Infinity
  const thetaRad = (diametroAngularGrados * Math.PI) / 180
  const nucleoAncho = (diametroPosteM / thetaRad) * Math.cos((elevacionGrados * Math.PI) / 180) - r
  const finNucleoM = nucleoAncho > 0 ? Math.min(nucleoTapa, nucleoAncho) : nucleoTapa
  const desnivelPuntaM = Number.isFinite(centroM) ? alturaSuelo(sx * (r + centroM), sz * (r + centroM)) - alturaSuelo(0, 0) : NaN
  return { centroM, finNucleoM, finPenumbraM, anchoPenumbraM: finPenumbraM - nucleoTapa, desnivelPuntaM }
}
