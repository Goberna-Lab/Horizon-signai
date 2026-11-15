// Las piezas de `luna-recursos/calculos/motor/environment.ts` (prototipo luna, commit 72f890f) que usa el planificador,
// copiadas sin cambios. El archivo original tiene además las reglas de la escena 3D, que aquí no hacen falta.

/**
 * ENV-002 (E9): constante solar, 1361 W/m² a 1 UA (FA cap. 20.4, p. 542). Las luces del motor están en unidades de
 * "Sol = 1 a 1 UA"; la irradiancia real cae con el cuadrado de la distancia (PBR cap. 5.2.1, p. 187; FA p. 152).
 */
export const CONSTANTE_SOLAR_W_M2 = 1361

export type Vec3 = [number, number, number]

const RAD = Math.PI / 180

/**
 * Dirección unitaria en ejes de la escena (+X este, +Y arriba, -Z norte)
 * a partir de elevación y azimut (medido desde el norte hacia el este).
 */
export function direccionDesdeHorizonte(elevacionGrados: number, azimutGrados: number): Vec3 {
  const e = elevacionGrados * RAD
  const a = azimutGrados * RAD
  const este = Math.cos(e) * Math.sin(a)
  const norte = Math.cos(e) * Math.cos(a)
  return [este, Math.sin(e), -norte]
}

/**
 * ENV-007: fracción del disco solar (o terrestre) que está sobre el horizonte, si su centro está
 * a una elevación e y su diámetro angular es θ. Área de un segmento circular, con t = e / (θ/2):
 *   F = 1/2 + (asin t + t·√(1 − t²)) / π   para |t| < 1;  0 debajo y 1 encima.
 * En el Apollo 17 (20,19° N), con θ ≈ 0,537°, el disco tarda ~68 min en salir por completo (con las efemérides de E5).
 * Supuesto: horizonte plano a 0° (sin relieve) y disco de brillo uniforme.
 */
export function fraccionDiscoVisible(elevacionGrados: number, diametroAngularGrados: number): number {
  const t = elevacionGrados / (diametroAngularGrados / 2)
  if (t <= -1) return 0
  if (t >= 1) return 1
  return 0.5 + (Math.asin(t) + t * Math.sqrt(1 - t * t)) / Math.PI
}
