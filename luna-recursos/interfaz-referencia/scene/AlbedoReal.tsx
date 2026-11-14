import { useEffect } from 'react'
import { Color, DataTexture, DataUtils, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat } from 'three'
import urlAlbedo from '../data/albedo-apollo17.u16?url'
import { SUPERFICIE } from '../engine/environment'
import { MATERIAL_TERRENO } from './materiales'

/**
 * E15.1: albedo real del sitio como textura del terreno. Viene de la ortofoto LROC NAC normalizada por la iluminación de la
 * toma (scripts/albedo-orto.ts): conserva las variaciones reales (el LM, las huellas, el halo del chorro del motor) con
 * media 0,085. Con la casilla apagada, el regolito vuelve al gris uniforme de 0,085.
 */
let textura: DataTexture | null = null
let cargando: Promise<DataTexture> | null = null

function cargar(): Promise<DataTexture> {
  cargando ??= fetch(urlAlbedo)
    .then((r) => r.arrayBuffer())
    .then((b) => {
      const datos = new Uint16Array(b)
      const n = Math.round(Math.sqrt(datos.length))
      const rgba = new Uint16Array(n * n * 4)
      for (let i = 0; i < n * n; i++) {
        const h = DataUtils.toHalfFloat(datos[i] / 10000)
        rgba[4 * i] = h
        rgba[4 * i + 1] = h
        rgba[4 * i + 2] = h
        rgba[4 * i + 3] = DataUtils.toHalfFloat(1)
      }
      const t = new DataTexture(rgba, n, n, RGBAFormat, HalfFloatType)
      t.colorSpace = LinearSRGBColorSpace
      t.magFilter = LinearFilter
      t.minFilter = LinearFilter
      t.needsUpdate = true
      textura = t
      return t
    })
  return cargando
}

const GRIS = new Color().setRGB(SUPERFICIE.albedo, SUPERFICIE.albedo, SUPERFICIE.albedo, LinearSRGBColorSpace)
const BLANCO = new Color(1, 1, 1)

function aplicar(activo: boolean) {
  const usarMapa = activo && textura !== null
  if ((MATERIAL_TERRENO.map !== null) !== usarMapa) MATERIAL_TERRENO.needsUpdate = true
  MATERIAL_TERRENO.map = usarMapa ? textura : null
  MATERIAL_TERRENO.color.copy(usarMapa ? BLANCO : GRIS)
}

export function AlbedoReal({ activo }: { activo: boolean }) {
  useEffect(() => {
    let vivo = true
    if (activo) void cargar().then(() => vivo && aplicar(true))
    else aplicar(false)
    return () => {
      vivo = false
    }
  }, [activo])
  return null
}
