import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { alturaSuelo, dentroDelTerreno } from '../engine/terreno'

/**
 * E15.4: cámara a la altura de los ojos de una persona sobre el relieve real. Altura de los ojos 1,7 m (supuesto).
 * Se mira alrededor arrastrando (OrbitControls girando sobre un punto 1 cm adelante) y se camina con W/A/S/D o las
 * flechas a 1,5 m/s (supuesto), siempre a 1,7 m sobre el suelo. El inicio es 25 m al sur del poste, mirándolo.
 */
export const ALTURA_OJOS_M = 1.7
const VELOCIDAD_M_S = 1.5
const INICIO: [number, number] = [0, 25]

const teclas = new Set<string>()
const adelante = new Vector3()
const lado = new Vector3()

export function ControlAstronauta() {
  const iniciado = useRef(false)
  useEffect(() => {
    const abajo = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return
      teclas.add(e.key.toLowerCase())
    }
    const arriba = (e: KeyboardEvent) => teclas.delete(e.key.toLowerCase())
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    return () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
      teclas.clear()
    }
  }, [])

  useFrame((state, dt) => {
    const controles = state.controls as unknown as OrbitControlsImpl | null
    if (!controles) return
    const cam = state.camera
    if (!iniciado.current) {
      const [x, z] = INICIO
      cam.position.set(x, alturaSuelo(x, z) + ALTURA_OJOS_M, z)
      controles.target.set(0, alturaSuelo(0, 0) + ALTURA_OJOS_M, 0)
      // Se acerca el objetivo a 1 cm del ojo: girar los controles equivale a mirar alrededor.
      adelante.subVectors(controles.target, cam.position).normalize()
      controles.target.copy(cam.position).addScaledVector(adelante, 0.01)
      controles.update()
      iniciado.current = true
    }
    adelante.subVectors(controles.target, cam.position)
    adelante.y = 0
    if (adelante.lengthSq() < 1e-12) return
    adelante.normalize()
    lado.set(-adelante.z, 0, adelante.x)
    let dx = 0
    let dz = 0
    const paso = VELOCIDAD_M_S * Math.min(dt, 0.1)
    if (teclas.has('w') || teclas.has('arrowup')) { dx += adelante.x * paso; dz += adelante.z * paso }
    if (teclas.has('s') || teclas.has('arrowdown')) { dx -= adelante.x * paso; dz -= adelante.z * paso }
    if (teclas.has('d') || teclas.has('arrowright')) { dx += lado.x * paso; dz += lado.z * paso }
    if (teclas.has('a') || teclas.has('arrowleft')) { dx -= lado.x * paso; dz -= lado.z * paso }
    const nx = cam.position.x + dx
    const nz = cam.position.z + dz
    if (!dentroDelTerreno(nx, nz)) return
    const dy = alturaSuelo(nx, nz) + ALTURA_OJOS_M - cam.position.y
    cam.position.set(nx, cam.position.y + dy, nz)
    controles.target.x += dx
    controles.target.y += dy
    controles.target.z += dz
  })
  return null
}
