// Datos del planificador de misiones (apps/web/public/planificar-mision.html), sacados del motor del Planificador.
//
// Las 13 zonas candidatas del polo sur, con la letra y el nombre del dashboard (prototipos/lunar-map/data/zonas.js):
// A, B, C (RoI de Barker et al. 2021), D a J (sitios del catálogo, horizonte detallado) y K, L, M (Mons Mouton, su
// meseta y el pico junto a Cabeus B: horizonte APROXIMADO sobre el relieve polar de LOLA).
//
// Escribe en apps/web/public/planificar-mision/:
//   datos.js          lo que la página necesita al abrir: DATOS (t0, paso, n y, por zona, su letra, nombre, posición y
//                     relieve LOLA de 20 × 20 km a 80 m) y DATOS2 (los 28 lugares del Planificador a 2 m y 10 m cada
//                     2 h, para el KPI de lugares que cumplen).
//   zonas/<id>.js     el cielo de una zona, que la página descarga al elegirla: por hora de 2026 a 2030 y para paneles a
//                     2 m y 10 m, el margen del Sol sobre el horizonte real (borde superior del disco, 0,05°), el de la
//                     Tierra (centro, 0,1°), el azimut del Sol (360/256) y su elevación geométrica (0,05°); y a 5, 15,
//                     20 y 30 m solo Sol y Tierra (las alturas de RAISE_TO_M, para el KPI de mástil).
// El relieve es el paquete del simulador (public/simulador/sitios) cuando lo hay; si no (K, L, M), sale del relieve
// polar de LOLA a 240 m (luna-recursos/datos/dem-polo-240m.i16), con el mismo encuadre: x este, z sur, decímetros
// relativos al centro.
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
const REPO = resolve(WEB, "../..")
type Zona = { id: string; nombre: string; lat: number; lon: number; paso: number; v: number[][]; aproximado?: boolean }
const zonasJs = readFileSync(join(REPO, "prototipos/lunar-map/data/zonas.js"), "utf8")
const CANDIDATAS = JSON.parse(zonasJs.slice(zonasJs.indexOf("{", zonasJs.indexOf("LunarData.zonas"))).trim().replace(/;$/, "")) as Record<string, Zona>
const ZONAS = Object.keys(CANDIDATAS).sort().map((k) => ({ k, ...CANDIDATAS[k] }))
const c8 = (x: number) => Math.max(-127, Math.min(127, Math.round(x)))
const b64 = (a: Int8Array) => Buffer.from(a.buffer).toString("base64")

/** La máscara de un lugar: la del catálogo del Planificador si la tiene; si no, la de data/zonas.js (aproximada). */
function mascara(id: string) {
  try {
    const h = JSON.parse(readFileSync(join(PLAN, "horizons", `${id}.json`), "utf8"))
    return { pasoAzimutGrados: h.stepDeg, vertices: h.vertices, fuente: h.horizon }
  } catch {
    const z = ZONAS.find((x) => x.id === id)!
    return { pasoAzimutGrados: z.paso, vertices: z.v, fuente: "approximate" }
  }
}
function barrido(id: string, alturaM: number, pasoMs: number) {
  const s = sitios.find((x) => x.id === id) ?? ZONAS.find((x) => x.id === id)!
  const perfil = perfilDesde(mascara(id) as Parameters<typeof perfilDesde>[0], alturaM)
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

/* Relieve polar de LOLA a 240 m (para las zonas sin paquete del simulador): mismo encuadre que build-simulador-sitios. */
const RLUNA = 1737400, HALF = 10000, NR = 251, PASO_R = (2 * HALF) / (NR - 1)
const dem = (() => {
  const b = readFileSync(join(REPO, "luna-recursos/datos/dem-polo-240m.i16"))
  return { n: 1626, paso: 240, x0: -195000, y0: 195000, h: new Int16Array(b.buffer, b.byteOffset, b.length / 2) }
})()
const alturaDem = (x: number, y: number) => {
  const c = (x - dem.x0) / dem.paso, f = (dem.y0 - y) / dem.paso
  const c0 = Math.min(Math.max(Math.floor(c), 0), dem.n - 2), f0 = Math.min(Math.max(Math.floor(f), 0), dem.n - 2), tc = c - c0, tf = f - f0, i = f0 * dem.n + c0
  return (dem.h[i] * (1 - tc) + dem.h[i + 1] * tc) * (1 - tf) + (dem.h[i + dem.n] * (1 - tc) + dem.h[i + dem.n + 1] * tc) * tf
}
function relieveDem(z: Zona) {
  const lon = (z.lon * Math.PI) / 180, rho = 2 * RLUNA * Math.tan(Math.PI / 4 + (z.lat * Math.PI) / 360)
  const X0 = rho * Math.sin(lon), Y0 = rho * Math.cos(lon), norte = [Math.sin(lon), Math.cos(lon)], este = [Math.cos(lon), -Math.sin(lon)]
  const h0 = alturaDem(X0, Y0), out = new Int16Array(NR * NR)
  for (let j = 0; j < NR; j++) for (let i = 0; i < NR; i++) {
    const x = -HALF + i * PASO_R, n = HALF - j * PASO_R
    out[j * NR + i] = Math.max(-32768, Math.min(32767, Math.round((alturaDem(X0 + x * este[0] + n * norte[0], Y0 + x * este[1] + n * norte[1]) - h0) * 10)))
  }
  return Buffer.from(out.buffer).toString("base64")
}
function relieve(z: Zona) {
  try {
    const pack = JSON.parse(readFileSync(join(WEB, "public/simulador/sitios", `${z.id}.json`), "utf8"))
    return { relieve: readFileSync(join(WEB, "public/simulador/sitios", `${z.id}.i16`)).toString("base64"), N: pack.wide.n, half: pack.wide.half, demPolar: false }
  } catch {
    return { relieve: relieveDem(z), N: NR, half: HALF, demPolar: true }
  }
}

const carpeta = join(WEB, "public/planificar-mision/zonas")
mkdirSync(carpeta, { recursive: true })
const zonas: unknown[] = []
let n = 0, n1 = 0
for (const z of ZONAS) {
  const c2 = cielo(z.id, 2, H, true), c10 = cielo(z.id, 10, H, true)
  n = c2.n
  const alturas: Record<number, string> = {}
  for (const a of [5, 15, 20, 30]) { const c = cielo(z.id, a, H, false); alturas[a] = c.datos; n1 = c.n }
  writeFileSync(join(carpeta, `${z.id}.js`), `// Generado por apps/web/scripts/build-planificador-mision.ts: no editar a mano.\nPM_ZONA(${JSON.stringify({ id: z.id, n: c2.n, n1, cielo: { 2: c2.datos, 10: c10.datos }, alturas })});\n`)
  zonas.push({ k: z.k, id: z.id, nombre: z.nombre, lat: z.lat, lon: z.lon, aproximado: Boolean(z.aproximado), ...relieve(z) })
  console.log(`${z.k} ${z.id}`)
}
const DATOS = { t0: T0, paso: H, n, n1, zonas }
const DATOS2: { sitios: unknown[]; n2: number } = { sitios: [], n2: 0 }
for (const s of sitios) { const a = cielo(s.id, 2, 2 * H, false), b = cielo(s.id, 10, 2 * H, false); DATOS2.sitios.push({ id: s.id, nombre: s.name, lat: s.lat, kind: s.kind, c2: a.datos, c10: b.datos }); DATOS2.n2 = a.n }

const salida = join(WEB, "public/planificar-mision/datos.js")
mkdirSync(dirname(salida), { recursive: true })
writeFileSync(salida, `// Generado por apps/web/scripts/build-planificador-mision.ts: no editar a mano.\nconst DATOS = ${JSON.stringify(DATOS)};\nconst DATOS2 = ${JSON.stringify(DATOS2)};\n`)
console.log(`${salida}: ${(readFileSync(salida).length / 1e6).toFixed(1)} MB`)
