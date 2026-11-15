/* Figures of 2026-2030 per candidate zone and gear height, with the planner's own engine (engine.js), printed as JSON.
 * The database loader (db/etl/load_zone_stats.py) runs it and stores the result in moon.zone_stats.
 *
 * Inputs (the files the planner itself loads): engine.js, data/efemerides-luna.js, data/zonas.js.
 * For each zone and each height in HEIGHTS (panel = antenna): a sweep over the whole ephemeris table with
 *  - step 10800 s (the table step): the means the planner shows in its zone cards (Engine.means), and
 *  - step 600 s (the engine's 10-minute step): the same figures at full resolution.
 *
 * Usage:  node prototipos/lunar-map/tools/zone-stats.js [height ...]      (default heights: 2 5 10)
 * No dependencies: plain Node, so the loader image only needs the node binary. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const AQUI = path.resolve(__dirname, '..');
const ctx = { atob: (s) => Buffer.from(s, 'base64').toString('binary') };
ctx.window = ctx;
vm.createContext(ctx);
const leer = (f) => fs.readFileSync(path.join(AQUI, f), 'utf8');
const engineSrc = leer('engine.js');
for (const f of ['data/efemerides-luna.js', 'data/zonas.js']) vm.runInContext(leer(f), ctx, { filename: f });
vm.runInContext(engineSrc, ctx, { filename: 'engine.js' });

const E = ctx.Lunar.Engine, Z = ctx.LunarData.zonas, T = E.tabla(ctx.LunarData.efemerides);
const HEIGHTS = process.argv.slice(2).map(Number).filter((h) => isFinite(h) && h >= 0);
const heights = HEIGHTS.length ? HEIGHTS : [2, 5, 10];
const engineSha = crypto.createHash('sha256').update(engineSrc).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

const rows = [];
for (const code of Object.keys(Z)) {
  for (const h of heights) {
    const st = E.station(Z[code], h, h);
    for (const step of [T.pasoMs, E.STEP_MS]) {
      const to = T.finMs - T.pasoMs;   /* the same period as Engine.means */
      const b = E.sweep(T, st, T.inicioMs, to, step), f = E.figures(b);
      rows.push({
        zone: code, panel_height_m: h, antenna_height_m: h, step_s: step / 1000,
        period_start: iso(T.inicioMs), period_end: iso(T.inicioMs + (b.n - 1) * step), samples: b.n,
        sun_pct: f.sunPct, earth_pct: f.earthPct, both_pct: f.bothPct, longest_night_h: f.longestNightH,
        longest_silence_h: f.longestSilenceH, mean_panel_w_m2: f.meanPanelWm2
      });
    }
  }
}
process.stdout.write(JSON.stringify({ engine_sha256: engineSha, rows }));
