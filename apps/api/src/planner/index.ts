import { Hono } from "hono"
import { compress } from "hono/compress"
import { db, enMemoria, esFalloDeConexion } from "../map3d/db.js"
import { cargarMotor, datos, paquete } from "./motor.js"

/**
 * El planificador por la API (`/api/planner/...`): las zonas candidatas con sus cifras 2026–2030 guardadas en la base
 * (`moon.zone_stats`) y la evaluación de un escenario con el mismo motor que el planificador web (`./motor.ts`).
 *
 * GET /zones?height=2            zonas, referencia de Mazarico y cifras 2026–2030 a esa altura (2, 5 o 10 m)
 * GET /power-systems             montajes de panel (módulo, NASA VSAT)
 * GET /data                      efemérides y zonas (con sus horizontes) para el planificador web, desde la base
 * GET /evaluate?zone=C&landing=2026-12-18T09:00Z&stay=3&panel=2&antenna=2&battery=24&earth=40&sun=1&el=1
 *                                veredicto, cifras de la estadía y comprobaciones (la regla del planificador)
 */
class Peticion extends Error {
  constructor(message: string, public status: 400 | 404 = 400) {
    super(message)
  }
}
const TTL = 5 * 60_000
const r1 = (x: number) => Math.round(x * 10) / 10
const r3 = (x: number) => Math.round(x * 1000) / 1000
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString())

function numero(v: string | undefined, nombre: string, min: number, max: number, def: number): number {
  if (v == null || v === "") return def
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new Peticion(`${nombre} must be a number from ${min} to ${max}`)
  return n
}
const bandera = (v: string | undefined, def: boolean) => (v == null || v === "" ? def : !["0", "false", "no"].includes(v.toLowerCase()))

async function zonas(altura: number) {
  const rows = await db()`
    select v.code, v.slug, v.name, v.kind, v.lat, v.lon, v.site_slug, v.horizon_quality, v.horizon_source,
           v.ground_height_m, v.mazarico_sun_pct, v.mazarico_earth_pct,
           s.panel_height_m, s.sun_pct, s.earth_pct, s.both_pct, s.longest_night_h, s.longest_silence_h, s.mean_panel_w_m2,
           s.period_start, s.period_end, s.engine_sha256
    from moon.v_candidate_zone v
    join moon.candidate_zone c on c.code = v.code
    left join moon.zone_stats s on s.zone_id = c.id and s.step_s = 10800 and s.panel_height_m = ${altura} and s.antenna_height_m = ${altura}
    order by v.sort_order`
  return {
    heightM: altura,
    period: rows[0]?.period_start ? { from: rows[0].period_start, to: rows[0].period_end, stepS: 10800 } : null,
    engineSha256: rows[0]?.engine_sha256 ?? null,
    zones: rows.map((r) => ({
      code: r.code, slug: r.slug, name: r.name, kind: r.kind, lat: Number(r.lat), lon: Number(r.lon), siteSlug: r.site_slug,
      horizon: { quality: r.horizon_quality, source: r.horizon_source }, groundHeightM: r.ground_height_m == null ? null : Number(r.ground_height_m),
      mazarico2011: r.mazarico_sun_pct == null ? null : { sunPct: Number(r.mazarico_sun_pct), earthPct: Number(r.mazarico_earth_pct) },
      stats: r.sun_pct == null ? null : {
        sunPct: r1(Number(r.sun_pct)), earthPct: r1(Number(r.earth_pct)), bothPct: r1(Number(r.both_pct)),
        longestNightH: r1(Number(r.longest_night_h)), longestSilenceH: r1(Number(r.longest_silence_h)), meanPanelWm2: Math.round(Number(r.mean_panel_w_m2)),
      },
    })),
  }
}

async function montajes() {
  const rows = await db()`
    select p.code, p.name, p.orientation, p.tracking, p.array_bottom_height_m, p.solar_constant_w_m2, p.notes, d.key as source, d.url
    from ref.power_system p left join ref.data_source d on d.id = p.source_id order by p.array_bottom_height_m`
  return rows.map((r) => ({
    code: r.code, name: r.name, orientation: r.orientation, tracking: r.tracking, arrayBottomHeightM: Number(r.array_bottom_height_m),
    solarConstantWm2: Number(r.solar_constant_w_m2), notes: r.notes, source: r.source, url: r.url,
  }))
}

/** La misma regla y los mismos límites que el planificador (index.html: sanitize, evaluateAll). */
async function evaluar(q: Record<string, string>) {
  const { E, sha256 } = cargarMotor()
  const { tabla, zonas } = await datos()
  const code = (q.zone ?? "").toUpperCase()
  const zona = zonas[code]
  if (!zona) throw new Peticion(`zone must be one of ${Object.keys(zonas).join(", ")}`, 404)
  const stayDays = Math.round(numero(q.stay, "stay", 1, 60, 3))
  const t = Date.parse(q.landing ?? "")
  if (!Number.isFinite(t)) throw new Peticion("landing must be an ISO date and time in UTC, e.g. 2026-12-18T09:00Z")
  const landingMs = Math.round(t / 60_000) * 60_000
  const ultimo = tabla.finMs - stayDays * 86_400_000
  if (landingMs < tabla.inicioMs || landingMs > ultimo) throw new Peticion(`landing must be from ${iso(tabla.inicioMs)} to ${iso(ultimo)}`)
  const sc = {
    landingMs, stayDays,
    panelM: numero(q.panel, "panel", 0, 30, 2), antennaM: numero(q.antenna, "antenna", 0, 30, 2),
    requirements: {
      batteryH: Math.round(numero(q.battery, "battery", 0, 720, 24)), minEarthPct: Math.round(numero(q.earth, "earth", 0, 100, 40)),
      sunAtLanding: bandera(q.sun, true), earthAtLanding: bandera(q.el, true),
    },
  }
  const e = E.evaluate(tabla, E.station(zona, sc.panelM, sc.antennaM), sc)
  const l = e.landing, rq = sc.requirements
  const verdict = !e.ok ? "NO GO" : (rq.sunAtLanding && l.sunMarginDeg < 0.5) || (rq.earthAtLanding && l.earthMarginDeg < 0.5) ? "REVIEW" : "GO"
  const f = e.figures
  return {
    zone: { code, name: zona.nombre, lat: zona.lat, lon: zona.lon, horizon: zona.aproximado ? "approximate" : "detailed" },
    scenario: { landing: iso(landingMs), stayDays, panelM: sc.panelM, antennaM: sc.antennaM, requirements: rq },
    verdict, ok: e.ok,
    landing: {
      sunAboveHorizonDeg: r3(l.sunAboveDeg), earthAboveHorizonDeg: r3(l.earthAboveDeg),
      sunMarginDeg: r3(l.sunMarginDeg), earthMarginDeg: r3(l.earthMarginDeg),
      sunNextChange: iso(l.sunChangeMs), earthNextChange: iso(l.earthChangeMs),
    },
    stay: {
      from: iso(e.fromMs), to: iso(e.toMs), stepS: E.STEP_MS / 1000,
      sunPct: r1(f.sunPct), earthPct: r1(f.earthPct), bothPct: r1(f.bothPct),
      longestNightH: r1(f.longestNightH), longestSilenceH: r1(f.longestSilenceH), meanPanelWm2: Math.round(f.meanPanelWm2),
    },
    checks: e.checks.map((c: { id: string; ok: boolean; value: number; limit: number }) => ({ id: c.id, ok: c.ok, value: r3(c.value), limit: c.limit })),
    computedWith: {
      engine: "prototipos/lunar-map/engine.js", engineSha256: sha256,
      ephemeris: "eph.sample (JPL Horizons DE441)", horizon: "moon.horizon_envelope",
      rule: "NO GO if a requirement fails; REVIEW if the Sun or Earth is less than 0.5 deg above the horizon at landing; else GO",
    },
  }
}

export const planner = new Hono()
  .onError((e, c) => {
    if (e instanceof Peticion) return c.json({ error: e.message }, e.status)
    if (esFalloDeConexion(e)) return c.json({ error: "Planner database not available" }, 503)
    console.error("planner:", e)
    return c.json({ error: "Internal error" }, 500)
  })
  .use("*", async (c, next) => {
    if (!process.env.DATABASE_URL) return c.json({ error: "Planner database not configured" }, 503)
    await next()
  })
  .use("*", compress())
  .get("/zones", async (c) => {
    const h = numero(c.req.query("height"), "height", 0, 30, 2)
    c.header("Cache-Control", "public, max-age=300")
    return c.json(await enMemoria(`planner-zones-${h}`, TTL, () => zonas(h)))
  })
  /* los datos del planificador web: gzip ya hecho (compress() no lo vuelve a comprimir), ETag para revalidar */
  .get("/data", async (c) => {
    const p = await paquete()
    const h = { ETag: p.etag, "Cache-Control": "no-cache", Vary: "Accept-Encoding" }
    if (c.req.header("if-none-match")?.split(",").some((x) => x.trim().replace(/^W\//, "") === p.etag)) return new Response(null, { status: 304, headers: h })
    return new Response(new Uint8Array(p.gz), { headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip" } })
  })
  .get("/power-systems", async (c) => {
    c.header("Cache-Control", "public, max-age=300")
    return c.json(await enMemoria("planner-power", TTL, montajes))
  })
  .get("/evaluate", async (c) => {
    c.header("Cache-Control", "no-store")
    return c.json(await evaluar(c.req.query()))
  })
