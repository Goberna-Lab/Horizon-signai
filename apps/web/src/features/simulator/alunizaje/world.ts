// @ts-nocheck — mundo mínimo para el alunizaje: terreno del sitio, cielo, luz y el bucle de dibujo.
// Los datos salen de nuestro navegador (relieve LOLA + detalle fino alrededor de Connecting Ridge · RoI 6):
//   fine.i16  6 x 6 km a 10 m (decímetros)   ·   wide.i16  20 x 20 km a 80 m   ·   site.json  Sol, Tierra y horizonte
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import fineUrl from './data/fine.i16?url';
import wideUrl from './data/wide.i16?url';
import siteUrl from './data/site.json?url';
import { LandingSim } from './landing';
import { Sonido } from './sonido';
import { makeDetail, buildDetail, disposeDetail, DETAIL_HALF } from './detalle';
import { createAstronaut } from './astronauta';
import { Caminata } from './caminata';

const D2R = Math.PI / 180;
const SKY_D = 60000;
const RING_R = 12500;

/** Rejilla de alturas con interpolación bilineal (metros). */
function sampler(dm, n, half) {
  const st = (2 * half) / (n - 1);
  return (x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + half) / st)), fz = Math.min(n - 1.001, Math.max(0, (z + half) / st));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, o = iz * n + ix;
    return ((dm[o] * (1 - tx) + dm[o + 1] * tx) * (1 - tz) + (dm[o + n] * (1 - tx) + dm[o + n + 1] * tx) * tz) / 10;
  };
}

/** Textura de regolito: ruido de varias escalas, también como relieve fino. */
function regolith() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const rnd = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y, f) => { const u = x * f, w = y * f, iu = Math.floor(u), iw = Math.floor(w), a = u - iu, b = w - iw, q = (i, j) => rnd((iu + i) % f, (iw + j) % f);
    return (q(0, 0) * (1 - a) + q(1, 0) * a) * (1 - b) + (q(0, 1) * (1 - a) + q(1, 1) * a) * b; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 0.5 * noise(x / N, y / N, 8) + 0.3 * noise(x / N, y / N, 32) + 0.2 * rnd(x, y), k = 150 + v * 90, i = (y * N + x) * 4;
    img.data[i] = k; img.data[i + 1] = k * 0.985; img.data[i + 2] = k * 0.96; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Malla de terreno de lado 2·half con n nodos por lado; `drop` hunde la parte que tapa la malla fina. */
function terrainMesh(f, half, n, mat, drop) {
  const g = new THREE.PlaneGeometry(2 * half, 2 * half, n - 1, n - 1).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, f(x, z) - (drop ? drop(x, z) : 0)); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}

/** Monta el alunizaje dentro de `host`. Devuelve la función para desmontarlo. */
export async function startLanding(host: HTMLElement): Promise<() => void> {
  const [site, fineBuf, wideBuf] = await Promise.all([fetch(siteUrl).then((r) => r.json()), fetch(fineUrl).then((r) => r.arrayBuffer()), fetch(wideUrl).then((r) => r.arrayBuffer())]);
  const fine = sampler(new Int16Array(fineBuf), site.fine.n, site.fine.half), wide = sampler(new Int16Array(wideBuf), site.wide.n, site.wide.half);
  const FH = site.fine.half - 40;
  const baseY = (x, z) => (Math.abs(x) < FH && Math.abs(z) < FH ? fine(x, z) : wide(x, z));
  // Cerca del sitio, el suelo de detalle (cráteres pequeños y rocas, detalle.ts) sobre el relieve LOLA
  const detail = makeDetail(site.site);
  const enDetalle = (x, z) => Math.abs(x) < DETAIL_HALF && Math.abs(z) < DETAIL_HALF;
  const groundY = (x, z) => (enDetalle(x, z) ? baseY(x, z) + detail.height(x, z) : baseY(x, z));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.187 ya no trae PCFSoftShadowMap
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.22;

  // Terreno: malla fina (6 km) sobre la amplia (20 km), y el anillo del relieve lejano con el ángulo exacto del horizonte
  const reg = regolith();
  const matFine = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 1, metalness: 0, map: reg, bumpMap: reg, bumpScale: 0.6 });
  reg.repeat.set(750, 750);
  const regW = reg.clone(); regW.repeat.set(250, 250); regW.needsUpdate = true;
  const matWide = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 1, metalness: 0, map: regW });
  // La malla LOLA se hunde bajo el parche de detalle (los cuencos de los cráteres bajan hasta ~4,5 m) para no asomar
  scene.add(terrainMesh(fine, site.fine.half, site.fine.n, matFine, (x, z) => (Math.abs(x) < DETAIL_HALF - 12 && Math.abs(z) < DETAIL_HALF - 12 ? 6 : 0)));
  const detailMesh = buildDetail(detail, baseY, matFine); // también deja detail.rocks: las usa el contacto del aterrizaje
  scene.add(detailMesh);
  scene.add(terrainMesh(wide, site.wide.half, site.wide.n, matWide, (x, z) => (Math.abs(x) < FH - 60 && Math.abs(z) < FH - 60 ? 4 : 0)));
  const ringDeg = site.ringDeg, bins = ringDeg.length - 1, rp = new Float32Array((bins + 1) * 6), col = new Float32Array((bins + 1) * 6), idx = [];
  for (let i = 0; i <= bins; i++) {
    const az = (i / bins) * 2 * Math.PI, r0 = site.wide.half * 0.97, x0 = Math.sin(az) * r0, z0 = -Math.cos(az) * r0;
    rp.set([x0, wide(x0, z0) - 40, z0, Math.sin(az) * RING_R, Math.tan(ringDeg[i] * D2R) * RING_R, -Math.cos(az) * RING_R], i * 6);
    col.set([0.12, 0.12, 0.118, 0.62, 0.62, 0.6], i * 6);
    if (i < bins) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.BufferAttribute(col, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  scene.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 1, side: THREE.DoubleSide, vertexColors: true })));

  // Cielo: estrellas, Sol (HDR) y, si está sobre el horizonte, la Tierra
  const sp = new Float32Array(4000 * 3); for (let i = 0; i < 4000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY_D * 1.5); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  const dir = (az, el) => new THREE.Vector3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), -Math.cos(el * D2R) * Math.cos(az * D2R));
  const sd = dir(site.sun.az, site.sun.el);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(site.sun.radius * D2R) * SKY_D, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8e6).multiplyScalar(9), toneMapped: false }));
  sun.position.copy(sd).multiplyScalar(SKY_D); scene.add(sun);
  // Resplandor del Sol (el vacío no lo difunde: es el de la óptica, como en las fotos del Apollo)
  const glow = document.createElement('canvas'); glow.width = glow.height = 128;
  { const g = glow.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.15, 'rgba(255,220,150,.5)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const glowTex = new THREE.CanvasTexture(glow); glowTex.colorSpace = THREE.SRGBColorSpace;
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sunGlow.position.copy(sun.position); sunGlow.scale.setScalar(Math.tan(site.sun.radius * D2R) * SKY_D * 14); scene.add(sunGlow);
  // La Tierra, si está sobre el horizonte: continentes, nubes y su fase según dónde está el Sol
  if (site.earth.visible) {
    const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256; const g = ec.getContext('2d');
    g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, 512, 256);
    const blob = (color, n, rmin, rmax) => { for (let k = 0; k < n; k++) { const x = Math.random() * 512, y = 256 * (0.15 + Math.random() * 0.7), r = rmin + Math.random() * (rmax - rmin); g.fillStyle = color; g.beginPath(); g.ellipse(x, y, r * 1.6, r, Math.random() * 3, 0, Math.PI * 2); g.fill(); } };
    blob('#4f7a3a', 26, 8, 30); blob('#a68a5b', 10, 6, 18); g.globalAlpha = 0.75; blob('#ffffff', 60, 4, 20); g.fillRect(0, 0, 512, 18); g.fillRect(0, 238, 512, 18);
    const map = new THREE.CanvasTexture(ec); map.colorSpace = THREE.SRGBColorSpace;
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, sunDir: { value: sd.clone() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ vec3 c = texture2D(map, vUv).rgb; float l = max(dot(normalize(vN), sunDir), 0.0); gl_FragColor = vec4(c * (0.1 + 1.25 * l), 1.0); }',
    });
    const e = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(site.earth.radius * D2R) * SKY_D, 48, 32), earthMat);
    e.position.copy(dir(site.earth.az, site.earth.el)).multiplyScalar(SKY_D); scene.add(e);
  }

  // Luz: Sol rasante con sombras que siguen a la nave, luz rebotada por el regolito y un mínimo de ambiente
  const sunLight = new THREE.DirectionalLight(0xfff6e8, 3.2 * site.sun.frac);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0005;
  Object.assign(sunLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 3000 });
  scene.add(sunLight, sunLight.target, new THREE.AmbientLight(0x9aa6c0, 0.05), new THREE.HemisphereLight(0x0a0c12, 0xbdb7aa, 0.35 * site.sun.frac + 0.04));

  // La simulación espera una "vista" con estas piezas (en nuestro navegador las da la escena 3D completa)
  // Efectos del descenso (alarma, impacto, estática). La voz es la de EVA, la de toda la aplicación (avisarEva).
  const sonido = new Sonido();
  const sfx = { radio() {}, static: (d) => sonido.staticNoise(d), boom: () => sonido.boom(), programAlarm: () => sonido.programAlarm() };
  const view = {
    host, renderer, scene, camera, groundY, baseY, detail, siteName: site.site, time: Date.parse(site.time),
    now: { sun: { ...site.sun }, earth: { ...site.earth } },
    eva: { fp: true, root: { style: {} }, briefing: { open: false }, sfx, yaw: 0, pitch: 0, _lookT: 0 },
    controls: { target: new THREE.Vector3(), update() {}, enabled: false },
    astro: createAstronaut(), // procedural: baja la escalera y camina (en primera persona casi no se ve)
    pos: new THREE.Vector3(), heading: 0, quality: 0,
  };
  scene.add(view.astro.object, view.astro.dust);
  view.astro.object.visible = false;
  // Caminata con el casco después del primer paso; Q vuelve a volar el descenso
  const caminata = (view.caminata = new Caminata(view, { onSalir: () => void sim.start(), sonido }));
  const sim = new LandingSim(view);
  await sim.start();
  if (import.meta.env.DEV) window.__alunizaje = sim; // para probar a mano en desarrollo (p. ej. forzar un fallo)

  const onKey = (e) => { if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.target.closest?.('button,input,select,textarea')) sim.skip(); };
  window.addEventListener('keydown', onKey);
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    sim.update(dt);
    caminata.update(dt);
    // Las sombras se calculan alrededor de la nave (o del astronauta, en la caminata)
    const f = caminata.active ? caminata.pos : sim.lm?.position ?? camera.position;
    sunLight.target.position.copy(f); sunLight.position.copy(f).addScaledVector(sd, 1500);
    if (caminata.active) caminata.render(dt); // a través del vidrio del casco, con su HUD
    else renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null); ro.disconnect(); window.removeEventListener('keydown', onKey);
    sim.stop(true); sim.active = false; sim.distant = false;
    if (import.meta.env.DEV && window.__alunizaje === sim) delete window.__alunizaje;
    sonido.dispose();
    caminata.dispose(); view.astro.dispose();
    disposeDetail(detailMesh); glowTex.dispose();
    renderer.dispose(); pmrem.dispose(); host.replaceChildren();
  };
}
