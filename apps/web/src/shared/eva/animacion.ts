// Animación de EVA: cómo se ven sus ojos, su cuerpo y su luz en cada estado, y cómo pasa de uno a otro.
// Reglas puras (sin three ni React) para poder probarlas con `npm test`; EvaModelo solo copia la pose a las
// mallas y al shader. Todo es diseño de personaje: aquí no hay física real.
//
// Carácter (Estephano, 2026-11-15): normalmente seria. La sonrisa de arcos se reserva para cuando bromea o
// está contenta; en reposo mira con el párpado recto y la ceja nivelada.

/** Lo que EVA está haciendo. Los seis primeros son los de siempre; los tres últimos son nuevos y opcionales. */
export type EstadoEva =
  | "reposo"
  | "escuchando"
  | "pensando"
  | "hablando"
  | "bromeando"
  | "cansada"
  | "alegre"
  | "sorpresa"
  | "alerta"

export const ESTADOS: readonly EstadoEva[] = ["reposo", "escuchando", "pensando", "hablando", "bromeando", "cansada", "alegre", "sorpresa", "alerta"]

/** Lo que entra en cada cuadro. */
export type EntradaEva = {
  estado: EstadoEva
  /** Volumen de la voz, 0..1. */
  nivel: number
  /** Velocidad en pantalla, px por cuadro (x a la derecha, y hacia abajo). */
  vx: number
  vy: number
  /** Hacia dónde está el puntero visto desde EVA, −1..1 (x a la derecha, y hacia arriba); null si no hay. */
  puntero?: { x: number; y: number } | null
  /** La tienen sujeta (puntero abajo sobre ella). */
  sujeta?: boolean
  /** Movimiento reducido (prefers-reduced-motion): flota menos y no mira alrededor. */
  calma?: boolean
}

/** Pose de un cuadro: lo que EvaModelo copia tal cual. Los arreglos se reutilizan entre cuadros. */
export type PoseEva = {
  /**
   * Dos ojos × 16 valores, en el orden que lee el shader (4 vec4 por ojo):
   * centro x, centro y, semiancho, semialto · redondez, párpado, inclinación, sonrisa ·
   * barras, aro, giro, brillo · ceja: altura, inclinación, curva, luz.
   */
  ojos: Float32Array
  /** Altura de las 5 barras de cada ojo al hablar, 0..1. */
  niveles: Float32Array
  /**
   * Marcas del visor (corchetes y barrido), 16 valores: abertura, luz, fase de la luz que recorre el corchete,
   * nivel · alerta, batería baja, barrido (altura), barrido (luz) · centro x, centro y (fijo: los ojos se
   * mueven dentro), corrimiento por la mirada x, y · cuánto «busca» (pensando), y tres libres.
   */
  hud: Float32Array
  tiempo: number
  /** Altura de todo el cuerpo: flota, salta, se hunde. */
  y: number
  cabeceo: number
  guinada: number
  alabeo: number
  /** Inclinación de todo el conjunto al volar. */
  ladeoX: number
  ladeoZ: number
  /** Estirarse (>1) o aplastarse (<1) a lo alto. */
  estira: number
  luz: number
  falla: number
  lineas: number
  pulso: number
  propulsor: number
}

export type OpcionesAnimacion = {
  /** Semilla del azar: la misma semilla da los mismos parpadeos y miradas. */
  semilla?: number
  /** Vida propia: parpadea, mira alrededor y repasa el visor. Apagada da poses fijas (para la lámina). */
  vida?: boolean
  /** Secuencia de encendido al nacer. */
  encendido?: boolean
}

export type AnimacionEva = {
  /** Avanza `dt` segundos y devuelve la pose. */
  paso(dt: number, entrada: EntradaEva): PoseEva
  /** Con pausa, `paso` devuelve la última pose sin avanzar. */
  pausa: boolean
  readonly pose: PoseEva
}

// ───────────────────────────── Gestos ─────────────────────────────
// Medidas de la pantalla del visor en radianes sobre la esfera (x a la derecha, y hacia arriba).

type Ojo = {
  /** Separación desde el centro del visor (cada ojo va a su lado). */
  x: number
  y: number
  ancho: number
  alto: number
  /** 0 = rectángulo, 1 = píldora. */
  redondez: number
  /** Párpado de arriba: 0 abierto, 1 cerrado. Corta recto: es lo que la hace ver seria. */
  parpado: number
  /** Del párpado: + baja hacia la nariz (decidida), − baja hacia afuera (caída). */
  inclinacion: number
  /** 0..1: una curva muerde el ojo por abajo y queda un arco (ojos que sonríen). */
  sonrisa: number
  /** 0..1: el ojo se parte en 5 barras que suben y bajan con la voz. */
  barras: number
  /** 0..1: hueco, queda un aro. */
  anillo: number
  giro: number
  cejaY: number
  cejaInclinacion: number
  cejaCurva: number
  cejaLuz: number
}

type Gesto = {
  ojos: [Ojo, Ojo]
  cabeceo: number
  guinada: number
  alabeo: number
  altura: number
  /** Corchetes: cuánto se abren y cuánto brillan. */
  corchete: number
  corcheteLuz: number
  luz: number
  lineas: number
  pulso: number
  propulsor: number
  /** 0..1: marcas del visor en rojo. */
  alerta: number
  /** 0..1: batería baja (una marca roja que parpadea y la luz titila). */
  bateria: number
}

const OJO: Ojo = {
  x: 0.265,
  y: -0.03,
  ancho: 0.115,
  alto: 0.1,
  redondez: 0.9,
  parpado: 0,
  inclinacion: 0,
  sonrisa: 0,
  barras: 0,
  anillo: 0,
  giro: 0,
  cejaY: 0.165,
  cejaInclinacion: 0,
  cejaCurva: 0,
  cejaLuz: 0.75,
}
const CUERPO = { cabeceo: 0, guinada: 0, alabeo: 0, altura: 0, corchete: 0, corcheteLuz: 0.65, luz: 1, lineas: 0.35, pulso: 0.12, propulsor: 0.75, alerta: 0, bateria: 0 }
const ojo = (o: Partial<Ojo>): Ojo => ({ ...OJO, ...o })
const iguales = (o: Partial<Ojo>): [Ojo, Ojo] => [ojo(o), ojo(o)]

type NombreGesto = EstadoEva | "molesta"

const GESTOS: Record<NombreGesto, Gesto> = {
  // Seria: media luna (párpado recto arriba, fondo redondo) y ceja que baja un poco hacia la nariz.
  // Ni triste ni enojada.
  reposo: { ...CUERPO, ojos: iguales({ y: 0.01, ancho: 0.113, alto: 0.105, redondez: 1, parpado: 0.4, cejaY: 0.125, cejaInclinacion: 0.13 }) },
  // Atenta: ojos abiertos en aro y cejas arriba; ladea la cabeza.
  escuchando: {
    ...CUERPO,
    ojos: iguales({ y: -0.015, ancho: 0.108, alto: 0.108, redondez: 1, parpado: 0.1, anillo: 1, cejaY: 0.188, cejaCurva: 0.25, cejaLuz: 0.85 }),
    alabeo: 0.16,
    cabeceo: -0.05,
    corchete: 0.018,
    corcheteLuz: 0.95,
    lineas: 0.5,
    pulso: 0.3,
  },
  // Dudando: un ojo entrecerrado y la otra ceja arriba; la mirada (arriba y a un lado) la pone `paso`.
  pensando: {
    ...CUERPO,
    ojos: [
      ojo({ y: 0, ancho: 0.11, alto: 0.095, redondez: 1, parpado: 0.56, cejaY: 0.1, cejaInclinacion: 0.16 }),
      ojo({ y: 0, ancho: 0.113, alto: 0.1, redondez: 1, parpado: 0.28, cejaY: 0.19, cejaInclinacion: -0.06, cejaCurva: 0.3 }),
    ],
    alabeo: -0.16,
    cabeceo: -0.12,
    guinada: 0.25,
    lineas: 0.6,
    pulso: 1,
    corcheteLuz: 0.9,
  },
  // Su voz: cada ojo son cinco barras que siguen el volumen.
  hablando: {
    ...CUERPO,
    ojos: iguales({ ancho: 0.125, alto: 0.105, redondez: 0.5, barras: 1, cejaY: 0.176, cejaInclinacion: 0.06, cejaLuz: 0.6 }),
    corcheteLuz: 0.85,
    lineas: 0.45,
    pulso: 0.4,
  },
  // Guiño: un arco alegre y el otro ojo cerrado en una raya ladeada.
  bromeando: {
    ...CUERPO,
    ojos: [
      ojo({ ancho: 0.12, alto: 0.1, redondez: 1, sonrisa: 1, cejaY: 0.188, cejaInclinacion: -0.05, cejaCurva: 0.6, cejaLuz: 0.9 }),
      ojo({ ancho: 0.105, alto: 0.016, redondez: 1, giro: -0.34, cejaY: 0.118, cejaInclinacion: 0.2, cejaLuz: 0.9 }),
    ],
    alabeo: 0.12,
    lineas: 0.7,
    pulso: 0.6,
  },
  // Sin batería: luz baja, párpados caídos hacia afuera, la cabeza se le va.
  cansada: {
    ...CUERPO,
    ojos: iguales({ y: -0.04, ancho: 0.105, alto: 0.09, redondez: 1, parpado: 0.66, inclinacion: -0.2, cejaY: 0.085, cejaInclinacion: -0.2, cejaLuz: 0.35 }),
    cabeceo: 0.3,
    alabeo: -0.05,
    altura: -0.06,
    luz: 0.42,
    lineas: 0.1,
    pulso: 0,
    propulsor: 0.28,
    corcheteLuz: 0.3,
    bateria: 1,
  },
  // Contenta: los dos arcos de la referencia. No es su cara de siempre.
  alegre: {
    ...CUERPO,
    ojos: iguales({ ancho: 0.12, alto: 0.1, redondez: 1, sonrisa: 1, cejaY: 0.188, cejaInclinacion: -0.04, cejaCurva: 0.6, cejaLuz: 0.9 }),
    alabeo: 0.07,
    altura: 0.02,
    lineas: 0.65,
    pulso: 0.5,
  },
  // Sobresalto: aros grandes, cejas muy arriba, se echa atrás.
  sorpresa: {
    ...CUERPO,
    ojos: iguales({ y: -0.02, ancho: 0.125, alto: 0.125, redondez: 1, anillo: 1, cejaY: 0.215, cejaCurva: 0.5, cejaLuz: 1 }),
    cabeceo: -0.1,
    altura: 0.09,
    corchete: 0.05,
    corcheteLuz: 1,
    lineas: 0.9,
    pulso: 0.8,
  },
  // Aviso crítico: ojos estrechos, ceja baja y las marcas del visor en rojo. Grave, no furiosa.
  alerta: {
    ...CUERPO,
    ojos: iguales({ y: 0.01, ancho: 0.118, alto: 0.1, redondez: 0.95, parpado: 0.52, inclinacion: 0.1, cejaY: 0.098, cejaInclinacion: 0.17, cejaLuz: 1 }),
    cabeceo: 0.07,
    altura: 0.02,
    corcheteLuz: 1,
    alerta: 1,
    lineas: 0.55,
    pulso: 0.8,
  },
  // Después de que la arrastran: párpados a medias y cejas rectas, un momento.
  molesta: {
    ...CUERPO,
    ojos: iguales({ y: 0.01, ancho: 0.113, alto: 0.1, redondez: 1, parpado: 0.58, cejaY: 0.092, cejaLuz: 0.8 }),
    cabeceo: 0.05,
    lineas: 0.3,
  },
}

// ───────────────────────────── Canales con resorte ─────────────────────────────

const N_OJO = 15
const X = 0
const Y = 1
const ANCHO = 2
const ALTO = 3
const REDONDEZ = 4
const PARPADO = 5
const INCLINACION = 6
const SONRISA = 7
const BARRAS = 8
const ANILLO = 9
const GIRO = 10
const CEJA_Y = 11
const CEJA_INCL = 12
const CEJA_CURVA = 13
const CEJA_LUZ = 14
const CABECEO = 30
const GUINADA = 31
const ALABEO = 32
const ALTURA = 33
const CORCHETE = 34
const CORCHETE_LUZ = 35
const LUZ = 36
const LINEAS = 37
const PULSO = 38
const PROPULSOR = 39
const ALERTA = 40
const BATERIA = 41
const N_GESTO = 42
const MIRA_X = 42
const MIRA_Y = 43
const CABEZA_X = 44
const CABEZA_Y = 45
const LADEO_Z = 46
const LADEO_X = 47
const GIRO_VUELO = 48
const ESTIRA = 49
const N = 50

function aCanales(g: Gesto) {
  const c = new Float32Array(N_GESTO)
  g.ojos.forEach((o, i) => {
    const b = i * N_OJO
    c[b + X] = o.x
    c[b + Y] = o.y
    c[b + ANCHO] = o.ancho
    c[b + ALTO] = o.alto
    c[b + REDONDEZ] = o.redondez
    c[b + PARPADO] = o.parpado
    c[b + INCLINACION] = o.inclinacion
    c[b + SONRISA] = o.sonrisa
    c[b + BARRAS] = o.barras
    c[b + ANILLO] = o.anillo
    c[b + GIRO] = o.giro
    c[b + CEJA_Y] = o.cejaY
    c[b + CEJA_INCL] = o.cejaInclinacion
    c[b + CEJA_CURVA] = o.cejaCurva
    c[b + CEJA_LUZ] = o.cejaLuz
  })
  c[CABECEO] = g.cabeceo
  c[GUINADA] = g.guinada
  c[ALABEO] = g.alabeo
  c[ALTURA] = g.altura
  c[CORCHETE] = g.corchete
  c[CORCHETE_LUZ] = g.corcheteLuz
  c[LUZ] = g.luz
  c[LINEAS] = g.lineas
  c[PULSO] = g.pulso
  c[PROPULSOR] = g.propulsor
  c[ALERTA] = g.alerta
  c[BATERIA] = g.bateria
  return c
}
const OBJETIVO = Object.fromEntries(Object.entries(GESTOS).map(([k, g]) => [k, aCanales(g)])) as Record<NombreGesto, Float32Array>

// Cada canal es un resorte: frecuencia (Hz) y amortiguamiento (1 = sin rebote). Los ojos y las cejas
// rebotan un poco al llegar; la luz no.
const FREC = new Float32Array(N)
const AMORT = new Float32Array(N)
const resorte = (desde: number, hasta: number, hz: number, amort: number) => {
  for (let i = desde; i <= hasta; i++) {
    FREC[i] = hz
    AMORT[i] = amort
  }
}
for (const b of [0, N_OJO]) {
  resorte(b + X, b + Y, 3, 0.72)
  resorte(b + ANCHO, b + GIRO, 3.4, 0.62)
  resorte(b + PARPADO, b + INCLINACION, 3.6, 0.7)
  resorte(b + SONRISA, b + ANILLO, 3.2, 0.85)
  resorte(b + CEJA_Y, b + CEJA_CURVA, 3, 0.52)
  resorte(b + CEJA_LUZ, b + CEJA_LUZ, 2.4, 1)
}
resorte(CABECEO, ALABEO, 1.5, 0.68)
resorte(ALTURA, ALTURA, 1.9, 0.48)
resorte(CORCHETE, CORCHETE, 2.8, 0.5)
resorte(CORCHETE_LUZ, BATERIA, 2.2, 1)
resorte(MIRA_X, MIRA_Y, 5, 0.85)
resorte(CABEZA_X, CABEZA_Y, 1.3, 0.9)
resorte(LADEO_Z, LADEO_X, 1.6, 0.5)
resorte(GIRO_VUELO, GIRO_VUELO, 1.4, 0.75)
resorte(ESTIRA, ESTIRA, 4, 0.38)

// ───────────────────────────── Utilidades ─────────────────────────────

const TAU = Math.PI * 2
const acotar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const suave = (a: number, b: number, x: number) => {
  const t = acotar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** Azar repetible (mulberry32). */
function azar(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Ruido fijo por instante (no depende de la semilla): titilar de la luz. */
const ruido = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

type Parpadeo = { cerrar: number; quieto: number; abrir: number }
const PARPADEO: Parpadeo = { cerrar: 0.065, quieto: 0.035, abrir: 0.13 }
const PARPADEO_CAMBIO: Parpadeo = { cerrar: 0.05, quieto: 0.03, abrir: 0.12 }
const PARPADEO_LENTO: Parpadeo = { cerrar: 0.17, quieto: 0.2, abrir: 0.3 }
/** Cada cuántos segundos parpadea en cada gesto ([mínimo, máximo]); sin entrada, no parpadea. */
const CADA_PARPADEO: Partial<Record<NombreGesto, [number, number]>> = {
  reposo: [2.6, 6.2],
  escuchando: [3.6, 7],
  pensando: [1.8, 4],
  cansada: [1.6, 3.2],
  alegre: [2.5, 5],
  alerta: [4, 8],
  molesta: [1.2, 2],
}
// Silueta del ecualizador: las barras del centro llegan más alto, como un ojo.
const SILUETA = [0.72, 0.92, 1, 0.92, 0.72]

/** Crea la animación de una EVA. Una por instancia. */
export function crearAnimacion(opciones: OpcionesAnimacion = {}): AnimacionEva {
  const { semilla = 1, vida = true, encendido = true } = opciones
  const r = azar(semilla)
  const val = new Float32Array(N)
  const vel = new Float32Array(N)
  const obj = new Float32Array(N)
  val.set(OBJETIVO.reposo)
  val[ESTIRA] = 1

  const pose: PoseEva = {
    ojos: new Float32Array(32),
    niveles: new Float32Array(10).fill(1),
    hud: new Float32Array(16),
    tiempo: 0,
    y: 0,
    cabeceo: 0,
    guinada: 0,
    alabeo: 0,
    ladeoX: 0,
    ladeoZ: 0,
    estira: 1,
    luz: 1,
    falla: 0,
    lineas: 0,
    pulso: 0,
    propulsor: 0,
  }

  let t = 0
  let estado: EstadoEva = "reposo"
  let gesto: NombreGesto = "reposo"
  let enGesto = 0 // segundos en el gesto actual
  let ritmo = 1 // qué tan rápido va hacia el gesto (cansada: despacio)

  let reaccion: NombreGesto | null = null
  let reaccionHasta = 0
  let enfriamiento = 0
  let sujetaAntes = false
  let arrastre = 0
  let vxAntes = 0
  let vyAntes = 0
  let volando = false

  let parpadeo: Parpadeo = PARPADEO
  let parpadeoInicio = -1
  let parpadeoOtro = false // falta un segundo parpadeo seguido
  let proximoParpadeo = 1.4 + r() * 2.2

  let miradaX = 0
  let miradaY = 0
  let miradaHasta = 0
  let proximaMirada = 2.5 + r() * 3

  let barridoInicio = -1
  let proximoBarrido = 5 + r() * 5

  let nivel = 0 // volumen suavizado
  let hudNivel = 1
  let hudGiro = 0
  let busca = 0
  let saltoEnv = 0
  let falla = 0
  let destello = 0
  let titila = 1

  const parpadear = (p: Parpadeo) => {
    parpadeo = p
    parpadeoInicio = t
  }
  const cierre = () => {
    if (parpadeoInicio < 0) return 0
    const d = t - parpadeoInicio
    const { cerrar, quieto, abrir } = parpadeo
    if (d < cerrar) return suave(0, cerrar, d)
    if (d < cerrar + quieto) return 1
    if (d < cerrar + quieto + abrir) return 1 - suave(0, abrir, d - cerrar - quieto)
    parpadeoInicio = -1
    return 0
  }

  const alCambiar = (antes: NombreGesto, ahora: NombreGesto) => {
    enGesto = 0
    ritmo = ahora === "cansada" ? 0.42 : antes === "cansada" ? 0.8 : 1
    // Con parpadeo: los ojos cambian de forma mientras están cerrados. Las barras de la voz entran y salen
    // sin parpadear; el sobresalto abre de golpe; el cansancio cae despacio.
    const directo = ahora === "hablando" || antes === "hablando" || ahora === "sorpresa" || ahora === "cansada"
    if (!directo) parpadear(PARPADEO_CAMBIO)
    if (antes === "cansada") falla = 1 // vuelve la corriente
    if (ahora === "sorpresa") {
      vel[ALTURA] += 1.5
      vel[ESTIRA] += 1.4
      destello = 0.7
    } else if (ahora === "alerta") {
      vel[ALTURA] += 0.5
      falla = 1
      destello = 0.5
    } else if (ahora === "bromeando" || ahora === "alegre") {
      vel[ALTURA] += 0.7
      destello = 0.35
    } else if (ahora === "escuchando") vel[ALTURA] += 0.35
    else if (ahora === "hablando") vel[ALTURA] += 0.22
    proximoParpadeo = t + 0.9 + r() * 2
  }

  function paso(dtCrudo: number, e: EntradaEva): PoseEva {
    if (api.pausa) return pose
    const dt = acotar(Number.isFinite(dtCrudo) ? dtCrudo : 0, 0, 0.05)
    t += dt
    enGesto += dt
    const calma = !!e.calma
    const sujeta = !!e.sujeta
    const vx = Number.isFinite(e.vx) ? e.vx : 0
    const vy = Number.isFinite(e.vy) ? e.vy : 0
    const rapidez = Math.hypot(vx, vy)
    const voz = acotar(Number.isFinite(e.nivel) ? e.nivel : 0, 0, 1)
    nivel += (voz - nivel) * (1 - Math.exp(-dt / (voz > nivel ? 0.03 : 0.14)))

    // ── Reacciones al tacto: al tocarla se hunde un poco y parpadea; si la arrastran rápido se sobresalta;
    //    al soltarla después de un paseo largo queda un momento con cara de pocos amigos.
    if (sujeta && !sujetaAntes) {
      arrastre = 0
      vel[ALTURA] -= 0.55
      vel[ESTIRA] -= 0.9
      if (gesto !== "hablando") parpadear(PARPADEO_CAMBIO)
    }
    if (sujeta) {
      arrastre += rapidez
      if (rapidez > 5) {
        reaccion = "sorpresa"
        reaccionHasta = t + 0.45
      }
    } else {
      if (sujetaAntes && arrastre > 240) {
        reaccion = "molesta"
        reaccionHasta = t + 1.1
      }
      // Un tirón brusco sin sujetarla (cambio de velocidad que el vuelo normal no da).
      if (Math.hypot(vx - vxAntes, vy - vyAntes) > 34 && t > enfriamiento) {
        reaccion = "sorpresa"
        reaccionHasta = t + 0.6
        enfriamiento = t + 2.5
      }
    }
    // Al llegar de un vuelo se asienta: un parpadeo y un pequeño hundirse.
    if (rapidez > 6) volando = true
    else if (volando && rapidez < 1) {
      volando = false
      if (!sujeta) {
        vel[ALTURA] -= 0.3
        if (gesto !== "hablando" && gesto !== "bromeando" && parpadeoInicio < 0) parpadear(PARPADEO)
      }
    }
    sujetaAntes = sujeta
    vxAntes = vx
    vyAntes = vy
    if (reaccion && t > reaccionHasta) reaccion = null

    estado = e.estado
    const g: NombreGesto = reaccion ?? estado
    if (g !== gesto) {
      alCambiar(gesto, g)
      gesto = g
    }

    // ── Objetivos: el gesto y lo que se mueve dentro de él.
    obj.set(OBJETIVO[g] ?? OBJETIVO.reposo)
    obj[ESTIRA] = 1
    let salto = 0
    let cierreExtra = 0
    if (g === "reposo") {
      if (!calma) obj[ALABEO] += Math.sin(t * 0.7) * 0.035 - (t < miradaHasta ? miradaX * 0.05 : 0)
      obj[LINEAS] += 0.08 * Math.sin(t * 0.9) // las líneas respiran
    } else if (g === "escuchando") {
      obj[CORCHETE] += nivel * 0.03
    } else if (g === "hablando") {
      // Asiente con los golpes de voz en vez de bambolearse.
      obj[CABECEO] += -0.02 + 0.09 * nivel
      obj[ALABEO] += Math.sin(t * 1.7) * 0.03
      obj[CEJA_Y] += 0.02 * nivel
      obj[N_OJO + CEJA_Y] += 0.02 * nivel
    } else if (g === "bromeando") {
      obj[ALABEO] += Math.sin(enGesto * 9) * 0.05
    } else if (g === "alegre") {
      obj[ALTURA] += Math.abs(Math.sin(enGesto * 5)) * 0.03 * Math.exp(-enGesto * 1.2)
    } else if (g === "cansada") {
      // Cabecea: se le va la cabeza despacio, se le cierran los ojos y se endereza de golpe.
      const f = (enGesto % 4.4) / 4.4
      const cae = f < 0.8 ? suave(0, 0.8, f) : 1 - suave(0.8, 0.88, f)
      obj[CABECEO] += 0.13 * cae - 0.05 * suave(0.8, 0.86, f) * (1 - suave(0.9, 1, f))
      cierreExtra = 0.7 * cae
    } else if (g === "alerta") {
      obj[CEJA_Y] -= 0.012 * nivel
      obj[N_OJO + CEJA_Y] -= 0.012 * nivel
    }
    // Rebote de la broma: entra y sale con una envolvente para no dar saltos.
    saltoEnv += ((g === "bromeando" ? 1 : 0) - saltoEnv) * (1 - Math.exp(-dt / 0.1))
    const bote = Math.abs(Math.sin(enGesto * 6.2))
    salto = bote * 0.07 * saltoEnv
    obj[ESTIRA] += saltoEnv * (0.07 * bote - 0.035)

    // ── Mirada: a dónde apuntan los ojos (rápido) y la cabeza (despacio, los ojos llegan antes).
    if (vida && !calma && g === "reposo" && t >= proximaMirada) {
      miradaX = (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.45)
      miradaY = -0.25 + r() * 0.6
      miradaHasta = t + 0.7 + r() * 1
      proximaMirada = miradaHasta + (r() < 0.3 ? 0.25 : 2.8 + r() * 4.5)
    }
    let gx = 0
    let gy = 0
    let cabeza = 1
    if (g === "pensando") {
      gx = 0.62
      gy = 0.7
      cabeza = 0 // la postura ya gira la cabeza
    } else if (g === "cansada") {
      gy = -0.55
      cabeza = 0
    } else if (rapidez > 2.5 && !sujeta) {
      // Mira hacia donde vuela.
      const k = Math.min(1, rapidez / 18)
      gx = (vx / rapidez) * k
      gy = (-vy / rapidez) * k * 0.8
    } else if (e.puntero && (g === "reposo" || g === "alegre" || g === "alerta" || g === "sorpresa" || g === "molesta")) {
      gx = acotar(e.puntero.x, -1, 1)
      gy = acotar(e.puntero.y, -1, 1)
    } else if (g === "reposo" && t < miradaHasta) {
      gx = miradaX
      gy = miradaY
    }
    obj[MIRA_X] = gx
    obj[MIRA_Y] = gy
    obj[CABEZA_X] = gx * cabeza
    obj[CABEZA_Y] = gy * cabeza
    // ── Vuelo: se inclina hacia donde va y gira la cara hacia allá.
    obj[LADEO_Z] = acotar(-vx * 0.012, -0.35, 0.35)
    obj[LADEO_X] = acotar(vy * 0.008, -0.25, 0.25)
    obj[GIRO_VUELO] = acotar(vx * 0.03, -0.7, 0.7)

    // ── Resortes (pasos cortos: estable aunque el cuadro llegue tarde).
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / sub
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < N; i++) {
        const w = TAU * FREC[i] * (i < N_GESTO ? ritmo : 1)
        vel[i] += (w * w * (obj[i] - val[i]) - 2 * AMORT[i] * w * vel[i]) * h
        val[i] += vel[i] * h
      }
    }

    // ── Parpadeo.
    const cada = CADA_PARPADEO[g]
    if (vida && cada && parpadeoInicio < 0 && t >= proximoParpadeo) {
      parpadear(g === "cansada" ? PARPADEO_LENTO : PARPADEO)
      if (parpadeoOtro) {
        parpadeoOtro = false
        proximoParpadeo = t + cada[0] + r() * (cada[1] - cada[0])
      } else if (g !== "cansada" && r() < 0.18) {
        parpadeoOtro = true
        proximoParpadeo = t + 0.3
      } else proximoParpadeo = t + cada[0] + r() * (cada[1] - cada[0])
    }
    const cerrado = g === "hablando" || g === "bromeando" ? 0 : Math.max(cierre(), cierreExtra)

    // ── Repaso del visor: una línea de luz que baja por la pantalla.
    const repasa = g === "pensando" ? 1.5 : g === "reposo" || g === "escuchando" || g === "alerta" || g === "alegre" ? 0 : -1
    if (barridoInicio < 0 && repasa >= 0 && (repasa > 0 ? enGesto > 0.25 && t >= proximoBarrido : vida && t >= proximoBarrido)) {
      barridoInicio = t
      proximoBarrido = t + (repasa > 0 ? repasa : 7 + r() * 6)
    }
    let barridoY = 0
    let barridoLuz = 0
    if (barridoInicio >= 0) {
      const f = (t - barridoInicio) / 0.9
      if (f >= 1) barridoInicio = -1
      else {
        barridoY = 0.36 - 0.72 * f
        barridoLuz = Math.sin(Math.PI * f)
      }
    }

    // ── Luz: titila con la batería baja, destella al sobresaltarse, se corre un instante con las fallas.
    const b = acotar(val[BATERIA], 0, 1)
    titila += ((ruido(Math.floor(t * 12)) < 0.11 ? 0.45 : 1) - titila) * (1 - Math.exp(-dt / 0.025))
    destello *= Math.exp(-dt / 0.14)
    falla *= Math.exp(-dt / 0.09)

    // ── Encendido: una raya que se abre a lo ancho, luego a lo alto; después llegan cejas, corchetes y líneas.
    const enc = encendido ? t : 10
    const encLuz = suave(0.1, 0.3, enc)
    const encRaya = suave(0.12, 0.42, enc)
    const encAbre = suave(0.42, 0.8, enc)
    const encHud = suave(0.7, 1.15, enc)
    const encOla = suave(0.6, 0.9, enc) * (1 - suave(1.2, 1.9, enc))
    const fallaTotal = Math.max(falla, 1 - suave(0.12, 0.5, enc))

    // ── Pose: ojos.
    const mx = val[MIRA_X] - 0.55 * val[CABEZA_X]
    const my = val[MIRA_Y] - 0.55 * val[CABEZA_Y]
    for (let i = 0; i < 2; i++) {
      const c = i * N_OJO
      const o = i * 16
      const lado = i === 0 ? -1 : 1
      pose.ojos[o] = lado * val[c + X] + mx * 0.085
      pose.ojos[o + 1] = val[c + Y] + my * 0.05
      pose.ojos[o + 2] = Math.max(0.004, val[c + ANCHO]) * encRaya
      pose.ojos[o + 3] = Math.max(0, val[c + ALTO]) * (1 - 0.93 * cerrado) * encAbre
      pose.ojos[o + 4] = acotar(val[c + REDONDEZ], 0, 1)
      pose.ojos[o + 5] = acotar(val[c + PARPADO], 0, 1)
      pose.ojos[o + 6] = val[c + INCLINACION]
      pose.ojos[o + 7] = acotar(val[c + SONRISA], 0, 1)
      pose.ojos[o + 8] = acotar(val[c + BARRAS], 0, 1)
      pose.ojos[o + 9] = acotar(val[c + ANILLO], 0, 1) * (1 - cerrado)
      pose.ojos[o + 10] = val[c + GIRO]
      pose.ojos[o + 11] = 1
      pose.ojos[o + 12] = val[c + CEJA_Y] - 0.014 * cerrado
      pose.ojos[o + 13] = val[c + CEJA_INCL]
      pose.ojos[o + 14] = val[c + CEJA_CURVA]
      pose.ojos[o + 15] = acotar(val[c + CEJA_LUZ], 0, 1) * encHud
      // Barras: se mueven siempre que habla; el volumen las hace crecer.
      for (let k = 0; k < 5; k++) {
        const ola = 0.5 + 0.5 * Math.sin(t * (8.2 + k * 1.37) + k * 1.9 + i * 2.3)
        pose.niveles[i * 5 + k] = acotar(SILUETA[k] * (0.26 + (0.22 + 0.52 * nivel) * ola), 0.08, 1)
      }
    }

    // ── Pose: marcas del visor.
    if (g === "pensando") {
      hudGiro += dt * 4.2
      hudNivel = (t * 1.4) % 1
    } else {
      hudGiro %= TAU
      const meta = hudGiro > Math.PI ? TAU : 0
      hudGiro += (meta - hudGiro) * (1 - Math.exp(-dt / 0.12))
      const lleno = g === "hablando" || g === "escuchando" ? 0.2 + 0.8 * Math.min(1, nivel * 1.4) : g === "cansada" ? 0.34 : 1
      hudNivel += (lleno - hudNivel) * (1 - Math.exp(-dt / 0.06))
    }
    busca += ((g === "pensando" ? 1 : 0) - busca) * (1 - Math.exp(-dt / 0.15))
    pose.hud[12] = busca
    const luz = acotar(val[LUZ], 0, 1.2) * (1 - b * (1 - titila)) * (1 + destello) * encLuz
    pose.hud[0] = val[CORCHETE]
    pose.hud[1] = acotar(val[CORCHETE_LUZ], 0, 1) * encHud
    pose.hud[2] = hudGiro
    pose.hud[3] = hudNivel
    pose.hud[4] = acotar(val[ALERTA], 0, 1)
    pose.hud[5] = b
    pose.hud[6] = barridoY
    pose.hud[7] = barridoLuz
    pose.hud[8] = OJO.x
    pose.hud[9] = OJO.y
    pose.hud[10] = mx * 0.04
    pose.hud[11] = my * 0.025

    // ── Pose: cuerpo y luces.
    const flota = (Math.sin(t * 1.5) * 0.05 + Math.sin(t * 0.83 + 1.3) * 0.018) * (calma ? 0.3 : 1) * (1 - 0.4 * b)
    pose.tiempo = t
    pose.y = flota + val[ALTURA] + salto
    pose.cabeceo = val[CABECEO] - val[CABEZA_Y] * 0.16
    pose.guinada = val[GUINADA] + val[CABEZA_X] * 0.3 + val[GIRO_VUELO]
    pose.alabeo = val[ALABEO]
    pose.ladeoX = val[LADEO_X]
    pose.ladeoZ = val[LADEO_Z]
    pose.estira = acotar(val[ESTIRA], 0.86, 1.14)
    pose.luz = luz
    pose.falla = acotar(fallaTotal, 0, 1)
    pose.lineas = acotar(val[LINEAS] + 0.25 * nivel * (g === "hablando" || g === "alerta" ? 1 : 0), 0, 1.2) * encHud * (0.4 + 0.6 * acotar(luz, 0, 1))
    pose.pulso = Math.max(acotar(val[PULSO], 0, 1), encOla)
    pose.propulsor =
      acotar(val[PROPULSOR] * (1 + 0.12 * Math.sin(t * 3.1)) + (g === "hablando" ? nivel * 0.35 : 0) + acotar(-vy * 0.02, 0, 0.5) + Math.abs(vel[ALTURA]) * 0.25, 0, 1.6) *
      (1 - 0.5 * b * (1 - titila)) *
      suave(0.3, 1, enc) *
      (1 + 0.5 * encOla)
    return pose
  }

  const api: AnimacionEva = { paso, pausa: false, pose }
  // Un primer paso sin tiempo deja la pose lista antes del primer cuadro.
  paso(0, { estado: "reposo", nivel: 0, vx: 0, vy: 0 })
  return api
}
