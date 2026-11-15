/**
 * Genera los datos de la landing a partir de `luna-recursos/` (datos de la NASA ya procesados + motor validado).
 *
 *   bun apps/web/scripts/build-landing-data.ts
 *
 * Salida, en `apps/web/src/features/landing/flight/data/`:
 *   - terrain.z.bin  Relieve del polo sur (LOLA LDEM_75S_240M) remuestreado a 1025 x 1025 nodos, Int16 (m),
 *                    con predicción 2D y gzip. La landing lo descomprime en el navegador.
 *   - plate.json     Procedencia, efemérides (JPL Horizons DE441), sitios del catálogo y las cifras que muestra
 *                    la landing. Todas las cifras salen del motor original (`luna-recursos/calculos/motor`),
 *                    sin modificar: aquí solo se copia a una carpeta temporal para que sus `import` resuelvan.
 *
 * `luna-recursos/` no entra en la imagen de Docker, por eso el resultado se guarda en el repo.
 * Script escrito con asistencia de IA (Claude Code).
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../../..")
const LUNA = join(RAIZ, "luna-recursos")
const SALIDA = resolve(AQUI, "../src/features/landing/flight/data")

// --- 1. Motor original en su estructura original (src/engine, src/data) -------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "horizon-landing-"))
mkdirSync(join(tmp, "src"), { recursive: true })
cpSync(join(LUNA, "calculos/motor"), join(tmp, "src/engine"), { recursive: true })
symlinkSync(join(LUNA, "datos"), join(tmp, "src/data"))
process.env.LUNA_SITIO = "connecting-ridge"
const ENG = join(tmp, "src/engine")
const DATOS = join(LUNA, "datos")
const { crearTablaLuna, prepararSitio, elevacionesEn } = await import(join(ENG, "efemeridesLuna.ts"))
const { barrer, resumir, margenSol, margenTierra, porMeses, proximoCambio, ventanas } = await import(join(ENG, "planificador.ts"))
const { mascaraDeArchivo, perfilDesde, horizonteEn } = await import(join(ENG, "mascara.ts"))
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

// --- 2. Relieve: 1626 nodos de 240 m -> 1025 nodos (380,9 m), filtro triangular separable ---------------------
const N = 1025
const EXT_KM = 195
const src = dem.cerca
const escala = (src.n - 1) / (N - 1)
function remuestrear(entrada: Float32Array, n: number, salidaN: number, porFilas: boolean, otro: number): Float32Array {
  // Reduce una dimensión de n a salidaN con filtro triangular de radio `escala`.
  const out = new Float32Array(porFilas ? otro * salidaN : salidaN * otro)
  for (let i = 0; i < salidaN; i++) {
    const centro = i * escala
    const a = Math.max(0, Math.ceil(centro - escala))
    const b = Math.min(n - 1, Math.floor(centro + escala))
    const pesos: number[] = []
    let suma = 0
    for (let k = a; k <= b; k++) {
      const w = Math.max(0, 1 - Math.abs(k - centro) / escala)
      pesos.push(w)
      suma += w
    }
    for (let j = 0; j < otro; j++) {
      let v = 0
      for (let k = a; k <= b; k++) v += pesos[k - a] * (porFilas ? entrada[j * n + k] : entrada[k * otro + j])
      if (porFilas) out[j * salidaN + i] = v / suma
      else out[i * otro + j] = v / suma
    }
  }
  return out
}
const horizontal = remuestrear(Float32Array.from(src.alturas), src.n, N, true, src.n) // src.n filas x N columnas
const reducido = remuestrear(horizontal, src.n, N, false, N) // N filas x N columnas
const alturas = new Int16Array(N * N)
let hMin = Infinity
let hMax = -Infinity
for (let i = 0; i < alturas.length; i++) {
  const h = Math.round(reducido[i])
  alturas[i] = h
  if (h < hMin) hMin = h
  if (h > hMax) hMax = h
}
// Predicción 2D (izquierda + arriba - diagonal) y zigzag: el residuo comprime mucho mejor que el dato crudo.
const residuo = new Uint16Array(N * N)
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const i = r * N + c
    const izq = c > 0 ? alturas[i - 1] : 0
    const arr = r > 0 ? alturas[i - N] : 0
    const diag = r > 0 && c > 0 ? alturas[i - N - 1] : 0
    const d = alturas[i] - (izq + arr - diag)
    residuo[i] = ((d << 1) ^ (d >> 15)) & 0xffff
  }
}
// Bytes bajos y altos separados (los altos son casi todos 0).
const planos = new Uint8Array(N * N * 2)
for (let i = 0; i < N * N; i++) {
  planos[i] = residuo[i] & 0xff
  planos[N * N + i] = residuo[i] >> 8
}
const comprimido = gzipSync(planos, { level: 9 })
mkdirSync(SALIDA, { recursive: true })
writeFileSync(join(SALIDA, "terrain.z.bin"), comprimido)

// --- 3. Efemérides del relato: un día lunar desde el 2026-12-01 (el ejemplo del SPEC E23) ---------------------
const MES_MS = 29.530589 * 86_400_000
const INICIO = Date.parse("2026-12-01T00:00:00Z")
const PASO_EFE = tabla.pasoMs // 3 h, el paso de la tabla original
const filasEfe = Math.ceil((MES_MS * 2.1) / PASO_EFE) + 1 // dos meses: la cuenta regresiva mira hacia adelante
const efe: number[] = []
const i0 = Math.round((INICIO - tabla.inicioMs) / tabla.pasoMs)
for (let k = 0; k < filasEfe; k++) {
  const a = (i0 + k) * 8
  // MOON_ME (x: hacia la Tierra media, z: norte) -> marco de la lámina (X: 90° E, Y: 0° E, Z: sur, hacia afuera).
  const sol = [tabla.datos[a + 1], tabla.datos[a], -tabla.datos[a + 2]]
  const tierra = [tabla.datos[a + 5], tabla.datos[a + 4], -tabla.datos[a + 6]]
  for (const v of [...sol, ...tierra]) efe.push(Number(v.toFixed(6)))
}

// --- 4. Sitios y cifras con el motor ----------------------------------------------------------------------
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
const sitiosCat: Sitio[] = catalogo.sitios
const nombreEn = (s: Sitio) => {
  if (NOMBRES[s.id]) return NOMBRES[s.id]
  const m = s.id.match(/^(.*)-roi-(\d+)$/)
  return m ? `${NOMBRES[m[1]]} RoI ${m[2]}` : s.id
}
function mascaraDe(s: Sitio) {
  if (s.id === "connecting-ridge") return { m: mascaraDeArchivo(json("horizonte-connecting-ridge.json"), "detallado"), detalle: "detailed" }
  try {
    return { m: mascaraDeArchivo(json(`horizonte-catalogo-${s.id}.json`), "catalogo"), detalle: "detailed" }
  } catch {
    return { m: mascaraPolar(dem, s.latitudGrados, s.longitudEsteGrados), detalle: "approximate" }
  }
}
const PASO_BARRIDO = 600_000 // 10 min, el del planificador
const r1 = (x: number) => Math.round(x * 10) / 10
function cifras(s: Sitio, alturaM: number, desde = INICIO) {
  const { m } = mascaraDe(s)
  const punto = { sitio: prepararSitio(s.latitudGrados, s.longitudEsteGrados), perfil: perfilDesde(m, alturaM) }
  const r = resumir(barrer(tabla, punto, desde, desde + MES_MS - PASO_BARRIDO, PASO_BARRIDO))
  return {
    sunPct: r1(r.fraccionSol * 100),
    earthPct: r1(r.fraccionTierra * 100),
    bothPct: r1(r.fraccionAmbos * 100),
    longestNightH: r1(r.nocheMasLargaH),
    longestSilenceH: r1(r.silencioMasLargoH),
    meanPanelWm2: Math.round(r.panelMedioWm2),
  }
}
const sitios = sitiosCat.map((s) => {
  const [x, y] = estereoSur(s.latitudGrados, s.longitudEsteGrados)
  const { detalle } = mascaraDe(s)
  return {
    id: s.id,
    name: nombreEn(s),
    kind: s.tipo === "roi" ? "roi" : s.tipo === "mision" ? "mission" : "site",
    lat: s.latitudGrados,
    lon: s.longitudEsteGrados,
    xKm: Number((x / 1000).toFixed(3)),
    yKm: Number((y / 1000).toFixed(3)),
    heightM: Math.round(alturaPolar(dem, x, y)),
    horizon: detalle,
    ground: cifras(s, 0),
    mast10m: cifras(s, 10),
  }
})

// Serie del sitio destacado (Connecting Ridge, centro del mosaico), cada 30 min durante dos meses.
const destacado = sitiosCat.find((s) => s.id === "connecting-ridge")!
const PASO_SERIE = 1_800_000
const nSerie = Math.ceil((MES_MS * 2.05) / PASO_SERIE)
function serie(alturaM: number) {
  const { m } = mascaraDe(destacado)
  const punto = { sitio: prepararSitio(destacado.latitudGrados, destacado.longitudEsteGrados), perfil: perfilDesde(m, alturaM) }
  const b = barrer(tabla, punto, INICIO, INICIO + (nSerie - 1) * PASO_SERIE, PASO_SERIE)
  const c = (x: number) => Math.round(x * 1000) // milésimas de grado: el Sol cruza el horizonte muy despacio
  return {
    heightM: alturaM,
    // Margen de visibilidad en milésimas de grado: > 0 visible (Sol: borde superior del disco; Tierra: centro).
    sunMargin: Array.from(b.solSobreHorizonte, (x: number) => c(margenSol(x))),
    earthMargin: Array.from(b.tierraSobreHorizonte, (x: number) => c(margenTierra(x))),
    panelWm2: Array.from(b.panelWm2, (x: number) => Math.round(x)),
  }
}
const series = [serie(0), serie(10)]

// Comprobación contra el ejemplo del SPEC E23: Sol 56,8 %, Tierra 19,9 %, ambos 9,4 %; el Sol sale el 2026-12-04 08:51 UTC.
const cr = sitios.find((s) => s.id === "connecting-ridge")!
const puntoCR = { sitio: prepararSitio(destacado.latitudGrados, destacado.longitudEsteGrados), perfil: perfilDesde(mascaraDe(destacado).m, 0) }
const salida = proximoCambio(tabla, puntoCR, INICIO, "sol", INICIO + 60 * 86_400_000)
const esperado = { sunPct: 56.8, earthPct: 19.9, bothPct: 9.4 }
for (const [k, v] of Object.entries(esperado)) {
  if (Math.abs((cr.ground as Record<string, number>)[k] - v) > 0.05) throw new Error(`No coincide con el SPEC E23: ${k} = ${(cr.ground as Record<string, number>)[k]}, se esperaba ${v}`)
}
const salidaISO = new Date(salida.cambioMs!).toISOString()
if (!salidaISO.startsWith("2026-12-04T08:51")) throw new Error(`No coincide con el SPEC E23: el Sol sale ${salidaISO}`)

// Mes a mes, 2026-2030 (61 meses sinódicos), a ras del suelo.
const meses = porMeses(tabla, puntoCR, Date.parse("2026-01-01T00:00:00Z"), Date.parse("2031-01-01T00:00:00Z")).map((m: any) => ({
  startMs: m.inicioMs,
  sunPct: r1(m.resumen.fraccionSol * 100),
  earthPct: r1(m.resumen.fraccionTierra * 100),
}))

// Elevación máxima del Sol en el polo en 2026-2030 (inclinación del eje: FA p. 412 da 1,5424°).
const polo = prepararSitio(-90, 0)
const s4 = new Float64Array(4)
let solMaxPolo = -9
let tierraMinPolo = 9
let tierraMaxPolo = -9
for (let t = tabla.inicioMs; t <= tabla.finMs; t += tabla.pasoMs) {
  elevacionesEn(tabla, polo, t, s4)
  solMaxPolo = Math.max(solMaxPolo, s4[1])
  tierraMinPolo = Math.min(tierraMinPolo, s4[3])
  tierraMaxPolo = Math.max(tierraMaxPolo, s4[3])
}

const plate = {
  provenance: {
    generatedUTC: new Date().toISOString(),
    script: "apps/web/scripts/build-landing-data.ts",
    engine: "luna-recursos/calculos/motor (prototype 'luna', commit 72f890f), unmodified",
    terrain: {
      product: "LRO LOLA LDEM_75S_240M_FLOAT (PDS Geosciences Node)",
      url: metaDem.procedencia.archivo,
      method: `South polar stereographic, 240 m grid resampled to ${N} x ${N} nodes (${((2 * EXT_KM * 1000) / (N - 1)).toFixed(1)} m) with a triangular filter. Heights in metres above the 1737.4 km sphere.`,
    },
    ephemeris: {
      product: "NASA/JPL Horizons On-Line Ephemeris System, DE441 (J. D. Giorgini and the JPL Solar System Dynamics Group)",
      url: metaEfe.procedencia.api,
      retrievedUTC: metaEfe.procedencia.consultadoUTC,
      method: "Sub-solar and sub-Earth points in the Moon-fixed MOON_ME frame, light-time corrected, every 3 h.",
    },
    sites: {
      product: "NASA GSFC PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021)",
      url: catalogo.procedencia.readme,
    },
  },
  radiusKm: 1737.4,
  terrain: { file: "terrain.z.bin", n: N, extentKm: EXT_KM, minM: hMin, maxM: hMax },
  ephemeris: { startMs: INICIO, stepMs: PASO_EFE, rows: filasEfe, columns: ["sunX", "sunY", "sunZ", "earthX", "earthY", "earthZ"], data: efe },
  lunarDay: { startMs: INICIO, lengthMs: MES_MS },
  pole: { sunMaxElevationDeg: Number(solMaxPolo.toFixed(2)), earthMinElevationDeg: Number(tierraMinPolo.toFixed(2)), earthMaxElevationDeg: Number(tierraMaxPolo.toFixed(2)) },
  featured: { id: "connecting-ridge", stepMs: PASO_SERIE, startMs: INICIO, sunriseUTC: salidaISO, series },
  months: meses,
  sites: sitios,
}
writeFileSync(join(SALIDA, "plate.json"), JSON.stringify(plate))

// Cifras que cita el texto de la landing. Van aparte porque se cargan con la página, antes que la escena.
const COMPARADOS = ["connecting-ridge", "connecting-ridge-roi-6", "de-gerlache-rim", "shackleton-rim", "im-2"]
const roi6 = sitiosCat.find((s) => s.id === "connecting-ridge-roi-6")!
const [ax, ay] = estereoSur(destacado.latitudGrados, destacado.longitudEsteGrados)
const [bx, by] = estereoSur(roi6.latitudGrados, roi6.longitudEsteGrados)
// Descenso nominal del motor frente al plan de misión del Apollo 11 (NASA TN D-6846): lo que cita la sección de
// validación. Sale del motor, no de la documentación.
const { descensoNominal } = await import(join(ENG, "simulacion.ts"))
const { PERFIL_APOLLO11 } = await import(join(ENG, "descenso.ts"))
const descenso = descensoNominal()
const facts = {
  generatedUTC: plate.provenance.generatedUTC,
  source: "Computed by apps/web/scripts/build-landing-data.ts with the project's engine (luna-recursos/calculos/motor), JPL Horizons DE441 and LOLA terrain.",
  lunarDayStartUTC: new Date(INICIO).toISOString(),
  lunarDayDays: Number((MES_MS / 86_400_000).toFixed(2)),
  pole: plate.pole,
  featured: { id: cr.id, name: cr.name, lat: cr.lat, lon: cr.lon, sunriseUTC: salidaISO, ground: cr.ground, mast10m: cr.mast10m },
  /** Distancia en la proyección entre el centro de Connecting Ridge y su RoI 6 (m); la escala allí es 1,0000. */
  pairDistanceM: Math.round(Math.hypot(ax - bx, ay - by)),
  compare: COMPARADOS.map((id) => {
    const s = sitios.find((x) => x.id === id)!
    return { id: s.id, name: s.name, horizon: s.horizon, lat: s.lat, lon: s.lon, ground: s.ground }
  }),
  months: meses.map((m: { startMs: number; sunPct: number; earthPct: number }) => [m.startMs, m.sunPct, m.earthPct]),
  descent: {
    /** Contacto del descenso simulado y del plan de misión (s desde el encendido). */
    contactS: Math.round(descenso.eventos.contacto),
    planContactS: PERFIL_APOLLO11.contacto.tS,
    /** Diferencia del cambio de velocidad y del combustible respecto del plan (%). */
    deltaVPct: r1((descenso.deltaVMs / PERFIL_APOLLO11.deltaVMs - 1) * 100),
    fuelPct: r1((descenso.combustibleUsadoKg / PERFIL_APOLLO11.combustibleNominalKg - 1) * 100),
  },
}
writeFileSync(join(SALIDA, "facts.json"), JSON.stringify(facts))

// --- 5. Figuras de la página: el cielo del sitio destacado y el catálogo -------------------------------------
// Van en `sections/data/`: se cargan con la página, no con el vuelo.
const FIGURAS = resolve(AQUI, "../src/features/landing/sections/data")
mkdirSync(FIGURAS, { recursive: true })
const HORA = 3_600_000
const horas = Math.ceil(MES_MS / HORA) // 709: el día lunar, hora a hora
const r2 = (x: number) => Math.round(x * 100) / 100
/** Ventanas visibles (en horas desde el inicio), con los bordes al segundo, hasta 65 días para la cuenta regresiva. */
function ventanasDe(alturaM: number) {
  const { m } = mascaraDe(destacado)
  const perfil = perfilDesde(m, alturaM)
  const punto = { sitio: prepararSitio(destacado.latitudGrados, destacado.longitudEsteGrados), perfil }
  const largo = barrer(tabla, punto, INICIO, INICIO + 65 * 86_400_000, PASO_BARRIDO)
  const aHoras = (v: Array<{ inicioMs: number; finMs: number }>) => v.map((w) => [r2((w.inicioMs - INICIO) / HORA), r2((w.finMs - INICIO) / HORA)])
  const sol = aHoras(ventanas(largo, "sol"))
  const tierra = aHoras(ventanas(largo, "tierra"))
  const ambos: number[][] = []
  for (const a of sol) for (const b of tierra) if (Math.min(a[1], b[1]) > Math.max(a[0], b[0])) ambos.push([Math.max(a[0], b[0]), Math.min(a[1], b[1])])
  const dia = barrer(tabla, punto, INICIO, INICIO + (horas - 1) * HORA, HORA)
  return {
    heightM: alturaM,
    // Horizonte real por azimut, cada grado, visto desde esta altura (grados).
    horizon: Array.from({ length: 360 }, (_, az) => r2(horizonteEn(perfil, az))),
    windows: { sun: sol, earth: tierra, both: ambos },
    panelWm2: Array.from(dia.panelWm2, (x: number) => Math.round(x)),
    sky: dia,
  }
}
const suelo = ventanasDe(0)
const mastil = ventanasDe(10)
const figura = {
  source: facts.source,
  site: { id: cr.id, name: cr.name, lat: cr.lat, lon: cr.lon },
  startMs: INICIO,
  hours: horas,
  // Dirección del Sol y de la Tierra desde el sitio, hora a hora: azimut desde el norte hacia el este y elevación (grados).
  sun: { az: Array.from(suelo.sky.solAzimut, (x: number) => Math.round(x * 10) / 10), el: Array.from(suelo.sky.solElevacion, r2) },
  earth: { az: Array.from(suelo.sky.tierraAzimut, (x: number) => Math.round(x * 10) / 10), el: Array.from(suelo.sky.tierraElevacion, r2) },
  ground: { heightM: 0, horizon: suelo.horizon, windows: suelo.windows, panelWm2: suelo.panelWm2, summary: cr.ground },
  mast: { heightM: 10, horizon: mastil.horizon, windows: mastil.windows, panelWm2: mastil.panelWm2, summary: cr.mast10m },
}
writeFileSync(join(FIGURAS, "sky.json"), JSON.stringify(figura))

// Catálogo: cada sitio con sus cifras y, si las tiene, sus zonas candidatas (RoI).
const padre = (id: string) => id.replace(/-roi-\d+$/, "")
const catalogoFigura = {
  source: facts.source,
  lunarDayStartUTC: facts.lunarDayStartUTC,
  sites: sitios
    .filter((s) => s.kind !== "roi")
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      lat: s.lat,
      lon: s.lon,
      heightM: s.heightM,
      horizon: s.horizon,
      ground: s.ground,
      mast10m: s.mast10m,
      regions: sitios
        .filter((x) => x.kind === "roi" && padre(x.id) === s.id)
        .map((x) => ({ id: x.id, name: x.name.replace(`${s.name} `, ""), sunPct: x.ground.sunPct, earthPct: x.ground.earthPct, longestNightH: x.ground.longestNightH })),
    })),
}
writeFileSync(join(FIGURAS, "catalog.json"), JSON.stringify(catalogoFigura))
console.log(`sky.json       ${(JSON.stringify(figura).length / 1e3).toFixed(1)} KB   catalog.json ${(JSON.stringify(catalogoFigura).length / 1e3).toFixed(1)} KB`)
const rango = (v: number[]) => `${Math.min(...v).toFixed(1)} .. ${Math.max(...v).toFixed(1)}`
console.log(`cielo de ${cr.name}: Sol az ${rango(figura.sun.az)} el ${rango(figura.sun.el)} | Tierra az ${rango(figura.earth.az)} el ${rango(figura.earth.el)}`)
console.log(`horizonte suelo ${rango(suelo.horizon)}  mástil ${rango(mastil.horizon)}`)
console.log(`ventanas suelo: Sol ${JSON.stringify(suelo.windows.sun)} Tierra ${JSON.stringify(suelo.windows.earth)} ambos ${JSON.stringify(suelo.windows.both)}`)
console.log(`ventanas mástil: Sol ${JSON.stringify(mastil.windows.sun)} Tierra ${JSON.stringify(mastil.windows.earth)}`)
console.log(`facts.json     ${(JSON.stringify(facts).length / 1e3).toFixed(1)} KB   par a ${facts.pairDistanceM} m`)

console.log(`terrain.z.bin  ${N}x${N}  crudo ${(N * N * 2 / 1e6).toFixed(2)} MB -> ${(comprimido.length / 1e6).toFixed(2)} MB   (gzip directo: ${(gzipSync(Buffer.from(alturas.buffer), { level: 9 }).length / 1e6).toFixed(2)} MB)`)
console.log(`alturas ${hMin} .. ${hMax} m`)
console.log(`plate.json     ${(JSON.stringify(plate).length / 1e3).toFixed(0)} KB`)
console.log(`polo: Sol max ${solMaxPolo.toFixed(3)} deg; Tierra ${tierraMinPolo.toFixed(2)} .. ${tierraMaxPolo.toFixed(2)} deg`)
console.log(`Connecting Ridge: el Sol sale ${salidaISO}`)
console.log("id".padEnd(30), "h".padEnd(4), "sun%", "earth%", "both%", "night h", "silence h", "panel")
for (const s of sitios) {
  if (s.kind === "roi" && !/roi-6$|shackleton-rim-roi-2$/.test(s.id)) continue
  for (const [etq, c] of [["0", s.ground], ["10", s.mast10m]] as const)
    console.log(s.id.padEnd(30), etq.padEnd(4), String(c.sunPct).padStart(5), String(c.earthPct).padStart(6), String(c.bothPct).padStart(6), String(c.longestNightH).padStart(7), String(c.longestSilenceH).padStart(8), String(c.meanPanelWm2).padStart(6), s.horizon)
}

// --- 6. La ventana del producto: comparación de sitios y Plan B ----------------------------------------------
// Tres puntos a menos de 12 km entre sí, a ras del suelo, con su horizonte real y el cielo del día lunar.
const PASO_POLAR = 3 * HORA
const muestras = Math.ceil(MES_MS / PASO_POLAR)
const r1b = (x: number) => Math.round(x * 10) / 10
function polarDe(s: Sitio) {
  const { m } = mascaraDe(s)
  const perfil = perfilDesde(m, 0)
  const punto = { sitio: prepararSitio(s.latitudGrados, s.longitudEsteGrados), perfil }
  const b = barrer(tabla, punto, INICIO, INICIO + (muestras - 1) * PASO_POLAR, PASO_POLAR)
  const fino = barrer(tabla, punto, INICIO, INICIO + MES_MS - PASO_BARRIDO, PASO_BARRIDO)
  const aHoras = (v: Array<{ inicioMs: number; finMs: number }>) => v.map((w) => [r2((w.inicioMs - INICIO) / HORA), r2((w.finMs - INICIO) / HORA)])
  return {
    horizon: Array.from({ length: 360 }, (_, az) => r2(horizonteEn(perfil, az))),
    sun: { az: Array.from(b.solAzimut, r1b), el: Array.from(b.solElevacion, r2) },
    earth: { az: Array.from(b.tierraAzimut, r1b), el: Array.from(b.tierraElevacion, r2) },
    windows: { sun: aHoras(ventanas(fino, "sol")), earth: aHoras(ventanas(fino, "tierra")) },
  }
}
const COMPARAR = ["connecting-ridge-roi-6", "connecting-ridge", "shackleton-rim"]
const comparar = COMPARAR.map((id) => {
  const s = sitiosCat.find((x) => x.id === id)!
  const fila = sitios.find((x) => x.id === id)!
  return { id, name: fila.name, lat: fila.lat, lon: fila.lon, figures: fila.ground, ...polarDe(s) }
})
const kmEntre = (a: Sitio, b: Sitio) => {
  const [x1, y1] = estereoSur(a.latitudGrados, a.longitudEsteGrados)
  const [x2, y2] = estereoSur(b.latitudGrados, b.longitudEsteGrados)
  return Math.hypot(x1 - x2, y1 - y2) / 1000
}
const shackleton = sitiosCat.find((x) => x.id === "shackleton-rim")!
const producto = {
  source: facts.source,
  startMs: INICIO,
  hours: horas,
  stepH: 3,
  compare: {
    sites: comparar,
    /** Distancia entre el primer sitio y el último (km). */
    spanKm: Number(kmEntre(roi6, shackleton).toFixed(1)),
  },
  planB: {
    baseline: cr.ground,
    move: { to: sitios.find((x) => x.id === "connecting-ridge-roi-6")!.name, distanceM: facts.pairDistanceM, figures: sitios.find((x) => x.id === "connecting-ridge-roi-6")!.ground },
    wait: { startUTC: new Date(INICIO + MES_MS).toISOString(), figures: cifras(destacado, 0, INICIO + MES_MS) },
    mast: { heightM: 10, figures: cr.mast10m },
  },
}
writeFileSync(join(FIGURAS, "product.json"), JSON.stringify(producto))
console.log(`product.json   ${(JSON.stringify(producto).length / 1e3).toFixed(1)} KB   ${muestras} muestras por sitio`)
console.log(`comparar: ${comparar.map((c) => `${c.name} Sol ${c.figures.sunPct} Tierra ${c.figures.earthPct} noche ${c.figures.longestNightH}`).join(" | ")}  (${producto.compare.spanKm} km)`)
console.log(`plan B: base ${JSON.stringify(cr.ground)}`)
console.log(`        esperar un mes ${JSON.stringify(producto.planB.wait.figures)} desde ${producto.planB.wait.startUTC}`)

// La copia temporal del motor ya no hace falta.
rmSync(tmp, { recursive: true, force: true })
