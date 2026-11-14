import { useMemo } from 'react'
import { Color, IcosahedronGeometry, InstancedMesh, LinearSRGBColorSpace, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three'
import { generador } from '../engine/montecarlo'
import { alturaSuelo } from '../engine/terreno'

/**
 * E15.2: rocas sintéticas pequeñas (5–40 cm) alrededor del sitio, SOLO visuales: el motor no las conoce, así que no
 * entran en las mediciones. Supuestos sin fuente en nuestros libros: cantidad (1500 en 80 m), ley de tamaños
 * P(D > d) ∝ d^(−2,5), semienterradas un 25 %, albedo 0,12. El LSB solo describe campos de bloques en el borde de
 * cráteres jóvenes y en los macizos (pp. 29, 31). Posiciones con un generador de semilla fija: siempre las mismas.
 */
const CANTIDAD = 1500
const RADIO_M = 80
const D_MIN = 0.05
const D_MAX = 0.4
const EXPONENTE = 2.5

const MATERIAL_ROCA = new MeshLambertMaterial({ color: new Color().setRGB(0.12, 0.12, 0.12, LinearSRGBColorSpace) })

export function Rocas() {
  const malla = useMemo(() => {
    const geometria = new IcosahedronGeometry(0.5, 1)
    const m = new InstancedMesh(geometria, MATERIAL_ROCA, CANTIDAD)
    const azar = generador(2026)
    const matriz = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const escala = new Vector3()
    const pos = new Vector3()
    let k = 0
    while (k < CANTIDAD) {
      const r = RADIO_M * Math.sqrt(azar())
      const a = 2 * Math.PI * azar()
      const x = r * Math.cos(a)
      const z = r * Math.sin(a)
      if (r < 3) continue // fuera del pie del poste y del LM
      // Ley de potencias truncada por inversión: D = (Dmin^−b − u·(Dmin^−b − Dmax^−b))^(−1/b).
      const u = azar()
      const D = Math.pow(Math.pow(D_MIN, -EXPONENTE) - u * (Math.pow(D_MIN, -EXPONENTE) - Math.pow(D_MAX, -EXPONENTE)), -1 / EXPONENTE)
      escala.set(D * (0.8 + 0.4 * azar()), D * (0.5 + 0.3 * azar()), D * (0.8 + 0.4 * azar()))
      pos.set(x, alturaSuelo(x, z) + escala.y * 0.25, z)
      q.setFromEuler(e.set(azar() * 0.6, azar() * Math.PI * 2, azar() * 0.6))
      m.setMatrixAt(k, matriz.compose(pos, q, escala))
      k++
    }
    m.instanceMatrix.needsUpdate = true
    m.castShadow = true
    m.receiveShadow = false
    return m
  }, [])
  return <primitive object={malla} />
}
