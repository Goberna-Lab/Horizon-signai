/* Lunar Map · south pole campaign shared between Home and Assistant.
 * Misiones, sitios, decisiones y la bitácora de movimientos (registrados y programados).
 * La aprobación de CR-02 se guarda en el navegador para que ambas páginas la vean.
 */
(function (root) {
  'use strict';
  var L = root.Lunar, M = L.Mission;
  var KEY = 'lunarmap.cr02.approvedAt';
  function U(y, mo, d, h, mi, s) { return Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0); }

  var CONTACT = U(2026, 12, 18, 9, 0, 0);
  var EVA = U(2026, 12, 19, 10, 0, 0);
  var DESCENT_S = 710; /* 11 min 50 s; P63 hasta 0,62, P64 hasta 0,93 */

  var MISSIONS = [
    { id: 'CR-01', name: 'Landing at Connecting Ridge', meta: '18 Dec 2026 · 09:00 UTC · Zone A', status: 'GO', site: 'A', bars: ['ok', 'ok', 'ok', 'warn', 'ok'], legend: 'fuel · light · Sun · Earth · night', href: 'index.html' },
    { id: 'CR-02', name: 'Science walk to the Shackleton rim', meta: '19 Dec 2026 · 10:00 UTC · 2 stops', status: 'PEND', site: 'A', bars: ['ok', 'warn', 'ok', 'ok', 'ok'], legend: 'slope · O₂ · power · Earth · light', href: 'planificar.html' },
    { id: 'PS-03', name: 'Survey of the peak next to Shackleton', meta: 'Jan 2027 · date to be chosen · Zone B', status: 'REV', site: 'B', bars: ['ok', 'ok', 'warn', 'warn', 'warn'], legend: 'fuel · light · Sun · Earth · night', href: 'index.html' },
    { id: 'DG-04', name: 'Sampling at the de Gerlache rim', meta: 'no date · science team draft', status: 'DRAFT', site: 'D', bars: ['ok', 'none', 'none', 'none', 'none'], legend: 'fuel · light · Sun · Earth · night', href: 'planificar.html' }
  ];
  var STATUS_LABEL = { GO: 'GO', PEND: 'PENDING SIGN-OFF', REV: 'REVIEW', DRAFT: 'DRAFT', OK: 'APPROVED' };
  var SITES = {
    A: { x: 294, y: 402, name: 'Connecting Ridge · RoI 6' },
    B: { x: 862, y: 518, name: 'Peak near Shackleton · RoI 2' },
    D: { x: 300, y: 560, name: 'de Gerlache rim' }
  };
  /* Sun above the real horizon, with the panel at 2 m (motor de Horizon Signal: JPL Horizons DE441 + horizonte LOLA/PGDA):
   * en la zona A (Connecting Ridge RoI 6) no se pone entre octubre y enero; en el pico cerca de Shackleton (RoI 2, misión
   * PS-03) se corta por primera vez el 28 ene 2027. La estadía de CR-01 dura 3 días desde el contacto. */
  var SUN = [[U(2026, 10, 1), U(2027, 2, 1)]];
  var SUN_B = [U(2027, 1, 1), U(2027, 1, 28, 9)];
  var STAY_END = CONTACT + 3 * 86400000;

  var TYPES = {
    dec: { label: 'Decision', short: 'DEC' },
    plan: { label: 'Planning', short: 'PLAN' },
    sim: { label: 'Simulation', short: 'SIM' },
    dato: { label: 'Data', short: 'DATA' },
    rev: { label: 'Review', short: 'REV' },
    op: { label: 'Operation', short: 'OPS' }
  };

  /* ---------- aprobación de CR-02 ---------- */
  function approvedAt() { try { var v = root.localStorage.getItem(KEY); return v ? +v : null; } catch (e) { return null; } }
  function approve(ts) { ts = ts || Date.now(); try { root.localStorage.setItem(KEY, String(ts)); } catch (e) {} return ts; }
  function resetApproval() { try { root.localStorage.removeItem(KEY); } catch (e) {} }

  function missions() {
    var ok = approvedAt() !== null;
    return MISSIONS.map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; if (ok && m.id === 'CR-02') c.status = 'OK'; return c; });
  }
  function decisions() {
    var out = [
      { id: 'CR-01', w: 'Apollo 11 descent profile adapted to the pole', m: 'Flight Director · 12 Nov 2026', t: U(2026, 11, 12, 15, 40) },
      { id: 'CR-01', w: 'Zone A · Connecting Ridge RoI 6 confirmed for the landing', m: 'Coordination · 10 Nov 2026', t: U(2026, 11, 10, 11, 5) },
      { id: 'CR-02', w: 'Safe backup route for the walk', m: 'Planning · 8 Nov 2026', t: U(2026, 11, 8, 16, 30) }
    ];
    var a = approvedAt();
    if (a !== null) out.unshift({ id: 'CR-02', w: 'Scientific route, with mandatory return at stop 2', m: 'Coordination · ' + fmtDay(a) + ' · ' + hhmm(a) + ' UTC', t: a, fresh: Date.now() - a < 10000 });
    return out;
  }

  /* ---------- bitácora de movimientos ---------- */
  /* t: terreno local (para medir la caminata y la ruta corta sobre el relieve) */
  function movements(t) {
    var sci = M.routeStats(t, 'science'), short = M.routeStats(t, 'short'), safe = M.routeStats(t, 'safe');
    var log = [
      [U(2026, 10, 2, 9, 15), 'DG-04', 'plan', 'Science team', 'Opens the draft: sampling at the de Gerlache rim', 'planificar.html'],
      [U(2026, 10, 6, 14, 30), 'CR-01', 'dato', 'Data', 'Loads the 5 m DTM of Connecting Ridge and the LOLA LDEM_75S', 'index.html'],
      [U(2026, 10, 9, 11, 0), 'PS-03', 'plan', 'Planning', 'Registers the mission: survey of the peak next to Shackleton', 'index.html'],
      [U(2026, 10, 14, 16, 20), 'CR-01', 'sim', 'Planning', '18.6-year illumination sweep over zones A, B and C (Mazarico 2011)', 'index.html'],
      [U(2026, 10, 20, 10, 5), 'CR-01', 'rev', 'Coordination', 'Changes zone C to RoI 4 on the Shackleton rim: the mosaic centre falls on the inner wall (11% Sun)', 'index.html'],
      [U(2026, 10, 23, 13, 45), 'CR-01', 'sim', 'Flight Director', 'First simulated descent with the Apollo 11 profile: P63 · P64 · P66 in 11 min 50 s', 'index.html'],
      [U(2026, 10, 28, 9, 30), 'PS-03', 'rev', 'Coordination', 'Put under review: without a local illumination series the date cannot be set', 'index.html'],
      [U(2026, 11, 2, 12, 10), 'CR-02', 'plan', 'Planning', 'Draws three routes for the walk: safe, short and scientific', 'planificar.html'],
      [U(2026, 11, 3, 15, 0), 'CR-02', 'sim', 'Planning', 'Short route not viable: one stretch reaches ' + M.num(short.pmax, 1) + '°, above the 15° limit', 'planificar.html'],
      [U(2026, 11, 5, 8, 20), 'CR-01', 'dato', 'Navigation', 'JPL Horizons DE441 ephemeris for Dec 2026: Sun at +2.7° at contact (panel at 2 m)', 'index.html'],
      [U(2026, 11, 8, 16, 30), 'CR-02', 'dec', 'Planning', 'Approves the safe route as backup (' + M.num(safe.distKm, 1) + ' km, max slope ' + M.num(safe.pmax, 1) + '°)', 'planificar.html'],
      [U(2026, 11, 10, 11, 5), 'CR-01', 'dec', 'Coordination', 'Confirms zone A · Connecting Ridge for the landing', 'index.html'],
      [U(2026, 11, 11, 14, 0), 'CR-01', 'sim', 'Flight Director', 'Second simulated descent: the line of sight to the Sun holds through P64', 'index.html'],
      [U(2026, 11, 12, 9, 50), 'CR-01', 'dato', 'Navigation', 'Earth is at +6.5° at contact (antenna at 2 m): direct link, no relay', 'index.html'],
      [U(2026, 11, 12, 15, 40), 'CR-01', 'dec', 'Flight Director', 'Approves the Apollo 11 descent profile adapted to the pole', 'index.html'],
      [U(2026, 11, 13, 10, 25), 'CR-02', 'sim', 'Planning', 'Dry run of the scientific route: two stops, no stretches beyond the limit', 'planificar.html'],
      [U(2026, 11, 13, 17, 5), 'CR-02', 'plan', 'Planning', 'Sends the scientific route for sign-off: ' + M.num(sci.distKm, 1) + ' km, max slope ' + M.num(sci.pmax, 1) + '°, O₂ on return 26%', 'planificar.html'],
      [U(2026, 11, 14, 8, 10), 'DG-04', 'plan', 'Science team', 'Adds three sampling points to the draft', 'planificar.html'],
      /* programados */
      [U(2026, 12, 15, 16, 0), 'CR-01', 'op', 'Flight Director', 'Final campaign Go/No-Go', 'index.html'],
      [CONTACT - DESCENT_S * 1000, 'CR-01', 'op', 'Flight Director', 'P63 · braking begins from 15 km altitude', 'index.html'],
      [CONTACT - Math.round(DESCENT_S * 0.38) * 1000, 'CR-01', 'op', 'Flight Director', 'P64 · approach with the site in view', 'index.html'],
      [CONTACT - Math.round(DESCENT_S * 0.07) * 1000, 'CR-01', 'op', 'Flight Director', 'P66 · vertical descent', 'index.html'],
      [CONTACT, 'CR-01', 'op', 'Flight Director', 'Contact in zone A · Connecting Ridge RoI 6', 'index.html']
    ];
    /* caminata medida sobre el relieve: 2,2 km/h y 20 min por parada */
    var near = function (x, y) { var b = 1e9, s = 0; sci.prof.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (d < b) { b = d; s = p.s; } }); return s; };
    var ms = function (m) { return m / 1000 / M.WALK_KMH * 3600000; }, stop = 20 * 60000;
    var s1 = near(560, 520), s2 = near(860, 600), end = sci.distM;
    var t1 = EVA + ms(s1), t2 = t1 + stop + ms(s2 - s1), t3 = t2 + stop + ms(end - s2), t4 = t3 + ms(end);
    var eva = approvedAt() !== null;
    log.push(
      [EVA, 'CR-02', 'op', 'EVA', 'Leaves the lander on the ' + (eva ? 'scientific' : 'scientific (pending sign-off)') + ' route', 'planificar.html'],
      [t1, 'CR-02', 'op', 'EVA', 'Stop 1 · lit rim, at ' + M.num(s1 / 1000, 1) + ' km', 'planificar.html'],
      [t2, 'CR-02', 'op', 'EVA', 'Stop 2 · permanent shadow with possible ice, at ' + M.num(s2 / 1000, 1) + ' km', 'planificar.html'],
      [t2 + stop, 'CR-02', 'dec', 'Coordination', 'Decision point: mandatory return if O₂ use runs above forecast', 'planificar.html'],
      [t3, 'CR-02', 'op', 'EVA', 'Arrival at the Shackleton rim, at ' + M.num(end / 1000, 1) + ' km', 'planificar.html'],
      [t4, 'CR-02', 'op', 'EVA', 'Return to the lander · ' + M.hm(sci.timeH) + ' in total', 'planificar.html'],
      [STAY_END, 'CR-01', 'op', 'Flight Director', 'Liftoff at the end of the 3-day stay on the surface', 'index.html'],
      [U(2027, 1, 7, 20), 'PS-03', 'rev', 'Planning', 'Deadline to choose the date: at the peak (RoI 2) the Sun is cut off on 28 Jan', 'index.html']
    );
    var a = approvedAt();
    if (a !== null) log.push([a, 'CR-02', 'dec', 'Coordination', 'Approves the scientific route with mandatory return at stop 2', 'planificar.html', true]);
    return log.map(function (r) { return { t: r[0], id: r[1], type: r[2], who: r[3], text: r[4], href: r[5], fresh: !!r[6] && Date.now() - r[0] < 10000 }; })
      .sort(function (x, y) { return x.t - y.t; });
  }

  /* ---------- formato ---------- */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ts) { var d = new Date(ts); return two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()); }
  function fmtDay(ts) { var d = new Date(ts); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function fmtDayLong(ts) { var d = new Date(ts); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

  root.Lunar.Campaign = {
    CONTACT: CONTACT, EVA: EVA, SUN: SUN, SUN_B: SUN_B, STAY_END: STAY_END, SITES: SITES, TYPES: TYPES, STATUS_LABEL: STATUS_LABEL, DAYS: DAYS, MONTHS: MONTHS, U: U,
    missions: missions, decisions: decisions, movements: movements,
    approvedAt: approvedAt, approve: approve, resetApproval: resetApproval,
    two: two, hhmm: hhmm, fmtDay: fmtDay, fmtDayLong: fmtDayLong, KEY: KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
