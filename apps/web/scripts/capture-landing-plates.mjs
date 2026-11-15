/**
 * Captura del propio lienzo de la landing las dos láminas fijas que usa la página:
 *
 *   - flight/data/poster.webp               La lámina del inicio (fondo mientras carga el vuelo y en modo estático).
 *   - sections/data/catalog-plate.webp      La lámina cuadrada del mapa de sitios.
 *   - sections/data/catalog-positions.json  Dónde cae cada sitio en esa lámina (fracciones del ancho y del alto).
 *
 * No son imágenes generadas: son el mismo dibujo del relieve de LOLA que hace la página, guardado como imagen.
 *
 * Usa Playwright con el Chrome instalado en el equipo (no descarga navegadores). Con el servidor de desarrollo
 * levantado:
 *
 *   npm run dev:web
 *   node apps/web/scripts/capture-landing-plates.mjs http://localhost:5173/
 *
 * Para usar otro navegador de Playwright: PW_CHANNEL=chromium (o msedge).
 * Script escrito con asistencia de IA (Claude Code).
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const url = process.argv[2] ?? "http://localhost:5173/"
const landing = resolve(dirname(fileURLToPath(import.meta.url)), "../src/features/landing")

// Sin ventana no hay gráfica: el lienzo se dibuja por software (SwiftShader), que da el mismo resultado.
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  // `window.__flight` solo existe en desarrollo: por eso hace falta el servidor de desarrollo y no el build.
  await page.waitForFunction(() => document.querySelector(".fl")?.dataset.ready === "true" && !!window.__flight, null, { timeout: 60_000 })
  console.log("Scene ready; capturing (software rendering, this takes a moment)")

  /**
   * Dibuja la primera parada con el encuadre pedido, espera a las sombras finas y devuelve el lienzo como WebP junto
   * con la posición de cada sitio. `frame` es el encuadre de la lámina: desplazamiento del centro óptico y lado en
   * píxeles del cuadrado en el que cabe.
   */
  const capture = (width, height, frame, stop) =>
    page.evaluate(
      async ({ width, height, frame, stop }) => {
        const { flight, points } = window.__flight
        // La captura no debe bajar de resolución aunque aquí se dibuje por software.
        flight.lockResolution()
        flight.o.stops[0] = { ...flight.o.stops[0], ...stop }
        flight.setProgress(1e-9)
        flight.resize(width, height, 1, flight.o.stops.map(() => frame))
        flight.setProgress(0)
        await flight.still(1)
        const canvas = document.querySelector(".fl__canvas")
        const image = canvas.toDataURL("image/webp", 0.82)
        const positions = {}
        const at = { x: 0, y: 0, visible: false }
        for (const [id, point] of Object.entries(points)) {
          flight.project(point, at)
          positions[id] = [+(at.x / width).toFixed(4), +(at.y / height).toFixed(4)]
        }
        return { image, positions, size: [canvas.width, canvas.height], fine: flight.fine }
      },
      { width, height, frame, stop },
    )

  const save = (file, dataUrl) => {
    mkdirSync(dirname(file), { recursive: true })
    const bytes = Buffer.from(dataUrl.split(",")[1], "base64")
    writeFileSync(file, bytes)
    return bytes.length
  }

  // Lámina del inicio: el mismo encuadre que ve una pantalla de 1600 x 1000 (barra arriba, tablero abajo).
  // El encuadre lateral de una pantalla de 1600 x 1000 con barra de 64 px y tablero de 46 px.
  const free = 1000 - 64 - 46
  const poster = await capture(1600, 1000, { shift: [0.2, (46 - 64) / 2000], fitPx: Math.min(free * 0.93, 0.6 * 1600 * 0.94) }, {})
  console.log("poster.webp", poster.size.join("x"), save(join(landing, "flight/data/poster.webp"), poster.image), "bytes, shadows:", poster.fine)

  // Lámina del mapa: cuadrada, centrada y sin desplazamiento.
  const catalog = await capture(1200, 1200, { shift: [0, 0], fitPx: 1200 * 0.93 }, { frameKm: 420 })
  console.log("catalog-plate.webp", catalog.size.join("x"), save(join(landing, "sections/data/catalog-plate.webp"), catalog.image), "bytes, shadows:", catalog.fine)
  writeFileSync(join(landing, "sections/data/catalog-positions.json"), JSON.stringify(catalog.positions))
  console.log("catalog-positions.json", Object.keys(catalog.positions).length, "sites")
} finally {
  await browser.close()
}
