// E26.1: descenso con motor del LM del Apollo, con el guiado polinómico del Apollo. Funciones puras, sin React ni three.
//
// Fuentes:
// - Guiado: Klumpp, "Apollo Lunar-Descent Guidance", MIT Draper Lab R-695 (1971), pp. 14–18 (R-695). Cada fase (P63
//   frenado, P64 aproximación) sigue una cuártica hacia atrás desde su punto objetivo; la aceleración a ordenar es
//   ACG = 12(RTG − RG)/T² + 6(VTG + VG)/T + ATG (ec. 7), con T < 0 el tiempo referido al objetivo, que se recalcula en cada
//   pasada como raíz de la cúbica de la sacudida en la dirección del avance (ec. 12). P66: velocidad horizontal a cero y
//   velocidad vertical de referencia (pp. 31–32). Regulador: empuje fijo máximo o dentro de la región permitida (p. 8).
// - Perfil y masas del Apollo 11 (premisión): NASA TN D-6846 (1972), tabla I y pp. 9–12 (TN). Motor: "Apollo experience
//   report: Descent propulsion system" (1973), p. 7 (DPS). Constantes: FA tabla B.4, p. 673.
//
// Simplificaciones (declaradas): masa puntual; Luna esférica de 1737,4 km sin rotación ni relieve (el suelo es la esfera en
// el sitio); descenso en un plano (sin desvío lateral); actitud instantánea (sin piloto automático); guiado sin el retardo
// de cálculo (ec. 7 en vez de 11); objetivos de cada fase extrapolados desde su término con aceleración constante y
// sacudida objetivo 0 (R-695 no publica los valores numéricos de los objetivos, solo cómo se eligen, pp. 51–56).

/** μ de la Luna (m³/s²): 4902,801 km³/s² (FA tabla B.4, p. 673). */
export const MU_LUNA = 4.902801e12
const R = 1_737_400
const PIE = 0.3048
const LIBRA = 0.45359237
/** g₀ de la definición del impulso específico (m/s², valor estándar). */
const G0 = 9.80665

/** El LM del Apollo 11 en el descenso. */
export const LM_APOLLO11 = {
  /** "approximately 34 000 pounds" al inicio del descenso (TN p. 32, crecimiento de peso del LM). */
  masaInicialKg: 34_000 * LIBRA,
  /** Combustible disponible para ΔV: 17 934,6 lb (TN tabla II). */
  combustibleKg: 17_934.6 * LIBRA,
  /** Empuje nominal del motor de descenso: 46 706 N = 10 500 lbf (R-695 p. 8; DPS p. 7). */
  empujeNominalN: 46_706,
  /** Punto de empuje fijo máximo: 92,5 % (DPS p. 7). */
  fraccionMaxima: 0.925,
  /** Región permitida del regulador: 11 % a 65 % (R-695 p. 8). */
  regionPermitida: [0.11, 0.65] as const,
  /** Impulso específico al final del ciclo de trabajo: 305 s (DPS p. 7). */
  impulsoEspecificoS: 305,
}

/** Perfil premisión del Apollo 11 (TN tabla I), en unidades SI. Tiempos desde el encendido. */
export const PERFIL_APOLLO11 = {
  inicio: { tS: 0, velocidadMs: 5560 * PIE, vVerticalMs: -4 * PIE, alturaM: 48_814 * PIE },
  maximoEmpuje: { tS: 26 },
  rotacion: { tS: 2 * 60 + 56, velocidadMs: 4000 * PIE, vVerticalMs: -50 * PIE, alturaM: 44_934 * PIE },
  actualizacionAltura: { tS: 4 * 60 + 18, velocidadMs: 3065 * PIE, vVerticalMs: -89 * PIE, alturaM: 39_201 * PIE },
  recuperacionRegulador: { tS: 6 * 60 + 24, velocidadMs: 1456 * PIE, vVerticalMs: -106 * PIE, alturaM: 24_639 * PIE },
  puertaAlta: { tS: 8 * 60 + 26, velocidadMs: 506 * PIE, vVerticalMs: -145 * PIE, alturaM: 7515 * PIE, alcanceM: 4.5 * 1852 },
  puertaBaja: { tS: 10 * 60 + 6, vHorizontalMs: 55 * PIE, vVerticalMs: -16 * PIE, alturaM: 512 * PIE },
  contacto: { tS: 11 * 60 + 54, vVerticalMs: -3 * PIE, alturaM: 12 * PIE },
  deltaVMs: 6775 * PIE,
  /** Combustible nominal para el ΔV: 16 960,9 lb (TN tabla II). */
  combustibleNominalKg: 16_960.9 * LIBRA,
  /** Inicio del descenso a ~260 millas náuticas del sitio (TN p. 8). */
  alcanceInicialM: 260 * 1852,
}

/** Objetivos de una fase en ejes de guiado (X arriba en el sitio, Z hacia adelante), m, m/s, m/s². */
type Objetivo = { r: [number, number]; v: [number, number]; a: [number, number]; jz: number }

export type ParametrosDescenso = {
  lm: typeof LM_APOLLO11
  /** Distancia por la superficie del inicio del descenso al sitio (m). */
  alcanceInicialM: number
  /** Término de P63 (puerta alta). */
  puertaAlta: { alturaM: number; alcanceM: number; vVerticalMs: number; vHorizontalMs: number }
  /** P63 termina con 57 % de empuje e inclinación de ~60° (R-695 p. 54). */
  empujeFinalP63: number
  inclinacionFinalP63Grados: number
  /** Sacudida objetivo de P63 en la dirección del avance (m/s³; R-695 p. 18, ec. 12; se elige en la planificación). */
  sacudidaZP63: number
  /** P63 pasa a P64 cuando faltan 60 s para su objetivo (TN p. 10). */
  tCambioP63S: number
  /** Término de P64 (inicio de P66): ~150 pies y −3 pies/s sobre el sitio (TN p. 10). */
  terminoP64: { alturaM: number; vVerticalMs: number }
  /** P64 pasa a P66 a este tiempo antes de su objetivo (supuesto: R-695 no da el valor). */
  tCambioP64S: number
  /**
   * Tiempo inicial de P64 respecto de su objetivo (TAPI, R-695 pp. 53–54: se elige en la planificación). Derivado de TN
   * tabla I: puerta alta a 8:26, término hacia las 11:04 (contacto a 11:54 menos ~46 s bajando 150 pies a 3 pies/s): 158 s,
   * más los 10 s de extrapolación.
   */
  tInicioP64S: number
  /** Contacto: sonda a 12 pies (TN tabla I). */
  alturaContactoM: number
}

export const PARAMETROS_APOLLO11: ParametrosDescenso = {
  lm: LM_APOLLO11,
  /**
   * Alcance de encendido: el que deja la puerta alta a las 8:26 (TN tabla I), hallado por bisección (como el algoritmo de
   * encendido de P63, R-695 p. 30, que fija el instante de encendido para cumplir los objetivos). TN da "approximately 260
   * nautical miles" (p. 8); aquí 264,8 (tests/descenso.test.ts lo comprueba).
   */
  alcanceInicialM: 490_327,
  puertaAlta: {
    alturaM: PERFIL_APOLLO11.puertaAlta.alturaM,
    alcanceM: PERFIL_APOLLO11.puertaAlta.alcanceM,
    vVerticalMs: PERFIL_APOLLO11.puertaAlta.vVerticalMs,
    vHorizontalMs: Math.sqrt(PERFIL_APOLLO11.puertaAlta.velocidadMs ** 2 - PERFIL_APOLLO11.puertaAlta.vVerticalMs ** 2),
  },
  empujeFinalP63: 0.57,
  inclinacionFinalP63Grados: 60,
  sacudidaZP63: 0,
  tCambioP63S: 60,
  terminoP64: { alturaM: 150 * PIE, vVerticalMs: -3 * PIE },
  tCambioP64S: 10,
  tInicioP64S: 168,
  alturaContactoM: PERFIL_APOLLO11.contacto.alturaM,
}

export type Fase = 'P63' | 'P64' | 'P66'

export type MuestraDescenso = {
  tS: number
  fase: Fase
  /** Altura sobre la esfera del sitio (m). */
  alturaM: number
  /** Distancia por la superficie hasta el sitio (m; negativa antes de llegar). */
  alcanceM: number
  vVerticalMs: number
  /** Velocidad horizontal (m/s; positiva hacia el sitio). */
  vHorizontalMs: number
  masaKg: number
  /** Fracción del empuje nominal. */
  empuje: number
  /** Inclinación del empuje respecto de la vertical local (°; positiva frenando). */
  inclinacionGrados: number
  /** ΔV acumulado (m/s). */
  deltaVMs: number
}

export type ResultadoDescenso = {
  muestras: MuestraDescenso[]
  /** Eventos (s desde el encendido); NaN si no ocurrieron. */
  eventos: { recuperacionRegulador: number; puertaAlta: number; puertaBaja: number; inicioP66: number; contacto: number }
  deltaVMs: number
  combustibleUsadoKg: number
  /** true si se acabó el combustible antes del contacto. */
  sinCombustible: boolean
}

const RAD = Math.PI / 180
type V2 = [number, number]

/** Estado en ejes de guiado a partir de altura, distancia por la superficie y velocidades vertical y horizontal. */
function estadoDesdeLocal(alturaM: number, alcanceM: number, vVertical: number, vHorizontal: number): { p: V2; v: V2 } {
  const phi = alcanceM / R
  const u: V2 = [Math.cos(phi), Math.sin(phi)]
  const t: V2 = [-Math.sin(phi), Math.cos(phi)]
  return { p: [(R + alturaM) * u[0], (R + alturaM) * u[1]], v: [vVertical * u[0] + vHorizontal * t[0], vVertical * u[1] + vHorizontal * t[1]] }
}

const gravedad = (p: V2): V2 => {
  const r = Math.hypot(p[0], p[1])
  const k = -MU_LUNA / (r * r * r)
  return [k * p[0], k * p[1]]
}

/** Objetivo extrapolado Δt más allá del término de una fase, con aceleración constante (sacudida 0). */
function extrapolar(p: V2, v: V2, a: V2, dt: number): Objetivo {
  return {
    r: [p[0] - R + v[0] * dt + (a[0] * dt * dt) / 2, p[1] + v[1] * dt + (a[1] * dt * dt) / 2],
    v: [v[0] + a[0] * dt, v[1] + a[1] * dt],
    a,
    jz: 0,
  }
}

/** Raíz de la cúbica de la ec. 12 de R-695 más cercana a tPrevio (T < 0). */
function tiempoAlObjetivo(o: Objetivo, rgz: number, vgz: number, tPrevio: number): number {
  const f = (T: number) => o.jz * T ** 3 + 6 * o.a[1] * T * T + (18 * o.v[1] + 6 * vgz) * T + 24 * (o.r[1] - rgz)
  let mejor = NaN
  for (let T = -3000; T < -0.05; T += 0.5) {
    const a = f(T)
    const b = f(T + 0.5)
    if (a === 0 || (a < 0) !== (b < 0)) {
      let lo = T
      let hi = T + 0.5
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2
        if ((f(lo) < 0) === (f(m) < 0)) lo = m
        else hi = m
      }
      const raiz = (lo + hi) / 2
      if (Number.isNaN(mejor) || Math.abs(raiz - tPrevio) < Math.abs(mejor - tPrevio)) mejor = raiz
    }
  }
  return mejor
}

/** Simula el descenso desde el encendido hasta el contacto (o hasta agotar el combustible). */
export function simularDescenso(par: ParametrosDescenso = PARAMETROS_APOLLO11, pasoS = 0.1): ResultadoDescenso {
  const { lm } = par
  const fNom = lm.empujeNominalN
  const ve = lm.impulsoEspecificoS * G0
  const ini = PERFIL_APOLLO11.inicio
  let { p, v } = estadoDesdeLocal(ini.alturaM, -par.alcanceInicialM, ini.vVerticalMs, Math.sqrt(ini.velocidadMs ** 2 - ini.vVerticalMs ** 2))
  let m = lm.masaInicialKg
  // Objetivo de P63: puerta alta + 60 s con 57 % de empuje a 60° y la gravedad en el sitio (R-695 p. 54; TN p. 10).
  const hg = estadoDesdeLocal(par.puertaAlta.alturaM, -par.puertaAlta.alcanceM, par.puertaAlta.vVerticalMs, par.puertaAlta.vHorizontalMs)
  // Masa estimada en la puerta alta con el ΔV de TN hasta allí (5375 pies/s, tabla I) y la ecuación del cohete (FA p. 6).
  const masaPuertaAlta = lm.masaInicialKg * Math.exp(-(5375 * PIE) / ve)
  const aEmpuje = (par.empujeFinalP63 * fNom) / masaPuertaAlta
  const th = par.inclinacionFinalP63Grados * RAD
  const g0Sitio = MU_LUNA / (R * R)
  const objP63 = { ...extrapolar(hg.p, hg.v, [aEmpuje * Math.cos(th) - g0Sitio, -aEmpuje * Math.sin(th)], par.tCambioP63S), jz: par.sacudidaZP63 }
  // Objetivo de P64: término sobre el sitio a ~150 pies, −3 pies/s, sin velocidad horizontal ni aceleración (TN p. 10).
  const term = estadoDesdeLocal(par.terminoP64.alturaM, 0, par.terminoP64.vVerticalMs, 0)
  const objP64 = extrapolar(term.p, term.v, [0, 0], par.tCambioP64S)

  const muestras: MuestraDescenso[] = []
  const eventos = { recuperacionRegulador: NaN, puertaAlta: NaN, puertaBaja: NaN, inicioP66: NaN, contacto: NaN }
  let fase: Fase = 'P63'
  let T = -(par.alcanceInicialM / ini.velocidadMs) * 1.5
  let mando: { dir: V2; f: number } = { dir: [0, 1], f: lm.fraccionMaxima }
  let proximoGuiado = 0
  let ultimoGuiado = 0
  let proximoVertical = 0
  let deltaV = 0
  let sinCombustible = false
  const masaSeca = lm.masaInicialKg - lm.combustibleKg
  let saturadoAntes = true

  const local = () => {
    const r = Math.hypot(p[0], p[1])
    const u: V2 = [p[0] / r, p[1] / r]
    const tan: V2 = [-u[1], u[0]]
    return { r, u, tan, altura: r - R, alcance: Math.atan2(p[1], p[0]) * R, vv: v[0] * u[0] + v[1] * u[1], vh: v[0] * tan[0] + v[1] * tan[1] }
  }

  for (let t = 0; t < 2000; t += pasoS) {
    const L = local()
    if (fase !== 'P66' && t >= proximoGuiado) {
      const rg: V2 = [p[0] - R, p[1]]
      // P63: T se recalcula en cada pasada con la ec. 12 (absorbe el tramo a empuje fijo). P64: se calcula al entrar y
      // luego avanza con el reloj; R-695 (p. 18) permite fijar T libremente, y sin redesignación del sitio la ec. 12 se
      // vuelve 0/0 sobre el sitio (posición y velocidad hacia adelante tienden a cero a la vez).
      if (fase === 'P63') T = tiempoAlObjetivo(objP63, rg[1], v[1], T)
      else T += t - ultimoGuiado
      ultimoGuiado = t
      if (fase === 'P63' && T >= -par.tCambioP63S) {
        fase = 'P64'
        eventos.puertaAlta = t
        T = -par.tInicioP64S
      } else if (fase === 'P64' && T >= -par.tCambioP64S) {
        fase = 'P66'
        eventos.inicioP66 = t
      }
      if (fase !== 'P66') {
        const oo = fase === 'P63' ? objP63 : objP64
        const g = gravedad(p)
        const acg: V2 = [0, 1].map((k) => (12 * (oo.r[k] - rg[k])) / (T * T) + (6 * (oo.v[k] + v[k])) / T + oo.a[k]) as V2
        const at: V2 = [acg[0] - g[0], acg[1] - g[1]]
        const n = Math.hypot(at[0], at[1])
        let f = (m * n) / fNom
        const saturado = f > lm.regionPermitida[1]
        if (saturado) f = lm.fraccionMaxima
        else if (f < lm.regionPermitida[0]) f = lm.regionPermitida[0]
        // TN tabla I: el motor enciende al mínimo y pasa al empuje máximo a los 26 s (10 %: el mínimo del diseño, TN p. 32).
        if (t < PERFIL_APOLLO11.maximoEmpuje.tS) f = 0.1
        if (saturadoAntes && !saturado && Number.isNaN(eventos.recuperacionRegulador) && t > 30) eventos.recuperacionRegulador = t
        saturadoAntes = saturado
        mando = { dir: [at[0] / n, at[1] / n], f }
      }
      proximoGuiado = t + 2
    }
    if (fase === 'P66' && t >= proximoVertical) {
      // R-695 pp. 31–32: horizontal, velocidad a cero con constante de 5 s y empuje a ≤ 20° de la vertical; vertical,
      // velocidad de referencia con constante de 1,5 s (una pasada por segundo).
      const gl = MU_LUNA / (L.r * L.r)
      const aH = -L.vh / 5
      const aV = (par.terminoP64.vVerticalMs - L.vv) / 1.5 + gl
      let ang = Math.atan2(aH, aV)
      ang = Math.max(-20 * RAD, Math.min(20 * RAD, ang))
      const mag = aV / Math.cos(ang)
      const f = Math.min(Math.max((m * mag) / fNom, lm.regionPermitida[0]), lm.regionPermitida[1])
      mando = { dir: [L.u[0] * Math.cos(ang) + L.tan[0] * Math.sin(ang), L.u[1] * Math.cos(ang) + L.tan[1] * Math.sin(ang)], f }
      proximoVertical = t + 1
    }
    if (Number.isNaN(eventos.puertaBaja) && L.altura <= PERFIL_APOLLO11.puertaBaja.alturaM) eventos.puertaBaja = t
    if (muestras.length === 0 || t - muestras[muestras.length - 1].tS >= 0.999) {
      const incl = Math.atan2(-(mando.dir[0] * L.tan[0] + mando.dir[1] * L.tan[1]), mando.dir[0] * L.u[0] + mando.dir[1] * L.u[1]) / RAD
      muestras.push({ tS: t, fase, alturaM: L.altura, alcanceM: L.alcance, vVerticalMs: L.vv, vHorizontalMs: L.vh, masaKg: m, empuje: mando.f, inclinacionGrados: incl, deltaVMs: deltaV })
    }
    if (L.altura <= par.alturaContactoM && fase === 'P66') {
      eventos.contacto = t
      break
    }
    if (m <= masaSeca) {
      sinCombustible = true
      break
    }
    // Integración RK2 (punto medio) con empuje constante en el paso.
    const F = mando.f * fNom
    const acel = (pp: V2, mm: number): V2 => {
      const g = gravedad(pp)
      return [g[0] + (F / mm) * mando.dir[0], g[1] + (F / mm) * mando.dir[1]]
    }
    const mdot = F / ve
    const a1 = acel(p, m)
    const pm: V2 = [p[0] + (v[0] * pasoS) / 2, p[1] + (v[1] * pasoS) / 2]
    const vm: V2 = [v[0] + (a1[0] * pasoS) / 2, v[1] + (a1[1] * pasoS) / 2]
    const a2 = acel(pm, m - (mdot * pasoS) / 2)
    p = [p[0] + vm[0] * pasoS, p[1] + vm[1] * pasoS]
    v = [v[0] + a2[0] * pasoS, v[1] + a2[1] * pasoS]
    deltaV += (F / (m - (mdot * pasoS) / 2)) * pasoS
    m -= mdot * pasoS
  }
  return { muestras, eventos, deltaVMs: deltaV, combustibleUsadoKg: lm.masaInicialKg - m, sinCombustible }
}

/**
 * E26.1: regla del Apollo para el rumbo de llegada: el Sol a la espalda (TN p. 10: la línea de vista de la tripulación al
 * sitio debe quedar por encima de la línea del Sol; el Apollo 11 llegó desde el este con el Sol al este, a 10,7°).
 * Devuelve el azimut del rumbo (hacia donde vuela el LM), opuesto al azimut del Sol.
 */
export const rumboApollo = (azimutSolGrados: number) => (((azimutSolGrados + 180) % 360) + 360) % 360

export type LuzDescenso = {
  /** Menor ángulo de la línea de vista del LM al sitio durante la aproximación (P64), en grados sobre la horizontal. */
  lineaDeVistaMinimaGrados: number
  /** Línea de vista mínima menos la elevación del Sol (°): > 0 cumple el criterio de TN (p. 10). */
  margenSobreSolGrados: number
  /** Ángulo entre el Sol y la espalda del LM (0° = Sol justo detrás). */
  solRespectoEspaldaGrados: number
}

/** Criterio de luz de TN D-6846 (p. 10) en la aproximación, con el Sol en el sitio a la hora del contacto. */
export function luzDelDescenso(r: ResultadoDescenso, elevacionSolGrados: number, azimutSolGrados: number, rumboGrados: number): LuzDescenso {
  let minimo = Infinity
  for (const s of r.muestras) {
    if (s.fase !== 'P64' || s.alcanceM >= -1) continue
    minimo = Math.min(minimo, Math.atan2(s.alturaM, -s.alcanceM) / RAD)
  }
  const espalda = (rumboGrados + 180) % 360
  return {
    lineaDeVistaMinimaGrados: minimo,
    margenSobreSolGrados: minimo - elevacionSolGrados,
    solRespectoEspaldaGrados: Math.abs(((azimutSolGrados - espalda + 540) % 360) - 180),
  }
}

/** Posición de una muestra respecto del sitio en ejes de la escena (+X este, +Y arriba, −Z norte), con el rumbo dado. */
export function posicionEnEscena(s: MuestraDescenso, rumboGrados: number): [number, number, number] {
  const a = rumboGrados * RAD
  // alcance < 0 antes del sitio: el LM está detrás, en sentido opuesto al rumbo.
  const este = s.alcanceM * Math.sin(a)
  const norte = s.alcanceM * Math.cos(a)
  // Caída de la esfera respecto del plano tangente del sitio (d²/2R): a 8 km son 18 m.
  return [este, s.alturaM - (s.alcanceM * s.alcanceM) / (2 * R), -norte]
}
