import { Suspense, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"

type SceneCanvasProps = { children?: ReactNode }

/** Lienzo 3D base. Cada escena del simulador se monta como hijo. */
export function SceneCanvas({ children }: SceneCanvasProps) {
  return (
    <Canvas className="scene-canvas" camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}
