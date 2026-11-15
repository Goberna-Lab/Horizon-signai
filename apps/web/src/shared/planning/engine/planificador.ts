// Copia de `luna-recursos/calculos/motor/planificador.ts` (prototipo luna, commit 72f890f). Único cambio: los `import` llevan la
// extensión `.ts`, para que `node --test` los resuelva. Lo que se cambie aquí debe cambiarse también en el original.
//
// E23: planificador. Para un punto (latitud, longitud, horizonte) y un período de 2026–2030, cuándo se ve el Sol (energía)
// y cuándo la Tierra (comunicación directa), con las efemérides globales de E22. Funciones puras, sin React ni three.
//
// Definiciones (las del motor):
// - Sol visible: alguna parte del disco sobre el horizonte real (como los mapas de Mazarico et al. 2011, E21). La energía
//   se pondera por la fracción del disco visible (fraccionDiscoVisible, ENV-007).
// - Tierra visible: el centro del disco sobre el horizonte real (comunicación directa posible, como E19).
// - Energía: irradiancia sobre un panel vertical que gira para mirar al Sol en azimut, E = 1361 W/m² / r² × fracción ×
//   cos(elevación) (constante solar: FA cap. 20.4, p. 542). El panel vertical es un supuesto: es la disposición habitual
//   cerca del polo, donde el Sol va casi rasante, pero cada misión tiene la suya.
import { CONSTANTE_SOLAR_W_M2, fraccionDiscoVisible } from './environment.ts'
import { cieloEn, elevacionesEn, type SitioLuna, type TablaLuna } from './efemeridesLuna.ts'
import { horizonteEn, type PerfilHorizonte } from './mascara.ts'

const RAD = Math.PI / 180
/** Semidiámetro fijo del Sol para el barrido (ENV-007): 0,266°, como la validación de E21. La Tierra cuenta por su centro. */
const SEMI_SOL = 0.266

/** Un punto a evaluar: dónde está y qué horizonte ve. */
export type PuntoPlan = { sitio: SitioLuna; perfil: PerfilHorizonte }

export type Barrido = {
  desdeMs: number
  pasoMs: number
  n: number
  solAzimut: Float32Array
  solElevacion: Float32Array
  /** Elevación del centro del Sol menos el horizonte en su azimut (°). */
  solSobreHorizonte: Float32Array
  /** Fracción del disco solar sobre el horizonte real (0–1). */
  solFraccion: Float32Array
  tierraAzimut: Float32Array
  tierraElevacion: Float32Array
  tierraSobreHorizonte: Float32Array
  /** Irradiancia sobre el panel vertical (W/m²) a 1 UA (la distancia real la cambia ±3,4 % en el año: e = 0,0167, FA p. 675). */
  panelWm2: Float32Array
}

/** Recorre [desdeMs, hastaMs] con paso pasoMs. 30 días cada 10 min son 4320 muestras (~2 ms). */
export function barrer(tabla: TablaLuna, punto: PuntoPlan, desdeMs: number, hastaMs: number, pasoMs: number): Barrido {
  const n = Math.max(2, Math.floor((hastaMs - desdeMs) / pasoMs) + 1)
  const b: Barrido = {
    desdeMs,
    pasoMs,
    n,
    solAzimut: new Float32Array(n),
    solElevacion: new Float32Array(n),
    solSobreHorizonte: new Float32Array(n),
    solFraccion: new Float32Array(n),
    tierraAzimut: new Float32Array(n),
    tierraElevacion: new Float32Array(n),
    tierraSobreHorizonte: new Float32Array(n),
    panelWm2: new Float32Array(n),
  }
  const s = new Float64Array(4)
  for (let k = 0; k < n; k++) {
    elevacionesEn(tabla, punto.sitio, desdeMs + k * pasoMs, s)
    const sobreSol = s[1] - horizonteEn(punto.perfil, s[0])
    const fraccion = fraccionDiscoVisible(sobreSol, 2 * SEMI_SOL)
    b.solAzimut[k] = s[0]
    b.solElevacion[k] = s[1]
    b.solSobreHorizonte[k] = sobreSol
    b.solFraccion[k] = fraccion
    b.tierraAzimut[k] = s[2]
    b.tierraElevacion[k] = s[3]
    b.tierraSobreHorizonte[k] = s[3] - horizonteEn(punto.perfil, s[2])
    b.panelWm2[k] = CONSTANTE_SOLAR_W_M2 * fraccion * Math.max(0, Math.cos(s[1] * RAD))
  }
  return b
}

/** Margen de visibilidad (°): > 0 visible. Sol: borde superior del disco; Tierra: centro. */
export const margenSol = (sobreHorizonte: number) => sobreHorizonte + SEMI_SOL
export const margenTierra = (sobreHorizonte: number) => sobreHorizonte

export type Ventana = { inicioMs: number; finMs: number }

/** Intervalos visibles en el barrido, con los bordes interpolados entre muestras (al segundo, con paso de 10 min). */
export function ventanas(b: Barrido, cuerpo: 'sol' | 'tierra'): Ventana[] {
  const margen = (k: number) => (cuerpo === 'sol' ? margenSol(b.solSobreHorizonte[k]) : margenTierra(b.tierraSobreHorizonte[k]))
  const t = (k: number) => b.desdeMs + k * b.pasoMs
  const cruce = (k: number) => {
    const a = margen(k - 1)
    const c = margen(k)
    return t(k - 1) + (a / (a - c)) * b.pasoMs
  }
  const salida: Ventana[] = []
  let inicio = margen(0) > 0 ? t(0) : NaN
  for (let k = 1; k < b.n; k++) {
    const antes = margen(k - 1) > 0
    const ahora = margen(k) > 0
    if (!antes && ahora) inicio = cruce(k)
    if (antes && !ahora) {
      salida.push({ inicioMs: inicio, finMs: cruce(k) })
      inicio = NaN
    }
  }
  if (!Number.isNaN(inicio)) salida.push({ inicioMs: inicio, finMs: t(b.n - 1) })
  return salida
}

export type ResumenPlan = {
  /** Fracción del período con alguna parte del Sol visible. */
  fraccionSol: number
  /** Fracción con la Tierra visible. */
  fraccionTierra: number
  /** Fracción con los dos a la vez (energía y comunicación directa). */
  fraccionAmbos: number
  horasSol: number
  /** Mayor intervalo seguido sin Sol (h): lo que tiene que aguantar la batería. */
  nocheMasLargaH: number
  /** Mayor intervalo seguido sin Tierra (h). */
  silencioMasLargoH: number
  /** Irradiancia media sobre el panel vertical en el período (W/m²). */
  panelMedioWm2: number
}

export function resumir(b: Barrido): ResumenPlan {
  let sol = 0
  let tierra = 0
  let ambos = 0
  let panel = 0
  let sinSol = 0
  let sinTierra = 0
  let nocheMax = 0
  let silencioMax = 0
  for (let k = 0; k < b.n; k++) {
    const s = margenSol(b.solSobreHorizonte[k]) > 0
    const t = margenTierra(b.tierraSobreHorizonte[k]) > 0
    if (s) sol++
    if (t) tierra++
    if (s && t) ambos++
    panel += b.panelWm2[k]
    sinSol = s ? 0 : sinSol + 1
    sinTierra = t ? 0 : sinTierra + 1
    nocheMax = Math.max(nocheMax, sinSol)
    silencioMax = Math.max(silencioMax, sinTierra)
  }
  const h = b.pasoMs / 3_600_000
  return {
    fraccionSol: sol / b.n,
    fraccionTierra: tierra / b.n,
    fraccionAmbos: ambos / b.n,
    horasSol: sol * h,
    nocheMasLargaH: nocheMax * h,
    silencioMasLargoH: silencioMax * h,
    panelMedioWm2: panel / b.n,
  }
}

/** Estado en un instante y cuándo cambia (puesta o salida), buscando hacia adelante hasta limiteMs. */
export type Cambio = { visible: boolean; cambioMs: number | null }

export function proximoCambio(tabla: TablaLuna, punto: PuntoPlan, ms: number, cuerpo: 'sol' | 'tierra', limiteMs: number): Cambio {
  const s = new Float64Array(4)
  const margen = (t: number) => {
    elevacionesEn(tabla, punto.sitio, t, s)
    return cuerpo === 'sol' ? margenSol(s[1] - horizonteEn(punto.perfil, s[0])) : margenTierra(s[3] - horizonteEn(punto.perfil, s[2]))
  }
  const visible = margen(ms) > 0
  const PASO = 600_000
  for (let t = ms + PASO; t <= limiteMs; t += PASO) {
    if (margen(t) > 0 !== visible) {
      // Bisección al segundo.
      let bajo = t - PASO
      let alto = t
      while (alto - bajo > 1000) {
        const medio = (bajo + alto) / 2
        if (margen(medio) > 0 === visible) bajo = medio
        else alto = medio
      }
      return { visible, cambioMs: alto }
    }
  }
  return { visible, cambioMs: null }
}

/** Cielo completo en un instante (diámetros, fase, distancias), para las tarjetas de la interfaz. */
export function cieloDelPunto(tabla: TablaLuna, punto: PuntoPlan, ms: number) {
  const c = cieloEn(tabla, punto.sitio, ms)
  const solSobre = c.sol.elevacionGrados - horizonteEn(punto.perfil, c.sol.azimutGrados)
  const fraccion = fraccionDiscoVisible(solSobre, c.sol.diametroGrados)
  return {
    ...c,
    solSobreHorizonte: solSobre,
    solFraccion: fraccion,
    tierraSobreHorizonte: c.tierra.elevacionGrados - horizonteEn(punto.perfil, c.tierra.azimutGrados),
    panelWm2: (CONSTANTE_SOLAR_W_M2 / (c.sol.distanciaAu * c.sol.distanciaAu)) * fraccion * Math.max(0, Math.cos(c.sol.elevacionGrados * RAD)),
  }
}

/** E25: resumen por mes sinódico (29,53 d, LSB p. 58) entre desdeMs y hastaMs, para ver cómo cambian las condiciones. */
export function porMeses(tabla: TablaLuna, punto: PuntoPlan, desdeMs: number, hastaMs: number, pasoMs = 1_800_000): Array<{ inicioMs: number; finMs: number; resumen: ResumenPlan }> {
  const MES_MS = 29.530589 * 86_400_000
  const salida: Array<{ inicioMs: number; finMs: number; resumen: ResumenPlan }> = []
  for (let a = desdeMs; a + MES_MS <= hastaMs; a += MES_MS) {
    salida.push({ inicioMs: a, finMs: a + MES_MS, resumen: resumir(barrer(tabla, punto, a, a + MES_MS - pasoMs, pasoMs)) })
  }
  return salida
}
