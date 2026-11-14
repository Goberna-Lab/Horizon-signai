import { useFrame } from '@react-three/fiber'
import { DIAGNOSTICO } from '../ui/diagnosticoDatos'

/** Mide cuadros por segundo y tiempo por cuadro (promedio móvil) y lee la GPU y las llamadas de dibujo del cuadro anterior. */
export function MedidorRender() {
  useFrame(({ gl }, dt) => {
    const ms = dt * 1000
    DIAGNOSTICO.msCuadro = DIAGNOSTICO.msCuadro ? DIAGNOSTICO.msCuadro * 0.9 + ms * 0.1 : ms
    DIAGNOSTICO.fps = DIAGNOSTICO.msCuadro > 0 ? 1000 / DIAGNOSTICO.msCuadro : 0
    // Se cuenta el cuadro completo (sombras, escena y pases de la acumulación): se reinicia a mano al empezar el cuadro.
    gl.info.autoReset = false
    DIAGNOSTICO.llamadas = gl.info.render.calls
    DIAGNOSTICO.triangulos = gl.info.render.triangles
    gl.info.reset()
    if (!DIAGNOSTICO.gpu) {
      const ctx = gl.getContext()
      const ext = ctx.getExtension('WEBGL_debug_renderer_info')
      DIAGNOSTICO.gpu = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
    }
  }, -1)
  return null
}
