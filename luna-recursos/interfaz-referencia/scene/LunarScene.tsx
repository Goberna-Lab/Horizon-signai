import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, NoToneMapping } from 'three'
import { CIELO, ESCALA_VISUAL, OBSTACULO, iluminacion, limitesSombra, tanSemidiametro } from '../engine/environment'
import type { EstadoEscena } from '../engine/simulation'
import { alturaSuelo, dentroDelTerreno, limitesSombraSobreTerreno } from '../engine/terreno'
// ENV-007: parcha los shaders de sombra antes del primer render (efecto al importar).
import { CAMARA_SOMBRA, SESGO_NORMALIZADO } from './penumbra'
import { Datatip } from './Datatip'
import { CuadriculaTerreno, Terreno } from './Terreno'
import { Cielo } from './Cielo'
import { Acumulacion } from './Acumulacion'
import { ControlAstronauta } from './Astronauta'
import { EquiposApollo17 } from './Equipos'
import { Rocas } from './Rocas'
import { AlbedoReal } from './AlbedoReal'
import { MedidorRender } from './Medidor'
import { Valle } from './Valle'
import { VueloLM, type Vuelo } from './Vuelo'
import { DatatipTerreno } from './DatatipTerreno'
import { faseEsferaLambert, luzTierraLlena } from '../engine/environment'
import { MATERIAL_POSTE, UNIFORME_MODELO, UNIFORME_SUELO } from './materiales'
import { reboteEnVertices } from '../engine/reboteSitio'
import { centrosPiesLM, RADIO_PIE_LM_M } from '../engine/equipos'

const DISTANCIA_LUZ_M = CAMARA_SOMBRA.distanciaM
const MEDIA_CAJA_SOMBRA_M = CAMARA_SOMBRA.mediaCajaM

/**
 * ENV-006: la exposición es de la cámara, no del entorno: escalado lineal 2^EV (RTR cap. 8.2.2, p. 285).
 * La curva de tono ACES (RTR pp. 285–287) es no física: para medir se usa el modo lineal, que deja los valores
 * proporcionales a la radiancia ("physical operations are only valid when performed on scene-referred data",
 * RTR p. 286). Antes de E8 la curva ACES estaba activa sin declararse.
 */
export function Exposicion({ ev, curva }: { ev: number; curva: CurvaTono }) {
  useFrame(({ gl }) => {
    gl.toneMappingExposure = 2 ** ev
    gl.toneMapping = curva === 'lineal' ? NoToneMapping : ACESFilmicToneMapping
  })
  return null
}

/** ENV-009: irradiancia que el suelo devuelve al poste (uniforme del shader), actualizada en cada cuadro. */
function LuzDelSuelo({ radiosidad, modelo }: { radiosidad: number; modelo: ModeloRegolito }) {
  useFrame(() => {
    UNIFORME_SUELO.value = ESCALA_VISUAL * radiosidad
    UNIFORME_MODELO.value = modelo === 'wac' ? 1 : 0
  })
  return null
}

/**
 * D4: umbral para recalcular el rebote mientras corre el reloj: un quinto del diámetro del Sol (0,53°, E5). El rebote
 * cambia suave con la dirección de la luz (parches de 8 m), así que entre cálculos se usa el último. Supuesto: no se
 * midió cuánto cambia la imagen con 0,1°.
 */
const UMBRAL_REBOTE_GRADOS = 0.1
const COS_UMBRAL_REBOTE = Math.cos((UMBRAL_REBOTE_GRADOS * Math.PI) / 180)
const coseno = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * D4: rebote por vértice con caché. Se recalcula si el Sol o la Tierra se movieron más del umbral; y al detenerse el
 * reloj (200 ms sin cambios) se calcula el exacto del instante mostrado, para que la imagen quieta no difiera del motor.
 */
function useRebote(estado: EstadoEscena): Float32Array {
  const [cache, setCache] = useState(() => ({ e: estado, rebote: reboteEnVertices(estado) }))
  // Estado derivado de las props, el patrón que React admite en el render (react.dev, "storing information from previous renders").
  let actual = cache
  if (
    coseno(cache.e.direccionSol, estado.direccionSol) < COS_UMBRAL_REBOTE ||
    coseno(cache.e.direccionTierra, estado.direccionTierra) < COS_UMBRAL_REBOTE
  ) {
    actual = { e: estado, rebote: reboteEnVertices(estado) }
    setCache(actual)
  }
  const exacto = actual.e === estado
  useEffect(() => {
    if (exacto) return
    const id = setTimeout(() => setCache({ e: estado, rebote: reboteEnVertices(estado) }), 200)
    return () => clearTimeout(id)
  }, [estado, exacto])
  return actual.rebote
}

/** E15.4: vista aérea (inicial) o a la altura de los ojos de una persona. */
export type ModoCamara = 'aerea' | 'astronauta'

/** Al volver a la vista aérea, la cámara regresa a su posición inicial. */
function CamaraAerea() {
  const hecho = useRef(false)
  useFrame((state) => {
    if (hecho.current) return
    state.camera.position.set(0, 80, 100)
    hecho.current = true
  })
  return null
}

/** E17: modelo del regolito para la luz directa: Hapke calibrado (LSB) o medido (LROC WAC). */
export type ModeloRegolito = 'calibrado' | 'wac'

/** Curva de tono de la cámara (ENV-006). */
export type CurvaTono = 'aces' | 'lineal'

/** Sombras compartidas por el Sol y la Tierra: misma caja, que cubre todo el suelo con cualquier azimut. */
const PROPS_SOMBRA = {
  castShadow: true,
  'shadow-bias': SESGO_NORMALIZADO,
  'shadow-normalBias': 0.02,
  'shadow-camera-left': -MEDIA_CAJA_SOMBRA_M,
  'shadow-camera-right': MEDIA_CAJA_SOMBRA_M,
  'shadow-camera-top': MEDIA_CAJA_SOMBRA_M,
  'shadow-camera-bottom': -MEDIA_CAJA_SOMBRA_M,
  'shadow-camera-near': CAMARA_SOMBRA.nearM,
  'shadow-camera-far': CAMARA_SOMBRA.farM,
} as const


/**
 * ENV-006: marca de medición sobre el suelo, perpendicular a la sombra, a una distancia horizontal del eje del
 * poste. Se dibuja encima de todo (sin prueba de profundidad) para que el relieve no la tape: es una ayuda.
 */
function Marca(props: { distanciaM: number; sombraX: number; sombraZ: number; giro: number; ancho: number; color: string }) {
  const { distanciaM, sombraX, sombraZ, giro, ancho, color } = props
  const x = sombraX * distanciaM
  const z = sombraZ * distanciaM
  return (
    <mesh position={[x, alturaSuelo(x, z) + 0.1, z]} rotation={[-Math.PI / 2, 0, giro]} renderOrder={10}>
      <planeGeometry args={[6, ancho]} />
      <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent />
    </mesh>
  )
}

/** E13 / ENV-006: ayudas no físicas que se pueden ocultar para ver la escena tal cual. */
export type Ayudas = { cuadricula: boolean; marcas: boolean }

/** Punto del suelo marcado para la medición inversa (E4); t = instante en que se marcó. */
export type PuntoMedido = { x: number; z: number; t: number }

/** El poste se hunde en el suelo para no flotar en la pendiente; su tapa queda a OBSTACULO.alturaM. */
const HUNDIDO_M = 0.3

/** Si el puntero se movió más que esto entre presionar y soltar, fue un arrastre de cámara, no un clic. */
const ARRASTRE_MAX_PX = 4

/** Representación de la escena. Las reglas viven en engine/; aquí solo se dibujan. */
export function LunarScene(props: {
  estado: EstadoEscena
  exposicionEV: number
  curva: CurvaTono
  /** E9.1 / ENV-006: lupa del cielo (aumenta el Sol y la Tierra; no física). */
  lupa: boolean
  ayudas: Ayudas
  /** E15.5: promediar cuadros cuando la imagen está quieta. */
  acumular: boolean
  camara: ModoCamara
  /** E15.3: equipos del Apollo 17. El LM está en el origen, donde está el poste: con equipos, el poste se oculta. */
  equipos: boolean
  /** E15.2 / D2: rocas sintéticas (solo visuales, apagadas por defecto). */
  detalle: boolean
  /** E15.1: albedo real del sitio (ortofoto LROC normalizada). */
  albedoReal: boolean
  modelo: ModeloRegolito
  medida: PuntoMedido | null
  alMedir: (x: number, z: number) => void
  /** E19: punto evaluado para aterrizar (la huella de los cuatro pies se dibuja ahí). */
  evaluado: { x: number; z: number }
  /** E26.3: descenso del LM en curso (null fuera de la simulación). */
  vuelo?: Vuelo | null
  /** E26.4: altura del observador para el datatip del terreno (la de Evaluación) y qué hace el clic. */
  alturaObservadorM?: number
  textoClic?: string
}) {
  const { estado, exposicionEV, curva, lupa, ayudas, acumular, camara, detalle, albedoReal, modelo, medida, alMedir, evaluado, vuelo } = props
  // E26.3: en la simulación el LM que baja reemplaza al poste y a los equipos del Apollo 17 (el LM real está en el sitio).
  const equipos = props.equipos && !vuelo
  const [sobrePoste, setSobrePoste] = useState(false)

  const sol = estado.direccionSol
  const luz = iluminacion(estado)
  // ENV-009 (E11): rebote del relieve real por vértice (motor; 3–12 ms según el sitio). D4: sin recalcular en cada cuadro.
  const rebote = useRebote(estado)
  // ENV-007 (E9): las luces salen del centroide del segmento visible del disco (igual al centro si no hay recorte).
  const solLuz = luz.direccionSolEfectiva
  const tierra = luz.direccionTierraEfectiva
  // ENV-007: tan(θ/2) por luz, con el diámetro real de este instante (E5); el parche lo lee como shadow.radius.
  const tanSemiSol = tanSemidiametro(estado.diametroSolGrados)
  const tanSemiTierra = tanSemidiametro(estado.diametroTierraGrados)
  // E10: hay sombra solar solo si el Sol asoma sobre el horizonte real del sitio (los macizos), no solo el astronómico.
  const solArriba = estado.elevacionSolGrados > 0 && luz.solVisible > 0
  const r = OBSTACULO.radioM
  // La sombra cae opuesta al Sol en el plano horizontal.
  const horizontal = Math.hypot(sol[0], sol[2]) || 1
  const sombraX = -sol[0] / horizontal
  const sombraZ = -sol[2] / horizontal
  const giroMarca = Math.atan2(sombraX, sombraZ)
  // ENV-003 / ENV-007: L con la fórmula de suelo plano (marca roja), para comparar.
  const plano = limitesSombra(OBSTACULO.alturaM, 2 * r, estado.elevacionSolGrados, estado.diametroSolGrados)
  // ENV-008: dónde cae de verdad la sombra sobre el relieve (marca blanca y celestes).
  const real = limitesSombraSobreTerreno(OBSTACULO.alturaM, 2 * r, estado.elevacionSolGrados, estado.diametroSolGrados, sombraX, sombraZ)
  const enSuelo = (distanciaDesdeBorde: number) =>
    !equipos &&
    ayudas.marcas &&
    solArriba && Number.isFinite(distanciaDesdeBorde) && dentroDelTerreno(sombraX * (r + distanciaDesdeBorde), sombraZ * (r + distanciaDesdeBorde))


  return (
    <Canvas
      className="mapa"
      dpr={[1, 2]}
      shadows="basic"
      camera={{ position: [0, 80, 100], fov: 50, near: 0.5, far: 60_000 }}
    >
      <Exposicion ev={exposicionEV} curva={curva} />
      <MedidorRender />
      {/* E15.5: la firma incluye todo lo que cambia la escena (no la exposición ni la curva: se aplican al final) */}
      <Acumulacion
        activa={acumular}
        firma={`${estado.t}|${camara}|${equipos}|${detalle}|${albedoReal}|${modelo}|${lupa}|${ayudas.cuadricula}|${ayudas.marcas}|${medida ? `${medida.x},${medida.z}` : ''}|${evaluado.x},${evaluado.z}|${vuelo ? vuelo.posicion.map((v) => v.toFixed(2)).join(",") : ""}`}
      />

      {/* ENV-001: cielo negro, sin niebla */}
      <color attach="background" args={[CIELO.color]} />

      {/* E16: el valle de Taurus-Littrow en 3D (SLDEM2015, ±25 km), con sombra propia por horizonte de vértice */}
      <Valle
        sol={estado.direccionSol}
        tierra={estado.direccionTierra}
        irradSol={ESCALA_VISUAL / (estado.distanciaSolAu * estado.distanciaSolAu)}
        irradTierra={
          (ESCALA_VISUAL * luzTierraLlena(estado.diametroTierraGrados) * faseEsferaLambert(estado.faseTierra)) /
          (estado.distanciaSolAu * estado.distanciaSolAu)
        }
        elevSol={estado.elevacionSolGrados}
        azSol={estado.azimutSolGrados}
        semiSol={estado.diametroSolGrados / 2}
      />

      {/* E9.1: el Sol y la Tierra en el cielo, posición y tamaño reales (Horizons); fase de la Tierra por geometría */}
      <Cielo
        direccionSol={estado.direccionSol}
        diametroSolGrados={estado.diametroSolGrados}
        solSinRecorte={1 / (estado.distanciaSolAu * estado.distanciaSolAu)}
        direccionTierra={estado.direccionTierra}
        diametroTierraGrados={estado.diametroTierraGrados}
        lupa={lupa}
      />

      {/* ENV-002: el Sol como luz direccional, en su posición real (E5). ENV-007: disco real (~0,537°), con penumbra (shadow-radius = tan(θ/2))
          y salida/puesta graduales (intensidad × fracción del disco sobre el horizonte).
          Siempre montada (F2): de noche su intensidad es 0, así no cambian las cuentas de luces ni se recompila. */}
      <directionalLight
        position={[solLuz[0] * DISTANCIA_LUZ_M, solLuz[1] * DISTANCIA_LUZ_M, solLuz[2] * DISTANCIA_LUZ_M]}
        intensity={ESCALA_VISUAL * luz.solNormal}
        shadow-mapSize={[4096, 4096]}
        shadow-radius={tanSemiSol}
        {...PROPS_SOMBRA}
      />

      {/* ENV-010: luz terrestre, direccional y tenue, desde la posición real de la Tierra (E5); derivada en E9 de una esfera
          lambertiana de albedo 0,32 (FA p. 542) con su fase real. Blanca: tiene "essentially the same spectral distribution
          as direct solar radiation" (FA p. 542); el tinte azul de antes no tenía fuente.
          ENV-007: la Tierra subtiende 1,81°–2,01°, así que su penumbra es ~3,6 veces la del Sol. */}
      <directionalLight
        position={[tierra[0] * DISTANCIA_LUZ_M, tierra[1] * DISTANCIA_LUZ_M, tierra[2] * DISTANCIA_LUZ_M]}
        intensity={ESCALA_VISUAL * luz.tierraNormal}
        shadow-mapSize={[2048, 2048]}
        shadow-radius={tanSemiTierra}
        {...PROPS_SOMBRA}
      />

      {/* ENV-009: luz que devuelve el suelo. E11: en el terreno, un rebote calculado sobre el relieve real (atributo por
          vértice); en el poste, el plano infinito ρ·E·(1 − n_y)/2. Reemplazan a la hemisphereLight de E2.1–E10, que
          sobre el terreno contaba la misma luz dos veces y no veía el relieve (PBR p. 580). */}
      <LuzDelSuelo radiosidad={luz.reflejadaTerreno} modelo={modelo} />
      {/* E15.2 / D2: rocas sintéticas (solo visuales, posiciones inventadas; el motor no las conoce) */}
      {detalle && <Rocas />}
      <AlbedoReal activo={albedoReal} />

      {/* ENV-008: relieve real del Apollo 17 (400 m alrededor del módulo lunar); proyecta y recibe sombra (ENV-003).
          E4: clic en el suelo = marcar la punta de la sombra para la medición inversa (h = L · tan α). */}
      <Terreno
        rebote={rebote}
        alClic={(e) => {
          if (e.delta > ARRASTRE_MAX_PX) return
          e.stopPropagation()
          alMedir(e.point.x, e.point.z)
        }}
      />

      {/* ENV-003: obstáculo vertical de 10 m (poste cilíndrico) en el sitio del módulo lunar, apoyado en el relieve.
          Se hunde 0,3 m para que no flote en la pendiente (4,5° en el centro); la tapa sigue a 10 m sobre el suelo.
          Proyecta sombra pero no la recibe: su lado oscuro ya sale de N·L, y así no se sombrea a sí mismo con grano.
          Simplificación: el relieve tampoco puede sombrear al poste. */}
      {/* E15.3: equipos del Apollo 17 en su posición real (LROC) */}
      {equipos && <EquiposApollo17 />}

      {vuelo && <VueloLM vuelo={vuelo} />}
      {/* E26.4: datatip del terreno al pasar el puntero (DI p. 447) */}
      <DatatipTerreno estado={estado} alturaM={props.alturaObservadorM ?? 0} textoClic={props.textoClic ?? ''} />

      {!equipos && !vuelo && (
      <mesh
        material={MATERIAL_POSTE}
        position={[0, alturaSuelo(0, 0) + (OBSTACULO.alturaM - HUNDIDO_M) / 2, 0]}
        castShadow
        onPointerOver={(e) => {
          e.stopPropagation()
          setSobrePoste(true)
        }}
        onPointerOut={() => setSobrePoste(false)}
      >
        <cylinderGeometry args={[OBSTACULO.radioM, OBSTACULO.radioM, OBSTACULO.alturaM + HUNDIDO_M, 24]} />
      </mesh>
      )}

      {/* ENV-006: cuadrícula sobre el relieve = ayuda de medición, no física (no recibe luz ni sombra ni exposición) */}
      {ayudas.cuadricula && <CuadriculaTerreno />}

      {/* ENV-006: marcas de medición, no físicas, calculadas por el motor (distancias horizontales desde el borde del poste):
          roja = L = h / tan(α) con suelo plano; blanca = punta real sobre el relieve (ENV-008);
          celestes = fin del núcleo negro y fin de la penumbra sobre el relieve (ENV-007). */}
      {enSuelo(plano.centroM) && (
        <Marca distanciaM={r + plano.centroM} sombraX={sombraX} sombraZ={sombraZ} giro={giroMarca} ancho={0.25} color="#ff4d4d" />
      )}
      {enSuelo(real.centroM) && (
        <Marca distanciaM={r + real.centroM} sombraX={sombraX} sombraZ={sombraZ} giro={giroMarca} ancho={0.25} color="#ffffff" />
      )}
      {enSuelo(real.finNucleoM) && (
        <Marca distanciaM={r + real.finNucleoM} sombraX={sombraX} sombraZ={sombraZ} giro={giroMarca} ancho={0.1} color="#4dd2ff" />
      )}
      {enSuelo(real.finPenumbraM) && (
        <Marca distanciaM={r + real.finPenumbraM} sombraX={sombraX} sombraZ={sombraZ} giro={giroMarca} ancho={0.1} color="#4dd2ff" />
      )}

      {/* E4: datatip sobre el poste al pasar el puntero (ENV-006: ayuda de lectura) */}
      {sobrePoste && !equipos && (
        <Datatip
          elevacionGrados={estado.elevacionSolGrados}
          diametroSolGrados={estado.diametroSolGrados}
          sombraX={sombraX}
          sombraZ={sombraZ}
        />
      )}

      {/* E4 / ENV-006: punto marcado para la medición inversa (ayuda, no física) */}
      {medida && ayudas.marcas && (
        <mesh position={[medida.x, alturaSuelo(medida.x, medida.z) + 0.1, medida.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <ringGeometry args={[0.35, 0.55, 32]} />
          <meshBasicMaterial color="#f5d76e" toneMapped={false} depthTest={false} transparent />
        </mesh>
      )}

      {/* E19 / ENV-006: huella de los cuatro pies del LM en el punto evaluado (ayuda, no física) */}
      {ayudas.marcas &&
        centrosPiesLM(evaluado.x, evaluado.z).map(([px, pz], k) => (
          <mesh key={k} position={[px, alturaSuelo(px, pz) + 0.1, pz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <ringGeometry args={[RADIO_PIE_LM_M - 0.08, RADIO_PIE_LM_M, 32]} />
            <meshBasicMaterial color="#6ee0f5" toneMapped={false} depthTest={false} transparent />
          </mesh>
        ))}

      {vuelo?.persecucion ? null : camara === 'aerea' ? (
        <>
          <CamaraAerea key="aerea" />
          <OrbitControls key="controles-aereos" makeDefault target={[0, 0, 0]} maxPolarAngle={Math.PI / 2 - 0.01} />
        </>
      ) : (
        <>
          <OrbitControls key="controles-astronauta" makeDefault enableZoom={false} enablePan={false} rotateSpeed={-0.35} />
          <ControlAstronauta />
        </>
      )}
    </Canvas>
  )
}
