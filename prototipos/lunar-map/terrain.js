/* Lunar Map · motor de terreno procedural
 * Genera un mapa de alturas (metros) sobre una malla, lo ilumina con un sol rasante
 * (Lambert + sombras proyectadas por marcha de rayos) y lo rasteriza a canvas.
 * Coordenadas de "escena" en px (las mismas que usan los SVG de las pantallas);
 * cada celda de la malla cubre `pxPerCell` px y `cell` metros.
 */
(function (root) {
  'use strict';

  /* ---------- aleatoriedad reproducible ---------- */
  function Rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* ---------- ruido de gradiente 2D (Perlin) ---------- */
  var perm = new Uint8Array(512);
  (function () {
    var r = Rng(90210), p = [], i, j, t;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  var GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function noise2(x, y) {
    var X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    var a = perm[perm[xi] + yi], b = perm[perm[xi + 1] + yi], c = perm[perm[xi] + yi + 1], d = perm[perm[xi + 1] + yi + 1];
    var u = fade(xf), v = fade(yf);
    var n00 = GX[a & 7] * xf + GY[a & 7] * yf, n10 = GX[b & 7] * (xf - 1) + GY[b & 7] * yf;
    var n01 = GX[c & 7] * xf + GY[c & 7] * (yf - 1), n11 = GX[d & 7] * (xf - 1) + GY[d & 7] * (yf - 1);
    var nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.41;
  }
  function fbm(x, y, oct, gain, lac) {
    var a = 1, f = 1, s = 0, n = 0, i;
    for (i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }

  /* ---------- construcción del mapa de alturas ---------- */
  function makeTerrain(cfg) {
    var cols = cfg.cols, rows = cfg.rows, ppc = cfg.pxPerCell || 1, cell = cfg.cell;
    var h = new Float32Array(cols * rows);
    var i, j, idx, px, py;
    var datum = cfg.datum || 0, ox = cfg.ox || 0, oy = cfg.oy || 0;
    var bAmp = cfg.baseAmp || 0, bF = cfg.baseFreq || 0.002, fAmp = cfg.fineAmp || 0, fF = cfg.fineFreq || 0.03;

    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        px = i * ppc + ox; py = j * ppc + oy;
        var v = datum;
        if (bAmp) v += bAmp * fbm(px * bF + 11.7, py * bF + 3.9, 4, cfg.baseGain || 0.5, 2.1);
        if (fAmp) v += fAmp * fbm(px * fF + 7.3, py * fF + 2.1, 3, 0.55, 2.3);
        h[j * cols + i] = v;
      }
    }

    /* crestas: gaussiana alrededor de un segmento, modulada por ruido */
    (cfg.ridges || []).forEach(function (r) {
      var ax = (r.x1 - ox) / ppc, ay = (r.y1 - oy) / ppc, bx = (r.x2 - ox) / ppc, by = (r.y2 - oy) / ppc;
      var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy, w = r.width / ppc;
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var t = ((i - ax) * vx + (j - ay) * vy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        var qx = ax + vx * t, qy = ay + vy * t, dx = i - qx, dy = j - qy;
        var d2 = dx * dx + dy * dy;
        var m = 1 + (r.wobble || 0.35) * noise2(i * ppc * 0.0025 + 3.1, j * ppc * 0.0025);
        h[j * cols + i] += r.height * m * Math.exp(-d2 / (2 * w * w));
      }
    });

    /* lomas y picos */
    (cfg.knolls || []).forEach(function (k) {
      var cx = (k.x - ox) / ppc, cy = (k.y - oy) / ppc, R = k.r / ppc, ext = R * 2.6;
      var j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(rows - 1, Math.ceil(cy + ext));
      var i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(cols - 1, Math.ceil(cx + ext));
      for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) {
        var dx = i - cx, dy = j - cy, d = Math.sqrt(dx * dx + dy * dy) / R;
        var m = 1 + 0.12 * noise2(i * 0.05, j * 0.05);
        h[j * cols + i] += k.height * m * Math.exp(-d * d * 0.9);
      }
    });

    /* cráteres: estampado por caja envolvente */
    function stamp(c) {
      var cx = (c.x - ox) / ppc, cy = (c.y - oy) / ppc, R = c.R / ppc, ext = R * (c.ext || 1.9);
      var realR = c.R * (cell / ppc); /* radio en metros */
      var D = c.D != null ? c.D : realR * 0.2;
      var fr = c.floor != null ? c.floor : (realR > 2500 ? 0.5 : realR > 400 ? 0.3 : 0.08);
      var rim = c.rim != null ? c.rim : D * 0.14, rimW = c.rimW || 0.12, extR = c.ext || 1.9;
      var wob = c.wobble != null ? c.wobble : 0.08;
      var j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(rows - 1, Math.ceil(cy + ext));
      var i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(cols - 1, Math.ceil(cx + ext));
      var nf = 1.2 / R, tf = 6 / R; /* frecuencias de ruido relativas al tamaño del cráter */
      for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) {
        var dx = i - cx, dy = j - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > ext) continue;
        var ang = Math.atan2(dy, dx);
        var w = 1 + wob * noise2(Math.cos(ang) * 2.1 + c.x * 0.013, Math.sin(ang) * 2.1 + c.y * 0.013);
        var r = d / (R * w), dz = 0;
        if (r < 1) {
          var t = r < fr ? 0 : (r - fr) / (1 - fr);
          dz = -D * (1 - t * t);
          dz += D * 0.03 * noise2(i * tf + c.x * 0.01, j * tf) * t;           /* terrazas */
          if (r < fr) dz += D * 0.015 * noise2(i * tf * 3, j * tf * 3);         /* suelo rugoso */
        }
        var e = (r - 1) / rimW;
        dz += rim * Math.exp(-e * e);                                        /* borde */
        if (r > 1) {                                                         /* manto de eyecta, se funde con el terreno en ext */
          var fade = 1 - (r - 1) / (extR - 1); fade = fade < 0 ? 0 : fade * fade;
          dz += rim * 0.45 * Math.exp(-(r - 1) / 0.32) * (1 + 0.35 * noise2(i * nf + 9, j * nf)) * fade;
        }
        h[j * cols + i] += dz;
      }
    }
    (cfg.craters || []).forEach(stamp);

    /* campo de cráteres pequeños, tamaños en ley de potencias */
    if (cfg.smallCraters) {
      var sc = cfg.smallCraters, rng = Rng(sc.seed || 7), n = 0, tries = 0, avoid = sc.avoid || [];
      while (n < sc.count && tries < sc.count * 20) {
        tries++;
        var x = ox + rng() * cols * ppc, y = oy + rng() * rows * ppc;
        var u = rng(); var R = sc.rmin + (sc.rmax - sc.rmin) * Math.pow(u, 3.2);
        var ok = true;
        for (var a = 0; a < avoid.length; a++) {
          var ddx = x - avoid[a].x, ddy = y - avoid[a].y;
          if (ddx * ddx + ddy * ddy < (avoid[a].r + R * 1.4) * (avoid[a].r + R * 1.4)) { ok = false; break; }
        }
        if (!ok) continue;
        var fresh = rng() < 0.18;
        stamp({ x: x, y: y, R: R, rim: fresh ? undefined : (R * cell / ppc) * 0.2 * 0.06, floor: 0.12, wobble: 0.1, ext: fresh ? 2.2 : 1.6 });
        n++;
      }
    }

    var t = { cols: cols, rows: rows, cell: cell, ppc: ppc, ox: ox, oy: oy, h: h, mpp: cell / ppc };

    /* normaliza a una cota conocida */
    if (cfg.anchor) {
      var cur = sampleGrid(t, h, (cfg.anchor.x - ox) / ppc, (cfg.anchor.y - oy) / ppc);
      var off = cfg.anchor.z - cur;
      for (idx = 0; idx < h.length; idx++) h[idx] += off;
    }
    var mn = 1e9, mx = -1e9;
    for (idx = 0; idx < h.length; idx++) { if (h[idx] < mn) mn = h[idx]; if (h[idx] > mx) mx = h[idx]; }
    t.min = mn; t.max = mx;
    return t;
  }

  function sampleGrid(t, arr, gx, gy) {
    var cols = t.cols, rows = t.rows;
    if (gx < 0) gx = 0; if (gy < 0) gy = 0;
    if (gx > cols - 1.001) gx = cols - 1.001; if (gy > rows - 1.001) gy = rows - 1.001;
    var x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * cols + x0;
    var a = arr[i], b = arr[i + 1], c = arr[i + cols], d = arr[i + cols + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  /* ---------- iluminación ---------- */
  /* sun: { ax, ay: dirección horizontal unitaria HACIA el sol en coords de escena (x→derecha, y→abajo); el: elevación en rad } */
  function light(t, sun, opts) {
    opts = opts || {};
    var cols = t.cols, rows = t.rows, cell = t.cell, h = t.h, n = cols * rows;
    var cosE = Math.cos(sun.el), lx = cosE * sun.ax, ly = cosE * sun.ay, lz = Math.sin(sun.el), tanE = Math.tan(sun.el);
    var lam = new Float32Array(n), slope = new Float32Array(n), shadow = new Float32Array(n);
    var maxDist = opts.maxShadowCells || 2000, i, j, idx;
    var maxH = t.max;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        idx = j * cols + i;
        var hl = h[idx - (i > 0 ? 1 : 0)], hr = h[idx + (i < cols - 1 ? 1 : 0)];
        var hu = h[idx - (j > 0 ? cols : 0)], hd = h[idx + (j < rows - 1 ? cols : 0)];
        var gx = (hr - hl) / (2 * cell), gy = (hd - hu) / (2 * cell);
        var inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        var l = (-gx * lx - gy * ly + lz) * inv;
        lam[idx] = l > 0 ? l : 0;
        slope[idx] = Math.atan(Math.sqrt(gx * gx + gy * gy));
        var sh = 1;
        if (l > 0) {
          var h0 = h[idx] + 0.6, dist = 0, step = 0.9;
          while (true) {
            dist += step;
            var x = i + sun.ax * dist, y = j + sun.ay * dist;
            if (x < 0 || y < 0 || x >= cols - 1 || y >= rows - 1 || dist > maxDist) break;
            var rayH = h0 + tanE * dist * cell;
            if (rayH > maxH) break;
            var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, k = y0 * cols + x0;
            var th = (h[k] + (h[k + 1] - h[k]) * fx) * (1 - fy) + (h[k + cols] + (h[k + cols + 1] - h[k + cols]) * fx) * fy;
            if (th > rayH) { sh = 0; break; }
            step *= 1.035;
          }
        }
        shadow[idx] = sh;
      }
    }
    /* penumbra: suaviza el borde de sombra con un desenfoque 3×3 */
    var soft = new Float32Array(n);
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      var s = 0, c = 0, dj, di;
      for (dj = -1; dj <= 1; dj++) for (di = -1; di <= 1; di++) {
        var jj = j + dj, ii = i + di;
        if (jj < 0 || ii < 0 || jj >= rows || ii >= cols) continue;
        s += shadow[jj * cols + ii]; c++;
      }
      soft[j * cols + i] = s / c;
    }
    t.lam = lam; t.slope = slope; t.shadow = soft; t.sun = sun;

    /* tono final 0..1 (sin gamma), incluye albedo variable y luz de la Tierra en sombra */
    var tone = new Float32Array(n), k = opts.exposure || 6, amb = opts.ambient != null ? opts.ambient : 0.012;
    var albF = opts.albedoFreq || 0.035, ppc = t.ppc;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      idx = j * cols + i;
      var alb = 1 + 0.22 * fbm(i * ppc * albF + 31, j * ppc * albF + 17, 2, 0.5, 2.2);
      var hiRim = 1 + 0.35 * Math.min(1, Math.max(0, (t.slope[idx] - 0.35) / 0.4)); /* laderas frescas más claras */
      var L = lam[idx] * soft[idx] * alb * hiRim;
      tone[idx] = (1 - Math.exp(-L * k)) + amb * soft[idx] + amb * 0.4 * (1 - soft[idx]);
    }
    t.tone = tone;
    return t;
  }

  /* ---------- rasterizado ---------- */
  function renderRelief(t, opts) {
    opts = opts || {};
    var cols = t.cols, rows = t.rows, cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(cols, rows), d = img.data;
    var rng = Rng(opts.seed || 3), grain = opts.grain != null ? opts.grain : 7;
    var tint = opts.tint || [1, 0.985, 0.955];
    for (var idx = 0; idx < cols * rows; idx++) {
      var v = t.tone[idx]; if (v > 1) v = 1;
      var g = Math.pow(v, 0.92) * 255 + (rng() - 0.5) * grain;
      var sh = t.shadow[idx];
      var o = idx * 4;
      d[o] = clamp(g * tint[0] + (1 - sh) * 2);
      d[o + 1] = clamp(g * tint[1] + (1 - sh) * 3);
      d[o + 2] = clamp(g * tint[2] + (1 - sh) * 7);
      d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* máscara coloreada: fn(idx) → alfa 0..1 */
  function renderMask(t, fn, rgb) {
    var cols = t.cols, rows = t.rows, cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(cols, rows), d = img.data;
    for (var idx = 0; idx < cols * rows; idx++) {
      var a = fn(idx); if (a <= 0) continue;
      var o = idx * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = clamp(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* curvas de nivel */
  function renderContours(t, interval, rgba, bold) {
    var cols = t.cols, rows = t.rows, cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(cols, rows), d = img.data, h = t.h;
    for (var j = 0; j < rows - 1; j++) for (var i = 0; i < cols - 1; i++) {
      var idx = j * cols + i, b0 = Math.floor(h[idx] / interval);
      var b1 = Math.floor(h[idx + 1] / interval), b2 = Math.floor(h[idx + cols] / interval);
      if (b0 !== b1 || b0 !== b2) {
        var major = (Math.max(b0, b1, b2) % (bold || 5)) === 0;
        var o = idx * 4; d[o] = rgba[0]; d[o + 1] = rgba[1]; d[o + 2] = rgba[2]; d[o + 3] = major ? rgba[3] : rgba[3] * 0.55;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* muestreo en coordenadas de escena (px) */
  function heightAt(t, px, py) { return sampleGrid(t, t.h, (px - t.ox) / t.ppc, (py - t.oy) / t.ppc); }
  function toneAt(t, px, py) { return sampleGrid(t, t.tone, (px - t.ox) / t.ppc, (py - t.oy) / t.ppc); }
  function slopeAt(t, px, py) { return sampleGrid(t, t.slope, (px - t.ox) / t.ppc, (py - t.oy) / t.ppc); }
  function shadowAt(t, px, py) { return sampleGrid(t, t.shadow, (px - t.ox) / t.ppc, (py - t.oy) / t.ppc); }

  /* muestrea un path SVG (solo M, L, C, S; coordenadas absolutas) en n puntos por segmento */
  function samplePath(d, n) {
    var tok = d.match(/[MLCS]|-?[\d.]+/g) || [], i = 0, cur = null, last2 = null, segs = [], pts = [];
    function num() { return parseFloat(tok[i++]); }
    while (i < tok.length) {
      var c = tok[i++];
      if (c === 'M') { cur = { x: num(), y: num() }; last2 = null; }
      else if (c === 'L') { var p = { x: num(), y: num() }; segs.push([cur, cur, p, p]); cur = p; last2 = null; }
      else if (c === 'C') { var a = { x: num(), y: num() }, b = { x: num(), y: num() }, q = { x: num(), y: num() }; segs.push([cur, a, b, q]); last2 = b; cur = q; }
      else if (c === 'S') { var b2 = { x: num(), y: num() }, q2 = { x: num(), y: num() }; var a2 = last2 ? { x: 2 * cur.x - last2.x, y: 2 * cur.y - last2.y } : cur; segs.push([cur, a2, b2, q2]); last2 = b2; cur = q2; }
    }
    var s = 0, prev = null;
    segs.forEach(function (sg) {
      for (var k = 0; k < n; k++) {
        var t = k / n, u = 1 - t;
        var x = u * u * u * sg[0].x + 3 * u * u * t * sg[1].x + 3 * u * t * t * sg[2].x + t * t * t * sg[3].x;
        var y = u * u * u * sg[0].y + 3 * u * u * t * sg[1].y + 3 * u * t * t * sg[2].y + t * t * t * sg[3].y;
        if (prev) s += Math.hypot(x - prev.x, y - prev.y);
        prev = { x: x, y: y }; pts.push({ x: x, y: y, s: s });
      }
    });
    if (cur) { if (prev) s += Math.hypot(cur.x - prev.x, cur.y - prev.y); pts.push({ x: cur.x, y: cur.y, s: s }); }
    return pts;
  }

  /* rutas de la caminata en coordenadas del mapa local (1440×900) */
  var ROUTES = {
    safe: { d: 'M430 640 C 520 660, 640 660, 760 620 S 860 560, 890 500 S 905 400, 1000 300', stops: [{ x: 760, y: 620 }] },
    short: { d: 'M430 640 C 520 590, 620 510, 700 450 L 830 330 C 880 300, 950 296, 1000 300', stops: [] },
    science: { d: 'M430 640 C 470 590, 510 540, 560 520 S 760 570, 860 600 S 885 520, 893 470 S 905 390, 1000 300', stops: [{ x: 560, y: 520 }, { x: 860, y: 600 }] }
  };

  /* ---------- escenas ---------- */

  /* Polo sur en estereográfica, viewBox 1000×800 (y de −100 a 700), 72 m/px */
  function polarScene() {
    var ppc = 1, cell = 72;
    var t = makeTerrain({
      cols: 1000, rows: 800, pxPerCell: ppc, cell: cell, oy: -100,
      datum: 0, baseAmp: 400, baseGain: 0.45, baseFreq: 1 / 420, fineAmp: 12, fineFreq: 1 / 26,
      craters: [
        { x: 555, y: 329, R: 146, D: 4200, rim: 420, floor: 0.52, wobble: 0.05 },   /* Shackleton */
        { x: 120, y: 520, R: 222, D: 2600, rim: 300, floor: 0.5, wobble: 0.07 },    /* de Gerlache */
        { x: 330, y: 40, R: 240, D: 2400, rim: 260, floor: 0.5, wobble: 0.08 },     /* cráter grande NO */
        { x: 930, y: -70, R: 210, D: 2200, rim: 240, floor: 0.5, wobble: 0.08 },    /* cráter grande NE */
        { x: 760, y: 700, R: 190, D: 2000, rim: 220, floor: 0.5, wobble: 0.08 },    /* cráter grande S */
        { x: 120, y: 90, R: 26 }, { x: 260, y: 150, R: 12 }, { x: 80, y: 300, R: 16 }, { x: 60, y: 180, R: 10 },
        { x: 720, y: 80, R: 16 }, { x: 900, y: 120, R: 20 }, { x: 820, y: 250, R: 10 }, { x: 980, y: 420, R: 12 }, { x: 360, y: 120, R: 9 },
        { x: 700, y: 440, R: 34, floor: 0.3 }, { x: 180, y: 420, R: 22 }, { x: 640, y: 560, R: 18 }, { x: 300, y: 520, R: 14 }
      ],
      knolls: [
        { x: 862, y: 518, r: 60, height: 1250 },   /* pico junto a Shackleton (zona B) */
        { x: 330, y: 400, r: 110, height: 420 }    /* lomo de Connecting Ridge */
      ],
      ridges: [{ x1: 240, y1: 470, x2: 420, y2: 330, height: 380, width: 60, wobble: 0.3 }],
      smallCraters: { count: 520, rmin: 1.6, rmax: 9, seed: 41, avoid: [{ x: 555, y: 329, r: 150 }] },
      anchor: { x: 292, y: 406, z: 1944.8 }
    });
    light(t, { ax: -0.7071, ay: -0.7071, el: 8 * Math.PI / 180 }, { exposure: 3.4, ambient: 0.012, maxShadowCells: 900 });
    return t;
  }

  /* Connecting Ridge local, viewBox 1440×900, 4.7 m/px, malla de 2 px (9.4 m).
   * Sol rasante desde el suroeste del mapa (abajo-izquierda), 5° sobre el horizonte. */
  var LOCAL_SUN = { ax: -0.6, ay: 0.8, el: 5 * Math.PI / 180 };
  function localScene(extraAvoid) {
    var ppc = 2, cell = 9.4;
    var avoid = [{ x: 430, y: 640, r: 70 }, { x: 1000, y: 300, r: 60 }].concat(extraAvoid || []);
    Object.keys(ROUTES).forEach(function (k) {
      samplePath(ROUTES[k].d, 14).forEach(function (p) { avoid.push({ x: p.x, y: p.y, r: 40 }); });
    });
    var t = makeTerrain({
      cols: 720, rows: 450, pxPerCell: ppc, cell: cell,
      datum: 1800, baseAmp: 14, baseGain: 0.45, baseFreq: 1 / 380, fineAmp: 0.35, fineFreq: 1 / 22,
      craters: [
        { x: 2900, y: -950, R: 2274, D: 4200, rim: 120, rimW: 0.22, floor: 0.5, wobble: 0.03 },  /* Shackleton */
        { x: -2200, y: 2600, R: 2500, D: 2600, rim: 150, rimW: 0.17, floor: 0.5, wobble: 0.03 }, /* de Gerlache */
        { x: 760, y: 380, R: 90, D: 95, rim: 14, floor: 0.4, wobble: 0.08 },                   /* cráter joven, laderas > 15° */
        { x: 1045, y: 530, R: 68, D: 70, rim: 10, floor: 0.4, wobble: 0.08 },                  /* segundo peligro */
        { x: 880, y: 612, R: 150, D: 17, rim: 2, floor: 0.3, wobble: 0.06 },                  /* hondonada en sombra (parada 2) */
        { x: 536, y: 552, R: 50, D: 10, rim: 2.5, floor: 0.3, wobble: 0.06 },                  /* cráter somero, borde iluminado (parada 1) */
        { x: 1120, y: 220, R: 46, D: 40, rim: 5, floor: 0.3 }, { x: 1180, y: 660, R: 28 }, { x: 300, y: 760, R: 34, D: 30, rim: 4 },
        { x: 240, y: 300, R: 22 }, { x: 620, y: 300, R: 16 }, { x: 760, y: 780, R: 14 }, { x: 1300, y: 420, R: 38, D: 36, rim: 5 },
        { x: 150, y: 560, R: 13 }, { x: 680, y: 120, R: 10 }, { x: 1340, y: 760, R: 17 }, { x: 90, y: 120, R: 11 }, { x: 420, y: 180, R: 8 },
        { x: 980, y: 150, R: 9 }, { x: 1240, y: 540, R: 8 }
      ],
      ridges: [{ x1: -100, y1: 860, x2: 1150, y2: 20, height: 115, width: 240, wobble: 0.3 }],
      knolls: [
        { x: 790, y: 790, r: 110, height: 190 },  /* loma que proyecta la sombra permanente sobre la hondonada */
        { x: 1250, y: 820, r: 140, height: 60 }, { x: 150, y: 220, r: 160, height: 45 }
      ],
      smallCraters: { count: 320, rmin: 2.5, rmax: 26, seed: 19, avoid: avoid },
      anchor: { x: 430, y: 640, z: 1944.8 }
    });
    light(t, LOCAL_SUN, { exposure: 5.5, ambient: 0.014, maxShadowCells: 1400 });
    return t;
  }

  root.Lunar = {
    Rng: Rng, noise2: noise2, fbm: fbm,
    makeTerrain: makeTerrain, light: light,
    renderRelief: renderRelief, renderMask: renderMask, renderContours: renderContours,
    heightAt: heightAt, toneAt: toneAt, slopeAt: slopeAt, shadowAt: shadowAt,
    samplePath: samplePath, ROUTES: ROUTES, polarScene: polarScene, localScene: localScene, LOCAL_SUN: LOCAL_SUN
  };
})(typeof window !== 'undefined' ? window : globalThis);
