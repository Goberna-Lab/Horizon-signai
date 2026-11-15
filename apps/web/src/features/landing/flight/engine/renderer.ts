/**
 * La lámina en WebGL: el relieve real del polo sur, las sombras del Sol en la fecha que marca el scroll y la cámara
 * que lo recorre. Sin React: la página le pasa el progreso, llama a `frame()` en cada cuadro y lee de vuelta lo que
 * necesita pintar encima.
 *
 * Pensado para una gráfica integrada:
 * - Dibuja solo cuando algo cambia y como mucho una vez por cuadro; en reposo no gasta nada.
 * - La malla tiene detalle variable: fina cerca del polo, donde vuela la cámara, y gruesa vista desde arriba.
 * - El lienzo tiene un tope de píxeles y baja de resolución por su cuenta si los cuadros se atrasan.
 * - Las sombras siguen a la cámara con un mapa rápido (mitad de resolución) y se afinan cuando se detiene.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
} from "three"
import { type Ephemeris, type Sky, skyAt, SUN_RADIUS_RAD } from "./ephemeris"
import { buildMesh, type MeshData } from "./mesh"
import { type Grid, heightAt, toPlate } from "./plate"
import type { Sweep } from "./shadow"
import { BODY_FRAGMENT, BODY_VERTEX, SPHERE_FRAGMENT, SPHERE_VERTEX, STAR_FRAGMENT, STAR_VERTEX, TERRAIN_FRAGMENT, TERRAIN_VERTEX } from "./shaders"
import { emptyPose, type Frame, type Pose, poseAt, type Stop } from "./story"

export type Palette = { paper: string; shade: string; ink: string; signal: string }

export type FlightOptions = {
  canvas: HTMLCanvasElement
  grid: Grid
  ephemeris: Ephemeris
  /** Inicio del día lunar del relato (ms UTC). */
  startMs: number
  stops: Stop[]
  palette: Palette
  /** Sitio destacado, en la proyección (km). */
  site: [number, number]
  quality: "high" | "low"
  /** Antialiasing por hardware. Solo conviene en gráficas de móvil: en una integrada de escritorio duplica el costo. */
  antialias: boolean
  /** Se llama cuando ya hay sombras y el primer cuadro está pintado. */
  onReady?: () => void
  /** Se llama después de cada cuadro dibujado. */
  onFrame?: (flight: Flight) => void
}

export type ScreenPoint = { x: number; y: number; visible: boolean }

type Layer = "sun" | "earth"
type Swept = { layer: Layer; fine: boolean; ms: number; sweep: Sweep; buffer: ArrayBuffer }

const DEG = Math.PI / 180
const DAY_MS = 86_400_000
/** Grosor de la lámina bajo la esfera de referencia (km): el canto que se ve en el borde del dato. */
const SLAB_KM = 9
/** Radios angulares reales: Sol 0,266° y Tierra 0,95° (diámetro ~1,90°, `luna-recursos/LEEME.md`). */
const EARTH_RADIUS_RAD = 0.95 * DEG
/** Luz cartográfica para la trama de relieve: 35° sobre el rumbo del Sol. */
const CARTO_ELEVATION = 35 * DEG
/** El cuadro del Sol y de la Tierra mide 1,25 radios, para que el borde suavizado no se corte. */
const BODY_MARGIN = 1.25
/** En el modo realista el cuadro del Sol mide estos radios: deja sitio a su resplandor. */
const SUN_GLOW_MARGIN = 46
/** Altura mínima de la cámara sobre el relieve (km): en la lámina y a ras de suelo (modo realista). */
const MIN_ALTITUDE = { print: 1.5, real: 0.12 }
/** Por debajo de esta distancia (km) la cámara usa la malla de detalle. */
const NEAR_KM = 560
/** Tope de píxeles del lienzo. */
const PIXEL_BUDGET = { high: 1_700_000, low: 1_000_000 }
/** La cámara lleva este tiempo quieta antes de pedir las sombras finas (ms). */
const SETTLE_MS = 220

/** Color en sRGB tal cual: los shaders escriben el color final, sin conversión. */
const rgb = (hex: string) => {
  const c = new Color(hex)
  c.getRGB(c, "srgb")
  return new Vector3(c.r, c.g, c.b)
}

const geometryOf = (data: MeshData) => {
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(data.position, 3))
  geometry.setAttribute("uv", new BufferAttribute(data.uv, 2))
  geometry.setAttribute("aSkirt", new BufferAttribute(data.skirt, 1))
  geometry.setAttribute("aHeight", new BufferAttribute(data.height, 1))
  geometry.setIndex(new BufferAttribute(data.index, 1))
  return geometry
}

export class Flight {
  readonly pose: Pose = emptyPose()
  readonly sky: Sky = { sun: [1, 0, 0], earth: [0, 1, 0] }
  /** Instante de misión del cuadro actual (ms UTC). */
  timeMs = 0
  /** true si el disco del Sol o el centro de la Tierra están tapados por el relieve desde la cámara. */
  sunHidden = false
  earthHidden = false

  private readonly o: FlightOptions
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(30, 1, 1, 5000)
  private readonly terrain: ShaderMaterial
  private readonly sphere: ShaderMaterial
  private readonly near: Mesh
  private readonly far: Mesh
  private readonly sun: Mesh
  private readonly earth: Mesh
  private readonly stars: Points
  private readonly starMaterial: ShaderMaterial
  private readonly clear = new Color()
  private readonly clearPrint: Color
  /** Día que manda en la primera parada mientras dura la entrada (el amanecer); null: el del recorrido. */
  private introDay: number | null = null
  private readonly maps: { sun: DataTexture; earth: DataTexture; fine: DataTexture }
  private readonly worker: Worker
  private readonly disposables: Array<{ dispose: () => void }> = []

  private width = 1
  private height = 1
  private maxDpr = 1
  /** Franjas de la vista tapadas por la interfaz (px): la escena se centra en lo que queda libre. */
  private stops: Stop[]
  private progress = 0
  private drawnProgress = NaN
  private dirty = true
  private disposed = false
  private ready = false
  private hasSun = false
  /** Mientras se dibuja un cuadro de captura (`still`), el bucle normal no interviene. */
  private holding = false
  /** Instante del mapa fino que dejó la última captura. */
  private stillMs = NaN

  // Resolución adaptativa: se guía por el tiempo que la gráfica tarda en dibujar un cuadro.
  private scale = 1
  private lastScaleAt = 0
  private gpuMs = 0
  private gpuSamples = 0
  private timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private query: WebGLQuery | null = null
  private timing = false

  // Movimiento: 1 en reposo, baja mientras la cámara se mueve.
  private calm = 1
  private lastMoveAt = 0

  // Sombras.
  private busy = false
  private requestId = 0
  private pending: { sun: number | null; earth: number | null; fine: number | null } = { sun: null, earth: null, fine: null }
  private requested = { sun: NaN, earth: NaN }
  private spare: Record<string, ArrayBuffer | undefined> = {}
  private fine: "none" | "requested" | "shown" = "none"
  private fineMix = 0

  private readonly target = new Vector3()
  private readonly normal = new Vector3()
  private readonly forward = new Vector3()
  private readonly look = new Vector3()
  private readonly up = new Vector3()
  private readonly tmp = new Vector3()

  constructor(options: FlightOptions) {
    this.o = options
    this.stops = options.stops
    const { grid, palette, quality } = options
    const n = grid.n
    const fastNodes = (n - 1) / 2 + 1

    this.renderer = new WebGLRenderer({ canvas: options.canvas, antialias: options.antialias, alpha: false, powerPreference: "high-performance" })
    this.renderer.setClearColor(new Color(palette.shade), 1)
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV
    this.timer = this.renderer.getContext().getExtension("EXT_disjoint_timer_query_webgl2")

    const colors = {
      cPaper: { value: rgb(palette.paper) },
      cShade: { value: rgb(palette.shade) },
      cInk: { value: rgb(palette.ink) },
      cSignal: { value: rgb(palette.signal) },
      uPixel: { value: 1 },
      uInk: { value: 1 },
      uRadius: { value: grid.radiusKm },
      uReal: { value: 0 },
      uSunDir: { value: new Vector3(1, 0, 0) },
    }

    // --- Texturas ---------------------------------------------------------------------------------------
    // Altura y pendientes del relieve (con la curvatura incluida), para curvas de nivel y trama.
    const detail = new Uint16Array(n * n * 4)
    const z = grid.z
    const inv2 = 1 / (2 * grid.stepKm)
    for (let r = 0; r < n; r++) {
      const ra = Math.max(r - 1, 0)
      const rb = Math.min(r + 1, n - 1)
      for (let c = 0; c < n; c++) {
        const ca = Math.max(c - 1, 0)
        const cb = Math.min(c + 1, n - 1)
        const i = r * n + c
        const o = i * 4
        detail[o] = DataUtils.toHalfFloat(grid.heights[i] / 1000)
        detail[o + 1] = DataUtils.toHalfFloat((z[r * n + cb] - z[r * n + ca]) * inv2 * (2 / (cb - ca)))
        // Las filas crecen hacia -Y.
        detail[o + 2] = DataUtils.toHalfFloat(-(z[rb * n + c] - z[ra * n + c]) * inv2 * (2 / (rb - ra)))
        detail[o + 3] = 15360 // 1.0
      }
    }
    const detailMap = new DataTexture(detail, n, n, RGBAFormat, HalfFloatType)
    detailMap.minFilter = detailMap.magFilter = LinearFilter
    detailMap.wrapS = detailMap.wrapT = ClampToEdgeWrapping
    detailMap.needsUpdate = true

    const visibility = (nodes: number) => {
      const map = new DataTexture(new Uint8Array(2 * nodes * nodes).fill(255), 2 * nodes, nodes, RedFormat, UnsignedByteType)
      map.minFilter = map.magFilter = LinearFilter
      map.wrapS = map.wrapT = ClampToEdgeWrapping
      map.unpackAlignment = 1
      map.needsUpdate = true
      return map
    }
    this.maps = { sun: visibility(fastNodes), earth: visibility(fastNodes), fine: visibility(n) }

    // --- Relieve: dos mallas con el mismo material ---------------------------------------------------------
    // La de detalle es fina alrededor del polo, donde vuela la cámara; la otra es gruesa, para las vistas desde arriba.
    const [a, b, c] = quality === "high" ? [2, 4, 8] : [4, 8, 16]
    // Alrededor del sitio destacado la malla va a resolución completa: ahí empieza el vuelo, a ras de suelo.
    const [siteX, siteY] = options.site
    const nearGeometry = geometryOf(
      buildMesh(grid, SLAB_KM, (x, y) => (Math.hypot(x - siteX, y - siteY) < 24 ? 1 : Math.hypot(x, y) < 110 ? a : Math.hypot(x, y) < 170 ? b : c)),
    )
    const farGeometry = geometryOf(buildMesh(grid, SLAB_KM, () => c))

    this.terrain = new ShaderMaterial({
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: TERRAIN_FRAGMENT,
      side: DoubleSide,
      uniforms: {
        ...colors,
        tDetail: { value: detailMap },
        tSun: { value: this.maps.sun },
        tSunFine: { value: this.maps.fine },
        tEarth: { value: this.maps.earth },
        uSunShear: { value: new Vector3() },
        uSunFineShear: { value: new Vector3() },
        uEarthShear: { value: new Vector3() },
        uNodes: { value: fastNodes },
        uFineNodes: { value: n },
        uSunFine: { value: 0 },
        uExtent: { value: grid.extentKm },
        uEarthLayer: { value: 0 },
        uRing: { value: 0 },
        uCalm: { value: 1 },
        uCarto: { value: new Vector3(0, 0, 1) },
        uSite: { value: [0, 0, 2.4, 30] },
        uBearings: { value: [1, 0, 0, 1] },
      },
    })
    this.near = new Mesh(nearGeometry, this.terrain)
    this.far = new Mesh(farGeometry, this.terrain)
    this.near.frustumCulled = this.far.frustumCulled = false

    // --- La Luna más allá del dato ------------------------------------------------------------------------
    // Se dibuja después del relieve: lo que el relieve tapa no llega a sombrearse.
    const sphereGeometry = new SphereGeometry(grid.radiusKm - SLAB_KM - 0.3, 144, 82, 0, Math.PI * 2, 0, 82 * DEG)
    sphereGeometry.rotateX(Math.PI / 2)
    sphereGeometry.translate(0, 0, -grid.radiusKm)
    this.sphere = new ShaderMaterial({ vertexShader: SPHERE_VERTEX, fragmentShader: SPHERE_FRAGMENT, uniforms: { ...colors } })
    const sphereMesh = new Mesh(sphereGeometry, this.sphere)
    sphereMesh.frustumCulled = false
    sphereMesh.renderOrder = 1

    // --- Sol y Tierra, a su tamaño angular real -----------------------------------------------------------
    const quad = new PlaneGeometry(2, 2)
    const body = (inner: number, glow: number) =>
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: BODY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: rgb(palette.signal) },
          uFill: { value: rgb(palette.paper) },
          uInner: { value: inner },
          uMargin: { value: BODY_MARGIN },
          uReal: colors.uReal,
          uGlow: { value: glow },
        },
      })
    const sunMaterial = body(-1, 1)
    const earthMaterial = body(0.84, 0)
    this.sun = new Mesh(quad, sunMaterial)
    this.earth = new Mesh(quad, earthMaterial)
    this.sun.frustumCulled = this.earth.frustumCulled = false
    this.sun.renderOrder = this.earth.renderOrder = 2

    // --- Estrellas (solo en el modo realista) ----------------------------------------------------------------
    // Direcciones fijas al azar (con semilla); la nube va pegada a la cámara, lejos, y el relieve las tapa.
    const starCount = 2600
    const starPositions = new Float32Array(starCount * 3)
    const starSizes = new Float32Array(starCount)
    let seed = 11
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < starCount; i++) {
      const u = random() * 2 - 1
      const t = random() * Math.PI * 2
      const k = Math.sqrt(1 - u * u)
      starPositions.set([k * Math.cos(t), k * Math.sin(t), u], i * 3)
      starSizes[i] = Math.pow(random(), 3)
    }
    const starGeometry = new BufferGeometry()
    starGeometry.setAttribute("position", new BufferAttribute(starPositions, 3))
    starGeometry.setAttribute("aSize", new BufferAttribute(starSizes, 1))
    this.starMaterial = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPixel: colors.uPixel, uReal: colors.uReal },
    })
    this.stars = new Points(starGeometry, this.starMaterial)
    this.stars.frustumCulled = false
    this.stars.renderOrder = 1.5
    this.clearPrint = new Color(palette.shade)

    this.scene.add(this.near, this.far, sphereMesh, this.stars, this.sun, this.earth)
    this.disposables.push(nearGeometry, farGeometry, sphereGeometry, quad, starGeometry, this.starMaterial, this.terrain, this.sphere, sunMaterial, earthMaterial, detailMap, this.maps.sun, this.maps.earth, this.maps.fine, this.renderer)

    const [sx, sy] = options.site
    const site = [0, 0, 0]
    toPlate(sx, sy, heightAt(grid, sx, sy), grid.radiusKm, site)
    const uSite = this.terrain.uniforms.uSite.value as number[]
    uSite[0] = site[0]
    uSite[1] = site[1]

    // --- Worker de sombras --------------------------------------------------------------------------------
    this.worker = new Worker(new URL("./shadow.worker.ts", import.meta.url), { type: "module" })
    this.worker.onmessage = (event: MessageEvent<Swept>) => this.onSwept(event.data)
    // El worker recibe su propia copia del relieve: la página sigue usando la suya.
    const copy = grid.z.slice()
    this.worker.postMessage({ type: "init", z: copy, n, stepKm: grid.stepKm }, [copy.buffer])
  }

  /**
   * Ajusta el lienzo. `frames` trae el encuadre de cada parada para esta pantalla (uno por parada, en orden):
   * hacia dónde se desplaza el centro óptico y en cuántos píxeles debe caber la lámina.
   */
  resize(width: number, height: number, maxDpr: number, frames: Frame[]): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.maxDpr = maxDpr
    this.stops = this.o.stops.map((stop, i) => {
      const frame = frames[i] ?? frames[frames.length - 1]
      if (!frame) return stop
      // Las paradas con encuadre fijan su distancia según el área libre: la lámina cabe entera en cualquier pantalla.
      const distance = stop.frameKm ? ((stop.frameKm / Math.max(frame.fitPx, 80)) * this.height) / (2 * Math.tan((stop.fov * DEG) / 2)) : stop.distance
      return { ...stop, shift: frame.shift, distance }
    })
    this.applySize()
  }

  /** Punto de la ruta: 0 es la primera parada y `stops.length - 1` la última. Se dibuja en el siguiente `frame()`. */
  setProgress(p: number): void {
    if (p === this.progress) return
    this.progress = p
    this.dirty = true
  }

  /**
   * El día de la primera parada mientras dura la entrada: la página lo avanza para que el Sol salga de verdad por
   * detrás del horizonte. Con null vuelve el día del recorrido. Al bajar con el scroll se funde con el recorrido.
   */
  setIntroDay(day: number | null): void {
    if (day === this.introDay) return
    this.introDay = day
    this.dirty = true
  }

  /** Opacidad de la tinta (0-1), para la entrada. */
  setInk(value: number): void {
    for (const material of [this.terrain, this.sphere]) material.uniforms.uInk.value = value
    this.dirty = true
  }

  /**
   * Un cuadro de animación. Hay que llamarlo en cada cuadro del navegador con `performance.now()`: dibuja si algo
   * cambió y, si no, vuelve sin hacer nada.
   */
  frame(now: number): void {
    if (this.disposed || this.holding) return
    const moved = this.progress !== this.drawnProgress

    // Cuánto se mueve la cámara: la trama y las curvas finas se aligeran en movimiento y vuelven al detenerse.
    const speed = moved && Number.isFinite(this.drawnProgress) ? Math.abs(this.progress - this.drawnProgress) : 0
    const calmTarget = 1 - Math.min(speed / 0.012, 1)
    this.calm += (calmTarget - this.calm) * (calmTarget < this.calm ? 0.3 : 0.07)
    if (Math.abs(this.calm - calmTarget) < 0.004) this.calm = calmTarget

    // Sombras finas: se piden cuando la cámara lleva un momento quieta y se descartan en cuanto vuelve a moverse.
    if (moved) {
      this.lastMoveAt = now
      this.fine = "none"
      this.fineMix = 0
      this.pending.fine = null
    } else if (this.fine === "none" && this.hasSun && !this.busy && this.pending.sun === null && now - this.lastMoveAt > SETTLE_MS) {
      this.fine = "requested"
      this.pending.fine = this.timeMs
      this.pump()
    }
    let fading = false
    if (this.fine === "shown" && this.fineMix < 1) {
      this.fineMix = Math.min(1, this.fineMix + 0.07)
      fading = true
    }

    if (!this.dirty && !fading && this.calm === calmTarget && !moved) return
    this.paint(now)
  }

  /**
   * Para capturas (las láminas fijas): dibuja un cuadro completo del punto actual de la ruta, con las sombras
   * finas de su instante y sin transiciones. `calm` es 1 con la cámara quieta y 0 en pleno movimiento. Así cada
   * cuadro depende solo del punto de la ruta, no de cuánto tardó en dibujarse el anterior.
   *
   * Va directo al mapa fino (el grueso solo sirve mientras la cámara se mueve) y no dibuja nada hasta tenerlo.
   */
  async still(calm = 1): Promise<void> {
    this.holding = true
    try {
      const ms = this.o.startMs + poseAt(this.stops, this.progress, this.pose).day * DAY_MS
      if (this.hasSun) this.requested.sun = ms
      this.update()
      if (this.stillMs !== ms) {
        this.fine = "requested"
        this.pending.fine = ms
        this.pump()
      }
      const start = performance.now()
      while ((this.busy || this.pending.sun !== null || this.pending.earth !== null || this.pending.fine !== null || !this.hasSun) && performance.now() - start < 30_000 && !this.disposed) {
        await new Promise((resolve) => setTimeout(resolve, 2))
        // La primera vez el mapa grueso llega antes y el fino hay que volver a pedirlo.
        if (!this.busy && this.hasSun && this.fine !== "shown" && this.pending.fine === null) {
          this.fine = "requested"
          this.pending.fine = ms
          this.pump()
        }
      }
      this.stillMs = ms
      this.fineMix = 1
      this.calm = Math.min(Math.max(calm, 0), 1)
      this.paint(performance.now())
    } finally {
      this.holding = false
    }
  }

  /** Desactiva la resolución adaptativa: una captura no debe perder nitidez aunque el cuadro tarde. */
  lockResolution(): void {
    this.timer = null
    this.scale = 1
    this.applySize()
  }

  private paint(now: number): void {
    this.dirty = false
    this.drawnProgress = this.progress

    this.update()
    const u = this.terrain.uniforms
    u.uCalm.value = this.calm
    u.uSunFine.value = this.fineMix * this.fineMix * (3 - 2 * this.fineMix)
    this.collect(now)
    const gl = this.renderer.getContext() as WebGL2RenderingContext
    const timed = this.timer !== null && this.query === null
    if (timed) {
      this.query = gl.createQuery()
      gl.beginQuery(this.timer!.TIME_ELAPSED_EXT, this.query!)
      this.timing = true
    }
    this.renderer.render(this.scene, this.camera)
    if (timed) {
      gl.endQuery(this.timer!.TIME_ELAPSED_EXT)
      this.timing = false
    }
    this.o.onFrame?.(this)

    if (!this.ready && this.hasSun) {
      this.ready = true
      this.o.onReady?.()
    }
  }

  /** Proyecta un punto del marco de la lámina (km) a píxeles CSS del lienzo. */
  project(point: readonly number[], out: ScreenPoint): ScreenPoint {
    this.tmp.set(point[0], point[1], point[2]).project(this.camera)
    out.x = (this.tmp.x * 0.5 + 0.5) * this.width
    out.y = (-this.tmp.y * 0.5 + 0.5) * this.height
    out.visible = this.tmp.z > -1 && this.tmp.z < 1 && out.x > -40 && out.x < this.width + 40 && out.y > -40 && out.y < this.height + 40
    return out
  }

  /** Dónde se ven el Sol y la Tierra en el lienzo (píxeles CSS). */
  bodyOnScreen(body: Layer, out: ScreenPoint): ScreenPoint {
    const mesh = body === "sun" ? this.sun : this.earth
    this.project([mesh.position.x, mesh.position.y, mesh.position.z], out)
    if (body === "sun" ? this.sunHidden : this.earthHidden) out.visible = false
    return out
  }

  dispose(): void {
    this.disposed = true
    if (this.query) (this.renderer.getContext() as WebGL2RenderingContext).deleteQuery(this.query)
    this.worker.terminate()
    for (const d of this.disposables) d.dispose()
  }

  // ---------------------------------------------------------------------------------------------------------

  /** Tamaño real del lienzo: el tope de píxeles y la escala adaptativa mandan sobre la densidad de la pantalla. */
  private applySize(): void {
    const budget = PIXEL_BUDGET[this.o.quality]
    const dpr = Math.max(0.5, Math.min(this.maxDpr, Math.sqrt(budget / (this.width * this.height))) * this.scale)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(this.width, this.height, false)
    // Los trazos nunca bajan de un píxel del lienzo.
    for (const material of [this.terrain, this.sphere]) material.uniforms.uPixel.value = Math.max(1, dpr)
    this.dirty = true
  }

  /**
   * Lee la última medición de la gráfica y ajusta la resolución del lienzo: baja si un cuadro le cuesta demasiado
   * y vuelve a subir si le sobra tiempo. Se mide el trabajo de la gráfica, no el intervalo entre cuadros, que
   * también cambia por el ahorro de energía o la frecuencia de la pantalla. Sin la extensión de medición, el lienzo
   * se queda con el tope de píxeles.
   */
  private collect(now: number): void {
    if (!this.timer || !this.query || this.timing) return
    const gl = this.renderer.getContext() as WebGL2RenderingContext
    if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return
    const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT) as boolean
    const ms = (gl.getQueryParameter(this.query, gl.QUERY_RESULT) as number) / 1e6
    gl.deleteQuery(this.query)
    this.query = null
    if (disjoint || !(ms > 0)) return
    this.gpuMs = this.gpuSamples === 0 ? ms : this.gpuMs + (ms - this.gpuMs) * 0.15
    this.gpuSamples++
    if (this.gpuSamples < 12 || now - this.lastScaleAt < 900) return
    // A 60 cuadros por segundo hay 16,7 ms por cuadro, y el navegador también necesita su parte para componer.
    const next = this.gpuMs > 12.5 && this.scale > 0.56 ? this.scale * 0.85 : this.gpuMs < 5 && this.scale < 1 ? Math.min(1, this.scale * 1.12) : this.scale
    if (next === this.scale) return
    this.scale = next
    this.lastScaleAt = now
    this.gpuSamples = 0
    this.applySize()
  }

  private update(): void {
    const { grid, ephemeris, startMs } = this.o
    const pose = poseAt(this.stops, this.progress, this.pose)
    const R = grid.radiusKm
    const aspect = this.width / this.height

    // Durante la entrada el día lo pone la página (el amanecer); al bajar se funde con el del recorrido.
    if (this.introDay !== null) pose.day += (this.introDay - pose.day) * Math.max(1 - this.progress, 0)
    this.timeMs = startMs + pose.day * DAY_MS
    skyAt(ephemeris, this.timeMs, this.sky)
    const { sun, earth } = this.sky
    const real = pose.real
    this.terrain.uniforms.uReal.value = real
    ;(this.terrain.uniforms.uSunDir.value as Vector3).set(sun[0], sun[1], sun[2])
    this.clear.copy(this.clearPrint).lerp(new Color(0, 0, 0), real)
    this.renderer.setClearColor(this.clear, 1)

    // --- Cámara -------------------------------------------------------------------------------------------
    const t = [0, 0, 0]
    toPlate(pose.at[0], pose.at[1], heightAt(grid, pose.at[0], pose.at[1]) + pose.lift, R, t)
    this.target.set(t[0], t[1], t[2])
    this.normal.set(t[0], t[1], t[2] + R).normalize()
    const bearing = pose.bearing * DEG
    this.forward.set(Math.sin(bearing), Math.cos(bearing), 0)
    this.forward.addScaledVector(this.normal, -this.forward.dot(this.normal)).normalize()
    const tilt = pose.tilt * DEG
    this.look.copy(this.normal).multiplyScalar(-Math.cos(tilt)).addScaledVector(this.forward, Math.sin(tilt))
    this.up.copy(this.normal).multiplyScalar(Math.sin(tilt)).addScaledVector(this.forward, Math.cos(tilt))
    const distance = pose.distance
    const camera = this.camera
    camera.position.copy(this.target).addScaledVector(this.look, -distance)

    // La cámara no entra en el terreno.
    let altitude = this.altitude(camera.position)
    const floor = MIN_ALTITUDE.print + (MIN_ALTITUDE.real - MIN_ALTITUDE.print) * real
    if (altitude < floor) {
      this.tmp.set(camera.position.x, camera.position.y, camera.position.z + R).normalize()
      camera.position.addScaledVector(this.tmp, floor - altitude)
      altitude = floor
    }
    camera.up.copy(this.up)
    camera.lookAt(this.target)
    // En vertical el campo se abre para no ver el terreno por un tubo. Entra de forma gradual, con la inclinación y
    // con lo estrecha que sea la pantalla, para que no haya saltos ni al picar ni al cambiar el tamaño de la ventana.
    const narrow = Math.min(Math.max((1 - aspect) / 0.25, 0), 1)
    const oblique = Math.min(Math.max((pose.tilt - 8) / 32, 0), 1)
    const widen = 1 + 0.45 * narrow * oblique * oblique * (3 - 2 * oblique)
    camera.fov = Math.min(pose.fov * widen, Math.max(62, pose.fov))
    camera.aspect = aspect
    const fromCenter = Math.hypot(camera.position.x, camera.position.y, camera.position.z + R)
    const horizon = Math.sqrt(Math.max(fromCenter * fromCenter - (R - SLAB_KM) * (R - SLAB_KM), 0))
    camera.far = Math.max(horizon * 1.2 + 80, distance * 2.5)
    camera.near = Math.max(0.05, Math.min(altitude * 0.3, distance * 0.4))
    const shiftX = pose.shift[0]
    const shiftY = pose.shift[1]
    if (shiftX !== 0 || shiftY !== 0) camera.setViewOffset(this.width, this.height, -shiftX * this.width, shiftY * this.height, this.width, this.height)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    // Malla según la distancia: de lejos, el detalle no se ve y solo cuesta.
    const close = distance < NEAR_KM
    this.near.visible = close
    this.far.visible = !close

    // --- Sol y Tierra -------------------------------------------------------------------------------------
    const far = camera.far * 0.9
    const sunMargin = BODY_MARGIN + (SUN_GLOW_MARGIN - BODY_MARGIN) * real
    ;(this.sun.material as ShaderMaterial).uniforms.uMargin.value = sunMargin
    this.place(this.sun, sun, far, SUN_RADIUS_RAD, sunMargin)
    this.place(this.earth, earth, far, EARTH_RADIUS_RAD)
    this.stars.visible = real > 0.001
    this.stars.position.copy(camera.position)
    this.stars.scale.setScalar(far * 0.98)
    this.sunHidden = this.blocked(sun)
    this.earthHidden = this.blocked(earth)

    // --- Uniformes ----------------------------------------------------------------------------------------
    const u = this.terrain.uniforms
    const horizontal = Math.hypot(sun[0], sun[1]) || 1
    ;(u.uCarto.value as Vector3).set((sun[0] / horizontal) * Math.cos(CARTO_ELEVATION), (sun[1] / horizontal) * Math.cos(CARTO_ELEVATION), Math.sin(CARTO_ELEVATION))
    u.uEarthLayer.value = pose.earth
    u.uRing.value = pose.ring
    const bearings = u.uBearings.value as number[]
    bearings[0] = sun[0] / horizontal
    bearings[1] = sun[1] / horizontal
    const eh = Math.hypot(earth[0], earth[1]) || 1
    bearings[2] = earth[0] / eh
    bearings[3] = earth[1] / eh

    // --- Sombras ------------------------------------------------------------------------------------------
    if (!(Math.abs(this.timeMs - this.requested.sun) < 45_000)) this.pending.sun = this.timeMs
    if (pose.earth > 0.001 && !(Math.abs(this.timeMs - this.requested.earth) < 600_000)) this.pending.earth = this.timeMs
    this.pump()
  }

  private place(mesh: Mesh, direction: readonly number[], distance: number, radius: number, margin = BODY_MARGIN): void {
    mesh.position.copy(this.camera.position)
    mesh.position.x += direction[0] * distance
    mesh.position.y += direction[1] * distance
    mesh.position.z += direction[2] * distance
    mesh.quaternion.copy(this.camera.quaternion)
    mesh.scale.setScalar(distance * Math.tan(radius) * margin)
  }

  /** Altura de un punto sobre el relieve (km). Fuera de la lámina, sobre la esfera de referencia. */
  private altitude(p: { x: number; y: number; z: number }): number {
    const { grid } = this.o
    const R = grid.radiusKm
    const zc = p.z + R
    const r = Math.hypot(p.x, p.y, zc)
    const colatitude = Math.acos(Math.min(Math.max(zc / r, -1), 1))
    const rho = 2 * R * Math.tan(colatitude / 2)
    const flat = Math.hypot(p.x, p.y)
    const xs = flat > 1e-9 ? (p.x / flat) * rho : 0
    const ys = flat > 1e-9 ? (p.y / flat) * rho : 0
    if (Math.abs(xs) > grid.extentKm || Math.abs(ys) > grid.extentKm) return r - R
    return r - R - heightAt(grid, xs, ys)
  }

  /** true si el relieve tapa la dirección dada, vista desde la cámara. */
  private blocked(direction: readonly number[]): boolean {
    const p = this.tmp
    let s = 0.4
    const origin = this.camera.position
    for (let i = 0; i < 220 && s < 700; i++) {
      p.set(origin.x + direction[0] * s, origin.y + direction[1] * s, origin.z + direction[2] * s)
      const a = this.altitude(p)
      if (a < 0) return true
      if (a > 30) return false
      s += Math.max(0.4, a * 0.5)
    }
    return false
  }

  /** Envía al worker el siguiente barrido pendiente: primero el Sol, después la Tierra y al final el mapa fino. */
  private pump(): void {
    if (this.busy || this.disposed) return
    const job = this.pending.sun !== null ? "sun" : this.pending.earth !== null ? "earth" : this.pending.fine !== null ? "fine" : null
    if (!job) return
    const ms = this.pending[job] as number
    this.pending[job] = null
    const layer: Layer = job === "earth" ? "earth" : "sun"
    if (job !== "fine") this.requested[layer] = ms
    const sky = skyAt(this.o.ephemeris, ms, { sun: [0, 0, 0], earth: [0, 0, 0] })
    const v = layer === "sun" ? sky.sun : sky.earth
    const horizontal = Math.hypot(v[0], v[1]) || 1e-9
    const buffer = this.spare[job]
    this.spare[job] = undefined
    this.busy = true
    // La columna de la rejilla crece con +X y la fila con -Y.
    this.worker.postMessage(
      { type: "sweep", id: ++this.requestId, layer, fine: job === "fine", ms, gx: v[0], gy: -v[1], tanE: v[2] / horizontal, disc: layer === "sun" ? SUN_RADIUS_RAD : 0, buffer },
      buffer ? [buffer] : [],
    )
  }

  private onSwept(result: Swept): void {
    if (this.disposed) return
    this.busy = false
    const job = result.fine ? "fine" : result.layer
    const stale = result.fine && (this.fine !== "requested" || result.ms !== this.timeMs)
    if (stale) {
      this.spare[job] = result.buffer
    } else {
      const map = this.maps[job]
      const previous = map.image.data as Uint8Array
      map.image.data = new Uint8Array(result.buffer)
      map.needsUpdate = true
      this.spare[job] = previous.buffer as ArrayBuffer
      const shear = this.terrain.uniforms[job === "fine" ? "uSunFineShear" : job === "sun" ? "uSunShear" : "uEarthShear"].value as Vector3
      shear.set(result.sweep.axis, result.sweep.k, result.sweep.umin)
      if (job === "fine") this.fine = "shown"
      if (job === "sun") this.hasSun = true
      this.dirty = true
    }
    this.pump()
  }
}
