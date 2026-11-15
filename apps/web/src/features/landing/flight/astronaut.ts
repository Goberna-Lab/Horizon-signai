/**
 * El astronauta del inicio: sale por la izquierda, recorre la ruta marcada sobre la cresta dejando huellas que se
 * van borrando y se queda de pie al final, junto a la señal.
 *
 * Trozo diferido (three.js y el modelo, unos 3 MB): la página lo pide cuando la entrada ya ha terminado. Se dibuja
 * en su propio lienzo, una franja sobre la cresta, con una cámara sin perspectiva que mide en píxeles de pantalla:
 * así los pies caen exactamente sobre la silueta dibujada en SVG.
 *
 * Cómo camina sin patinar: la animación trae el paso, no el avance. En cada cuadro se mira cuánto retrocede el pie
 * apoyado; eso mismo es lo que avanza el cuerpo. Cuando el apoyo cambia de pie, ahí se deja una huella.
 *
 * Modelo: "Astronaut", de Javi_DaviYT (Sketchfab), CC BY 4.0, aligerado con `scripts/convert-astronaut.mjs`.
 */
import {
  type AnimationAction,
  AnimationMixer,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import modelUrl from "./data/astronaut.glb?url"

export type AstronautLayout = {
  /** La franja del lienzo, en px del escenario. */
  width: number
  top: number
  height: number
  /** Alto del astronauta, en px. */
  size: number
  /** Altura de la cresta (px del escenario, hacia abajo) en cada x. */
  ground: (x: number) => number
  /** Dónde empieza y dónde termina la ruta (x, px). */
  from: number
  to: number
}

export type Astronaut = {
  resize(layout: AstronautLayout): void
  /** Echa a andar (una sola vez). */
  walk(): void
  /** Se dibuja solo mientras el inicio está a la vista. */
  setActive(active: boolean): void
  dispose(): void
}

/** Segundos que tarda en borrarse una huella y cuántas puede haber a la vez. */
const PRINT_LIFE = 6
const PRINTS = 36
/** Lo que tarda en recorrer la ruta (segundos): el paso se acelera o se frena para llegar a tiempo. */
const WALK_S = 8
/** Giro hacia la cámara, para que no vaya de perfil puro (radianes). */
const TOWARDS_CAMERA = 0.42

export async function createAstronaut(canvas: HTMLCanvasElement, options: { paper: string; still: boolean }): Promise<Astronaut> {
  const gltf = await new GLTFLoader().loadAsync(modelUrl)
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const camera = new OrthographicCamera(0, 1, 1, 0, -4000, 4000)

  // Luz: el traje se lee sobre el papel; un contraluz cálido llega desde el lado del Sol.
  scene.add(new HemisphereLight(0xffffff, 0x6f6a64, 2.1))
  const key = new DirectionalLight(0xffffff, 2.2)
  key.position.set(-0.6, 0.9, 1)
  const rim = new DirectionalLight(0xffb39c, 1.6)
  rim.position.set(1, 0.5, -0.8)
  scene.add(key, rim)

  // rig (posición en pantalla) > turn (hacia dónde mira) > model (centrado, con los pies en el suelo).
  const rig = new Group()
  const turn = new Group()
  const model = gltf.scene
  rig.add(turn)
  turn.add(model)
  scene.add(rig)
  model.updateMatrixWorld(true)
  const box = new Box3().setFromObject(model)
  const tall = box.max.y - box.min.y || 1
  const centre = box.getCenter(new Vector3())
  model.position.set(-centre.x, -box.min.y, -centre.z)

  const find = (pattern: RegExp) => {
    let found: Object3D | null = null
    model.traverse((node) => {
      if (!found && pattern.test(node.name)) found = node
    })
    return found as Object3D | null
  }
  const feet = [find(/^L_Toe(?!_End)/), find(/^R_Toe(?!_End)/)]
  const mixer = new AnimationMixer(model)
  const clip = (name: string) => gltf.animations.find((a) => a.name === name) ?? gltf.animations[0]
  const walking: AnimationAction = mixer.clipAction(clip("moon_walk"))
  const standing: AnimationAction = mixer.clipAction(clip("idle"))
  walking.play()

  const at = new Vector3()
  const foot = [new Vector3(), new Vector3()]
  const before = [new Vector3(), new Vector3()]
  let planted = -1
  /**
   * Avanza la animación y devuelve en `out` cuánto se ha movido el pie apoyado (en el espacio de `space`) desde el
   * cuadro anterior. Devuelve true si el apoyo acaba de cambiar de pie.
   */
  const step = (dt: number, space: Object3D, out: Vector3) => {
    mixer.update(dt)
    rig.updateMatrixWorld(true)
    let lowest = 0
    for (let i = 0; i < 2; i++) {
      const bone = feet[i]
      if (bone) space.worldToLocal(bone.getWorldPosition(foot[i]))
      if (foot[i].y < foot[lowest].y) lowest = i
    }
    // El apoyo no cambia por un temblor: el otro pie tiene que estar claramente más bajo.
    const next = planted < 0 || foot[lowest].y < foot[planted].y - tall * 0.004 ? lowest : planted
    const touched = next !== planted
    out.set(0, 0, 0)
    if (!touched) out.copy(foot[next]).sub(before[next])
    planted = next
    before[0].copy(foot[0])
    before[1].copy(foot[1])
    return touched
  }

  // Hacia dónde y cuánto avanza el modelo en un ciclo: se recorre entero sumando lo que retrocede el pie apoyado.
  const travel = new Vector3()
  const delta = new Vector3()
  const cycle = walking.getClip().duration || 1
  for (let t = 0; t < cycle; t += 1 / 30) {
    step(1 / 30, turn, delta)
    travel.sub(delta)
  }
  turn.rotation.y = Math.atan2(travel.z, travel.x) - TOWARDS_CAMERA
  /** Avance natural, en alturas del astronauta por segundo. */
  const pace = Math.hypot(travel.x, travel.z) / tall / cycle
  walking.reset().play()
  planted = -1

  // Huellas: elipses de color papel sobre la cresta negra. Se reutilizan.
  const printShape = new CircleGeometry(1, 20)
  const prints = Array.from({ length: PRINTS }, () => {
    const mesh = new Mesh(printShape, new MeshBasicMaterial({ color: new Color(options.paper), transparent: true, opacity: 0, depthTest: false }))
    mesh.visible = false
    mesh.renderOrder = -1
    scene.add(mesh)
    return { mesh, born: -1e9 }
  })
  let nextPrint = 0

  let layout: AstronautLayout | null = null
  let active = false
  /** "waiting": aún no sale; "walking": recorre la ruta; "standing": ya llegó. */
  let phase: "waiting" | "walking" | "standing" = options.still ? "standing" : "waiting"
  /** Avance por la ruta, de 0 a 1: así un cambio de tamaño de pantalla no lo saca de su sitio. */
  let progress = options.still ? 1 : 0
  let raf = 0
  let last = 0
  let clock = 0
  /** De px del escenario (y hacia abajo) a la escena (y hacia arriba, dentro de la franja). */
  const up = (y: number) => (layout ? layout.height - (y - layout.top) : 0)

  const place = () => {
    if (!layout) return
    rig.position.x = layout.from + (layout.to - layout.from) * progress
    rig.position.y = up(layout.ground(rig.position.x)) - layout.size * 0.02
  }

  const stand = () => {
    phase = "standing"
    standing.reset().play()
    walking.crossFadeTo(standing, 0.6, false)
  }

  const draw = () => {
    if (!layout) return
    rig.visible = phase !== "waiting"
    rig.updateMatrixWorld(true)
    for (const print of prints) {
      const left = 1 - (clock - print.born) / PRINT_LIFE
      print.mesh.visible = left > 0
      if (left > 0) (print.mesh.material as MeshBasicMaterial).opacity = 0.9 * Math.pow(left, 1.4)
    }
    renderer.render(scene, camera)
  }

  const frame = (now: number) => {
    raf = 0
    if (!layout || !active) return
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    clock += dt
    if (phase === "walking") {
      const touched = step(dt, scene, delta)
      // El pie apoyado se queda donde está: el cuerpo avanza lo que ese pie retrocede.
      const length = Math.max(layout.to - layout.from, 1)
      progress = Math.min(progress - delta.x / length, 1)
      place()
      if (touched && planted >= 0) {
        rig.updateMatrixWorld(true)
        const bone = feet[planted]
        if (bone) {
          bone.getWorldPosition(at)
          const print = prints[nextPrint]
          nextPrint = (nextPrint + 1) % PRINTS
          print.born = clock
          print.mesh.position.set(at.x, up(layout.ground(at.x)) - layout.size * 0.055, 0)
          print.mesh.scale.set(layout.size * 0.075, layout.size * 0.024, 1)
        }
      }
      if (progress >= 1) stand()
    } else if (phase === "standing") {
      mixer.update(dt)
    }
    draw()
    // De pie y sin huellas a la vista basta con dibujar a menos cuadros, pero el gesto sigue vivo.
    raf = requestAnimationFrame(frame)
  }

  const start = () => {
    if (raf || !active || !layout || options.still) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  if (options.still) {
    standing.play()
    walking.stop()
    mixer.update(0.8)
  }

  if (import.meta.env.DEV) (window as unknown as { __astronaut?: object }).__astronaut = { state: () => ({ phase, progress, x: rig.position.x, timeScale: walking.timeScale, pace }) }

  return {
    resize(next) {
      layout = next
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(next.width, next.height, false)
      camera.right = next.width
      camera.top = next.height
      camera.updateProjectionMatrix()
      rig.scale.setScalar(next.size / tall)
      // El paso se ajusta para recorrer la ruta en WALK_S segundos, sin pasar de un ritmo creíble.
      const wanted = (next.to - next.from) / WALK_S / next.size
      walking.timeScale = Math.min(Math.max(wanted / (pace || 1), 0.9), 2.4)
      for (const print of prints) print.born = -1e9
      place()
      draw()
      start()
    },
    walk() {
      if (phase !== "waiting") return
      phase = "walking"
      walking.reset().play()
      planted = -1
      start()
    },
    setActive(value) {
      if (active === value) return
      active = value
      if (active) start()
      else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    dispose() {
      cancelAnimationFrame(raf)
      mixer.stopAllAction()
      printShape.dispose()
      for (const print of prints) (print.mesh.material as MeshBasicMaterial).dispose()
      model.traverse((node) => {
        const mesh = node as Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const map = (material as { map?: { dispose(): void } | null }).map
          map?.dispose()
          material.dispose()
        }
      })
      renderer.dispose()
    },
  }
}
