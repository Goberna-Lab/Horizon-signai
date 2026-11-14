import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, type BufferAttribute } from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { fijarPuntoSobreTerreno } from './sobreTerreno'
import { MATERIAL_TERRENO } from './materiales'
import { CUADRICULA } from '../engine/environment'
import { LADO_ESTE_M, LADO_NORTE_M, MUESTRAS, alturaMuestra, alturaSuelo, posicionMuestra } from '../engine/terreno'

/** Geometría del relieve (estática): una muestra del DTM por vértice, con el atributo `rebote` (E11). */
let geometriaTerreno: BufferGeometry | null = null
/** Último arreglo de rebote subido a la GPU (para no subirlo en cada cuadro). */
let reboteAplicado: Float32Array | null = null
function obtenerGeometria(): BufferGeometry {
  if (geometriaTerreno) return geometriaTerreno
  const posiciones: number[] = []
  for (let f = 0; f < MUESTRAS; f++) {
    for (let c = 0; c < MUESTRAS; c++) {
      const [x, z] = posicionMuestra(f, c)
      posiciones.push(x, alturaMuestra(f, c), z)
    }
  }
  const indices: number[] = []
  for (let f = 0; f < MUESTRAS - 1; f++) {
    for (let c = 0; c < MUESTRAS - 1; c++) {
      const a = f * MUESTRAS + c
      const b = a + 1
      const d = a + MUESTRAS
      const e = d + 1
      // Triángulos con normal hacia +Y (filas hacia el sur = +Z, columnas hacia el este = +X).
      indices.push(a, d, b, b, d, e)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3))
  g.setAttribute('rebote', new Float32BufferAttribute(new Float32Array(MUESTRAS * MUESTRAS), 1))
  // E15.1: coordenadas de textura del mapa de albedo (filas de norte a sur, como el DTM y la textura).
  const uv: number[] = []
  for (let f = 0; f < MUESTRAS; f++) for (let c = 0; c < MUESTRAS; c++) uv.push(c / (MUESTRAS - 1), f / (MUESTRAS - 1))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  geometriaTerreno = g
  return g
}

/**
 * ENV-008: malla del relieve real (NAC DTM de LROC, 2 m/píxel), una muestra por vértice.
 * Proyecta y recibe sombras (ENV-003): el borde de un cráter sombrea su interior.
 * ENV-009 (E11): `rebote` es la irradiancia de un rebote por vértice (motor, unidades "Sol = 1 a 1 UA").
 */
export function Terreno(props: { rebote: Float32Array; alClic: (e: ThreeEvent<MouseEvent>) => void }) {
  const geometria = obtenerGeometria()
  useFrame(() => {
    const atributo = geometria.getAttribute('rebote') as BufferAttribute
    if (reboteAplicado !== props.rebote) {
      ;(atributo.array as Float32Array).set(props.rebote)
      atributo.needsUpdate = true
      reboteAplicado = props.rebote
    }
  })
  return (
    <mesh
      geometry={geometria}
      material={MATERIAL_TERRENO}
      castShadow
      receiveShadow
      onClick={props.alClic}
      onPointerMove={(e) => fijarPuntoSobreTerreno({ x: e.point.x, z: e.point.z, pantallaX: e.nativeEvent.clientX, pantallaY: e.nativeEvent.clientY })}
      onPointerOut={() => fijarPuntoSobreTerreno(null)}
    >
      {/* ENV-009 (E8): lambertiano de verdad (sin el especular GGX de meshStandardMaterial); E11: más el rebote. */}
    </mesh>
  )
}

/** Separación de la cuadrícula sobre el suelo, para que no se mezcle con él (ENV-006). */
const SOBRE_SUELO_M = 0.05

/** Líneas de la cuadrícula cada `paso` metros, siguiendo el relieve con muestras cada 1 m. */
function lineasCuadricula(paso: number): BufferGeometry {
  const v: number[] = []
  const medioX = LADO_ESTE_M / 2
  const medioZ = LADO_NORTE_M / 2
  const tramo = 1
  for (let x = -Math.floor(medioX / paso) * paso; x <= medioX + 1e-6; x += paso) {
    for (let z = -medioZ; z < medioZ - 1e-6; z += tramo) {
      const z2 = Math.min(z + tramo, medioZ)
      v.push(x, alturaSuelo(x, z) + SOBRE_SUELO_M, z, x, alturaSuelo(x, z2) + SOBRE_SUELO_M, z2)
    }
  }
  for (let z = -Math.floor(medioZ / paso) * paso; z <= medioZ + 1e-6; z += paso) {
    for (let x = -medioX; x < medioX - 1e-6; x += tramo) {
      const x2 = Math.min(x + tramo, medioX)
      v.push(x, alturaSuelo(x, z) + SOBRE_SUELO_M, z, x2, alturaSuelo(x2, z) + SOBRE_SUELO_M, z)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  return g
}

/**
 * ENV-004 / ENV-006: cuadrícula de 1 m y 10 m que sigue el relieve. Es una ayuda de medición, no física:
 * no recibe luz, sombra ni exposición. Las distancias son horizontales (en planta).
 */
export function CuadriculaTerreno() {
  const menor = useMemo(() => lineasCuadricula(CUADRICULA.pasoMenorM), [])
  const mayor = useMemo(() => lineasCuadricula(CUADRICULA.pasoMayorM), [])
  return (
    <>
      <lineSegments geometry={menor}>
        <lineBasicMaterial color="#3a3a3a" toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={mayor}>
        <lineBasicMaterial color="#7a7a7a" toneMapped={false} />
      </lineSegments>
    </>
  )
}
