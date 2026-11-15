import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { crearAnimacion, type AnimacionEva, type EntradaEva, type EstadoEva } from "./animacion"
import {
  BLANCO,
  crearMaterialAro,
  crearMaterialCuerpo,
  crearMaterialEstela,
  crearMaterialLente,
  crearUniformes,
  ESTELA,
  estudioDeLuz,
  geometriasEva,
  LUZ,
  LUZ_HOLOGRAMA,
  PLOMO,
  VISORES,
  type VisorEva,
} from "./materiales"

export type { EstadoEva } from "./animacion"
export type { VisorEva } from "./materiales"

type Props = {
  /** Lo que EVA está haciendo: cambia sus ojos, su postura y su luz. */
  estado: EstadoEva
  /** Volumen de su voz (0..1), leído en cada cuadro: mueve las barras de luz al hablar. */
  nivel: RefObject<number>
  /** Velocidad en pantalla (px por cuadro): se inclina y mira hacia donde vuela. */
  velocidad?: RefObject<{ x: number; y: number }>
  /** Hacia dónde apunta con su rayo (−1..1; x a la derecha, y hacia arriba) o null. Mira hacia allá y da un destello al empezar. */
  mirar?: RefObject<{ x: number; y: number } | null>
  /**
   * Salida: dónde quedan sus dos ojos dentro del lienzo, en cada cuadro, como fracción de su ancho y su alto
   * (x0, y0, x1, y1; el origen es la esquina de arriba a la izquierda). De ahí sale el rayo con el que apunta.
   */
  ojos?: RefObject<Float32Array>
  /** Forma del visor. Por defecto `domo`, la de la referencia. */
  visor?: VisorEva
  /** Color de su luz. Por defecto LUZ («luz de Tierra»). */
  luz?: string
  /** Solo para la lámina: una animación ya preparada (por ejemplo, congelada en una pose). */
  animacion?: AnimacionEva
  /**
   * Holograma: la misma EVA, proyectada en luz cian (malla de alambre, borde brillante y su pantalla de LED), sin
   * cerámica ni reflejos. La usa el simulador cuando vive dentro del visor del casco.
   */
  holograma?: boolean
}

/** Cámara con la que se la mira (la usan EvaLienzo y la lámina): un poco desde arriba y con sitio para la estela. */
export const CAMARA_EVA = { fov: 28, position: [0, 0.186, 6.3], rotation: [-0.0485, 0, 0] } as const

/**
 * EVA en 3D: una esfera de cerámica blanca que flota, con un visor de vidrio oscuro. Detrás del vidrio hay
 * una pantalla de LED hecha de líneas (las líneas de señal de la marca) donde van sus ojos, sus cejas y los
 * corchetes; en la carcasa, líneas grabadas por las que corre luz, y abajo un propulsor con su estela.
 * Sin boca ni rasgos de dibujo animado: habla con los ojos y con la postura. Normalmente está seria.
 * Referencia de Estephano (2026-11-15): esfera blanca con visor y ojos LED; diseño propio.
 *
 * Qué hace en cada estado y cómo pasa de uno a otro: animacion.ts. Cómo se pinta: materiales.ts.
 * Se dibuja dentro de un <Canvas> (ver EvaLienzo). No necesita luces: trae su estudio de reflejos.
 */
export function EvaModelo({ estado, nivel, velocidad, mirar, ojos, visor = "domo", luz: luzPedida, animacion, holograma = false }: Props) {
  const luz = luzPedida ?? (holograma ? LUZ_HOLOGRAMA : LUZ)
  const gl = useThree((s) => s.gl)
  const raiz = useRef<THREE.Group>(null!)
  const esfera = useRef<THREE.Group>(null!)
  const estela = useRef<THREE.Mesh>(null!)
  const anim = useMemo(() => animacion ?? crearAnimacion(), [animacion])
  const geo = geometriasEva()
  const piezas = useMemo(() => {
    const u = crearUniformes(visor, luz)
    const estudio = estudioDeLuz(gl)
    return {
      u,
      color: new THREE.Color(luz),
      blanco: new THREE.Color(BLANCO),
      plomo: new THREE.Color(PLOMO),
      cuerpo: crearMaterialCuerpo(u, estudio),
      aro: crearMaterialAro(estudio),
      lente: crearMaterialLente(luz),
      estela: crearMaterialEstela(luz),
    }
  }, [gl, visor, luz])
  // Holograma: luz pura que se suma a lo que hay detrás (sin cerámica, sin reflejos, sin tapar nada)
  useEffect(() => {
    const { u, cuerpo, aro } = piezas
    u.uHolo.value = holograma ? 1 : 0
    for (const m of [cuerpo, aro]) {
      m.transparent = holograma
      m.blending = holograma ? THREE.AdditiveBlending : THREE.NormalBlending
      m.depthWrite = !holograma
      m.needsUpdate = true
    }
    aro.emissive.set(holograma ? luz : 0x000000)
    aro.emissiveIntensity = holograma ? 0.5 : 1
  }, [piezas, holograma, luz])
  useEffect(
    () => () => {
      piezas.cuerpo.dispose()
      piezas.aro.dispose()
      piezas.lente.dispose()
      piezas.estela.dispose()
    },
    [piezas],
  )

  // El puntero: lo sigue con la mirada y nota cuando la sujetan. En la lámina (animación preparada) no.
  const puntero = useRef({ x: 0, y: 0, cuando: -1e9, sujeta: false, cuadro: 0, cx: 0, cy: 0 })
  useEffect(() => {
    if (animacion) return
    const lienzo = gl.domElement
    const p = puntero.current
    const mover = (e: PointerEvent) => {
      p.x = e.clientX
      p.y = e.clientY
      p.cuando = performance.now()
    }
    const bajar = () => (p.sujeta = true)
    const soltar = () => (p.sujeta = false)
    window.addEventListener("pointermove", mover, { passive: true })
    lienzo.addEventListener("pointerdown", bajar)
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointermove", mover)
      lienzo.removeEventListener("pointerdown", bajar)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [gl, animacion])

  const calma = useMemo(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, [])
  const entrada = useRef<EntradaEva>({ estado, nivel: 0, vx: 0, vy: 0, puntero: null, sujeta: false, calma })
  const mira = useRef({ x: 0, y: 0 })
  const giro = useMemo(() => new THREE.Quaternion(), [])
  const lente = useMemo(() => new THREE.Vector3(), [])
  const ojo = useMemo(() => new THREE.Vector3(), [])

  useFrame((s, dt) => {
    const e = entrada.current
    const p = puntero.current
    e.estado = estado
    e.nivel = nivel.current ?? 0
    e.vx = velocidad?.current?.x ?? 0
    e.vy = velocidad?.current?.y ?? 0
    e.sujeta = p.sujeta
    e.apunta = mirar?.current ?? null
    e.puntero = null
    if (!animacion && performance.now() - p.cuando < 2800) {
      // Dónde está ella en la pantalla (se mueve con transform, así que se mide; uno de cada tres cuadros).
      if (p.cuadro++ % 3 === 0) {
        const r = gl.domElement.getBoundingClientRect()
        p.cx = r.left + r.width / 2
        p.cy = r.top + r.height * 0.45
      }
      const dx = p.x - p.cx
      const dy = p.y - p.cy
      const d = Math.hypot(dx, dy)
      const k = Math.min(1, d / 260) / Math.max(d, 1) // cerca de ella mira al frente; lejos, de lleno
      mira.current.x = dx * k
      mira.current.y = -dy * k
      e.puntero = mira.current
    }
    const pose = anim.paso(dt, e)

    raiz.current.position.y = pose.y
    raiz.current.rotation.set(pose.ladeoX, 0, pose.ladeoZ)
    const ancho = 1 / Math.sqrt(pose.estira)
    esfera.current.rotation.set(pose.cabeceo, pose.guinada, pose.alabeo)
    esfera.current.scale.set(ancho, pose.estira, ancho)
    // La estela siempre da la cara a la cámara, gire como gire el conjunto, y nace donde esté la lente.
    estela.current.quaternion.copy(raiz.current.getWorldQuaternion(giro).invert()).multiply(s.camera.quaternion)
    raiz.current.updateMatrixWorld()
    estela.current.worldToLocal(esfera.current.localToWorld(lente.set(0, -1.03, 0)))
    piezas.estela.uniforms.uLente.value.set(lente.x * ESTELA.ancho, lente.y * ESTELA.alto)

    // Dónde cae cada ojo en el lienzo. La pantalla del visor usa longitud y latitud sobre la esfera (materiales.ts):
    // el centro de cada ojo se pasa a un punto de la esfera, luego al mundo y de ahí a la cámara.
    if (ojos?.current) {
      const forma = VISORES[visor]
      for (let k = 0; k < 2; k++) {
        const lon = pose.ojos[k * 16] * forma.escala
        const lat = pose.ojos[k * 16 + 1] * forma.escala + forma.ojosY + forma.latitud
        ojo.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat))
        esfera.current.localToWorld(ojo).project(s.camera)
        ojos.current[k * 2] = (ojo.x + 1) / 2
        ojos.current[k * 2 + 1] = (1 - ojo.y) / 2
      }
    }

    const u = piezas.u
    const h = pose.hud
    u.uTiempo.value = pose.tiempo
    u.uOjo.value.set(pose.ojos)
    u.uNivel.value.set(pose.niveles)
    u.uHud.value.set(h[0], h[1], h[2], h[3])
    u.uHud2.value.set(h[4], h[5], h[6], h[7])
    u.uHud3.value.set(h[8], h[9], h[10], h[11])
    u.uHud4.value.x = h[12]
    u.uPant.value.set(pose.luz, pose.falla, pose.lineas, pose.pulso)
    u.uCuerpo.value.x = pose.propulsor
    // Sin energía: plomo oscuro, mate y con pocos reflejos; al cargarse vuelve la cerámica blanca.
    const apagado = 1 - pose.energia
    u.uCuerpo.value.y = apagado
    piezas.cuerpo.envMapIntensity = piezas.aro.envMapIntensity = holograma ? 0 : 1 - 0.6 * apagado
    piezas.cuerpo.clearcoat = piezas.aro.clearcoat = holograma ? 0 : 1 - 0.65 * apagado
    if (holograma) piezas.aro.color.setScalar(0)
    else piezas.aro.color.copy(piezas.blanco).lerp(piezas.plomo, apagado * 0.95)
    piezas.lente.color
      .copy(piezas.color)
      .multiplyScalar(0.5 + 0.8 * Math.min(pose.propulsor, 1.4))
      .addScalar(0.2 * pose.propulsor)
      .lerp(piezas.plomo, apagado)
    piezas.estela.uniforms.uFuerza.value = pose.propulsor
    piezas.estela.uniforms.uTiempo.value = pose.tiempo
  })

  return (
    <group ref={raiz}>
      <group ref={esfera}>
        <mesh geometry={geo.esfera} material={piezas.cuerpo} />
        {/* Propulsor: un aro de cerámica y una lente de luz en el polo de abajo. */}
        <mesh geometry={geo.aro} material={piezas.aro} position={[0, -0.935, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.lente} material={piezas.lente} position={[0, -0.96, 0]} scale={[1, 0.5, 1]} />
      </group>
      {/* Estela: no gira con la cabeza. */}
      <mesh ref={estela} geometry={geo.plano} material={piezas.estela} position={[0, ESTELA.y, ESTELA.z]} scale={[ESTELA.ancho, ESTELA.alto, 1]} renderOrder={2} />
    </group>
  )
}
