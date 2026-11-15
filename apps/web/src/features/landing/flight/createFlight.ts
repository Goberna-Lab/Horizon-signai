/**
 * Entrada del trozo diferido: three.js, los datos y el motor de la lámina. La página lo importa después de
 * pintar el texto, así que el inicio no espera a la escena.
 */
import plate from "./data/plate.json"
import terrainUrl from "./data/terrain.z.bin?url"
import { createGrid, decodeTerrain, project, surfacePoint } from "./engine/plate"
import { Flight, type Palette } from "./engine/renderer"
import { FEATURED_SITE, STOPS } from "./stops"
import { readouts, type Featured } from "./telemetry"

export type FlightHandle = {
  flight: Flight
  /** Puntos del terreno (marco de la lámina, km) para rotular sitios. */
  points: Record<string, [number, number, number]>
  readouts: () => ReturnType<typeof readouts>
}

export const STOP_COUNT = STOPS.length

export async function createFlight(
  canvas: HTMLCanvasElement,
  options: { palette: Palette; quality: "high" | "low"; antialias: boolean; onReady: () => void; onFrame: (flight: Flight) => void },
): Promise<FlightHandle> {
  const heights = await decodeTerrain(await fetch(terrainUrl), plate.terrain.n)
  const grid = createGrid(heights, plate.terrain.n, plate.terrain.extentKm, plate.radiusKm)
  const flight = new Flight({
    canvas,
    grid,
    ephemeris: plate.ephemeris,
    startMs: plate.lunarDay.startMs,
    stops: STOPS,
    site: FEATURED_SITE,
    palette: options.palette,
    quality: options.quality,
    antialias: options.antialias,
    onReady: options.onReady,
    onFrame: options.onFrame,
  })
  const points: FlightHandle["points"] = {}
  for (const site of plate.sites) {
    const [xs, ys] = project(site.lat, site.lon, plate.radiusKm)
    points[site.id] = surfacePoint(grid, xs, ys, 0.15)
  }
  const featured = plate.featured as Featured
  return { flight, points, readouts: () => readouts(featured, flight.sky, flight.timeMs) }
}
