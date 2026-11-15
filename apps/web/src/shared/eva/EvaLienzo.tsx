import { Canvas } from "@react-three/fiber"
import type { RefObject } from "react"
import { NeutralToneMapping } from "three"
import { CAMARA_EVA, EvaModelo, type EstadoEva, type VisorEva } from "./EvaModelo"

type Props = {
  estado: EstadoEva
  nivel: RefObject<number>
  velocidad?: RefObject<{ x: number; y: number }>
  /** Hacia dónde apunta con su rayo (ver EvaModelo). */
  mirar?: RefObject<{ x: number; y: number } | null>
  /** Salida: dónde quedan sus ojos dentro del lienzo, en cada cuadro (ver EvaModelo). */
  ojos?: RefObject<Float32Array>
  visor?: VisorEva
  /** La misma EVA como holograma cian (dentro del visor del casco del simulador). */
  holograma?: boolean
  className?: string
}

/**
 * EVA en un lienzo 3D transparente del tamaño de su caja: se puede poner encima de cualquier pantalla.
 * No lleva luces: el modelo trae su propio estudio de reflejos, hecho con formas de luz (sin mapas de
 * entorno que bajar de la red). El tono «neutral» deja la cerámica blanca de verdad.
 */
export default function EvaLienzo({ estado, nivel, velocidad, mirar, ojos, visor, holograma, className }: Props) {
  return (
    <Canvas
      className={className}
      camera={CAMARA_EVA}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power", toneMapping: NeutralToneMapping }}
      dpr={[1, 2]}
      style={{ background: "transparent" }}
    >
      <EvaModelo estado={estado} nivel={nivel} velocidad={velocidad} mirar={mirar} ojos={ojos} visor={visor} holograma={holograma} />
    </Canvas>
  )
}
