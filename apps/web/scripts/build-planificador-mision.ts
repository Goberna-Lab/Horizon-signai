// Datos del planificador de misiones (apps/web/public/planificar-mision.html), sacados del motor del Planificador.
//
// Escribe apps/web/public/planificar-mision/datos.js con dos globales:
//   DATOS   las tres zonas (connecting-ridge-roi-6, peak-near-shackleton-roi-2, shackleton-rim-roi-4): por hora de 2026 a
//           2030 y para paneles a 2 m y 10 m, el margen del Sol sobre el horizonte real (borde superior del disco, 0,05°),
//           el de la Tierra (centro, 0,1°), el azimut del Sol (360/256) y su elevación geométrica (0,05°); y el relieve
//           LOLA de 20 × 20 km a 80 m (el mismo paquete del simulador, public/simulador/sitios).
//   DATOS2  las mismas tres zonas a 5, 15, 20 y 30 m (las alturas de RAISE_TO_M, para el KPI de mástil) y los 28 lugares
//           del Planificador a 2 m y 10 m cada 2 h (para el KPI de lugares que cumplen).
// Todo sale de `barrer` (shared/planning/engine): efemérides DE441 de JPL Horizons y la máscara de horizonte de cada
// lugar. Comprobado contra `evaluate()` el 2026-11-15 (Sol, Tierra y noche más larga iguales; la noche, a la hora).
//
// Uso, desde la raíz del repo:  npx tsx apps/web/scripts/build-planificador-mision.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { crearTablaLuna, prepararSitio } from "../src/shared/planning/engine/efemeridesLuna.ts"
import { perfilDesde } from "../src/shared/planning/engine/mascara.ts"
import { barrer } from "../src/shared/planning/engine/planificador.ts"

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PLAN = join(WEB, "src/shared/planning/data")
const meta = JSON.parse(readFileSync(join(PLAN, "ephemeris.json"), "utf8"))
const buf = readFileSync(join(PLAN, "ephemeris.f32"))
const tabla = crearTablaLuna(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta)
const sitios = JSON.parse(readFileSync(join(PLAN, "sites.json"), "utf8")).sites as { id: string; name: string; lat: number; lon: number; kind: string }[]
const T0 = Date.UTC(2026, 0, 1), T1 = Date.UTC(2030, 11, 31, 23), H = 3_600_000
const ZONAS = ["connecting-ridge-roi-6", "peak-near-shackleton-roi-2", "shackleton-rim-roi-4"]
const c8 = (x: number) => Math.max(-127, Math.min(127, Math.round(x)))
const b64 = (a: Int8Array) => Buffer.from(a.buffer).toString("base64")

function barrido(id: string, alturaM: number, pasoMs: number) {
  const s = sitios.find((x) => x.id === id)!
  const h = JSON.parse(readFileSync(join(PLAN, "horizons", `${id}.json`), "utf8"))
  const perfil = perfilDesde({ pasoAzimutGrados: h.stepDeg, vertices: h.vertices, fuente: h.horizon }, alturaM)
  return barrer(tabla, { sitio: prepararSitio(s.lat, s.lon), perfil }, T0, T1, pasoMs)
}
/** Sol y Tierra (2 bytes por muestra) o, con `completo`, también el azimut y la elevación del Sol (4 bytes). */
function cielo(id: string, alturaM: number, pasoMs: number, completo: boolean) {
  const b = barrido(id, alturaM, pasoMs), ancho = completo ? 4 : 2, v = new Int8Array(b.n * ancho)
  for (let k = 0; k < b.n; k++) {
    v[k * ancho] = c8((b.solSobreHorizonte[k] + 0.266) * 20) // + semidiámetro: el borde superior, como margenSol
    v[k * ancho + 1] = c8(b.tierraSobreHorizonte[k] * 10)
    if (completo) { v[k * ancho + 2] = c8((b.solAzimut[k] / 360) * 256 - 128); v[k * ancho + 3] = c8(b.solElevacion[k] * 20) }
  }
  return { n: b.n, datos: b64(v) }
}

const DATOS: Record<string, unknown> = { t0: T0, paso: H }
for (const id of ZONAS) {
  const pack = JSON.parse(readFileSync(join(WEB, "public/simulador/sitios", `${id}.json`), "utf8"))
  const c2 = cielo(id, 2, H, true), c10 = cielo(id, 10, H, true)
  DATOS[id] = { n: c2.n, cielo: { 2: c2.datos, 10: c10.datos }, relieve: readFileSync(join(WEB, "public/simulador/sitios", `${id}.i16`)).toString("base64"), N: pack.wide.n, half: pack.wide.half }
}
const DATOS2: { alturas: Record<string, Record<number, string>>; sitios: unknown[]; n1: number; n2: number } = { alturas: {}, sitios: [], n1: 0, n2: 0 }
for (const id of ZONAS) { DATOS2.alturas[id] = {}; for (const a of [5, 15, 20, 30]) { const c = cielo(id, a, H, false); DATOS2.alturas[id][a] = c.datos; DATOS2.n1 = c.n } }
for (const s of sitios) { const a = cielo(s.id, 2, 2 * H, false), b = cielo(s.id, 10, 2 * H, false); DATOS2.sitios.push({ id: s.id, nombre: s.name, lat: s.lat, kind: s.kind, c2: a.datos, c10: b.datos }); DATOS2.n2 = a.n }

const salida = join(WEB, "public/planificar-mision/datos.js")
mkdirSync(dirname(salida), { recursive: true })
writeFileSync(salida, `// Generado por apps/web/scripts/build-planificador-mision.ts: no editar a mano.\nconst DATOS = ${JSON.stringify(DATOS)};\nconst DATOS2 = ${JSON.stringify(DATOS2)};\n`)
console.log(`${salida}: ${(readFileSync(salida).length / 1e6).toFixed(1)} MB`)
