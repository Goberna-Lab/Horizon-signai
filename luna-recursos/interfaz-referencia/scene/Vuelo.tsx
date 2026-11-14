// E26.3: el descenso del LM en la escena 3D. El LM recorre la trayectoria del motor (src/engine/descenso.ts) llevada al
// sitio con el rumbo de la regla del Apollo; la línea de la trayectoria usa los mismos colores por fase que el perfil del
// panel (Data Brushing, DI pp. 459–460: el mismo tono en todas las vistas enlazadas). La cámara puede seguir al LM.
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { ModuloLunar } from './Equipos'
import type { Fase } from '../engine/descenso'
import { COLOR_FASE } from './colores'

export type Vuelo = {
  /** Posición del LM en la escena: base de sus patas (m). */
  posicion: [number, number, number]
  inclinacionGrados: number
  rumboGrados: number
  trayectoria: Array<{ p: [number, number, number]; fase: Fase }>
  persecucion: boolean
}

const RAD = Math.PI / 180

function Trayectoria({ puntos }: { puntos: Vuelo['trayectoria'] }) {
  const geometrias = useMemo(() => {
    const porFase = new Map<Fase, number[]>()
    puntos.forEach((q, i) => {
      if (i === 0) return
      const a = puntos[i - 1]
      const lista = porFase.get(q.fase) ?? []
      lista.push(...a.p, ...q.p)
      porFase.set(q.fase, lista)
    })
    return [...porFase].map(([fase, v]) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(v, 3))
      return { fase, g }
    })
  }, [puntos])
  return (
    <>
      {geometrias.map(({ fase, g }) => (
        <lineSegments key={fase} geometry={g}>
          {/* ENV-006: ayuda de lectura, no física (no recibe luz). */}
          <lineBasicMaterial color={COLOR_FASE[fase]} toneMapped={false} />
        </lineSegments>
      ))}
    </>
  )
}

/** Cámara detrás y por encima del LM, mirando hacia adelante y abajo. */
function CamaraPersecucion({ objetivo, rumboGrados }: { objetivo: [number, number, number]; rumboGrados: number }) {
  const { camera } = useThree()
  const destino = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const a = rumboGrados * RAD
    // Detrás del LM (opuesto al rumbo) a 60 m y 20 m más arriba; en ejes de la escena el norte es −Z.
    destino.set(objetivo[0] - Math.sin(a) * 60, objetivo[1] + 20, objetivo[2] + Math.cos(a) * 60)
    camera.position.lerp(destino, 0.2)
    camera.lookAt(objetivo[0] + Math.sin(a) * 40, objetivo[1] - 10, objetivo[2] - Math.cos(a) * 40)
  })
  return null
}

export function VueloLM({ vuelo }: { vuelo: Vuelo }) {
  const a = vuelo.rumboGrados * RAD
  // El LM mira hacia donde vuela y se inclina hacia atrás para frenar (empuje hacia adelante): giro sobre su eje lateral.
  return (
    <>
      <Trayectoria puntos={vuelo.trayectoria} />
      {/* +Z del modelo (la escalera) hacia el rumbo: girar +Z a (sin a, 0, −cos a) es rotar π − a sobre Y. */}
      <group position={vuelo.posicion} rotation={[0, Math.PI - a, 0]}>
        <group rotation={[-vuelo.inclinacionGrados * RAD, 0, 0]}>
          <ModuloLunar x={0} z={0} enVuelo />
        </group>
      </group>
      {vuelo.persecucion && <CamaraPersecucion objetivo={vuelo.posicion} rumboGrados={vuelo.rumboGrados} />}
    </>
  )
}
