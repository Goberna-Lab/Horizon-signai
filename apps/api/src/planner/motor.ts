import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { db, enMemoria } from "../map3d/db.js"

/**
 * El motor del planificador en el servidor: el mismo `prototipos/lunar-map/engine.js` que corre en el navegador (una
 * sola copia del cálculo), con los datos leídos de la base en lugar de los archivos del planificador:
 * - efemérides: `eph.sample` (JPL Horizons DE441, los mismos float32 que `data/efemerides-luna.js`);
 * - zonas y horizontes: `moon.candidate_zone` + `moon.horizon_envelope` (cargados desde `data/zonas.js`).
 * Así cualquiera puede recalcular por la API lo que muestra el planificador y obtener las mismas cifras.
 */
const ENGINE_PATH = fileURLToPath(new URL("../../../../prototipos/lunar-map/engine.js", import.meta.url))

// El motor es JavaScript de navegador sin tipos (cuelga de window.Lunar.Engine).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Motor = { E: any; sha256: string }
let motor: Motor | null = null

export function cargarMotor(): Motor {
  if (motor) return motor
  const src = readFileSync(ENGINE_PATH, "utf8")
  const ctx: Record<string, unknown> = { atob: (s: string) => Buffer.from(s, "base64").toString("binary") }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(src, ctx, { filename: "engine.js" })
  const E = (ctx.Lunar as { Engine: unknown }).Engine
  /* el sha256 se toma con saltos de línea LF: igual en Windows (CRLF) que en el servidor */
  motor = { E, sha256: createHash("sha256").update(src.replace(/\r\n/g, "\n")).digest("hex") }
  return motor
}

export type Zona = {
  id: string
  code: string
  nombre: string
  lat: number
  lon: number
  paso: number
  v: number[][]
  aproximado: boolean
  sitio: string | null
  mazarico: { sol: number; tierra: number } | null
  alturaM: number | null
}
export type Tabla = { inicioMs: number; finMs: number; pasoMs: number; filas: number; datos: Float32Array }
export type Datos = { tabla: Tabla; zonas: Record<string, Zona> }

/** Tabla de efemérides (8 float32 por fila: Sol x, y, z, km; Tierra x, y, z, km) y zonas, desde la base. */
async function leerDatos(): Promise<Datos> {
  const sql = db()
  const [serie] = await sql`
    select s.id, s.step_s, s.start_utc, s.row_count
    from eph.series s join ref.data_source d on d.id = s.source_id
    where s.frame = 'MOON_ME' and d.key = 'jpl_horizons_de441'
    order by s.id desc limit 1`
  if (!serie) throw new Error("no ephemeris series in eph.series")
  const n = Number(serie.row_count)
  const filas = await sql`select body_id, x, y, z, dist_km from eph.sample where series_id = ${serie.id} order by body_id, t`
  if (filas.length !== 2 * n) throw new Error(`eph.sample has ${filas.length} rows, expected ${2 * n}`)
  const datos = new Float32Array(n * 8)
  filas.forEach((r, k) => {
    const sol = Number(r.body_id) === 1, i = sol ? k : k - n, o = i * 8 + (sol ? 0 : 4)
    datos[o] = Number(r.x); datos[o + 1] = Number(r.y); datos[o + 2] = Number(r.z); datos[o + 3] = Number(r.dist_km)
  })
  const pasoMs = Number(serie.step_s) * 1000, inicioMs = new Date(serie.start_utc as string).getTime()
  const tabla: Tabla = { inicioMs, finMs: inicioMs + (n - 1) * pasoMs, pasoMs, filas: n, datos }

  const zs = await sql`
    select c.id, c.code, c.slug, c.name, ST_Y(c.geom) as lat, c.lon_east as lon, c.horizon_quality, c.ground_height_m,
           s.slug as site_slug, ir.sun_pct, ir.earth_pct
    from moon.candidate_zone c
    left join moon.site s on s.id = c.site_id
    left join ref.illumination_reference ir on ir.zone_id = c.id
    order by c.sort_order`
  const env = await sql`select zone_id, az_index, az_step_deg, hull_m from moon.horizon_envelope order by zone_id, az_index`
  const porZona = new Map<number, { paso: number; v: number[][] }>()
  for (const e of env) {
    const z = porZona.get(Number(e.zone_id)) ?? { paso: Number(e.az_step_deg), v: [] }
    z.v[Number(e.az_index)] = (e.hull_m as (number | string)[]).map(Number)
    porZona.set(Number(e.zone_id), z)
  }
  const zonas: Record<string, Zona> = {}
  for (const z of zs) {
    const h = porZona.get(Number(z.id))
    if (!h) continue
    zonas[String(z.code)] = {
      id: String(z.slug), code: String(z.code), nombre: String(z.name), lat: Number(z.lat), lon: Number(z.lon),
      paso: h.paso, v: h.v, aproximado: z.horizon_quality === "approximate",
      sitio: z.site_slug == null ? null : String(z.site_slug),
      mazarico: z.sun_pct == null ? null : { sol: Math.round(Number(z.sun_pct)), tierra: Math.round(Number(z.earth_pct)) },
      alturaM: z.ground_height_m == null ? null : Math.round(Number(z.ground_height_m)),
    }
  }
  return { tabla, zonas }
}

/** Una hora en memoria: los datos solo cambian con un despliegue que recarga la base. */
export const datos = () => enMemoria("planner-datos", 60 * 60_000, leerDatos)

/**
 * Los datos del planificador web, leídos de la base, con la misma forma que sus archivos `data/efemerides-luna.js` y
 * `data/zonas.js` (LunarData.efemerides y LunarData.zonas): JSON comprimido una vez, con su ETag.
 */
export type Paquete = { gz: Buffer; etag: string; bytes: number }
async function armarPaquete(): Promise<Paquete> {
  const { tabla, zonas } = await datos()
  const iso = (ms: number) => new Date(ms).toISOString()
  const efemerides = {
    meta: {
      inicioUTC: iso(tabla.inicioMs), finUTC: iso(tabla.finMs), pasoS: tabla.pasoMs / 1000, filas: tabla.filas,
      columnas: ["solX", "solY", "solZ", "solKm", "tierraX", "tierraY", "tierraZ", "tierraKm"],
    },
    b64: Buffer.from(tabla.datos.buffer, tabla.datos.byteOffset, tabla.datos.byteLength).toString("base64"),
  }
  const zs: Record<string, unknown> = {}
  for (const [code, z] of Object.entries(zonas)) {
    zs[code] = {
      id: z.id, nombre: z.nombre, lat: z.lat, lon: z.lon, mazarico: z.mazarico, paso: z.paso, v: z.v, sitio: z.sitio,
      ...(z.aproximado ? { alturaM: z.alturaM, aproximado: true } : {}),
    }
  }
  const json = JSON.stringify({ source: "database", efemerides, zonas: zs })
  const etag = `"${createHash("sha256").update(json).digest("hex").slice(0, 20)}"`
  return { gz: gzipSync(json, { level: 9 }), etag, bytes: Buffer.byteLength(json) }
}
export const paquete = () => enMemoria("planner-paquete", 60 * 60_000, armarPaquete)
