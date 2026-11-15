/**
 * Genera los datos del planificador (`/planificador`) a partir de `luna-recursos/` (datos de la NASA ya procesados
 * + motor validado).
 *
 *   bun apps/web/scripts/build-planner-data.ts            datos (efemérides, sitios y horizontes)
 *   bun apps/web/scripts/build-planner-data.ts --relief   además, la lámina de relieve (necesita `cwebp`)
 *
 * Salida, en `apps/web/src/shared/planning/data/`:
 *   - ephemeris.f32      La tabla global de efemérides (JPL Horizons DE441), sin cambios: 14 609 filas de 8 Float32.
 *   - ephemeris.json     Sus metadatos y su procedencia.
 *   - sites.json         Los 28 lugares del catálogo del polo sur, con nombre en inglés, coordenadas, posición en la
 *                        proyección, pendiente y desnivel del terreno (rejilla de 240 m) y encuadre de la lámina.
 *   - horizons/<id>.json La máscara de horizonte de cada lugar, lista para `perfilDesde`: por azimut, la envolvente
 *                        convexa superior del relieve (lejana y cercana ya unidas). Sirve para cualquier altura.
 *   - relief.webp        Lámina del relieve (LOLA LDEM_75S_240M) sombreada en los tonos de la marca.
 *
 * El planificador calcula en el navegador con el motor portado (`shared/planning/engine/`). Aquí el motor
 * original solo se usa para la máscara de IM-2 (no tiene DTM de 5 m: sale de la rejilla de 240 m), para la altura
 * de cada lugar y para comprobar el ejemplo del SPEC E23 antes de escribir nada.
 *
 * `luna-recursos/` no entra en la imagen de Docker, por eso el resultado se guarda en el repo.
 * Script escrito con asistencia de IA (Claude Code).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../../..")
const LUNA = join(RAIZ, "luna-recursos")
const DATOS = join(LUNA, "datos")
const SALIDA = resolve(AQUI, "../src/shared/planning/data")
const CON_RELIEVE = process.argv.includes("--relief")

/** Encuadre de la lámina: un cuadrado de 250 km que contiene los 28 lugares del catálogo (proyección del DEM). */
const LAMINA = { xMinKm: -70, yMaxKm: 188, sizeKm: 250, px: 2048 }

// --- 1. Motor original en su estructura original (src/engine, src/data) -------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "horizon-planner-"))
mkdirSync(join(tmp, "src"), { recursive: true })
cpSync(join(LUNA, "calculos/motor"), join(tmp, "src/engine"), { recursive: true })
symlinkSync(DATOS, join(tmp, "src/data"))
process.env.LUNA_SITIO = "connecting-ridge"
const ENG = join(tmp, "src/engine")
const { crearTablaLuna, prepararSitio } = await import(join(ENG, "efemeridesLuna.ts"))
const { barrer, resumir, proximoCambio } = await import(join(ENG, "planificador.ts"))
const { mascaraDeArchivo, perfilDesde } = await import(join(ENG, "mascara.ts"))
const { crearDemPolar, mascaraPolar, estereoSur, alturaPolar } = await import(join(ENG, "demPolar.ts"))

const json = (p: string) => JSON.parse(readFileSync(join(DATOS, p), "utf8"))
const bin = (p: string) => {
  const b = readFileSync(join(DATOS, p))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const metaDem = json("dem-polo.json")
const metaEfe = json("efemerides-luna.json")
const catalogo = json("catalogo-polo.json")
const tabla = crearTablaLuna(bin("efemerides-luna.f32"), metaEfe)
const dem = crearDemPolar(bin(metaDem.cerca.archivo), bin(metaDem.lejos.archivo), metaDem)

// --- 2. Lugares y máscaras ------------------------------------------------------------------------------------
const NOMBRES: Record<string, string> = {
  "connecting-ridge": "Connecting Ridge",
  "shackleton-rim": "Shackleton rim",
  "nobile-rim-1": "Nobile rim 1",
  "peak-near-shackleton": "Peak near Shackleton",
  "de-gerlache-rim": "de Gerlache rim",
  "leibnitz-beta": "Leibnitz Beta plateau",
  "malapert-massif": "Malapert massif",
  haworth: "Haworth",
  shoemaker: "Shoemaker",
  "nobile-rim-2": "Nobile rim 2",
  "im-2": "IM-2 Athena landing",
}
type Sitio = { id: string; nombre: string; tipo: string; latitudGrados: number; longitudEsteGrados: number }
type Mascara = { pasoAzimutGrados: number; vertices: number[][]; fuente: string }
const sitiosCat: Sitio[] = catalogo.sitios
const padre = (id: string) => (/-roi-\d+$/.test(id) ? id.replace(/-roi-\d+$/, "") : null)
const nombreEn = (s: Sitio) => {
  if (NOMBRES[s.id]) return NOMBRES[s.id]
  const m = s.id.match(/^(.*)-roi-(\d+)$/)
  return m ? `${NOMBRES[m[1]]} RoI ${m[2]}` : s.id
}
/** La misma elección que la landing (`build-landing-data.ts`): detallado si hay archivo, aproximado si no. */
function mascaraDe(s: Sitio): { m: Mascara; detalle: "detailed" | "approximate" } {
  if (s.id === "connecting-ridge") return { m: mascaraDeArchivo(json("horizonte-connecting-ridge.json"), "detallado"), detalle: "detailed" }
  try {
    return { m: mascaraDeArchivo(json(`horizonte-catalogo-${s.id}.json`), "catalogo"), detalle: "detailed" }
  } catch {
    return { m: mascaraPolar(dem, s.latitudGrados, s.longitudEsteGrados), detalle: "approximate" }
  }
}

/**
 * Complejidad del terreno alrededor del punto, sobre la rejilla de 240 m (indicador grueso: no ve rocas ni cráteres
 * de menos de ~500 m). Pendiente: diferencias centradas a 240 m a cada lado. Desnivel: altura máxima menos mínima
 * dentro de 2 km. No son umbrales de aterrizaje: el reto no pide evaluar peligros del terreno.
 */
function terreno(x: number, y: number): { slopeDeg: number; reliefM: number } {
  const d = 240
  const dzdx = (alturaPolar(dem, x + d, y) - alturaPolar(dem, x - d, y)) / (2 * d)
  const dzdy = (alturaPolar(dem, x, y + d) - alturaPolar(dem, x, y - d)) / (2 * d)
  let min = Infinity
  let max = -Infinity
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      if (Math.hypot(i, j) * d > 2000) continue
      const h = alturaPolar(dem, x + i * d, y + j * d)
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  return { slopeDeg: Number(((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI).toFixed(1)), reliefM: Math.round(max - min) }
}

mkdirSync(join(SALIDA, "horizons"), { recursive: true })
let bytesMascaras = 0
const sitios = sitiosCat.map((s) => {
  const [x, y] = estereoSur(s.latitudGrados, s.longitudEsteGrados)
  const { m, detalle } = mascaraDe(s)
  const texto = JSON.stringify({ stepDeg: m.pasoAzimutGrados, horizon: detalle, vertices: m.vertices })
  bytesMascaras += texto.length
  writeFileSync(join(SALIDA, "horizons", `${s.id}.json`), texto)
  return {
    id: s.id,
    name: nombreEn(s),
    kind: s.tipo === "roi" ? "roi" : s.tipo === "mision" ? "mission" : "site",
    parent: padre(s.id),
    lat: s.latitudGrados,
    lon: s.longitudEsteGrados,
    xKm: Number((x / 1000).toFixed(3)),
    yKm: Number((y / 1000).toFixed(3)),
    heightM: Math.round(alturaPolar(dem, x, y)),
    ...terreno(x, y),
    horizon: detalle,
  }
})
for (const s of sitios) {
  const dentro = s.xKm > LAMINA.xMinKm && s.xKm < LAMINA.xMinKm + LAMINA.sizeKm && s.yKm < LAMINA.yMaxKm && s.yKm > LAMINA.yMaxKm - LAMINA.sizeKm
  if (!dentro) throw new Error(`${s.id} queda fuera de la lámina: (${s.xKm}, ${s.yKm}) km`)
}

// --- 3. Comprobación contra el ejemplo del SPEC E23 ------------------------------------------------------------
// Connecting Ridge, 2026-12-01, un día lunar, a ras del suelo: Sol 56,8 %, Tierra 19,9 %, ambos 9,4 %; el Sol sale el
// 2026-12-04 a las 08:51 UTC. La prueba del núcleo (`shared/planning/model/planner.test.ts`) repite esto con el motor portado.
const MES_MS = 29.530589 * 86_400_000
const INICIO = Date.parse("2026-12-01T00:00:00Z")
const PASO = 600_000
const cr = sitiosCat.find((s) => s.id === "connecting-ridge")!
const puntoCR = { sitio: prepararSitio(cr.latitudGrados, cr.longitudEsteGrados), perfil: perfilDesde(mascaraDe(cr).m, 0) }
const r = resumir(barrer(tabla, puntoCR, INICIO, INICIO + MES_MS - PASO, PASO))
const r1 = (x: number) => Math.round(x * 1000) / 10
const visto = { sol: r1(r.fraccionSol), tierra: r1(r.fraccionTierra), ambos: r1(r.fraccionAmbos) }
const esperado = { sol: 56.8, tierra: 19.9, ambos: 9.4 }
for (const k of ["sol", "tierra", "ambos"] as const) {
  if (Math.abs(visto[k] - esperado[k]) > 0.05) throw new Error(`No coincide con el SPEC E23: ${k} = ${visto[k]}, se esperaba ${esperado[k]}`)
}
const salidaISO = new Date(proximoCambio(tabla, puntoCR, INICIO, "sol", INICIO + 60 * 86_400_000).cambioMs!).toISOString()
if (!salidaISO.startsWith("2026-12-04T08:51")) throw new Error(`No coincide con el SPEC E23: el Sol sale ${salidaISO}`)

// --- 4. Efemérides y catálogo ---------------------------------------------------------------------------------
writeFileSync(join(SALIDA, "ephemeris.f32"), readFileSync(join(DATOS, "efemerides-luna.f32")))
writeFileSync(
  join(SALIDA, "ephemeris.json"),
  JSON.stringify(
    {
      inicioUTC: metaEfe.inicioUTC,
      finUTC: metaEfe.finUTC,
      pasoS: metaEfe.pasoS,
      filas: metaEfe.filas,
      provenance: {
        product: "NASA/JPL Horizons On-Line Ephemeris System, DE441 (J. D. Giorgini and the JPL Solar System Dynamics Group)",
        url: metaEfe.procedencia.api,
        retrievedUTC: metaEfe.procedencia.consultadoUTC,
        method: "Sub-solar and sub-Earth points in the Moon-fixed MOON_ME frame, light-time corrected, every 3 h.",
      },
    },
    null,
    1,
  ),
)
writeFileSync(
  join(SALIDA, "sites.json"),
  JSON.stringify(
    {
      generatedUTC: new Date().toISOString(),
      script: "apps/web/scripts/build-planner-data.ts",
      provenance: {
        sites: {
          product: "NASA GSFC PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021)",
          url: catalogo.procedencia.readme,
        },
        terrain: {
          product: "LRO LOLA LDEM_75S_240M_FLOAT (PDS Geosciences Node)",
          url: metaDem.procedencia.archivo,
        },
        horizons:
          "Detailed: 5 m LOLA terrain model (PGDA) out to 4 km, then the 240 m and 960 m LOLA grids out to 150 km. Approximate: 240 m grid only.",
      },
      radiusKm: 1737.4,
      plate: { file: "relief.webp", ...LAMINA },
      sites: sitios,
    },
    null,
    1,
  ),
)

// --- 5. Lámina de relieve -------------------------------------------------------------------------------------
// Sombreado de la rejilla de 240 m con tres luces fijas (no es la luz del Sol de ninguna fecha: es el relieve de
// fondo), en los tonos de la marca: de la tinta cálida al papel. Se escribe como PNG y `cwebp` lo pasa a WebP.
if (CON_RELIEVE) {
  const g = dem.cerca as { n: number; pasoM: number; x0M: number; y0M: number; alturas: Int16Array }
  const n = g.n
  const z = Float32Array.from(g.alturas)
  const luces = [
    { az: 315, alt: 38, w: 0.62 },
    { az: 250, alt: 45, w: 0.22 },
    { az: 20, alt: 50, w: 0.16 },
  ].map((l) => {
    const az = (l.az * Math.PI) / 180
    const alt = (l.alt * Math.PI) / 180
    return { x: Math.sin(az) * Math.cos(alt), y: Math.cos(az) * Math.cos(alt), z: Math.sin(alt), w: l.w }
  })
  const plano = luces.reduce((a, l) => a + l.w * l.z, 0)
  const EXAG = 1.6
  const hs = new Float32Array(n * n)
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const i = f * n + c
      const izq = z[f * n + Math.max(c - 1, 0)]
      const der = z[f * n + Math.min(c + 1, n - 1)]
      const arr = z[Math.max(f - 1, 0) * n + c]
      const aba = z[Math.min(f + 1, n - 1) * n + c]
      const dx = (der - izq) / ((Math.min(c + 1, n - 1) - Math.max(c - 1, 0)) * g.pasoM)
      // La fila 0 es el borde de arriba (+y): la derivada en y va con el signo cambiado.
      const dy = (arr - aba) / ((Math.min(f + 1, n - 1) - Math.max(f - 1, 0)) * g.pasoM)
      const nx = -dx * EXAG
      const ny = -dy * EXAG
      const largo = Math.sqrt(nx * nx + ny * ny + 1)
      let s = 0
      for (const l of luces) s += (l.w * (nx * l.x + ny * l.y + l.z)) / largo
      hs[i] = s
    }
  }
  const P = LAMINA.px
  const mPx = (LAMINA.sizeKm * 1000) / P
  const muestra = (a: Float32Array, x: number, y: number) => {
    const c = Math.min(Math.max((x - g.x0M) / g.pasoM, 0), n - 1.001)
    const f = Math.min(Math.max((g.y0M - y) / g.pasoM, 0), n - 1.001)
    const c0 = Math.floor(c)
    const f0 = Math.floor(f)
    const tc = c - c0
    const tf = f - f0
    const i = f0 * n + c0
    return (a[i] * (1 - tc) + a[i + 1] * tc) * (1 - tf) + (a[i + n] * (1 - tc) + a[i + n + 1] * tc) * tf
  }
  const sombra = new Float32Array(P * P)
  const altura = new Float32Array(P * P)
  let media = 0
  for (let j = 0; j < P; j++) {
    const y = LAMINA.yMaxKm * 1000 - (j + 0.5) * mPx
    for (let i = 0; i < P; i++) {
      const x = LAMINA.xMinKm * 1000 + (i + 0.5) * mPx
      sombra[j * P + i] = muestra(hs, x, y)
      const h = muestra(z, x, y)
      altura[j * P + i] = h
      media += h
    }
  }
  media /= P * P
  const OSCURO = [0x4b, 0x45, 0x3d]
  const CLARO = [0xfa, 0xf6, 0xee]
  // PNG RGB de 8 bits: un byte de filtro (0) por fila y los píxeles.
  const crudo = Buffer.alloc(P * (1 + P * 3))
  for (let j = 0; j < P; j++) {
    const base = j * (1 + P * 3)
    for (let i = 0; i < P; i++) {
      const d = sombra[j * P + i] - plano
      const v = Math.min(Math.max(0.8 + (d > 0 ? d * 0.45 : d * 1.3) + (altura[j * P + i] - media) / 90000, 0), 1)
      for (let k = 0; k < 3; k++) crudo[base + 1 + i * 3 + k] = Math.round(OSCURO[k] + (CLARO[k] - OSCURO[k]) * v)
    }
  }
  const crc = (() => {
    const t = new Uint32Array(256)
    for (let k = 0; k < 256; k++) {
      let c = k
      for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[k] = c >>> 0
    }
    return (b: Buffer) => {
      let c = 0xffffffff
      for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8)
      return (c ^ 0xffffffff) >>> 0
    }
  })()
  const trozo = (tipo: string, datos: Buffer) => {
    const cabeza = Buffer.alloc(4)
    cabeza.writeUInt32BE(datos.length)
    const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos])
    const pie = Buffer.alloc(4)
    pie.writeUInt32BE(crc(cuerpo))
    return Buffer.concat([cabeza, cuerpo, pie])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(P, 0)
  ihdr.writeUInt32BE(P, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(crudo, { level: 6 })), trozo("IEND", Buffer.alloc(0))])
  const rutaPng = join(tmp, "relief.png")
  writeFileSync(rutaPng, png)
  const cwebp = Bun.spawnSync(["cwebp", "-quiet", "-q", "80", "-m", "6", rutaPng, "-o", join(SALIDA, "relief.webp")])
  if (cwebp.exitCode !== 0) throw new Error(`cwebp falló (hace falta tenerlo instalado): ${cwebp.stderr.toString()}`)
  console.log(`relief.webp    ${P} x ${P} px, ${LAMINA.sizeKm} km de lado (${mPx.toFixed(0)} m por píxel), ${(readFileSync(join(SALIDA, "relief.webp")).length / 1e3).toFixed(0)} KB`)
}

rmSync(tmp, { recursive: true, force: true })

console.log(`ephemeris.f32  ${metaEfe.filas} filas, ${(readFileSync(join(SALIDA, "ephemeris.f32")).length / 1e3).toFixed(0)} KB`)
console.log(`sites.json     ${sitios.length} lugares (${sitios.filter((s) => s.horizon === "approximate").map((s) => s.id).join(", ")}: horizonte aproximado)`)
console.log(`horizons/      ${sitios.length} máscaras, ${(bytesMascaras / 1e6).toFixed(2)} MB`)
console.log(`SPEC E23       Connecting Ridge, 2026-12-01, suelo: Sol ${visto.sol} %, Tierra ${visto.tierra} %, ambos ${visto.ambos} %; el Sol sale ${salidaISO}`)
