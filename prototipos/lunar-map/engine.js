/* Lunar Map · motor de planificación de Horizon Signal, portado a JavaScript sin cambios de método.
 * Origen (repo Goberna-Lab/Horizon-signai): luna-recursos/calculos/motor/efemeridesLuna.ts, mascara.ts, planificador.ts
 * y environment.ts (fraccionDiscoVisible), y apps/web/src/shared/planning/model/evaluate.ts.
 * - Cielo: tabla global de JPL Horizons DE441 cada 3 h (2026–2030) en ejes fijos a la Luna; dirección desde el sitio =
 *   cuerpo − posición del sitio en la esfera de 1737,4 km (paralaje), en ejes este-norte-arriba.
 * - Horizonte desde una altura H: máx atan2(y − H, x) sobre la envolvente de cada azimut (ojo a 1 cm como mínimo).
 * - Sol visible: alguna parte del disco (semidiámetro fijo 0,266°); Tierra visible: su centro.
 * - Panel: 1361 W/m² × fracción visible del disco × cos(elevación); panel vertical que sigue al Sol (supuesto).
 * - Barrido cada 10 min (STEP_MS), como el planificador del equipo. El Sol se mide desde el panel y la Tierra desde la
 *   antena, en el mismo punto del terreno (simplificación declarada del equipo).
 * Datos: data/efemerides-luna.js y data/zonas.js. */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, R_LUNA = 1737.4, SEMI_SOL = 0.266, SOLAR = 1361;
  var STEP_MS = 600000, HOUR_MS = 3600000, DAY_MS = 86400000, STEPS_PER_DAY = DAY_MS / STEP_MS;
  var RAISE_TO_M = [2, 5, 10, 15, 20, 30];   /* alturas que se prueban al proponer subir el equipo (supuesto del equipo) */

  /* ---------- efemérides ---------- */
  function tabla(src) {
    var bin = atob(src.b64), n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return { inicioMs: Date.parse(src.meta.inicioUTC), finMs: Date.parse(src.meta.finUTC), pasoMs: src.meta.pasoS * 1000, filas: src.meta.filas, datos: new Float32Array(u8.buffer) };
  }
  var c3 = [0, 0, 0];
  function cuerpoKm(t, ms, off) {
    var s = (Math.min(Math.max(ms, t.inicioMs), t.finMs) - t.inicioMs) / t.pasoMs;
    var i = Math.min(Math.floor(s), t.filas - 2), f = s - i, d = t.datos, a = i * 8 + off, b = a + 8;
    var x = d[a] + (d[b] - d[a]) * f, y = d[a + 1] + (d[b + 1] - d[a + 1]) * f, z = d[a + 2] + (d[b + 2] - d[a + 2]) * f;
    var km = (d[a + 3] + (d[b + 3] - d[a + 3]) * f) / Math.hypot(x, y, z);
    c3[0] = x * km; c3[1] = y * km; c3[2] = z * km;
    return c3;
  }
  function sitio(lat, lon) {
    var f = lat * RAD, l = lon * RAD, up = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)];
    return { pos: [up[0] * R_LUNA, up[1] * R_LUNA, up[2] * R_LUNA], e: [-Math.sin(l), Math.cos(l), 0], n: [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)], u: up };
  }
  /* out = [azSol, elSol, azTierra, elTierra] (grados) */
  function elevaciones(t, st, ms, out) {
    for (var k = 0; k < 2; k++) {
      var c = cuerpoKm(t, ms, k * 4), rx = c[0] - st.pos[0], ry = c[1] - st.pos[1], rz = c[2] - st.pos[2], L = Math.hypot(rx, ry, rz);
      var e = rx * st.e[0] + ry * st.e[1] + rz * st.e[2], n = rx * st.n[0] + ry * st.n[1] + rz * st.n[2], u = rx * st.u[0] + ry * st.u[1] + rz * st.u[2];
      out[k * 2] = (Math.atan2(e, n) / RAD + 360) % 360;
      out[k * 2 + 1] = Math.asin(u / L) / RAD;
    }
  }

  /* ---------- horizonte ---------- */
  function perfil(zona, alturaM) {
    var H = Math.max(alturaM, 0.01), v = zona.v, elev = new Float32Array(v.length);
    for (var i = 0; i < v.length; i++) {
      var best = -Math.PI / 2, a = v[i];
      for (var k = 0; k < a.length; k += 2) best = Math.max(best, Math.atan2(a[k + 1] - H, a[k]));
      elev[i] = best / RAD;
    }
    return { paso: zona.paso, elev: elev, alturaM: alturaM };
  }
  function horizonteEn(p, az) {
    var n = p.elev.length, a = (((az % 360) + 360) % 360) / p.paso, i = Math.floor(a), f = a - i;
    return p.elev[i % n] * (1 - f) + p.elev[(i + 1) % n] * f;
  }
  function fraccionDisco(sobre) {
    var t = sobre / SEMI_SOL;
    return t <= -1 ? 0 : t >= 1 ? 1 : 0.5 + (Math.asin(t) + t * Math.sqrt(1 - t * t)) / Math.PI;
  }
  var margenSol = function (x) { return x + SEMI_SOL; }, margenTierra = function (x) { return x; };

  /* ---------- barrido y cifras ---------- */
  var s4 = new Float64Array(4);
  function barrer(t, st, perfSol, perfTierra, desde, hasta, paso) {
    var n = Math.max(2, Math.floor((hasta - desde) / paso) + 1);
    var b = { desdeMs: desde, pasoMs: paso, n: n, solAz: new Float32Array(n), solEl: new Float32Array(n), solSobre: new Float32Array(n), tierraAz: new Float32Array(n), tierraEl: new Float32Array(n), tierraSobre: new Float32Array(n), panel: new Float32Array(n) };
    for (var k = 0; k < n; k++) {
      elevaciones(t, st, desde + k * paso, s4);
      var sobre = s4[1] - horizonteEn(perfSol, s4[0]), f = fraccionDisco(sobre);
      b.solAz[k] = s4[0]; b.solEl[k] = s4[1]; b.solSobre[k] = sobre;
      b.tierraAz[k] = s4[2]; b.tierraEl[k] = s4[3]; b.tierraSobre[k] = s4[3] - horizonteEn(perfTierra, s4[2]);
      b.panel[k] = SOLAR * f * Math.max(0, Math.cos(s4[1] * RAD));
    }
    return b;
  }
  function ventanas(b, cuerpo) {
    var m = function (k) { return cuerpo === 'sol' ? margenSol(b.solSobre[k]) : margenTierra(b.tierraSobre[k]); };
    var t = function (k) { return b.desdeMs + k * b.pasoMs; };
    var cruce = function (k) { var a = m(k - 1), c = m(k); return t(k - 1) + (a / (a - c)) * b.pasoMs; };
    var out = [], ini = m(0) > 0 ? t(0) : NaN;
    for (var k = 1; k < b.n; k++) {
      var antes = m(k - 1) > 0, ahora = m(k) > 0;
      if (!antes && ahora) ini = cruce(k);
      if (antes && !ahora) { out.push([ini, cruce(k)]); ini = NaN; }
    }
    if (!isNaN(ini)) out.push([ini, t(b.n - 1)]);
    return out;
  }
  function solape(a, b) {
    var out = [];
    a.forEach(function (x) { b.forEach(function (y) { if (Math.min(x[1], y[1]) > Math.max(x[0], y[0])) out.push([Math.max(x[0], y[0]), Math.min(x[1], y[1])]); }); });
    return out;
  }
  function figures(b, i0, n) {
    i0 = i0 || 0; n = n || b.n - i0;
    var sun = 0, earth = 0, both = 0, panel = 0, noSun = 0, noEarth = 0, night = 0, silence = 0;
    for (var k = i0; k < i0 + n; k++) {
      var s = margenSol(b.solSobre[k]) > 0, e = margenTierra(b.tierraSobre[k]) > 0;
      if (s) sun++; if (e) earth++; if (s && e) both++;
      panel += b.panel[k];
      noSun = s ? 0 : noSun + 1; noEarth = e ? 0 : noEarth + 1;
      if (noSun > night) night = noSun; if (noEarth > silence) silence = noEarth;
    }
    var h = b.pasoMs / HOUR_MS;
    return { sunPct: sun / n * 100, earthPct: earth / n * 100, bothPct: both / n * 100, longestNightH: night * h, longestSilenceH: silence * h, meanPanelWm2: panel / n };
  }
  function check(f, sunMargin, earthMargin, req) {
    var list = [];
    if (req.sunAtLanding) list.push({ id: 'sunAtLanding', ok: sunMargin > 0, value: sunMargin, limit: 0 });
    if (req.earthAtLanding) list.push({ id: 'earthAtLanding', ok: earthMargin > 0, value: earthMargin, limit: 0 });
    list.push({ id: 'battery', ok: f.longestNightH <= req.batteryH, value: f.longestNightH, limit: req.batteryH });
    list.push({ id: 'earthContact', ok: f.earthPct >= req.minEarthPct, value: f.earthPct, limit: req.minEarthPct });
    return list;
  }

  /* ---------- estación, evaluación y salidas ---------- */
  function station(zona, panelM, antennaM) {
    var p = perfil(zona, panelM);
    return { zona: zona, site: sitio(zona.lat, zona.lon), panel: p, antenna: antennaM === panelM ? p : perfil(zona, antennaM) };
  }
  function sweep(t, st, desde, hasta, paso) { return barrer(t, st.site, st.panel, st.antenna, desde, hasta, paso || STEP_MS); }
  function samplesOf(stayDays) { return Math.max(2, Math.round(stayDays * STEPS_PER_DAY) + 1); }
  function proximoCambio(t, st, ms, cuerpo, limiteMs) {
    var s = new Float64Array(4);
    var m = function (x) { elevaciones(t, st.site, x, s); return cuerpo === 'sol' ? margenSol(s[1] - horizonteEn(st.panel, s[0])) : margenTierra(s[3] - horizonteEn(st.antenna, s[2])); };
    var vis = m(ms) > 0;
    for (var x = ms + STEP_MS; x <= limiteMs; x += STEP_MS) {
      if ((m(x) > 0) !== vis) {
        var lo = x - STEP_MS, hi = x;
        while (hi - lo > 1000) { var mid = (lo + hi) / 2; if ((m(mid) > 0) === vis) lo = mid; else hi = mid; }
        return { visible: vis, cambioMs: hi };
      }
    }
    return { visible: vis, cambioMs: null };
  }
  function evaluate(t, st, sc) {
    var from = sc.landingMs, to = from + (samplesOf(sc.stayDays) - 1) * STEP_MS, b = sweep(t, st, from, to), f = figures(b);
    var sm = margenSol(b.solSobre[0]), em = margenTierra(b.tierraSobre[0]), sun = ventanas(b, 'sol'), earth = ventanas(b, 'tierra');
    var checks = check(f, sm, em, sc.requirements), limit = Math.min(to + 60 * DAY_MS, t.finMs);
    return {
      fromMs: from, toMs: to, sweep: b, figures: f, windows: { sun: sun, earth: earth, both: solape(sun, earth) },
      landing: { sunMarginDeg: sm, earthMarginDeg: em, sunAboveDeg: b.solSobre[0], earthAboveDeg: b.tierraSobre[0], sunChangeMs: proximoCambio(t, st, from, 'sol', limit).cambioMs, earthChangeMs: proximoCambio(t, st, from, 'tierra', limit).cambioMs },
      checks: checks, ok: checks.every(function (c) { return c.ok; })
    };
  }
  function outcome(t, st, sc) {
    var n = samplesOf(sc.stayDays), b = sweep(t, st, sc.landingMs, sc.landingMs + (n - 1) * STEP_MS), f = figures(b);
    var checks = check(f, margenSol(b.solSobre[0]), margenTierra(b.tierraSobre[0]), sc.requirements);
    return { figures: f, checks: checks, ok: checks.every(function (c) { return c.ok; }) };
  }
  function scanDates(t, st, sc, daysBefore, daysAfter) {
    daysBefore = daysBefore == null ? 30 : daysBefore; daysAfter = daysAfter == null ? 120 : daysAfter;
    var n = samplesOf(sc.stayDays), span = (n - 1) * STEP_MS, first = -daysBefore, last = daysAfter;
    while (first < 0 && sc.landingMs + first * DAY_MS < t.inicioMs) first++;
    while (last > 0 && sc.landingMs + last * DAY_MS + span > t.finMs) last--;
    var b = sweep(t, st, sc.landingMs + first * DAY_MS, sc.landingMs + last * DAY_MS + span), out = [];
    for (var d = first; d <= last; d++) {
      var i0 = (d - first) * STEPS_PER_DAY, f = figures(b, i0, n);
      var checks = check(f, margenSol(b.solSobre[i0]), margenTierra(b.tierraSobre[i0]), sc.requirements);
      out.push({ landingMs: sc.landingMs + d * DAY_MS, figures: f, checks: checks, ok: checks.every(function (c) { return c.ok; }) });
    }
    return out;
  }
  function dateWindows(days) {
    var out = [], run = null;
    days.forEach(function (d) {
      if (d.ok) {
        if (run && d.landingMs - run.toMs === DAY_MS) { run.toMs = d.landingMs; run.days++; }
        else { run = { fromMs: d.landingMs, toMs: d.landingMs, days: 1 }; out.push(run); }
      } else run = null;
    });
    return out;
  }
  function suggestDate(days, landingMs) {
    var w = dateWindows(days).filter(function (x) { return !(landingMs >= x.fromMs && landingMs <= x.toMs); });
    var later = w.filter(function (x) { return x.fromMs > landingMs; }), pool = later.length ? later : w;
    if (!pool.length) return null;
    var win = pool.reduce(function (a, x) { return Math.abs(x.fromMs - landingMs) < Math.abs(a.fromMs - landingMs) ? x : a; });
    var slack = Math.floor((win.days - 1) / 2), day = days.filter(function (d) { return d.landingMs === win.fromMs + slack * DAY_MS; })[0];
    return day ? { day: day, window: win, slackDays: slack } : null;
  }
  function suggestHeight(t, zona, sc, panelM, antennaM) {
    for (var i = 0; i < RAISE_TO_M.length; i++) {
      var h = RAISE_TO_M[i];
      if (h <= Math.min(panelM, antennaM)) continue;
      var o = outcome(t, station(zona, Math.max(panelM, h), Math.max(antennaM, h)), sc);
      if (o.ok) { o.heightM = h; return o; }
    }
    return null;
  }
  /* medias de 2026 a 2030 con la tabla (cada 3 h), para comparar zonas a largo plazo */
  function means(t, st) {
    var b = sweep(t, st, t.inicioMs, t.finMs - t.pasoMs, t.pasoMs), f = figures(b);
    return { sunPct: f.sunPct, earthPct: f.earthPct, bothPct: f.bothPct };
  }

  /* ---------- punto propio (demPolar.ts, SPEC E24): máscara sobre el relieve polar de LOLA ----------
   * Marcha de rayos por círculo máximo cada 0,5° de azimut hasta 150 km, esfera exacta de 1737,4 km; pasos de 120 m hasta
   * 6 km, de 240 m hasta 30 km y de 960 m después; por rayo, la envolvente convexa superior. Horizonte APROXIMADO: a 240 m
   * por píxel el relieve de menos de ~500 m no aparece. Solo hasta 190 km del polo. Datos: data/dem-polo.js. */
  var R_M = 1737400, RADIO_DOMINIO_M = 190000;
  function crearDem(src) {
    var g = function (b64, m) {
      var bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return { n: m.n, pasoM: m.pasoM, x0M: m.x0M, y0M: m.y0M, alturas: new Int16Array(u8.buffer) };
    };
    return { cerca: g(src.cerca, src.meta.cerca), lejos: g(src.lejos, src.meta.lejos) };
  }
  function estereoSur(lat, lon) { var rho = 2 * R_M * Math.tan((90 + lat) * RAD / 2); return [rho * Math.sin(lon * RAD), rho * Math.cos(lon * RAD)]; }
  function desdeEstereoSur(x, y) { var c = 2 * Math.atan(Math.hypot(x, y) / (2 * R_M)); return [-90 + c / RAD, ((Math.atan2(x, y) / RAD) % 360 + 360) % 360]; }
  function enRejilla(g, x, y) {
    var c = (x - g.x0M) / g.pasoM, f = (g.y0M - y) / g.pasoM;
    if (c < 0 || f < 0 || c > g.n - 1 || f > g.n - 1) return NaN;
    var c0 = Math.min(Math.floor(c), g.n - 2), f0 = Math.min(Math.floor(f), g.n - 2), tc = c - c0, tf = f - f0, a = g.alturas, i = f0 * g.n + c0;
    return (a[i] * (1 - tc) + a[i + 1] * tc) * (1 - tf) + (a[i + g.n] * (1 - tc) + a[i + g.n + 1] * tc) * tf;
  }
  function alturaPolar(dem, x, y) { var h = enRejilla(dem.cerca, x, y); return isNaN(h) ? enRejilla(dem.lejos, x, y) : h; }
  function dentroDelDominio(lat, lon) { var p = estereoSur(lat, lon); return Math.hypot(p[0], p[1]) <= RADIO_DOMINIO_M; }
  var DIST = (function () { var d = [], s; for (s = 120; s <= 6000; s += 120) d.push(s); for (s = 6240; s <= 30000; s += 240) d.push(s); for (s = 30960; s <= 150000; s += 960) d.push(s); return d; })();
  var COS = DIST.map(function (s) { return Math.cos(s / R_M); }), SIN = DIST.map(function (s) { return Math.sin(s / R_M); });
  function envolventeSuperior(pts) {
    pts.sort(function (a, b) { return a[0] - b[0]; });
    var h = [];
    pts.forEach(function (q) {
      while (h.length >= 2) {
        var a = h[h.length - 2], b = h[h.length - 1];
        if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0) h.pop(); else break;
      }
      h.push(q);
    });
    var out = [];
    h.forEach(function (q) { out.push(Math.round(q[0]), Math.round(q[1] * 100) / 100); });
    return out;
  }
  /* devuelve una «zona» con la misma forma que las de data/zonas.js, lista para station() */
  function mascaraPolar(dem, lat, lon) {
    var f = lat * RAD, l = lon * RAD, u = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)];
    var e = [-Math.sin(l), Math.cos(l), 0], n = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)];
    var p0 = estereoSur(lat, lon), h0 = alturaPolar(dem, p0[0], p0[1]);
    if (isNaN(h0)) throw new Error('The point is outside the polar terrain.');
    var v = [];
    for (var i = 0; i < 720; i++) {
      var az = i * 0.5 * RAD, ca = Math.cos(az), sa = Math.sin(az), d = [ca * n[0] + sa * e[0], ca * n[1] + sa * e[1], ca * n[2]], pts = [];
      for (var k = 0; k < DIST.length; k++) {
        var px = COS[k] * u[0] + SIN[k] * d[0], py = COS[k] * u[1] + SIN[k] * d[1], pz = COS[k] * u[2] + SIN[k] * d[2];
        var h = alturaPolar(dem, 2 * R_M * py / (1 - pz), 2 * R_M * px / (1 - pz));
        if (isNaN(h)) break;
        pts.push([(R_M + h) * SIN[k], (R_M + h) * COS[k] - (R_M + h0)]);
      }
      v.push(envolventeSuperior(pts));
    }
    return { id: 'punto-propio', nombre: 'Own point', lat: lat, lon: lon, paso: 0.5, v: v, alturaM: h0, aproximado: true };
  }

  root.Lunar = root.Lunar || {};
  root.Lunar.Engine = {
    STEP_MS: STEP_MS, HOUR_MS: HOUR_MS, DAY_MS: DAY_MS, SEMI_SOL: SEMI_SOL, RAISE_TO_M: RAISE_TO_M,
    tabla: tabla, sitio: sitio, perfil: perfil, horizonteEn: horizonteEn, station: station, sweep: sweep, ventanas: ventanas, solape: solape,
    figures: figures, evaluate: evaluate, outcome: outcome, scanDates: scanDates, dateWindows: dateWindows, suggestDate: suggestDate,
    suggestHeight: suggestHeight, means: means, margenSol: margenSol, margenTierra: margenTierra,
    RADIO_DOMINIO_M: RADIO_DOMINIO_M, crearDem: crearDem, estereoSur: estereoSur, desdeEstereoSur: desdeEstereoSur, dentroDelDominio: dentroDelDominio, mascaraPolar: mascaraPolar
  };
})(window);
