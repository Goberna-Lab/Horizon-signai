import { ComingSoon } from "@/shared/ui/ComingSoon"
import { SceneCanvas } from "./components/SceneCanvas"
import { simulatorScenes } from "./scenes/registry"

export function SimulatorPage() {
  // Provisional: mientras no haya escenas registradas se muestra la pantalla de "SOON".
  if (simulatorScenes.length === 0) return <ComingSoon label="3D simulator" />
  return (
    <section className="screen">
      <SceneCanvas />
    </section>
  )
}
