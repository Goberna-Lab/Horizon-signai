import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { Vec3 } from '../engine/environment'
import { SITIO_ACTIVO } from '../engine/sitio'
import { GLSL_HAPKE } from './materiales'

/**
 * E16: el valle de Taurus-Littrow en 3D (SLDEM2015, ±25 km, muestras cada 125 m, curvatura incluida), detrás del recorte
 * detallado de 400 m. Reemplaza la pared de E10. Cada vértice trae su horizonte en 8 azimuts: las montañas se sombrean
 * solas con la fracción visible del disco solar (sin mapa de sombras a esta escala).
 * Brillo: Hapke del sitio (E12) escalada por el albedo. Supuesto: albedo por altura sobre el LM, de 0,085 en el fondo
 * (mar con manto oscuro, LSB p. 631) a 0,15 en los macizos (tierras altas, 11–18 %, LSB p. 59), con transición entre
 * +100 y +400 m. Dentro del recorte de 400 m la malla se hunde 60 m para no competir con el terreno detallado.
 */

// E20: archivos del valle del sitio activo (src/data/valle-<sitio>*).
const URLS_ALTURAS = import.meta.glob('../data/valle-*-alturas.i16', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const URLS_HORIZONTES = import.meta.glob('../data/valle-*-horizontes.u8', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const METAS = import.meta.glob('../data/valle-*.json', { import: 'default', eager: true }) as Record<
  string,
  { muestras: number; pasoM: number; semiladoM: number; escalaAlturasM?: number }
>
const urlAlturas = URLS_ALTURAS[`../data/valle-${SITIO_ACTIVO.id}-alturas.i16`]
const urlHorizontes = URLS_HORIZONTES[`../data/valle-${SITIO_ACTIVO.id}-horizontes.u8`]
const meta = METAS[`../data/valle-${SITIO_ACTIVO.id}.json`]
/** Metros por unidad de las alturas Int16: 0,1 en el Apollo 17 (E16) y 0,5 en el polo (E20, Shackleton baja ~5 km). */
const ESCALA_ALTURAS = meta.escalaAlturasM ?? 0.1

const N = meta.muestras
const PASO = meta.pasoM
const SEMILADO = meta.semiladoM
const MEDIO_RECORTE_M = 210

export const MATERIAL_VALLE = new ShaderMaterial({
  uniforms: {
    uSol: { value: new Vector3(0, 1, 0) },
    uTierra: { value: new Vector3(0, 1, 0) },
    uIrradSol: { value: 0 },
    uIrradTierra: { value: 0 },
    uElevSol: { value: 0 },
    uAzSol: { value: 0 },
    uSemiSol: { value: 0.27 },
  },
  vertexShader: /* glsl */ `
    attribute vec4 horizonteA;
    attribute vec4 horizonteB;
    attribute float albedo;
    uniform float uElevSol;
    uniform float uAzSol;
    uniform float uSemiSol;
    varying vec3 vNormal;
    varying vec3 vMundo;
    varying float vVisible;
    varying float vAlbedo;
    float fraccionDisco( float e, float h, float semi ) {
      float t = clamp( ( e - h ) / semi, -1.0, 1.0 );
      return 0.5 + ( asin( t ) + t * sqrt( 1.0 - t * t ) ) / 3.14159265;
    }
    void main() {
      float h[8];
      h[0] = horizonteA.x; h[1] = horizonteA.y; h[2] = horizonteA.z; h[3] = horizonteA.w;
      h[4] = horizonteB.x; h[5] = horizonteB.y; h[6] = horizonteB.z; h[7] = horizonteB.w;
      float a = mod( uAzSol, 360.0 ) / 45.0;
      int i = int( floor( a ) ) % 8;
      int j = ( i + 1 ) % 8;
      float hz = mix( h[i], h[j], fract( a ) ) * 60.0 - 10.0;
      vVisible = fraccionDisco( uElevSol, hz, uSemiSol );
      vAlbedo = albedo;
      vNormal = normalize( mat3( modelMatrix ) * normal );
      vMundo = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4( vMundo, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    ${GLSL_HAPKE}
    uniform vec3 uSol;
    uniform vec3 uTierra;
    uniform float uIrradSol;
    uniform float uIrradTierra;
    varying vec3 vNormal;
    varying vec3 vMundo;
    varying float vVisible;
    varying float vAlbedo;
    void main() {
      vec3 n = normalize( vNormal );
      vec3 v = normalize( cameraPosition - vMundo );
      float mu0 = max( dot( n, uSol ), 0.0 );
      float directa = uIrradSol * vVisible * mu0 * lunaHapke( uSol, n, v ) * ( vAlbedo / 0.085 );
      float terrestre = uIrradTierra * max( dot( n, uTierra ), 0.0 ) * vAlbedo / PI;
      gl_FragColor = vec4( vec3( directa + terrestre ), 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})

function crearGeometria(alturas: Int16Array, horizontes: Uint8Array): BufferGeometry {
  const pos = new Float32Array(N * N * 3)
  const alb = new Float32Array(N * N)
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const k = f * N + c
      const x = -SEMILADO + c * PASO
      const z = -SEMILADO + f * PASO
      const y = alturas[k] * ESCALA_ALTURAS
      const enRecorte = Math.abs(x) < MEDIO_RECORTE_M && Math.abs(z) < MEDIO_RECORTE_M
      pos.set([x, enRecorte ? y - 60 : y, z], 3 * k)
      // E20: en el polo todo es tierra alta (0,15, LSB p. 59; supuesto); en el Apollo 17, albedo por altura (E16).
      const t = Math.min(Math.max((y - 100) / 300, 0), 1)
      alb[k] = SITIO_ACTIVO.id === 'apollo17' ? 0.085 + (0.15 - 0.085) * t * t * (3 - 2 * t) : SITIO_ACTIVO.albedo
    }
  }
  const indices: number[] = []
  for (let f = 0; f < N - 1; f++) {
    for (let c = 0; c < N - 1; c++) {
      const a = f * N + c
      indices.push(a, a + N, a + 1, a + 1, a + N, a + N + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('albedo', new Float32BufferAttribute(alb, 1))
  const intercalado = new InterleavedBuffer(horizontes, 8)
  g.setAttribute('horizonteA', new InterleavedBufferAttribute(intercalado, 4, 0, true))
  g.setAttribute('horizonteB', new InterleavedBufferAttribute(intercalado, 4, 4, true))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export function Valle(props: {
  sol: Vec3
  tierra: Vec3
  irradSol: number
  irradTierra: number
  elevSol: number
  azSol: number
  semiSol: number
}) {
  const [geometria, setGeometria] = useState<BufferGeometry | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all([fetch(urlAlturas).then((r) => r.arrayBuffer()), fetch(urlHorizontes).then((r) => r.arrayBuffer())]).then(([a, h]) => {
      if (vivo) setGeometria(crearGeometria(new Int16Array(a), new Uint8Array(h)))
    })
    return () => {
      vivo = false
    }
  }, [])
  useFrame(() => {
    const u = MATERIAL_VALLE.uniforms
    ;(u.uSol.value as Vector3).set(...props.sol)
    ;(u.uTierra.value as Vector3).set(...props.tierra)
    u.uIrradSol.value = props.irradSol
    u.uIrradTierra.value = props.irradTierra
    u.uElevSol.value = props.elevSol
    u.uAzSol.value = props.azSol
    u.uSemiSol.value = props.semiSol
  })
  if (!geometria) return null
  return <mesh geometry={geometria} material={MATERIAL_VALLE} frustumCulled={false} />
}
