// E26.2: simulación de un aterrizaje: el descenso del LM (E26.1) llevado a un sitio y una hora de contacto de 2026–2030,
// con la luz y la Tierra de las efemérides globales (E22), la estadía en superficie (E23) y un veredicto contra los
// requisitos que pone el usuario. El motor no inventa umbrales (Abiertas, E19): solo compara con lo que se le pide.
// Funciones puras, sin React ni three.
import { cieloEn, type TablaLuna } from './efemeridesLuna'
import { LM_APOLLO11, luzDelDescenso, rumboApollo, simularDescenso, type LuzDescenso, type ResultadoDescenso } from './descenso'
import { barrer, proximoCambio, resumir, type PuntoPlan, type ResumenPlan, margenSol, margenTierra } from './planificador'
import { horizonteEn } from './mascara'
import type { EstadoEscena } from './simulation'

const UA_KM = 149_597_870.7

/** Requisitos de la misión, puestos por el usuario en el asistente (no son de una fuente). */
export type Requisitos = {
  /** Días en superficie después del contacto. */
  diasSuperficie: number
  /** Horas seguidas sin Sol que aguanta la batería. */
  bateriaHoras: number
  /** Inclinación máxima tolerada del LM sobre sus patas (°). */
  inclinacionMaximaGrados: number
  /** Combustible que debe sobrar al contacto (kg). */
  margenCombustibleKg: number
  /** Exigir la Tierra visible en el contacto (comunicación directa). */
  tierraEnContacto: boolean
  /** Fracción mínima de la estadía con la Tierra visible (0–1). */
  tierraMinimaEstadia: number
  /** Exigir el Sol visible en el contacto. */
  solEnContacto: boolean
}

export const REQUISITOS_EJEMPLO: Requisitos = {
  diasSuperficie: 3,
  bateriaHoras: 24,
  inclinacionMaximaGrados: 12,
  margenCombustibleKg: 100,
  tierraEnContacto: true,
  tierraMinimaEstadia: 0.5,
  solEnContacto: true,
}

export type Criterio = { id: string; nombre: string; valor: string; requisito: string; cumple: boolean; fuente: string }

export type Simulacion = {
  contactoMs: number
  encendidoMs: number
  rumboGrados: number
  descenso: ResultadoDescenso
  luz: LuzDescenso
  sol: { elevacionGrados: number; azimutGrados: number; sobreHorizonteGrados: number }
  tierra: { elevacionGrados: number; azimutGrados: number; sobreHorizonteGrados: number }
  /** Fracción del descenso con la Tierra visible desde el sitio. */
  tierraDuranteDescenso: number
  estadia: ResumenPlan
  /** Horas desde el contacto hasta el inicio de la noche más larga de la estadía (null si no hay noche). */
  inicioNocheMasLargaH: number | null
  /** Primera puesta del Sol después del contacto (ms), o null si no hay en la estadía. */
  primeraPuestaMs: number | null
  combustibleSobranteKg: number
  veredicto: Criterio[]
}

/** Descenso nominal (el mismo para todos los sitios: perfil del Apollo 11, E26.1). Se calcula una vez. */
let DESCENSO: ResultadoDescenso | null = null
export const descensoNominal = () => (DESCENSO ??= simularDescenso())

const fmt = (x: number, d = 1) => x.toFixed(d)

/** Simula el aterrizaje en el punto con el contacto en contactoMs. inclinacionGrados: apoyo del LM (E19), si hay DTM. */
export function simularAterrizaje(tabla: TablaLuna, punto: PuntoPlan, contactoMs: number, req: Requisitos, inclinacionGrados: number | null): Simulacion {
  const descenso = descensoNominal()
  const encendidoMs = contactoMs - descenso.eventos.contacto * 1000
  const c = cieloEn(tabla, punto.sitio, contactoMs)
  const rumboGrados = rumboApollo(c.sol.azimutGrados)
  const luz = luzDelDescenso(descenso, c.sol.elevacionGrados, c.sol.azimutGrados, rumboGrados)
  const solSobre = c.sol.elevacionGrados - horizonteEn(punto.perfil, c.sol.azimutGrados)
  const tierraSobre = c.tierra.elevacionGrados - horizonteEn(punto.perfil, c.tierra.azimutGrados)
  const bDescenso = barrer(tabla, punto, encendidoMs, contactoMs, 10_000)
  let conTierra = 0
  for (let k = 0; k < bDescenso.n; k++) if (margenTierra(bDescenso.tierraSobreHorizonte[k]) > 0) conTierra++
  const finEstadia = Math.min(contactoMs + req.diasSuperficie * 86_400_000, tabla.finMs)
  const bEstadia = barrer(tabla, punto, contactoMs, Math.max(finEstadia, contactoMs + 600_000), 600_000)
  const estadia = resumir(bEstadia)
  // Inicio de la noche más larga (para llevar la escena allí desde el veredicto, E26.4).
  let inicioNocheMasLargaH: number | null = null
  {
    let largo = 0
    let mejor = 0
    for (let k = 0; k < bEstadia.n; k++) {
      if (margenSol(bEstadia.solSobreHorizonte[k]) > 0) largo = 0
      else if (++largo > mejor) {
        mejor = largo
        inicioNocheMasLargaH = ((k - largo + 1) * bEstadia.pasoMs) / 3_600_000
      }
    }
  }
  const cambio = proximoCambio(tabla, punto, contactoMs, 'sol', finEstadia)
  const primeraPuestaMs = cambio.visible ? cambio.cambioMs : null
  const combustibleSobranteKg = LM_APOLLO11.combustibleKg - descenso.combustibleUsadoKg
  const solVisible = margenSol(solSobre) > 0
  const tierraVisible = margenTierra(tierraSobre) > 0

  const veredicto: Criterio[] = [
    {
      id: 'combustible',
      nombre: 'Combustible al contacto',
      valor: `sobran ${fmt(combustibleSobranteKg, 0)} kg`,
      requisito: `≥ ${req.margenCombustibleKg} kg`,
      cumple: combustibleSobranteKg >= req.margenCombustibleKg,
      fuente: 'E26.1: perfil del Apollo 11 (TN D-6846), combustible disponible de la tabla II',
    },
    {
      id: 'luz-aproximacion',
      nombre: 'Línea de vista sobre el Sol en la aproximación',
      valor: `${fmt(luz.lineaDeVistaMinimaGrados)}° frente a Sol a ${fmt(c.sol.elevacionGrados)}°`,
      requisito: 'línea de vista por encima de la línea del Sol',
      cumple: luz.margenSobreSolGrados > 0,
      fuente: 'TN D-6846 p. 10: bajo la línea del Sol el relieve se ve lavado',
    },
    {
      id: 'sol-contacto',
      nombre: 'Sol en el contacto',
      valor: solVisible ? `visible, ${fmt(solSobre, 2)}° sobre el horizonte` : `oculto, ${fmt(solSobre, 2)}°`,
      requisito: req.solEnContacto ? 'visible' : 'no exigido',
      cumple: !req.solEnContacto || solVisible,
      fuente: 'E23: alguna parte del disco sobre el horizonte real',
    },
    {
      id: 'tierra-contacto',
      nombre: 'Tierra en el contacto (comunicación directa)',
      valor: tierraVisible ? `visible, ${fmt(tierraSobre, 2)}° sobre el horizonte` : `oculta, ${fmt(tierraSobre, 2)}°`,
      requisito: req.tierraEnContacto ? 'visible' : 'no exigido',
      cumple: !req.tierraEnContacto || tierraVisible,
      fuente: 'E23: centro de la Tierra sobre el horizonte real',
    },
    {
      id: 'noche',
      nombre: `Noche más larga en ${req.diasSuperficie} d de estadía`,
      valor: `${fmt(estadia.nocheMasLargaH)} h`,
      requisito: `≤ ${req.bateriaHoras} h de batería`,
      cumple: estadia.nocheMasLargaH <= req.bateriaHoras,
      fuente: 'E23: barrido cada 10 min',
    },
    {
      id: 'tierra-estadia',
      nombre: 'Tierra visible en la estadía',
      valor: `${fmt(100 * estadia.fraccionTierra)} %`,
      requisito: `≥ ${fmt(100 * req.tierraMinimaEstadia, 0)} %`,
      cumple: estadia.fraccionTierra >= req.tierraMinimaEstadia,
      fuente: 'E23: barrido cada 10 min',
    },
  ]
  if (inclinacionGrados !== null) {
    veredicto.push({
      id: 'inclinacion',
      nombre: 'Inclinación del LM sobre sus patas',
      valor: `${fmt(inclinacionGrados)}°`,
      requisito: `≤ ${req.inclinacionMaximaGrados}°`,
      cumple: inclinacionGrados <= req.inclinacionMaximaGrados,
      fuente: 'E19: plano por los cuatro pies sobre el DTM',
    })
  }
  return {
    contactoMs,
    encendidoMs,
    rumboGrados,
    descenso,
    luz,
    sol: { elevacionGrados: c.sol.elevacionGrados, azimutGrados: c.sol.azimutGrados, sobreHorizonteGrados: solSobre },
    tierra: { elevacionGrados: c.tierra.elevacionGrados, azimutGrados: c.tierra.azimutGrados, sobreHorizonteGrados: tierraSobre },
    tierraDuranteDescenso: conTierra / bDescenso.n,
    estadia,
    inicioNocheMasLargaH,
    primeraPuestaMs,
    combustibleSobranteKg,
    veredicto,
  }
}

/**
 * E26.2: sugerencia de hora de contacto dentro de [desdeMs, hastaMs]: cada 3 h se descartan los instantes sin Sol o sin
 * Tierra en el contacto (si se exigen) y se elige el de noche más corta en la estadía y, a igualdad, más Tierra. Es una
 * ayuda para empezar, no una optimización de misión.
 */
export function sugerirContacto(tabla: TablaLuna, punto: PuntoPlan, desdeMs: number, hastaMs: number, req: Requisitos): number | null {
  let mejor: { ms: number; noche: number; tierra: number } | null = null
  for (let ms = desdeMs; ms <= Math.min(hastaMs, tabla.finMs - req.diasSuperficie * 86_400_000); ms += 3 * 3_600_000) {
    const b0 = barrer(tabla, punto, ms, ms + 1, 1)
    if (req.solEnContacto && margenSol(b0.solSobreHorizonte[0]) <= 0) continue
    if (req.tierraEnContacto && margenTierra(b0.tierraSobreHorizonte[0]) <= 0) continue
    const r = resumir(barrer(tabla, punto, ms, ms + req.diasSuperficie * 86_400_000, 1_800_000))
    if (!mejor || r.nocheMasLargaH < mejor.noche - 1e-9 || (Math.abs(r.nocheMasLargaH - mejor.noche) < 1e-9 && r.fraccionTierra > mejor.tierra)) {
      mejor = { ms, noche: r.nocheMasLargaH, tierra: r.fraccionTierra }
    }
  }
  return mejor?.ms ?? null
}

/**
 * E26.2 (paso "Comparar" del asistente): las n mejores horas de contacto del período, separadas al menos 24 h, con el mismo
 * criterio que sugerirContacto. Sirven para comparar condiciones antes de elegir (Wizard: elegir, comparar, evaluar).
 */
export function candidatosContacto(tabla: TablaLuna, punto: PuntoPlan, desdeMs: number, hastaMs: number, req: Requisitos, n = 3): number[] {
  const todos: Array<{ ms: number; noche: number; tierra: number }> = []
  for (let ms = desdeMs; ms <= Math.min(hastaMs, tabla.finMs - req.diasSuperficie * 86_400_000); ms += 3 * 3_600_000) {
    const b0 = barrer(tabla, punto, ms, ms + 1, 1)
    if (req.solEnContacto && margenSol(b0.solSobreHorizonte[0]) <= 0) continue
    if (req.tierraEnContacto && margenTierra(b0.tierraSobreHorizonte[0]) <= 0) continue
    const r = resumir(barrer(tabla, punto, ms, ms + req.diasSuperficie * 86_400_000, 1_800_000))
    todos.push({ ms, noche: r.nocheMasLargaH, tierra: r.fraccionTierra })
  }
  todos.sort((a, b) => a.noche - b.noche || b.tierra - a.tierra || a.ms - b.ms)
  const elegidos: number[] = []
  for (const c of todos) {
    if (elegidos.every((e) => Math.abs(e - c.ms) >= 86_400_000)) elegidos.push(c.ms)
    if (elegidos.length === n) break
  }
  return elegidos.sort((a, b) => a - b)
}

/** E26.3: estado de la escena 3D en cualquier instante de 2026–2030, desde la tabla global (E22). */
export function estadoGlobal(tabla: TablaLuna, punto: PuntoPlan, ms: number): EstadoEscena {
  const c = cieloEn(tabla, punto.sitio, ms)
  return {
    t: (ms - tabla.inicioMs) / 1000,
    fechaUTC: new Date(ms).toISOString(),
    direccionSol: c.sol.direccion,
    elevacionSolGrados: c.sol.elevacionGrados,
    azimutSolGrados: c.sol.azimutGrados,
    diametroSolGrados: c.sol.diametroGrados,
    distanciaSolAu: c.sol.distanciaAu,
    direccionTierra: c.tierra.direccion,
    elevacionTierraGrados: c.tierra.elevacionGrados,
    azimutTierraGrados: c.tierra.azimutGrados,
    diametroTierraGrados: c.tierra.diametroGrados,
    distanciaTierraAu: c.tierra.distanciaKm / UA_KM,
    faseTierra: c.tierra.fase,
  }
}
