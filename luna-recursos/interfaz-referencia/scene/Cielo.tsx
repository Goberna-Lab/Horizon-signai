import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { LinearSRGBColorSpace, MeshBasicMaterial, Plane, ShaderMaterial, Vector3, type Group } from 'three'
import { ESCALA_VISUAL, TIERRA, type Vec3 } from '../engine/environment'

/**
 * E9.1: el Sol y la Tierra dibujados en el cielo, en su posición y con su tamaño angular reales (JPL Horizons).
 * Están "en el infinito": el grupo sigue a la cámara, así no hay paralaje al girarla. Se recortan por el horizonte
 * astronómico (elevación 0°) con un plano que pasa por la cámara; las montañas del valle 3D (E16) los tapan por profundidad.
 * Solo representación: posiciones, tamaños y brillo vienen del motor.
 */

/**
 * Distancia de dibujo de los cuerpos del cielo: detrás del valle en 3D (E16, hasta 25 km) y dentro del far de la
 * cámara (60 km). No es su distancia real.
 */
const DISTANCIA_CIELO_M = 40_000

/** ENV-006: aumento de la lupa del cielo (no física). */
export const AUMENTO_LUPA = 10

/** Horizonte astronómico: plano horizontal que pasa por el ojo (se actualiza en cada cuadro). Hay un solo cielo. */
const HORIZONTE = new Plane(new Vector3(0, 1, 0), 0)

/**
 * Disco solar: radiancia = E⊥/Ω (Ω = π·(θ/2)²) en las unidades de la escena (ESCALA_VISUAL, E8). Es ~4,6·10⁴ veces
 * la de un gris al 100 %: la curva de tono lo satura a blanco, como una cámara.
 */
const MATERIAL_SOL = new MeshBasicMaterial({ clippingPlanes: [HORIZONTE] })

/**
 * ENV-010: la Tierra es una esfera lambertiana gris de albedo 0,32 (FA p. 542) iluminada por el Sol SIN el recorte de
 * nuestro horizonte (de noche en el sitio, la Tierra sigue al Sol). Su fase sale de la geometría real Sol–Tierra
 * (coincide con la fracción iluminada de Horizons a 0,13 %). Radiancia en pantalla = ESCALA·A·E·cos(i)/π, igual que el
 * suelo lambertiano de three. Simplificación: sin la luz que la Luna devuelve a la Tierra (su lado nocturno queda negro).
 */
const MATERIAL_TIERRA = new ShaderMaterial({
  clipping: true,
  clippingPlanes: [HORIZONTE],
  uniforms: { uDirSol: { value: new Vector3(0, 1, 0) }, uRadiancia: { value: 0 } },
  vertexShader: /* glsl */ `
    #include <clipping_planes_pars_vertex>
    varying vec3 vNormalMundo;
    void main() {
      vNormalMundo = normalize( mat3( modelMatrix ) * normal );
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }`,
  fragmentShader: /* glsl */ `
    #include <clipping_planes_pars_fragment>
    uniform vec3 uDirSol;
    uniform float uRadiancia;
    varying vec3 vNormalMundo;
    void main() {
      #include <clipping_planes_fragment>
      float coseno = max( dot( normalize( vNormalMundo ), uDirSol ), 0.0 );
      gl_FragColor = vec4( vec3( uRadiancia * coseno ), 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})

export function Cielo(props: {
  direccionSol: Vec3
  diametroSolGrados: number
  /** Irradiancia solar perpendicular sin recorte por el horizonte, en "Sol = 1 a 1 UA". */
  solSinRecorte: number
  direccionTierra: Vec3
  diametroTierraGrados: number
  lupa: boolean
}) {
  const { direccionSol, diametroSolGrados, solSinRecorte, direccionTierra, diametroTierraGrados, lupa } = props
  const grupo = useRef<Group>(null)

  useFrame(({ camera, gl }) => {
    // El horizonte astronómico pasa por el ojo: lo que está bajo elevación 0° no se dibuja.
    gl.localClippingEnabled = true
    HORIZONTE.constant = -camera.position.y
    grupo.current?.position.copy(camera.position)
    const omegaSol = Math.PI * ((diametroSolGrados / 2) * (Math.PI / 180)) ** 2
    const radianciaSol = (ESCALA_VISUAL * solSinRecorte) / omegaSol
    MATERIAL_SOL.color.setRGB(radianciaSol, radianciaSol, radianciaSol, LinearSRGBColorSpace)
    ;(MATERIAL_TIERRA.uniforms.uDirSol.value as Vector3).set(direccionSol[0], direccionSol[1], direccionSol[2]).normalize()
    MATERIAL_TIERRA.uniforms.uRadiancia.value = (ESCALA_VISUAL * TIERRA.albedoBond * solSinRecorte) / Math.PI
  })

  const aumento = lupa ? AUMENTO_LUPA : 1
  const radioSol = DISTANCIA_CIELO_M * Math.tan(((diametroSolGrados / 2) * Math.PI) / 180) * aumento
  const radioTierra = DISTANCIA_CIELO_M * Math.tan(((diametroTierraGrados / 2) * Math.PI) / 180) * aumento
  const pos = (d: Vec3): [number, number, number] => [d[0] * DISTANCIA_CIELO_M, d[1] * DISTANCIA_CIELO_M, d[2] * DISTANCIA_CIELO_M]

  return (
    <group ref={grupo}>
      <mesh position={pos(direccionSol)} frustumCulled={false} material={MATERIAL_SOL}>
        <sphereGeometry args={[radioSol, 32, 16]} />
      </mesh>
      <mesh position={pos(direccionTierra)} frustumCulled={false} material={MATERIAL_TIERRA}>
        <sphereGeometry args={[radioTierra, 64, 32]} />
      </mesh>
    </group>
  )
}
