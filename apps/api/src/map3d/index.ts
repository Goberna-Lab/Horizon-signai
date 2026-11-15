import { Hono } from "hono"
import { compress } from "hono/compress"
import { db, enMemoria, esFalloDeConexion } from "./db.js"

/**
 * Datos del mapa 3D de la Luna, servidos desde PostgreSQL (esquema en `db/`): `/api/map3d/...`.
 * Los activos binarios (relieve, albedo, efemérides, texturas) salen de `terrain.asset` byte a byte.
 */
const TTL = 5 * 60_000
const JSON_CACHE = "public, max-age=300"

type Fila = Record<string, unknown>
const SLUG = /^[a-z0-9][a-z0-9_-]{0,80}$/

class Peticion extends Error {
  constructor(message: string, public status: 400 | 404 = 400) {
    super(message)
  }
}

// ------------------------------------------------------------------ rango de efemérides y validación
async function rangoEfemerides(): Promise<{ desde: number; hasta: number }> {
  return enMemoria("rango", TTL, async () => {
    const [r] = await db()`select meta from ref.dataset where key = 'ephemeris_de441'`
    const m = (r?.meta ?? {}) as Fila
    const ini = Date.parse(String(m.start_utc ?? m.startUtc ?? ""))
    const paso = Number(m.step_s ?? m.stepS ?? 10800)
    const filas = Number(m.rows ?? 0)
    if (!Number.isFinite(ini) || !filas) return { desde: Date.UTC(2026, 0, 1), hasta: Date.UTC(2031, 0, 1) }
    return { desde: ini, hasta: ini + (filas - 1) * paso * 1000 }
  })
}

async function tiempo(valor: string | undefined, nombre: string): Promise<string> {
  if (!valor) throw new Peticion(`Falta ${nombre} (ISO 8601)`)
  const ms = Date.parse(valor)
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}/.test(valor)) throw new Peticion(`${nombre} no es una fecha ISO 8601`)
  const { desde, hasta } = await rangoEfemerides()
  if (ms < desde || ms > hasta)
    throw new Peticion(`${nombre} fuera de las efemérides (${new Date(desde).toISOString()} a ${new Date(hasta).toISOString()})`)
  return new Date(ms).toISOString()
}

function numero(valor: string | undefined, nombre: string, min = -Infinity, max = Infinity): number {
  const n = valor === undefined || valor.trim() === "" ? NaN : Number(valor)
  if (!Number.isFinite(n) || n < min || n > max) throw new Peticion(`${nombre} inválido`)
  return n
}

async function sitio(slug: string): Promise<void> {
  if (!SLUG.test(slug)) throw new Peticion("slug inválido")
  const [r] = await db()`select 1 as ok from moon.site where slug = ${slug}`
  if (!r) throw new Peticion("sitio no encontrado", 404)
}

// ------------------------------------------------------------------ activos en memoria
interface Activo {
  key: string
  format: string
  encoding: string | null
  sha256: string
  byteSize: number
  content: Buffer
}
const activos = new Map<string, Promise<Activo | null>>()
function activo(key: string): Promise<Activo | null> {
  let p = activos.get(key)
  if (!p) {
    p = (async () => {
      const [r] = await db()`
        select d.key, a.format, a.encoding, a.sha256, a.byte_size::int as "byteSize", a.content
        from terrain.asset a join ref.dataset d on d.id = a.dataset_id where d.key = ${key} limit 1`
      return (r as unknown as Activo) ?? null
    })()
    activos.set(key, p)
    p.then((v) => v ?? activos.delete(key), () => activos.delete(key))
  }
  return p
}
const MIME: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" }
const tipoMime = (f: string) => MIME[f.toLowerCase()] ?? "application/octet-stream"

// ------------------------------------------------------------------ consultas de metadatos
async function meta() {
  const s = db()
  const [datasets, assets, notas, cats, fuentes] = await Promise.all([
    s`select key, description, resolution_m::float8 as "resolutionM", srid, width, height, meta from ref.dataset order by id`,
    s`select d.key, a.format, a.encoding, a.sha256, a.byte_size::int as "byteSize" from terrain.asset a join ref.dataset d on d.id = a.dataset_id`,
    s`select key, body from ref.provenance_note order by key`,
    s`select code, label, label_singular as "labelSingular", sort_order as "sortOrder" from ref.site_category order by sort_order`,
    s`select key, citation, url from ref.data_source order by id`,
  ])
  const ds: Record<string, Fila> = {}
  for (const d of datasets) ds[d.key as string] = { ...d, meta: d.meta ?? {} }
  return {
    datasets: ds,
    assets: Object.fromEntries(
      assets.map((a) => [
        a.key,
        { key: a.key, format: a.format, encoding: a.encoding, sha256: a.sha256, byteSize: a.byteSize,
          url: `/api/map3d/assets/${a.key}?v=${String(a.sha256).slice(0, 12)}` },
      ]),
    ),
    provenance: Object.fromEntries(notas.map((n) => [n.key, n.body])),
    categories: cats,
    sources: Object.fromEntries(fuentes.map((f) => [f.key, { citation: f.citation, url: f.url }])),
  }
}

async function sitios() {
  const s = db()
  const [cats, rows] = await Promise.all([
    s`select code, label, label_singular as "labelSingular" from ref.site_category order by sort_order`,
    s`
      select s.slug, s.name, s.category_code as cat, ag.name as agency, ag.country_code as country, to_char(s.event_date, 'YYYY-MM-DD') as date,
             ST_Y(s.geom)::float8 as lat, s.lon_east::float8 as lon, s.region_name as region, ds.key as "sourceKey", ds.citation as source,
             s.description, s.is_approximate as approx, s.is_artemis_candidate as artemis,
             t.elevation_m::float8 as "elevation240", t.slope_deg::float8 as "slope240",
             coalesce((select json_agg(json_build_object('label', l.label, 'url', l.url) order by l.sort_order)
                       from moon.site_link l where l.site_id = s.id), '[]'::json) as links
      from moon.site s
      left join ref.agency ag on ag.id = s.agency_id
      left join ref.data_source ds on ds.id = s.source_id
      left join moon.site_terrain t on t.site_id = s.id and t.dataset_id = (select id from ref.dataset where key = 'pole_elevation_240')
      order by s.id`,
  ])
  return { categories: cats, sites: rows }
}

async function iau() {
  const rows = await db()`
    select name, ST_Y(geom)::float8 as lat, lon_east::float8 as lon, diameter_km::float8 as d, type_code as c, origin as o, id, approval_year as a
    from moon.iau_feature order by id`
  return rows.map((r) => [r.name, r.lat, r.lon, r.d, r.c, r.o, r.id, r.a])
}

async function horizontes() {
  const rows = await db()`select s.slug, h.elevation_deg from moon.horizon_profile h join moon.site s on s.id = h.site_id order by s.slug`
  return Object.fromEntries(rows.map((r) => [r.slug, (r.elevation_deg as number[]).map((v) => Math.round(v * 100) / 100)]))
}

// ------------------------------------------------------------------ router
const json = (c: { header: (k: string, v: string) => void; json: (v: any) => Response }, v: unknown) => {
  c.header("Cache-Control", JSON_CACHE)
  return c.json(v)
}

export const map3d = new Hono()
  .onError((e, c) => {
    if (e instanceof Peticion) return c.json({ error: e.message }, e.status)
    if (esFalloDeConexion(e)) return c.json({ error: "Base de datos del mapa 3D no disponible" }, 503)
    console.error("map3d:", e)
    return c.json({ error: "Error interno" }, 500)
  })
  .use("*", async (c, next) => {
    if (!process.env.DATABASE_URL) return c.json({ error: "Base de datos del mapa 3D no configurada" }, 503)
    await next()
  })
  .use("*", async (c, next) => {
    if (c.req.path.includes("/assets/")) return next() // ya vienen comprimidos (zlib, webp, jpg)
    return compress()(c, next)
  })
  .get("/meta", async (c) => json(c, await enMemoria("meta", TTL, meta)))
  .get("/sites", async (c) => json(c, await enMemoria("sites", TTL, sitios)))
  .get("/iau", async (c) => json(c, await enMemoria("iau", TTL, iau)))
  .get("/horizons", async (c) => json(c, await enMemoria("horizons", TTL, horizontes)))
  .get("/assets/:key", async (c) => {
    const key = c.req.param("key")
    if (!SLUG.test(key)) throw new Peticion("clave inválida")
    const a = await activo(key)
    if (!a) throw new Peticion("activo no encontrado", 404)
    const etag = `"${a.sha256}"`
    const v = c.req.query("v")
    const inmutable = !!v && v.length >= 8 && a.sha256.startsWith(v)
    const cabeceras = {
      ETag: etag,
      "Cache-Control": inmutable ? "public, max-age=31536000, immutable" : "no-cache",
      "Content-Type": tipoMime(a.format),
    }
    const inm = c.req.header("If-None-Match")
    if (inm && inm.split(",").some((x) => x.trim().replace(/^W\//, "") === etag)) return new Response(null, { status: 304, headers: cabeceras })
    return new Response(new Uint8Array(a.content), { headers: { ...cabeceras, "Content-Length": String(a.content.length) } })
  })
  .get("/sites/:slug/sun", async (c) => {
    const slug = c.req.param("slug")
    const t = await tiempo(c.req.query("t"), "t")
    await sitio(slug)
    const [r] = await db()`select azimuth_deg::float8 as "azimuthDeg", elevation_deg::float8 as "elevationDeg", above_horizon as "aboveHorizon" from moon.sun_at(${slug}, ${t}::timestamptz)`
    return json(c, { site: slug, t, ...r })
  })
  .get("/sites/:slug/earth", async (c) => {
    const slug = c.req.param("slug")
    const t = await tiempo(c.req.query("t"), "t")
    await sitio(slug)
    const [r] = await db()`select azimuth_deg::float8 as "azimuthDeg", elevation_deg::float8 as "elevationDeg", above_horizon as "aboveHorizon" from moon.earth_at(${slug}, ${t}::timestamptz)`
    return json(c, { site: slug, t, ...r })
  })
  .get("/point", async (c) => {
    const lat = numero(c.req.query("lat"), "lat", -90, 90)
    const lon = ((numero(c.req.query("lon"), "lon") % 360) + 360) % 360
    const [r] = await db()`select terrain.elevation_at(${lat}::float8, ${lon}::float8)::float8 as "elevationM"`
    return json(c, { lat, lon, elevationM: r?.elevationM ?? null })
  })
  .get("/sites/:slug/illumination", async (c) => {
    const slug = c.req.param("slug")
    const desde = await tiempo(c.req.query("from"), "from")
    const hasta = await tiempo(c.req.query("to"), "to")
    if (Date.parse(hasta) <= Date.parse(desde)) throw new Peticion("to debe ser posterior a from")
    if (Date.parse(hasta) - Date.parse(desde) > 400 * 86_400_000) throw new Peticion("el intervalo máximo es de 400 días")
    await sitio(slug)
    const s = db()
    const [serie, [resumen]] = await Promise.all([
      s`select i.t, i.sun_az::float8 as "sunAz", i.sun_el::float8 as "sunEl", i.sun_lit as "sunLit",
               i.earth_az::float8 as "earthAz", i.earth_el::float8 as "earthEl", i.earth_visible as "earthVisible"
        from moon.site_illumination i join moon.site st on st.id = i.site_id
        where st.slug = ${slug} and i.t >= ${desde}::timestamptz and i.t <= ${hasta}::timestamptz
          and extract(minute from i.t) = 0 and extract(second from i.t) = 0
        order by i.t`,
      s`with x as (
          select i.t, i.sun_lit, i.earth_visible,
                 row_number() over (order by i.t) - row_number() over (partition by i.sun_lit order by i.t) as g
          from moon.site_illumination i join moon.site st on st.id = i.site_id
          where st.slug = ${slug} and i.t >= ${desde}::timestamptz and i.t <= ${hasta}::timestamptz),
        paso as (select coalesce(extract(epoch from (max(t) - min(t))) / nullif(count(*) - 1, 0) / 3600, 1) as h from x),
        oscuro as (select count(*) as n from x where not sun_lit group by g order by n desc limit 1)
        select count(*)::int as samples,
               round(100.0 * count(*) filter (where sun_lit) / nullif(count(*), 0), 2)::float8 as "sunLitPercent",
               round(100.0 * count(*) filter (where earth_visible) / nullif(count(*), 0), 2)::float8 as "earthVisiblePercent",
               round(coalesce((select n from oscuro), 0) * (select h from paso), 2)::float8 as "longestDarkHours"
        from x`,
    ])
    return json(c, { site: slug, from: desde, to: hasta, summary: resumen, hourly: serie })
  })
