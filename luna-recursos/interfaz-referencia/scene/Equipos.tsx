import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Color, LinearSRGBColorSpace, Mesh, MeshLambertMaterial, MeshStandardMaterial, PropertyBinding, Quaternion, Vector3, type Material, type Object3D } from 'three'
import urlLM from '../data/modelos/lm-nasa-3d-resources.glb?url'
import { DIMENSIONES_LM, DIMENSIONES_LRV, EQUIPOS_APOLLO17, GIRO_LM_RAD, RADIO_PIE_LM_M, centrosPiesLM, posicionLocal } from '../engine/equipos'
import { alturaSuelo } from '../engine/terreno'
import { conLuzDelSuelo } from './materiales'

/**
 * E15.3: equipos del Apollo 17 en su posición real (LROC, ±3–4 m). Medidas con fuente: etapa de descenso del LM (NSSDCA)
 * y LRV (LSB fig. 9.44, p. 527). Supuestos (declarados en la interfaz): la orientación de cada equipo, el ALSEP y el SEP
 * como cajas.
 *
 * E15.6: el LM es híbrido. El cuerpo de la etapa de descenso (con porche, tobera, paneles, bandera y placa) sale del
 * modelo de NASA 3D Resources (src/data/modelos/lm-nasa-3d-resources.json), cuyo ancho coincide con NSSDCA (4,2 m). Su
 * tren de aterrizaje es un 40 % corto, así que se reconstruye aquí con las medidas de NSSDCA (9,4 m entre los extremos de
 * los pies; base a 1,5 m). Materiales físicos con la luz que devuelve el suelo (ENV-009, conLuzDelSuelo).
 */

const lineal = (r: number, g: number, b: number) => new Color().setRGB(r, g, b, LinearSRGBColorSpace)
const MATERIAL_METAL = new MeshLambertMaterial({ color: lineal(0.45, 0.45, 0.45) })
const MATERIAL_OSCURO = new MeshLambertMaterial({ color: lineal(0.08, 0.08, 0.08) })
const MATERIAL_BLANCO = new MeshLambertMaterial({ color: lineal(0.7, 0.7, 0.7) })

// E15.6: materiales del LM. Colores del modelo de NASA (qué parte es dorada, negra o plateada); reflectancias y
// rugosidades: supuestos (sin medición en nuestras fuentes). La lámina dorada es Kapton aluminizado: metal con tinte ámbar.
const LAMINA_DORADA = conLuzDelSuelo(new MeshStandardMaterial({ color: lineal(0.75, 0.48, 0.12), metalness: 1, roughness: 0.32 }))
const LAMINA_AMBAR = conLuzDelSuelo(new MeshStandardMaterial({ color: lineal(0.62, 0.3, 0.05), metalness: 1, roughness: 0.38 }))
const ALUMINIO = conLuzDelSuelo(new MeshStandardMaterial({ color: lineal(0.82, 0.82, 0.8), metalness: 1, roughness: 0.45 }))
const PANEL_NEGRO = conLuzDelSuelo(new MeshStandardMaterial({ color: lineal(0.035, 0.035, 0.035), metalness: 0, roughness: 0.55 }))
const PINTURA_GRIS = conLuzDelSuelo(new MeshStandardMaterial({ color: lineal(0.35, 0.35, 0.35), metalness: 0, roughness: 0.6 }))

/** Material del modelo de NASA → material físico. Los que tienen textura (bandera, placa, tobera) conservan su mapa. */
function materialFisico(original: Material): Material {
  const m = original as MeshStandardMaterial
  if (m.map) {
    return conLuzDelSuelo(new MeshStandardMaterial({ map: m.map, metalness: 0, roughness: 0.6 }))
  }
  const c = m.color
  const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  if (c.r > c.b * 2.5 && c.g > c.b * 2.5) return LAMINA_DORADA
  if (c.r > c.b * 2.5) return LAMINA_AMBAR
  if (luma < 0.02) return PANEL_NEGRO
  if (luma > 0.4) return ALUMINIO
  return PINTURA_GRIS
}

/**
 * Piezas del modelo que son tren de aterrizaje (se reemplaza) o etapa de ascenso (despegó en 1972). Nombres del glTF; three
 * los normaliza (espacios → "_", sin puntos) y las mallas de varias primitivas quedan como hijas de un grupo con ese nombre.
 */
const TREN_DEL_MODELO = new Set([
  'group31 10', 'group31 11', 'group31 12', 'group31 13', 'group31 14', 'group31 15', 'group31 16', 'group31 19',
  'group31 20', 'group31 g6', 'group31 g7', 'group31 g8', 'group31 g9', 'pCylinder3.002', 'polySurfa1',
].map((n) => PropertyBinding.sanitizeNodeName(n)))
/** Altura (del modelo) desde la que todo es etapa de ascenso (la cabina empieza en 2,42 m). */
const INICIO_ASCENSO_M = 2.415
/** Tanque de la etapa de ascenso que baja hasta 2,21 m. */
const ASCENSO_BAJO = new Set([PropertyBinding.sanitizeNodeName('pCylinde10')])
const enLista = (o: Object3D, lista: Set<string>) => lista.has(o.name) || (o.parent !== null && lista.has(o.parent.name))
/** Fondo del cuerpo de la etapa de descenso en el modelo, y su cubierta superior. */
const FONDO_CUERPO_MODELO_M = 0.84
const TECHO_CUERPO_MODELO_M = 2.04

const RADIO_PIE_M = RADIO_PIE_LM_M
const RADIO_PUNTAL_PRIMARIO_M = 0.07 // supuesto
const RADIO_PUNTAL_SECUNDARIO_M = 0.045 // supuesto
const GIRO_LM = GIRO_LM_RAD

/** Cilindro entre dos puntos. */
function Puntal({ desde, hasta, radio, material }: { desde: Vector3; hasta: Vector3; radio: number; material: Material }) {
  const { posicion, giro, largo } = useMemo(() => {
    const d = new Vector3().subVectors(hasta, desde)
    return {
      posicion: new Vector3().addVectors(desde, hasta).multiplyScalar(0.5),
      giro: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()),
      largo: d.length(),
    }
  }, [desde, hasta])
  return (
    <mesh position={posicion} quaternion={giro} material={material} castShadow>
      <cylinderGeometry args={[radio, radio, largo, 12]} />
    </mesh>
  )
}

/** Cuerpo de la etapa de descenso tomado del modelo de NASA, sin el tren ni la etapa de ascenso. */
function CuerpoNasa({ elevacion }: { elevacion: number }) {
  const { scene } = useGLTF(urlLM, '/draco/')
  const cuerpo = useMemo(() => {
    const copia = scene.clone(true)
    const quitar: Object3D[] = []
    copia.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.geometry.computeBoundingBox()
      const minY = o.geometry.boundingBox!.min.y
      if (enLista(o, TREN_DEL_MODELO) || enLista(o, ASCENSO_BAJO) || minY >= INICIO_ASCENSO_M) {
        quitar.push(o)
        return
      }
      o.material = Array.isArray(o.material) ? o.material.map(materialFisico) : materialFisico(o.material)
      o.castShadow = true
      o.receiveShadow = true
    })
    quitar.forEach((o) => o.removeFromParent())
    return copia
  }, [scene])
  return <primitive object={cuerpo} position={[0, elevacion, 0]} />
}

/**
 * LM con su tren de aterrizaje. E26.3: con enVuelo, el LM no está apoyado en el relieve: los pies quedan a la altura del
 * fondo de su plano (y = 0 del grupo) y quien lo usa lo ubica y lo inclina.
 */
export function ModuloLunar({ x, z, enVuelo = false }: { x: number; z: number; enVuelo?: boolean }) {
  const { alturaBaseM, entrePatasM } = DIMENSIONES_LM
  const base = enVuelo ? 0 : alturaSuelo(x, z)
  // El fondo del cuerpo queda a 1,5 m sobre el suelo (NSSDCA); el modelo se sube lo que haga falta.
  const elevacion = alturaBaseM - FONDO_CUERPO_MODELO_M
  const techo = alturaBaseM + (TECHO_CUERPO_MODELO_M - FONDO_CUERPO_MODELO_M)
  const patas = useMemo(
    () =>
      [0, 90, 180, 270].map((grados, k) => {
        // En el marco del LM (antes de girarlo): patas sobre los ejes, la de +Z es la delantera (escalera).
        const a = (grados * Math.PI) / 180
        const [ux, uz] = [Math.sin(a), Math.cos(a)]
        // NSSDCA: 9,4 m entre los extremos de los pies opuestos → centro del pie a 4,7 m − radio (motor, E19).
        const rPie = entrePatasM / 2 - RADIO_PIE_M
        const [gx, gz] = centrosPiesLM(x, z)[k]
        const pie = new Vector3(ux * rPie, enVuelo ? 0.08 : alturaSuelo(gx, gz) - base + 0.08, uz * rPie)
        // Supuesto: el puntal primario sale del borde del cuerpo, a 85 % de su altura.
        const hombro = new Vector3(ux * 2.05, alturaBaseM + (techo - alturaBaseM) * 0.85, uz * 2.05)
        // Supuesto: dos puntales secundarios por pata, desde el fondo del cuerpo (a ±1,2 m de lado) hasta el 35 % del primario.
        const rodilla = new Vector3().lerpVectors(pie, hombro, 0.35)
        const lado = new Vector3(uz, 0, -ux).multiplyScalar(1.2)
        const raiz = new Vector3(ux * 1.9, alturaBaseM, uz * 1.9)
        return {
          grados,
          pie,
          hombro,
          rodilla,
          secundarios: [raiz.clone().add(lado), raiz.clone().sub(lado)],
          delantera: grados === 0,
        }
      }),
    [x, z, base, alturaBaseM, entrePatasM, techo, enVuelo],
  )
  const delantera = patas.find((p) => p.delantera)!
  // Supuesto: escalera de 0,5 m de ancho con peldaños cada 0,23 m sobre el puntal delantero, del porche al pie.
  const peldanos = useMemo(() => {
    const lista: Vector3[] = []
    const largo = delantera.hombro.distanceTo(delantera.pie)
    for (let s = 0.4; s < largo - 0.3; s += 0.23) lista.push(new Vector3().lerpVectors(delantera.pie, delantera.hombro, s / largo))
    return lista
  }, [delantera])
  const ladoEscalera = new Vector3(0.25, 0, 0)
  return (
    <group position={enVuelo ? [0, 0, 0] : [x, base, z]} rotation={[0, enVuelo ? 0 : GIRO_LM, 0]}>
      <Suspense fallback={null}>
        <CuerpoNasa elevacion={elevacion} />
      </Suspense>
      {patas.map((p) => (
        <group key={p.grados}>
          <Puntal desde={p.hombro} hasta={p.pie} radio={RADIO_PUNTAL_PRIMARIO_M} material={LAMINA_DORADA} />
          {p.secundarios.map((s, k) => (
            <Puntal key={k} desde={s} hasta={p.rodilla} radio={RADIO_PUNTAL_SECUNDARIO_M} material={PANEL_NEGRO} />
          ))}
          {/* Pie: plato poco profundo (supuesto: 0,94 m de diámetro y 0,3 m de alto) */}
          <mesh position={[p.pie.x, p.pie.y + 0.07, p.pie.z]} material={ALUMINIO} castShadow receiveShadow>
            <cylinderGeometry args={[RADIO_PIE_M, RADIO_PIE_M * 0.7, 0.15, 24]} />
          </mesh>
        </group>
      ))}
      {[1, -1].map((signo) => (
        <Puntal
          key={signo}
          desde={delantera.pie.clone().add(ladoEscalera.clone().multiplyScalar(signo))}
          hasta={delantera.hombro.clone().add(ladoEscalera.clone().multiplyScalar(signo))}
          radio={0.02}
          material={ALUMINIO}
        />
      ))}
      {peldanos.map((c, k) => (
        <Puntal key={k} desde={c.clone().sub(ladoEscalera)} hasta={c.clone().add(ladoEscalera)} radio={0.015} material={ALUMINIO} />
      ))}
    </group>
  )
}

function Rover({ x, z }: { x: number; z: number }) {
  const { largoM, entreEjesM, trochaM, altoMaxM, diametroRuedaM, anchoRuedaM } = DIMENSIONES_LRV
  const base = alturaSuelo(x, z)
  const r = diametroRuedaM / 2
  // Supuesto: el rover apunta al norte (−Z).
  const ruedas = [
    [-trochaM / 2, -entreEjesM / 2],
    [trochaM / 2, -entreEjesM / 2],
    [-trochaM / 2, entreEjesM / 2],
    [trochaM / 2, entreEjesM / 2],
  ]
  return (
    <group position={[x, base, z]}>
      <mesh position={[0, r + 0.05, 0]} material={MATERIAL_METAL} castShadow>
        <boxGeometry args={[1.2, 0.12, largoM]} />
      </mesh>
      {/* Consola y respaldos hasta la altura máxima de 1,14 m */}
      <mesh position={[0, (r + altoMaxM) / 2 + 0.05, -0.55]} material={MATERIAL_OSCURO} castShadow>
        <boxGeometry args={[0.3, altoMaxM - r, 0.2]} />
      </mesh>
      <mesh position={[0, r + 0.35, 0.3]} material={MATERIAL_METAL} castShadow>
        <boxGeometry args={[1.0, 0.5, 0.1]} />
      </mesh>
      {ruedas.map(([wx, wz]) => (
        <mesh key={`${wx},${wz}`} position={[wx, r, wz]} rotation={[0, 0, Math.PI / 2]} material={MATERIAL_OSCURO} castShadow>
          <cylinderGeometry args={[r, r, anchoRuedaM, 24]} />
        </mesh>
      ))}
    </group>
  )
}

function Caja({ x, z, ancho, alto, fondo }: { x: number; z: number; ancho: number; alto: number; fondo: number }) {
  return (
    <mesh position={[x, alturaSuelo(x, z) + alto / 2, z]} material={MATERIAL_BLANCO} castShadow>
      <boxGeometry args={[ancho, alto, fondo]} />
    </mesh>
  )
}

export function EquiposApollo17() {
  return (
    <group>
      {EQUIPOS_APOLLO17.map((e) => {
        const [x, z] = posicionLocal(e)
        if (e.id === 'LM') return <ModuloLunar key={e.id} x={x} z={z} />
        if (e.id === 'LRV') return <Rover key={e.id} x={x} z={z} />
        // ALSEP y SEP: cajas de ~0,6 m y ~0,5 m (supuesto: el tamaño no está en nuestras fuentes).
        if (e.id === 'ALSEP') return <Caja key={e.id} x={x} z={z} ancho={0.6} alto={0.4} fondo={0.5} />
        return <Caja key={e.id} x={x} z={z} ancho={0.5} alto={0.5} fondo={0.5} />
      })}
    </group>
  )
}
