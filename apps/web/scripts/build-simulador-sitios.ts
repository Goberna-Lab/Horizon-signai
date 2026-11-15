// Paquetes de terreno del simulador para los sitios del Planificador (features/simulator/alunizaje).
//
// Por sitio escribe en apps/web/public/simulador/sitios/:
//   <id>.i16   relieve de 20 x 20 km a 80 m alrededor del sitio (251 x 251, int16 en decímetros, relativo al centro;
//              x = este, z = sur, como la escena), muestreado de los bloques LOLA LDEM_80S_80M de nuestro simulador NASA.
//   <id>.json  { id, name, lat, lon, wide: { half, n }, ringDeg: horizonte (721 valores, cada 0,5°), slope }
// El horizonte sale de la máscara de cada sitio de @/shared/planning (la misma que usa el Planificador), visto a 1,7 m.
// El Sol y la Tierra NO se guardan: el simulador los calcula para la fecha de la misión con el motor de @/shared/planning.
//
// Uso:  npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/build-simulador-sitios.ts --nasa <NASA/app/public/data>
//       (--comprobar: solo compara connecting-ridge-roi-6 con el paquete hecho a mano del repo; el 2026-11-15 dio
//        8,7 m RMS en los 12 km centrales, correlación 0,955, y el horizonte 0,04° RMS)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import catalog from "../src/shared/planning/data/sites.json" with { type: "json" }
import { horizonteEn, perfilDesde, type Mascara } from "../src/shared/planning/engine/mascara.ts"

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(AQUI, "..")
const SALIDA = join(WEB, "public/simulador/sitios")
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const NASA = resolve(arg("--nasa") ?? join(process.env.HOME ?? "", "Documentos/NASA/app/public/data"))
const COMPROBAR = process.argv.includes("--comprobar")

const R = 1737400
const HALF = 10000, N = 251, ST = (2 * HALF) / (N - 1) // 80 m, como el paquete de Connecting Ridge
const OJO_M = 1.7

type Meta = { near: { size: number; scale: number; offset: number; tile: number; tiles: number } }
const meta = JSON.parse(readFileSync(join(NASA, "meta.json"), "utf8")) as Meta
const { size, scale, offset, tile } = meta.near
const bloques = new Map<string, Int16Array | null>()
const bloque = (tr: number, tc: number) => {
  const k = `${tr}_${tc}`
  if (!bloques.has(k)) {
    try {
      const b = readFileSync(join(NASA, "tiles", `t_${k}.bin`))
      bloques.set(k, new Int16Array(b.buffer, b.byteOffset, b.length / 2))
    } catch {
      bloques.set(k, null)
    }
  }
  return bloques.get(k)!
}
/** Altura LOLA (m) en un píxel de la malla de 80 m (DN × 0,5). */
const px = (linea: number, muestra: number) => {
  const l = Math.min(size - 1, Math.max(0, linea)), m = Math.min(size - 1, Math.max(0, muestra))
  const b = bloque(Math.floor(l / tile), Math.floor(m / tile))
  return b ? b[(l % tile) * tile + (m % tile)] * 0.5 : NaN
}
/** Altura (m) en un punto de la proyección estereográfica polar sur, con interpolación bilineal. */
const altura = (X: number, Y: number) => {
  const m = offset + X / scale, l = offset - Y / scale
  const m0 = Math.floor(m), l0 = Math.floor(l), fm = m - m0, fl = l - l0
  return (px(l0, m0) * (1 - fm) + px(l0, m0 + 1) * fm) * (1 - fl) + (px(l0 + 1, m0) * (1 - fm) + px(l0 + 1, m0 + 1) * fm) * fl
}

type Sitio = { id: string; name: string; lat: number; lon: number }
/** Relieve local (dm, relativo al centro): x hacia el este, z hacia el sur. En el polo sur, el norte es alejarse del polo. */
function relieve(s: Sitio) {
  const lon = (s.lon * Math.PI) / 180
  const rho = 2 * R * Math.tan(Math.PI / 4 + (s.lat * Math.PI) / 180 / 2)
  const X0 = rho * Math.sin(lon), Y0 = rho * Math.cos(lon)
  const norte = [Math.sin(lon), Math.cos(lon)], este = [Math.cos(lon), -Math.sin(lon)]
  const h0 = altura(X0, Y0)
  const out = new Int16Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HALF + i * ST, z = -HALF + j * ST, n = -z
    const h = altura(X0 + x * este[0] + n * norte[0], Y0 + x * este[1] + n * norte[1])
    out[j * N + i] = Math.max(-32768, Math.min(32767, Math.round((h - h0) * 10)))
  }
  return out
}

/** Pendiente media (°) en un radio de ~100 m alrededor del centro. */
function pendiente(r: Int16Array) {
  const c = (N - 1) / 2, g = (i: number, j: number) => r[j * N + i] / 10
  const dx = (g(c + 1, c) - g(c - 1, c)) / (2 * ST), dz = (g(c, c + 1) - g(c, c - 1)) / (2 * ST)
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI
}

async function mascara(id: string): Promise<Mascara> {
  const h = JSON.parse(readFileSync(join(WEB, "src/shared/planning/data/horizons", `${id}.json`), "utf8"))
  return { pasoAzimutGrados: h.stepDeg, vertices: h.vertices, fuente: h.horizon }
}

const sitios = (catalog as { sites: Sitio[] }).sites
mkdirSync(SALIDA, { recursive: true })

if (COMPROBAR) {
  // El paquete hecho a mano (features/simulator/alunizaje/data) para Connecting Ridge · RoI 6: mismo encuadre
  const ref = readFileSync(join(WEB, "src/features/simulator/alunizaje/data/wide.i16"))
  const refR = new Int16Array(ref.buffer, ref.byteOffset, ref.length / 2)
  const refJ = JSON.parse(readFileSync(join(WEB, "src/features/simulator/alunizaje/data/site.json"), "utf8"))
  const s = sitios.find((x) => x.id === "connecting-ridge-roi-6")!
  const nuevo = relieve({ ...s, lat: refJ.lat, lon: refJ.lon })
  let d2 = 0, n = 0
  for (let k = 0; k < nuevo.length; k++) if (Math.abs(refR[k]) < 30000) { d2 += ((nuevo[k] - refR[k]) / 10) ** 2; n++ }
  const m = await mascara(s.id), p = perfilDesde(m, OJO_M)
  let a2 = 0
  for (let k = 0; k < refJ.ringDeg.length; k++) a2 += (horizonteEn(p, k * 0.5) - refJ.ringDeg[k]) ** 2
  console.log(`relieve: RMS ${Math.sqrt(d2 / n).toFixed(1)} m · horizonte: RMS ${Math.sqrt(a2 / refJ.ringDeg.length).toFixed(3)}°`)
  process.exit(0)
}

let total = 0
const indice = []
for (const s of sitios) {
  const r = relieve(s)
  const m = await mascara(s.id), p = perfilDesde(m, OJO_M)
  const ringDeg = Array.from({ length: 721 }, (_, k) => +horizonteEn(p, k * 0.5).toFixed(3))
  writeFileSync(join(SALIDA, `${s.id}.i16`), Buffer.from(r.buffer))
  writeFileSync(join(SALIDA, `${s.id}.json`), JSON.stringify({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, wide: { half: HALF, n: N }, ringDeg, slope: +pendiente(r).toFixed(2) }))
  total += r.byteLength
  indice.push({ id: s.id, name: s.name })
  console.log(`${s.id.padEnd(30)} pendiente ${pendiente(r).toFixed(1)}°`)
}
writeFileSync(join(SALIDA, "index.json"), JSON.stringify({ fuente: "LRO LOLA LDEM_80S_80M (PDS Geosciences Node), vía nuestro simulador NASA", sitios: indice }))
console.log(`Listo: ${indice.length} sitios, ${(total / 1e6).toFixed(1)} MB`)
