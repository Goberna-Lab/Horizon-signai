import type { ComponentType } from "react"

export type SimulatorScene = {
  id: string
  title: string
  Scene: ComponentType
}

/** Registro de escenas 3D del simulador. Agrega aquí cada escena nueva. */
export const simulatorScenes: SimulatorScene[] = []
