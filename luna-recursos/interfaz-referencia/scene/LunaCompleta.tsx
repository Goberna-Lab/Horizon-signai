import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  ClampToEdgeWrapping,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  MeshBasicMaterial,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  Vector3,
} from 'three'
import urlAltura from '../data/luna-ldem4.f16?url'
import urlAlbedo from '../data/luna-ldam4.f16?url'
import { ESCALA_VISUAL, TIERRA, faseEsferaLambert, luzTierraLlena, type Vec3 } from '../engine/environment'
import { FACTOR_VISIBLE_LOLA, RADIO_LUNA_KM, geometriaGlobal, vectorDePunto } from '../engine/lunaGlobal'
import { SITIO, type EstadoEscena } from '../engine/simulation'
import { Exposicion, type CurvaTono } from './LunarScene'
import { GLSL_HAPKE, GLSL_PI } from './materiales'
import { MedidorRender } from './Medidor'

/**
 * E14: la Luna completa, en km. Relieve LOLA LDEM_4 y albedo LOLA LDAM_4 (4 px/grado), iluminada por el Sol real del
 * instante (Horizons, convertido al marco selenográfico) con la misma BRDF de Hapke del sitio (E12), escalada por el
 * albedo local. La Tierra y el Sol a escala y distancia reales; el sitio del Apollo 17 marcado (ayuda, ENV-006).
 * Simplificaciones: sin sombras del relieve sobre sí mismo (a 7,6 km/píxel solo importan en el terminador); brillo
 * visible = LDAM (1064 nm) × 0,085/0,177 (supuesto, ver lunaGlobal.ts); relieve exagerable (ENV-006).
 */

/** Selenográfico (x a 0°E, y a 90°E, z al norte) → ejes de three (Y arriba). */
const aThree = ([x, y, z]: Vec3): [number, number, number] => [x, z, -y]

function texturaMedia(datos: Uint16Array): DataTexture {
  const t = new DataTexture(datos, 1440, 720, RedFormat, HalfFloatType)
  t.wrapS = RepeatWrapping
  t.wrapT = ClampToEdgeWrapping
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.generateMipmaps = false
  t.colorSpace = LinearSRGBColorSpace
  t.needsUpdate = true
  return t
}

const GLSL_COMUN = /* glsl */ `${GLSL_PI}
uniform sampler2D uAltura;
uniform float uExageracion;
vec2 lunaUV( vec3 s ) {
  float lon = atan( s.y, s.x );
  if ( lon < 0.0 ) lon += 2.0 * PI;
  float lat = asin( clamp( s.z, -1.0, 1.0 ) );
  return vec2( lon / ( 2.0 * PI ), ( 0.5 * PI - lat ) / PI );
}
`

function crearMaterialGlobo(altura: DataTexture, albedo: DataTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uAltura: { value: altura },
      uAlbedo: { value: albedo },
      uExageracion: { value: 1 },
      uSol: { value: new Vector3(1, 0, 0) },
      uTierra: { value: new Vector3(1, 0, 0) },
      uIrradSol: { value: 0 },
      uIrradTierra: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${GLSL_COMUN}
      varying vec3 vSel;
      varying vec3 vMundo;
      void main() {
        vec3 d = normalize( position );
        vec3 s = vec3( d.x, -d.z, d.y );
        vSel = s;
        float h = textureLod( uAltura, lunaUV( s ), 0.0 ).r;
        vec3 p = d * ( ${RADIO_LUNA_KM.toFixed(1)} + h * uExageracion );
        vMundo = ( modelMatrix * vec4( p, 1.0 ) ).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4( vMundo, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMUN}
      ${GLSL_HAPKE}
      uniform sampler2D uAlbedo;
      uniform vec3 uSol;
      uniform vec3 uTierra;
      uniform float uIrradSol;
      uniform float uIrradTierra;
      varying vec3 vSel;
      varying vec3 vMundo;
      float alturaEn( vec2 uv ) { return texture( uAltura, uv ).r * uExageracion; }
      void main() {
        vec3 s = normalize( vSel );
        vec2 uv = lunaUV( s );
        float lon = uv.x * 2.0 * PI;
        float lat = 0.5 * PI - uv.y * PI;
        // Normal del relieve por diferencias centradas (un píxel = 0,25°).
        float du = 1.0 / 1440.0;
        float dv = 1.0 / 720.0;
        float dE = ( alturaEn( uv + vec2( du, 0.0 ) ) - alturaEn( uv - vec2( du, 0.0 ) ) ) / ( 2.0 * du * 2.0 * PI * ${RADIO_LUNA_KM.toFixed(1)} * max( cos( lat ), 0.01 ) );
        float dN = ( alturaEn( uv - vec2( 0.0, dv ) ) - alturaEn( uv + vec2( 0.0, dv ) ) ) / ( 2.0 * dv * PI * ${RADIO_LUNA_KM.toFixed(1)} );
        vec3 E = vec3( -sin( lon ), cos( lon ), 0.0 );
        vec3 N = vec3( -sin( lat ) * cos( lon ), -sin( lat ) * sin( lon ), cos( lat ) );
        vec3 nSel = normalize( s - dE * E - dN * N );
        vec3 n = vec3( nSel.x, nSel.z, -nSel.y );
        vec3 v = normalize( cameraPosition - vMundo );
        float albedoVisible = texture( uAlbedo, uv ).r * ${FACTOR_VISIBLE_LOLA.toFixed(6)};
        float mu0 = max( dot( n, uSol ), 0.0 );
        // Luz directa: Hapke del sitio (albedo normal 0,085) escalada por el albedo local; f = r/µ0 y E·µ0.
        float directa = uIrradSol * mu0 * lunaHapke( uSol, n, v ) * ( albedoVisible / 0.085 );
        // Luz terrestre en el lado nocturno: lambertiana (ENV-010).
        float terrestre = uIrradTierra * max( dot( n, uTierra ), 0.0 ) * albedoVisible / PI;
        gl_FragColor = vec4( vec3( directa + terrestre ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

/** Tierra lambertiana gris de albedo 0,32 (FA p. 542), iluminada por el Sol (como en Cielo.tsx). */
function crearMaterialTierra(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSol: { value: new Vector3(1, 0, 0) }, uRadiancia: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() { vN = normalize( mat3( modelMatrix ) * normal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol; uniform float uRadiancia; varying vec3 vN;
      void main() {
        gl_FragColor = vec4( vec3( uRadiancia * max( dot( normalize( vN ), uSol ), 0.0 ) ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

/** Tierra y Sol del globo: un solo globo en la app, así que viven en el módulo y se actualizan en cada cuadro. */
const MATERIAL_TIERRA_GLOBO = crearMaterialTierra()
const MATERIAL_SOL_GLOBO = new MeshBasicMaterial()

function ActualizarCuerpos(props: { sol: [number, number, number]; irradSol: number; radianciaSol: number }) {
  useFrame(() => {
    ;(MATERIAL_TIERRA_GLOBO.uniforms.uSol.value as Vector3).set(...props.sol)
    MATERIAL_TIERRA_GLOBO.uniforms.uRadiancia.value = (props.irradSol * TIERRA.albedoBond) / Math.PI
    MATERIAL_SOL_GLOBO.color.setRGB(props.radianciaSol, props.radianciaSol, props.radianciaSol, LinearSRGBColorSpace)
  })
  return null
}

export function LunaCompleta(props: {
  estado: EstadoEscena
  exposicionEV: number
  curva: CurvaTono
  exageracion: number
}) {
  const { estado, exposicionEV, curva, exageracion } = props
  const [texturas, setTexturas] = useState<{ altura: DataTexture; albedo: DataTexture } | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all([fetch(urlAltura), fetch(urlAlbedo)])
      .then((r) => Promise.all(r.map((x) => x.arrayBuffer())))
      .then(([a, b]) => {
        if (vivo) setTexturas({ altura: texturaMedia(new Uint16Array(a)), albedo: texturaMedia(new Uint16Array(b)) })
      })
    return () => {
      vivo = false
    }
  }, [])
  const globo = useMemo(() => (texturas ? crearMaterialGlobo(texturas.altura, texturas.albedo) : null), [texturas])

  const g = geometriaGlobal(estado, estado.distanciaTierraAu)
  const sol3 = aThree(g.sol)
  const tierra3 = aThree(g.tierra)
  const irradSol = ESCALA_VISUAL / (estado.distanciaSolAu * estado.distanciaSolAu)
  const irradTierra = irradSol * luzTierraLlena(estado.diametroTierraGrados) * faseEsferaLambert(estado.faseTierra)
  const omegaSol = Math.PI * ((estado.diametroSolGrados / 2) * (Math.PI / 180)) ** 2
  const radianciaSol = irradSol / omegaSol
  const vSol = useMemo(() => new Vector3(), [])
  const vTierra = useMemo(() => new Vector3(), [])

  const DISTANCIA_SOL_DIBUJO_KM = 900_000
  const radioSolDibujo = DISTANCIA_SOL_DIBUJO_KM * Math.tan(((estado.diametroSolGrados / 2) * Math.PI) / 180)
  const sitio = aThree(vectorDePunto(SITIO.latitudGrados, SITIO.longitudEsteGrados))
  const camaraInicial = sitio.map((c) => c * 7000) as [number, number, number]

  return (
    <Canvas className="mapa" dpr={[1, 2]} camera={{ position: camaraInicial, fov: 40, near: 50, far: 1_200_000 }}>
      <Exposicion ev={exposicionEV} curva={curva} />
      <MedidorRender />
      <color attach="background" args={['#000000']} />
      <ActualizarCuerpos sol={sol3} irradSol={irradSol} radianciaSol={radianciaSol} />
      {globo && (
        <mesh>
          <sphereGeometry args={[RADIO_LUNA_KM, 720, 360]} />
          <primitive
            object={globo}
            attach="material"
            uniforms-uSol-value={vSol.set(...sol3)}
            uniforms-uTierra-value={vTierra.set(...tierra3)}
            uniforms-uIrradSol-value={irradSol}
            uniforms-uIrradTierra-value={irradTierra}
            uniforms-uExageracion-value={exageracion}
          />
        </mesh>
      )}
      {/* ENV-006: marca del sitio del Apollo 17 (ayuda, no física) */}
      <mesh position={sitio.map((c) => c * (RADIO_LUNA_KM + 12 * exageracion)) as [number, number, number]}>
        <sphereGeometry args={[18, 16, 8]} />
        <meshBasicMaterial color="#f5d76e" toneMapped={false} />
      </mesh>
      <mesh position={tierra3.map((c) => c * g.distanciaTierraKm) as [number, number, number]} material={MATERIAL_TIERRA_GLOBO}>
        <sphereGeometry args={[6378.137, 64, 32]} />
      </mesh>
      <mesh position={sol3.map((c) => c * DISTANCIA_SOL_DIBUJO_KM) as [number, number, number]} material={MATERIAL_SOL_GLOBO}>
        <sphereGeometry args={[radioSolDibujo, 32, 16]} />
      </mesh>
      <OrbitControls makeDefault minDistance={1900} maxDistance={600_000} />
    </Canvas>
  )
}
