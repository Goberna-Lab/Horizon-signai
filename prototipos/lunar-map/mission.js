/* Lunar Map · datos de misión compartidos entre Inicio y Planificar.
 * Las rutas viven en Lunar.ROUTES (coordenadas del mapa local); aquí se miden sobre el terreno.
 */
(function (root) {
  'use strict';
  var L = root.Lunar;
  var WALK_KMH = 2.2, STOP_MIN = 20, SLOPE_LIMIT = 15;

  var META = {
    safe: { label: 'Segura', status: 'ok', hint: 'Rodea las dos zonas de pendiente. Es la más larga.', leg: 'módulo → desvío', next: 'Desvío para rodear la pendiente', stopNames: ['Desvío'] },
    short: { label: 'Corta', status: 'risk', hint: 'La más directa, pero un tramo cruza una pendiente fuera del límite.', leg: 'módulo → borde de Shackleton', next: 'Borde de Shackleton', stopNames: [] },
    science: { label: 'Científica', status: 'tight', hint: 'Pasa por el borde iluminado y una zona en sombra con posible hielo, sin cruzar peligros.', leg: 'módulo → parada 1', next: '1 · Borde iluminado', stopNames: ['1 · Borde iluminado', '2 · Sombra permanente'] }
  };
  var ORDER = ['safe', 'short', 'science'];
  var FILLS = { ok: [0.45, 0.4, 0.35], tight: [0.74, 0.66, 0.58], risk: [0.4, 0.34, 0.3] };
  var STATUS = {
    ok: { label: 'Dentro de la reserva', bg: 'rgba(17,17,17,0.07)', fg: '#111111', note: 'Consumo estimado frente a la reserva' },
    tight: { label: 'Oxígeno ajustado', bg: '#C9C1B6', fg: '#111111', note: 'El oxígeno queda justo al volver' },
    risk: { label: 'Ruta no viable', bg: '#C8102E', fg: '#F4EFE6', note: 'Los consumibles alcanzan; el problema es la pendiente' }
  };
  var SUPPLIES = [['O₂', 'Oxígeno'], ['E', 'Energía'], ['H₂O', 'Agua']];

  var cache = {};
  function routeStats(t, key) {
    if (cache[key]) return cache[key];
    var r = L.ROUTES[key], pts = L.samplePath(r.d, 48), prev = null, dist = 0, up = 0, pmax = 0, hmin = 1e9, hmax = -1e9;
    var prof = [], warn = [], anyWarn = false;
    pts.forEach(function (p) {
      var h = L.heightAt(t, p.x, p.y), s = L.slopeAt(t, p.x, p.y) * 180 / Math.PI;
      if (prev) { dist += Math.hypot(p.x - prev.x, p.y - prev.y) * t.mpp; if (h > prev.h) up += h - prev.h; }
      if (s > pmax) pmax = s; if (h < hmin) hmin = h; if (h > hmax) hmax = h;
      var w = s > SLOPE_LIMIT; warn.push(w); if (w) anyWarn = true;
      prof.push({ s: dist, h: h, slope: s, x: p.x, y: p.y });
      prev = { x: p.x, y: p.y, h: h };
    });
    var timeH = (2 * dist / 1000) / WALK_KMH + r.stops.length * STOP_MIN / 60;
    var out = { key: key, pts: pts, prof: prof, warn: warn, anyWarn: anyWarn, distM: dist, distKm: dist / 1000, timeH: timeH, dz: up, pmax: pmax, hmin: hmin, hmax: hmax, stops: r.stops, d: r.d, meta: META[key] };
    cache[key] = out;
    return out;
  }

  /* tramo hasta el siguiente punto (parada 1, desvío o destino) */
  function nextLeg(t, key) {
    var st = routeStats(t, key), target = st.stops.length ? st.stops[0] : { x: 1000, y: 300 };
    var best = 1e9, idx = 0;
    st.prof.forEach(function (p, i) { var d = Math.hypot(p.x - target.x, p.y - target.y); if (d < best) { best = d; idx = i; } });
    var legDist = st.prof[idx].s, pm = 0;
    for (var i = 0; i <= idx; i++) if (st.prof[i].slope > pm) pm = st.prof[i].slope;
    return { distM: legDist, timeMin: legDist / 1000 / WALK_KMH * 60, pmax: pm, target: target, remKm: st.distKm, remMin: st.distKm / WALK_KMH * 60 };
  }

  function supplies(status, radius) {
    var circ = 2 * Math.PI * radius;
    return SUPPLIES.map(function (p, i) {
      var f = FILLS[status][i];
      return { short: p[0], name: p[1], pct: Math.round((1 - f) * 100), aria: p[1] + ': consumo estimado frente a la reserva', color: f > 0.7 ? '#C8102E' : '#111111', dash: (f * circ).toFixed(1) + ' ' + circ.toFixed(1) };
    });
  }

  /* formato español: 3,8 · 2 100 */
  function num(v, dec) { var s = v.toFixed(dec || 0).replace('.', ','); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function hm(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); return H + ' h ' + (M < 10 ? '0' : '') + M; }

  /* bearing en grados desde el norte del mapa (−y), horario */
  function bearing(ax, ay, bx, by) { var d = Math.atan2(bx - ax, -(by - ay)) * 180 / Math.PI; return (d + 360) % 360; }

  /* dibuja un recorte del relieve local en un canvas destino (región en coords de mapa) */
  function drawCrop(reliefCanvas, t, target, region) {
    var ctx = target.getContext('2d');
    var sx = (region.x - t.ox) / t.ppc, sy = (region.y - t.oy) / t.ppc, sw = region.w / t.ppc, sh = region.h / t.ppc;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(reliefCanvas, sx, sy, sw, sh, 0, 0, target.width, target.height);
  }

  root.Lunar.Mission = { META: META, ORDER: ORDER, STATUS: STATUS, SLOPE_LIMIT: SLOPE_LIMIT, WALK_KMH: WALK_KMH, routeStats: routeStats, nextLeg: nextLeg, supplies: supplies, num: num, hm: hm, bearing: bearing, drawCrop: drawCrop };
})(typeof window !== 'undefined' ? window : globalThis);
