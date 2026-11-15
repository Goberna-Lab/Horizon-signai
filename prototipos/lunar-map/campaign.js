/* Lunar Map · campaña del polo sur compartida entre Inicio y Asistente.
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
    { id: 'CR-01', name: 'Alunizaje en Connecting Ridge', meta: '18 dic 2026 · 09:00 UTC · Zona A', status: 'GO', site: 'A', bars: ['ok', 'ok', 'ok', 'warn', 'ok'], legend: 'comb · luz · Sol · Tierra · noche', href: 'index.html' },
    { id: 'CR-02', name: 'Caminata científica al borde de Shackleton', meta: '19 dic 2026 · 10:00 UTC · 2 paradas', status: 'PEND', site: 'A', bars: ['ok', 'warn', 'ok', 'ok', 'ok'], legend: 'pend · O₂ · energía · Tierra · luz', href: 'planificar.html' },
    { id: 'PS-03', name: 'Reconocimiento del pico junto a Shackleton', meta: 'ene 2027 · fecha por elegir · Zona B', status: 'REV', site: 'B', bars: ['ok', 'ok', 'warn', 'warn', 'warn'], legend: 'comb · luz · Sol · Tierra · noche', href: 'index.html' },
    { id: 'DG-04', name: 'Muestreo en el borde de de Gerlache', meta: 'sin fecha · borrador del equipo científico', status: 'DRAFT', site: 'D', bars: ['ok', 'none', 'none', 'none', 'none'], legend: 'comb · luz · Sol · Tierra · noche', href: 'planificar.html' }
  ];
  var STATUS_LABEL = { GO: 'GO', PEND: 'POR APROBAR', REV: 'REVISAR', DRAFT: 'BORRADOR', OK: 'APROBADA' };
  var SITES = {
    A: { x: 294, y: 402, name: 'Connecting Ridge · RoI 6' },
    B: { x: 862, y: 518, name: 'Pico cerca de Shackleton · RoI 2' },
    D: { x: 300, y: 560, name: 'Borde de de Gerlache' }
  };
  /* Sol sobre el horizonte real, con el panel a 2 m (motor de Horizon Signal: JPL Horizons DE441 + horizonte LOLA/PGDA):
   * en la zona A (Connecting Ridge RoI 6) no se pone entre octubre y enero; en el pico cerca de Shackleton (RoI 2, misión
   * PS-03) se corta por primera vez el 28 ene 2027. La estadía de CR-01 dura 3 días desde el contacto. */
  var SUN = [[U(2026, 10, 1), U(2027, 2, 1)]];
  var SUN_B = [U(2027, 1, 1), U(2027, 1, 28, 9)];
  var STAY_END = CONTACT + 3 * 86400000;

  var TYPES = {
    dec: { label: 'Decisión', short: 'DEC' },
    plan: { label: 'Planificación', short: 'PLAN' },
    sim: { label: 'Simulación', short: 'SIM' },
    dato: { label: 'Datos', short: 'DATOS' },
    rev: { label: 'Revisión', short: 'REV' },
    op: { label: 'Operación', short: 'OP' }
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
      { id: 'CR-01', w: 'Perfil de descenso del Apollo 11 adaptado al polo', m: 'Dirección de vuelo · 12 nov 2026', t: U(2026, 11, 12, 15, 40) },
      { id: 'CR-01', w: 'Zona A · Connecting Ridge RoI 6 confirmada para el alunizaje', m: 'Coordinación · 10 nov 2026', t: U(2026, 11, 10, 11, 5) },
      { id: 'CR-02', w: 'Ruta segura de respaldo para la caminata', m: 'Planificación · 8 nov 2026', t: U(2026, 11, 8, 16, 30) }
    ];
    var a = approvedAt();
    if (a !== null) out.unshift({ id: 'CR-02', w: 'Ruta científica, con retorno obligatorio en la parada 2', m: 'Coordinación · ' + fmtDay(a) + ' · ' + hhmm(a) + ' UTC', t: a, fresh: Date.now() - a < 10000 });
    return out;
  }

  /* ---------- bitácora de movimientos ---------- */
  /* t: terreno local (para medir la caminata y la ruta corta sobre el relieve) */
  function movements(t) {
    var sci = M.routeStats(t, 'science'), short = M.routeStats(t, 'short'), safe = M.routeStats(t, 'safe');
    var log = [
      [U(2026, 10, 2, 9, 15), 'DG-04', 'plan', 'Equipo científico', 'Abre el borrador: muestreo en el borde de de Gerlache', 'planificar.html'],
      [U(2026, 10, 6, 14, 30), 'CR-01', 'dato', 'Datos', 'Carga el DTM de 5 m de Connecting Ridge y el LDEM_75S de LOLA', 'index.html'],
      [U(2026, 10, 9, 11, 0), 'PS-03', 'plan', 'Planificación', 'Da de alta la misión: reconocimiento del pico junto a Shackleton', 'index.html'],
      [U(2026, 10, 14, 16, 20), 'CR-01', 'sim', 'Planificación', 'Barrido de iluminación de 18,6 años sobre las zonas A, B y C (Mazarico 2011)', 'index.html'],
      [U(2026, 10, 20, 10, 5), 'CR-01', 'rev', 'Coordinación', 'Cambia la zona C a la RoI 4 del borde de Shackleton: el centro del mosaico cae en la pared interior (11 % de Sol)', 'index.html'],
      [U(2026, 10, 23, 13, 45), 'CR-01', 'sim', 'Dirección de vuelo', 'Primer descenso simulado con el perfil del Apollo 11: P63 · P64 · P66 en 11 min 50 s', 'index.html'],
      [U(2026, 10, 28, 9, 30), 'PS-03', 'rev', 'Coordinación', 'Queda en revisión: sin serie local de iluminación no se puede fijar la fecha', 'index.html'],
      [U(2026, 11, 2, 12, 10), 'CR-02', 'plan', 'Planificación', 'Traza tres rutas para la caminata: segura, corta y científica', 'planificar.html'],
      [U(2026, 11, 3, 15, 0), 'CR-02', 'sim', 'Planificación', 'Ruta corta no viable: un tramo llega a ' + M.num(short.pmax, 1) + '°, por encima del límite de 15°', 'planificar.html'],
      [U(2026, 11, 5, 8, 20), 'CR-01', 'dato', 'Navegación', 'Efemérides JPL Horizons DE441 para dic 2026: Sol a +2,7° en el contacto (panel a 2 m)', 'index.html'],
      [U(2026, 11, 8, 16, 30), 'CR-02', 'dec', 'Planificación', 'Aprueba la ruta segura como respaldo (' + M.num(safe.distKm, 1) + ' km, pend. máx. ' + M.num(safe.pmax, 1) + '°)', 'planificar.html'],
      [U(2026, 11, 10, 11, 5), 'CR-01', 'dec', 'Coordinación', 'Confirma la zona A · Connecting Ridge para el alunizaje', 'index.html'],
      [U(2026, 11, 11, 14, 0), 'CR-01', 'sim', 'Dirección de vuelo', 'Segundo descenso simulado: la línea de vista sobre el Sol se mantiene en P64', 'index.html'],
      [U(2026, 11, 12, 9, 50), 'CR-01', 'dato', 'Navegación', 'La Tierra queda a +6,5° en el contacto (antena a 2 m): enlace directo, sin relé', 'index.html'],
      [U(2026, 11, 12, 15, 40), 'CR-01', 'dec', 'Dirección de vuelo', 'Aprueba el perfil de descenso del Apollo 11 adaptado al polo', 'index.html'],
      [U(2026, 11, 13, 10, 25), 'CR-02', 'sim', 'Planificación', 'Ensayo de la ruta científica: dos paradas, sin tramos fuera de límite', 'planificar.html'],
      [U(2026, 11, 13, 17, 5), 'CR-02', 'plan', 'Planificación', 'Envía a firma la ruta científica: ' + M.num(sci.distKm, 1) + ' km, pend. máx. ' + M.num(sci.pmax, 1) + '°, O₂ al volver 26 %', 'planificar.html'],
      [U(2026, 11, 14, 8, 10), 'DG-04', 'plan', 'Equipo científico', 'Añade tres puntos de muestreo al borrador', 'planificar.html'],
      /* programados */
      [U(2026, 12, 15, 16, 0), 'CR-01', 'op', 'Dirección de vuelo', 'Go/No-go final de la campaña', 'index.html'],
      [CONTACT - DESCENT_S * 1000, 'CR-01', 'op', 'Dirección de vuelo', 'P63 · empieza el frenado desde 15 km de altura', 'index.html'],
      [CONTACT - Math.round(DESCENT_S * 0.38) * 1000, 'CR-01', 'op', 'Dirección de vuelo', 'P64 · aproximación con el sitio a la vista', 'index.html'],
      [CONTACT - Math.round(DESCENT_S * 0.07) * 1000, 'CR-01', 'op', 'Dirección de vuelo', 'P66 · descenso vertical', 'index.html'],
      [CONTACT, 'CR-01', 'op', 'Dirección de vuelo', 'Contacto en la zona A · Connecting Ridge RoI 6', 'index.html']
    ];
    /* caminata medida sobre el relieve: 2,2 km/h y 20 min por parada */
    var near = function (x, y) { var b = 1e9, s = 0; sci.prof.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (d < b) { b = d; s = p.s; } }); return s; };
    var ms = function (m) { return m / 1000 / M.WALK_KMH * 3600000; }, stop = 20 * 60000;
    var s1 = near(560, 520), s2 = near(860, 600), end = sci.distM;
    var t1 = EVA + ms(s1), t2 = t1 + stop + ms(s2 - s1), t3 = t2 + stop + ms(end - s2), t4 = t3 + ms(end);
    var eva = approvedAt() !== null;
    log.push(
      [EVA, 'CR-02', 'op', 'EVA', 'Salida del módulo por la ruta ' + (eva ? 'científica' : 'científica (pendiente de firma)'), 'planificar.html'],
      [t1, 'CR-02', 'op', 'EVA', 'Parada 1 · borde iluminado, a ' + M.num(s1 / 1000, 1) + ' km', 'planificar.html'],
      [t2, 'CR-02', 'op', 'EVA', 'Parada 2 · sombra permanente con posible hielo, a ' + M.num(s2 / 1000, 1) + ' km', 'planificar.html'],
      [t2 + stop, 'CR-02', 'dec', 'Coordinación', 'Punto de decisión: retorno obligatorio si el O₂ va por encima de lo previsto', 'planificar.html'],
      [t3, 'CR-02', 'op', 'EVA', 'Llegada al borde de Shackleton, a ' + M.num(end / 1000, 1) + ' km', 'planificar.html'],
      [t4, 'CR-02', 'op', 'EVA', 'Regreso al módulo · ' + M.hm(sci.timeH) + ' en total', 'planificar.html'],
      [STAY_END, 'CR-01', 'op', 'Dirección de vuelo', 'Despegue al final de la estadía de 3 días en superficie', 'index.html'],
      [U(2027, 1, 7, 20), 'PS-03', 'rev', 'Planificación', 'Plazo para elegir la fecha: en el pico (RoI 2) el Sol se corta el 28 ene', 'index.html']
    );
    var a = approvedAt();
    if (a !== null) log.push([a, 'CR-02', 'dec', 'Coordinación', 'Aprueba la ruta científica con retorno obligatorio en la parada 2', 'planificar.html', true]);
    return log.map(function (r) { return { t: r[0], id: r[1], type: r[2], who: r[3], text: r[4], href: r[5], fresh: !!r[6] && Date.now() - r[0] < 10000 }; })
      .sort(function (x, y) { return x.t - y.t; });
  }

  /* ---------- formato ---------- */
  var DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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
