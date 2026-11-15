/* Comprobación en Node: iluminación de los puntos clave y pendientes a lo largo de las rutas */
require('../terrain.js');
const L = globalThis.Lunar;

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return { x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x, y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y };
}
function samplePath(d, n) {
  const tok = d.match(/[MCSL]|-?[\d.]+/g); let i = 0, cur = null, pts = [], last2 = null;
  const num = () => parseFloat(tok[i++]);
  const segs = [];
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cur = { x: num(), y: num() }; }
    else if (c === 'L') { const p = { x: num(), y: num() }; segs.push([cur, cur, p, p]); cur = p; last2 = p; }
    else if (c === 'C') { const a = { x: num(), y: num() }, b = { x: num(), y: num() }, p = { x: num(), y: num() }; segs.push([cur, a, b, p]); last2 = b; cur = p; }
    else if (c === 'S') { const b = { x: num(), y: num() }, p = { x: num(), y: num() }; const a = last2 ? { x: 2*cur.x - last2.x, y: 2*cur.y - last2.y } : cur; segs.push([cur, a, b, p]); last2 = b; cur = p; }
  }
  segs.forEach(s => { for (let k = 0; k < n; k++) pts.push(bez(s[0], s[1], s[2], s[3], k / n)); });
  pts.push(cur); return pts;
}

let t0 = Date.now();
const t = L.localScene();
console.log('local build ms', Date.now() - t0, 'min', t.min.toFixed(0), 'max', t.max.toFixed(0));
const pts = { modulo: [430, 640], parada1: [560, 520], parada2: [860, 600], borde: [1000, 300], hondonada: [880, 612], peligro: [760, 380] };
for (const k in pts) {
  const [x, y] = pts[k];
  console.log(k.padEnd(10), 'h', L.heightAt(t, x, y).toFixed(1), 'sombra', L.shadowAt(t, x, y).toFixed(2), 'tono', L.toneAt(t, x, y).toFixed(2), 'pend', (L.slopeAt(t, x, y) * 180 / Math.PI).toFixed(1));
}
const routes = {
  safe: 'M430 640 C 520 660, 640 660, 760 620 S 860 560, 890 500 S 905 400, 1000 300',
  short: 'M430 640 C 520 590, 620 510, 700 450 L 830 330 C 880 300, 950 296, 1000 300',
  science: 'M430 640 C 470 590, 510 540, 560 520 S 760 570, 860 600 S 885 520, 893 470 S 905 390, 1000 300'
};
for (const k in routes) {
  const ps = L.samplePath(routes[k], 40);
  let mx = 0, over = 0, shadowed = 0;
  ps.forEach(p => { const s = L.slopeAt(t, p.x, p.y) * 180 / Math.PI; if (s > mx) mx = s; if (s > 15) over++; if (L.toneAt(t, p.x, p.y) < 0.08) shadowed++; });
  console.log(k.padEnd(8), 'pend max', mx.toFixed(1), 'muestras >15°', over, '/', ps.length, 'en sombra', shadowed);
}
// fracción del mapa en sombra
let sh = 0; for (let i = 0; i < t.shadow.length; i++) sh += t.shadow[i] < 0.5 ? 1 : 0;
console.log('fraccion en sombra', (sh / t.shadow.length).toFixed(2));

t0 = Date.now();
const p = L.polarScene();
console.log('polar build ms', Date.now() - t0, 'min', p.min.toFixed(0), 'max', p.max.toFixed(0));
[['A', 292, 406], ['B', 862, 518], ['C', 431, 336], ['polo', 444, 239], ['shack centro', 555, 329]].forEach(z => {
  console.log(z[0].padEnd(12), 'h', L.heightAt(p, z[1], z[2]).toFixed(0), 'sombra', L.shadowAt(p, z[1], z[2]).toFixed(2), 'tono', L.toneAt(p, z[1], z[2]).toFixed(2));
});
sh = 0; for (let i = 0; i < p.shadow.length; i++) sh += p.shadow[i] < 0.5 ? 1 : 0;
console.log('fraccion en sombra polar', (sh / p.shadow.length).toFixed(2));
