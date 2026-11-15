/**
 * Entrada del trozo diferido: three.js, los datos y el motor de la lámina. La página lo importa después de
 * pintar el texto, así que el inicio no espera a la escena.
 */
import plate from "./data/plate.json"
import terrainUrl from "./data/terrain.z.bin?url"
import { skyAt } from "./engine/ephemeris"
import { createGrid, decodeTerrain, project, surfacePoint } from "./engine/plate"
import { Flight, type Palette } from "./engine/renderer"
import { FEATURED_SITE, HERO_DAY, HERO_TURN, STOPS } from "./stops"
import { readouts, type Featured } from "./telemetry"

export type FlightHandle = {
  flight: Flight
  /** Puntos del terreno (marco de la lámina, km) para rotular sitios. */
  points: Record<string, [number, number, number]>
  readouts: () => ReturnType<typeof readouts>
}

export const STOP_COUNT = STOPS.length

/** Pasos de la carga, para la pantalla de carga: el relieve se descarga, se monta la malla y se calculan las sombras. */
export type LoadStep = "terrain" | "mesh" | "light"

/** Descarga el relieve contando los bytes, para que la carga avance de verdad. */
async function download(url: string, onProgress: (fraction: number) => void): Promise<Response> {
  const response = await fetch(url)
  const total = Number(response.headers.get("content-length")) || 0
  if (!response.body || !total) return response
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(Math.min(received / total, 1))
  }
  return new Response(new Blob(chunks as BlobPart[]))
}

/** Deja pintar a la página antes de un trabajo largo y síncrono (la pantalla de carga se actualiza). */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

export async function createFlight(
  canvas: HTMLCanvasElement,
  options: {
    palette: Palette
    quality: "high" | "low"
    antialias: boolean
    onReady: () => void
    onFrame: (flight: Flight) => void
    onProgress?: (step: LoadStep, fraction: number) => void
  },
): Promise<FlightHandle> {
  const progress = options.onProgress ?? (() => {})
  progress("terrain", 0)
  const heights = await decodeTerrain(await download(terrainUrl, (f) => progress("terrain", f)), plate.terrain.n)
  progress("mesh", 0)
  await nextFrame()
  const grid = createGrid(heights, plate.terrain.n, plate.terrain.extentKm, plate.radiusKm)
  // La primera parada mira cerca del Sol del amanecer, sea cual sea su rumbo ese día, girada unos grados: con la luz
  // de lado el relieve se ve iluminado (de frente, todo lo que mira a la cámara queda a contraluz).
  const { sun } = skyAt(plate.ephemeris, plate.lunarDay.startMs + HERO_DAY * 86_400_000, { sun: [0, 0, 0], earth: [0, 0, 0] })
  const stops = STOPS.map((stop, i) => (i === 0 ? { ...stop, bearing: (Math.atan2(sun[0], sun[1]) * 180) / Math.PI + HERO_TURN } : stop))
  const flight = new Flight({
    canvas,
    grid,
    ephemeris: plate.ephemeris,
    startMs: plate.lunarDay.startMs,
    stops,
    site: FEATURED_SITE,
    palette: options.palette,
    quality: options.quality,
    antialias: options.antialias,
    onReady: options.onReady,
    onFrame: options.onFrame,
  })
  progress("light", 0)
  const points: FlightHandle["points"] = {}
  for (const site of plate.sites) {
    const [xs, ys] = project(site.lat, site.lon, plate.radiusKm)
    points[site.id] = surfacePoint(grid, xs, ys, 0.15)
  }
  const featured = plate.featured as Featured
  return { flight, points, readouts: () => readouts(featured, flight.sky, flight.timeMs) }
}
