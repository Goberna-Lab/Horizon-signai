// E13: datos para la interfaz de verificación. Funciones puras: comparan lo que da el motor con lo que dicen las
// fuentes, para que la evidencia se vea en pantalla (Designing Interfaces: Multi-Y Graph pp. 462–464; Alternative Views
// pp. 97–98; Proximity p. 218).
import { CONSTANTE_SOLAR_W_M2, OBSTACULO, direccionDesdeHorizonte, iluminacion, limitesSombra } from './environment'
import { ALBEDO_NORMAL_SITIO, ALBEDO_NORMAL_WAC, W_SITIO, albedoNormal } from './hapke'
import { DEFINICION_DIA, estado, tParaElevacionManana, tParaElevacionTarde, type DiaLunar, type EstadoEscena } from './simulation'
import { alturaSuelo, limitesSombraSobreTerreno } from './terreno'

const RAD = Math.PI / 180
const UA_KM = 149_597_870.7 // FA tabla B.1, p. 671

/** Dirección horizontal de la sombra (opuesta al Sol). */
export function direccionSombra(e: EstadoEscena): [number, number] {
  const d = e.direccionSol
  const h = Math.hypot(d[0], d[2]) || 1
  return [-d[0] / h, -d[2] / h]
}

/** Una comprobación: valor esperado (fórmula con fuente) frente al simulado, con tolerancia. */
export type Comprobacion = {
  nombre: string
  esperado: number
  simulado: number
  unidad: string
  /** Tolerancia absoluta en las mismas unidades; null = solo informativa (muestra una diferencia, no un error). */
  tolerancia: number | null
  fuente: string
}

export function comprobaciones(e: EstadoEscena): Comprobacion[] {
  const lista: Comprobacion[] = []
  const r = e.distanciaSolAu // UA
  lista.push({
    nombre: 'Diámetro del Sol',
    esperado: (2 * Math.asin(695_508 / (r * UA_KM))) / RAD,
    simulado: e.diametroSolGrados,
    unidad: '°',
    tolerancia: 0.0005 * e.diametroSolGrados,
    fuente: 'R☉ y UA (FA pp. 671, 673) frente a Horizons',
  })
  const s = e.direccionSol
  const t = e.direccionTierra
  lista.push({
    nombre: 'Fase de la Tierra',
    esperado: ((1 - (s[0] * t[0] + s[1] * t[1] + s[2] * t[2])) / 2) * 100,
    simulado: e.faseTierra * 100,
    unidad: '%',
    tolerancia: 0.2,
    fuente: 'geometría Sol–Tierra frente a Horizons',
  })
  lista.push({
    nombre: 'Albedo normal (Hapke calibrado)',
    esperado: ALBEDO_NORMAL_SITIO,
    simulado: albedoNormal(W_SITIO),
    unidad: '',
    tolerancia: 1e-6,
    fuente: 'mares 7–10 % (LSB p. 59); definición en LSB p. 560',
  })
  lista.push({
    nombre: 'Albedo normal (Hapke WAC)',
    esperado: ALBEDO_NORMAL_SITIO,
    simulado: ALBEDO_NORMAL_WAC,
    unidad: '',
    tolerancia: null,
    fuente: 'parámetros medidos (Sato et al. 2014) sin rugosidad: difiere del LSB',
  })
  const luz = iluminacion(e)
  // Solo con el disco entero visible: con recorte, la irradiancia es menor a propósito (E9/E10), y de noche es 0.
  if (luz.solVisible >= 1) {
    lista.push({
      nombre: 'Irradiancia solar ⊥',
      esperado: CONSTANTE_SOLAR_W_M2 / (e.distanciaSolAu * e.distanciaSolAu),
      simulado: CONSTANTE_SOLAR_W_M2 * luz.solNormal,
      unidad: 'W/m²',
      tolerancia: 0.01,
      fuente: '1361/r² (FA p. 542)',
    })
  }
  if (e.elevacionSolGrados > 1 && luz.solVisible > 0) {
    const h = OBSTACULO.alturaM
    const plano = limitesSombra(h, 2 * OBSTACULO.radioM, e.elevacionSolGrados, e.diametroSolGrados)
    const lineal = (h * e.diametroSolGrados * RAD) / Math.sin(e.elevacionSolGrados * RAD) ** 2
    lista.push({
      nombre: 'Penumbra en la punta (plano)',
      esperado: lineal,
      simulado: plano.anchoPenumbraM,
      unidad: 'm',
      tolerancia: 0.01 * lineal + 0.005,
      fuente: 'h·θ/sin²α (FA p. 543; auditoría física)',
    })
    const [sx, sz] = direccionSombra(e)
    const real = limitesSombraSobreTerreno(h, 2 * OBSTACULO.radioM, e.elevacionSolGrados, e.diametroSolGrados, sx, sz)
    if (Number.isFinite(real.centroM)) {
      lista.push({
        nombre: 'Sombra: relieve frente a plano',
        esperado: plano.centroM,
        simulado: real.centroM,
        unidad: 'm',
        tolerancia: null,
        fuente: 'ENV-008: la fórmula supone suelo plano (Fielder, cap. 4)',
      })
      lista.push({
        nombre: 'Altura deducida (Fielder)',
        esperado: h,
        simulado: real.centroM * Math.tan(e.elevacionSolGrados * RAD),
        unidad: 'm',
        tolerancia: null,
        fuente: 'h = L·tan α sobre el relieve real (Fielder, caps. 2 y 4)',
      })
    }
  }
  return lista
}

/** Serie de un día lunar para la gráfica, con un punto por hora desde su salida. NaN donde no hay Sol sobre el horizonte real. */
export type SerieDia = {
  t: Float64Array
  elevacion: Float64Array
  largoPlano: Float64Array
  largoRelieve: Float64Array
  errorAlturaPorciento: Float64Array
}

/** E18: caché por día lunar (índice del día). */
const seriesGuardadas = new Map<number, SerieDia>()

export function serieDelDia(d: DiaLunar): SerieDia {
  const guardada = seriesGuardadas.get(d.indice)
  if (guardada) return guardada
  const n = Math.floor(d.duracion / 3600) + 1
  const serie: SerieDia = {
    t: new Float64Array(n),
    elevacion: new Float64Array(n),
    largoPlano: new Float64Array(n),
    largoRelieve: new Float64Array(n),
    errorAlturaPorciento: new Float64Array(n),
  }
  const h = OBSTACULO.alturaM
  for (let i = 0; i < n; i++) {
    const t = Math.min(d.inicio + i * 3600, d.fin)
    const e = estado(t)
    serie.t[i] = t
    serie.elevacion[i] = e.elevacionSolGrados
    const visible = iluminacion(e).solVisible > 0 && e.elevacionSolGrados > 1
    if (!visible) {
      serie.largoPlano[i] = NaN
      serie.largoRelieve[i] = NaN
      serie.errorAlturaPorciento[i] = NaN
      continue
    }
    const [sx, sz] = direccionSombra(e)
    const plano = limitesSombra(h, 2 * OBSTACULO.radioM, e.elevacionSolGrados, e.diametroSolGrados).centroM
    const real = limitesSombraSobreTerreno(h, 2 * OBSTACULO.radioM, e.elevacionSolGrados, e.diametroSolGrados, sx, sz).centroM
    serie.largoPlano[i] = plano
    serie.largoRelieve[i] = real
    serie.errorAlturaPorciento[i] = Number.isFinite(real) ? ((real * Math.tan(e.elevacionSolGrados * RAD) - h) / h) * 100 : NaN
  }
  seriesGuardadas.set(d.indice, serie)
  return serie
}

/** Perfil del suelo a lo largo del eje de la sombra, desde el eje del poste (para la vista de perfil). */
export function perfilSombra(e: EstadoEscena, hastaM: number, pasos = 120): Array<[number, number]> {
  const [sx, sz] = direccionSombra(e)
  const base = alturaSuelo(0, 0)
  const puntos: Array<[number, number]> = []
  for (let i = 0; i <= pasos; i++) {
    const d = -10 + ((hastaM + 10) * i) / pasos
    puntos.push([d, alturaSuelo(sx * d, sz * d) - base])
  }
  return puntos
}

/**
 * Momentos de prueba de un día lunar (para la línea de tiempo anotada, DI pp. 199–201). E20: en el polo no hay salida ni
 * puesta local únicas ni α = 12°; los momentos son la medianoche y el mediodía (tránsito, Sol más alto del día).
 */
export function momentosDePrueba(d: DiaLunar) {
  if (DEFINICION_DIA === 'medianoche') {
    return [
      { nombre: 'Medianoche', t: d.inicio },
      { nombre: 'Mediodía (tránsito)', t: d.mediodia },
    ]
  }
  return [
    { nombre: 'Salida local', t: d.salidaLocal },
    { nombre: 'α = 12° mañana', t: tParaElevacionManana(d, 12) },
    { nombre: 'Tránsito', t: d.mediodia },
    { nombre: 'α = 12° tarde', t: tParaElevacionTarde(d, 12) },
    { nombre: 'Puesta local', t: d.puestaLocal },
  ]
}

/** Para pruebas: dirección del Sol a una elevación y azimut dados (reexporta el helper del motor). */
export const direccionSolDe = direccionDesdeHorizonte
