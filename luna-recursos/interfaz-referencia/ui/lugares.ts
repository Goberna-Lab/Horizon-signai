// E23–E24: lugares del planificador. Cada uno trae sus coordenadas, la fuente y cómo cargar su máscara de horizonte.
// - Sitios detallados (E23): horizonte lejano de E10/E20 más el cercano del DTM de 2 m.
// - Catálogo del polo sur (E24): sitios del DTM de 5 m de PGDA, con horizonte precalculado (5 m cerca, LOLA 240 m lejos).
// - Puntos propios dentro de 190 km del polo (E24): horizonte calculado en el navegador sobre LOLA 240 m (aproximado).
import catalogo from '../data/catalogo-polo.json'
import metaDem from '../data/dem-polo.json'
import urlCerca from '../data/dem-polo-240m.i16?url'
import urlLejos from '../data/dem-polo-960m.i16?url'
import { crearDemPolar, mascaraPolar, type DemPolar } from '../engine/demPolar'
import { mascaraDeArchivo, type Mascara } from '../engine/mascara'
import { SITIOS, type IdSitio } from '../engine/sitio'

/** Un lugar del planificador: dónde está y de dónde sale su horizonte. */
export type Lugar = {
  id: string
  nombre: string
  latitudGrados: number
  longitudEsteGrados: number
  fuente: string
  /** Detalle del horizonte, para avisar en la interfaz: 'detallado' (DTM de 2–5 m cerca) o 'aproximado' (LOLA 240 m). */
  detalle: 'detallado' | 'aproximado'
  grupo: string
  cargarMascara: () => Promise<Mascara>
}

type ArchivoHorizonte = Parameters<typeof mascaraDeArchivo>[0]
const HORIZONTES = import.meta.glob('../data/horizonte-*.json', { import: 'default' }) as Record<string, () => Promise<ArchivoHorizonte>>

let promesaDem: Promise<DemPolar> | null = null
/** DEM polar (E24, 6,3 MB): se baja una vez, la primera vez que se pide un punto sin horizonte precalculado. */
export function cargarDemPolar(): Promise<DemPolar> {
  promesaDem ??= Promise.all([fetch(urlCerca).then((r) => r.arrayBuffer()), fetch(urlLejos).then((r) => r.arrayBuffer())]).then(([a, b]) => crearDemPolar(a, b, metaDem))
  return promesaDem
}

const FUENTE_APROXIMADA = 'LOLA LDEM_75S_240M (240 m), calculado en el navegador; aproximado: sin el relieve de menos de ~500 m'

/** E24: un punto propio dentro del dominio polar. */
export function lugarPropio(latitudGrados: number, longitudEsteGrados: number): Lugar {
  return {
    id: `propio:${latitudGrados.toFixed(5)},${longitudEsteGrados.toFixed(5)}`,
    nombre: `Punto propio (${Math.abs(latitudGrados).toFixed(3)}° S, ${longitudEsteGrados.toFixed(3)}° E)`,
    latitudGrados,
    longitudEsteGrados,
    fuente: FUENTE_APROXIMADA,
    detalle: 'aproximado',
    grupo: 'Puntos propios',
    cargarMascara: async () => mascaraPolar(await cargarDemPolar(), latitudGrados, longitudEsteGrados),
  }
}

/** E23: los dos sitios detallados. */
const DETALLADOS: Lugar[] = (Object.keys(SITIOS) as IdSitio[]).map((id) => ({
  id,
  nombre: SITIOS[id].nombre,
  latitudGrados: SITIOS[id].latitudGrados,
  longitudEsteGrados: SITIOS[id].longitudEsteGrados,
  fuente: `${SITIOS[id].textos.horizonte} + relieve cercano (${SITIOS[id].textos.relieve})`,
  detalle: 'detallado',
  grupo: 'Sitios con escena 3D',
  cargarMascara: async () => mascaraDeArchivo(await HORIZONTES[`../data/horizonte-${id}.json`](), `${SITIOS[id].textos.horizonte} + ${SITIOS[id].textos.relieve}`),
}))

/** E24: grupo de cada tipo del catálogo, en el orden en que se muestran. */
const GRUPOS: Record<string, string> = {
  roi: 'Zonas de aterrizaje candidatas (RoI; Barker et al. 2021)',
  centro: 'Sitios del polo sur (centro del mosaico de PGDA)',
  mision: 'Misiones',
}

/** E24: sitios del catálogo (sin el centro de Connecting Ridge, que ya es un sitio detallado). */
const CATALOGO: Lugar[] = catalogo.sitios
  .filter((s) => s.id !== 'connecting-ridge')
  .map((s) => {
    const archivo = `../data/horizonte-catalogo-${s.id}.json`
    const precalculado = archivo in HORIZONTES
    return {
      id: s.id,
      nombre: s.nombre,
      latitudGrados: s.latitudGrados,
      longitudEsteGrados: s.longitudEsteGrados,
      fuente: precalculado ? `DTM de 5 m de LOLA (PGDA) hasta 4 km y LOLA 240 m hasta 150 km. Sitio: ${s.fuente}` : `${FUENTE_APROXIMADA}. Sitio: ${s.fuente}`,
      detalle: precalculado ? 'detallado' : 'aproximado',
      grupo: GRUPOS[s.tipo] ?? 'Otros',
      cargarMascara: precalculado
        ? async () => mascaraDeArchivo(await HORIZONTES[archivo](), 'DTM de 5 m de LOLA (PGDA) + LOLA 240 m')
        : async () => mascaraPolar(await cargarDemPolar(), s.latitudGrados, s.longitudEsteGrados),
    } satisfies Lugar
  })
  .sort((a, b) => Object.values(GRUPOS).indexOf(a.grupo) - Object.values(GRUPOS).indexOf(b.grupo))

export const LUGARES: Lugar[] = [...DETALLADOS, ...CATALOGO]

/** Sitios del catálogo para marcar en el mapa polar (sin las RoI, que a esta escala caen encima de su sitio). */
export const MARCAS_CATALOGO = catalogo.sitios.filter((s) => s.tipo !== 'roi').map((s) => ({ id: s.id, nombre: s.nombre, latitudGrados: s.latitudGrados, longitudEsteGrados: s.longitudEsteGrados }))

const mascaras = new Map<string, Promise<Mascara>>()
/** Máscara de un lugar, calculada o bajada una sola vez por sesión. */
export function obtenerMascara(lugar: Lugar): Promise<Mascara> {
  if (!mascaras.has(lugar.id)) mascaras.set(lugar.id, lugar.cargarMascara())
  return mascaras.get(lugar.id)!
}
