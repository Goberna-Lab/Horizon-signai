// @ts-nocheck — mundo mínimo para el alunizaje: terreno del sitio, cielo, luz y el bucle de dibujo.
// El sitio y su cielo para la fecha (sitio.ts): cualquiera de los 28 sitios del Planificador; por defecto Connecting
// Ridge · RoI 6, que trae relieve fino a 10 m. Encima, cerca del punto, el suelo de detalle con cráteres y rocas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cargarSitio, cieloEn } from './sitio';
import { verSol, rejillaDeLuz, pintarLuz } from './luz';
import { LandingSim } from './landing';
import { Sonido } from './sonido';
import { makeDetail, buildDetail, disposeDetail, DETAIL_HALF } from './detalle';
import { createAstronaut } from './astronauta';
import { Caminata } from './caminata';
import { Rover } from './rover';
import { Tactil, esTactil } from './tactil';
import { abrirEva, estadoSimulador } from './paraEva';
import { Estacion } from './estacion';
import { avisarSitio } from './avisoSitio';
import { avisarEva } from '@/shared/eva';

const AFK_S = 60; // sin tocar nada este rato, EVA bromea con tu ausencia (y otra vez cada 90 s más)

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
export async function startLanding(host: HTMLElement, { siteId, ms, ruta, evaH, tipo, roverKmh, paradaH, panelM, antenaM, estadiaH, fallos }: { siteId?: string; ms?: number; ruta?: string; evaH?: number; tipo?: string; roverKmh?: number; paradaH?: number; panelM?: number; antenaM?: number; estadiaH?: number; fallos?: boolean } = {}): Promise<() => void> {
  const { site, fineBuf, wideBuf } = await cargarSitio(siteId, ms);
  const wide = sampler(new Int16Array(wideBuf), site.wide.n, site.wide.half);
  const fine = fineBuf ? sampler(new Int16Array(fineBuf), site.fine.n, site.fine.half) : wide; // sin relieve fino: el de 80 m interpolado
  const FH = site.fine.half - 40;
  // Curvatura de la Luna: a 10 km del sitio el suelo ya baja ~29 m (en el polo cambia qué tapa al Sol)
  const R_LUNA = 1737400, curva = (x, z) => (x * x + z * z) / (2 * R_LUNA);
  const fineC = (x, z) => fine(x, z) - curva(x, z), wideC = (x, z) => wide(x, z) - curva(x, z);
  const baseY = (x, z) => (Math.abs(x) < FH && Math.abs(z) < FH ? fineC(x, z) : wideC(x, z));
  // Cerca del sitio, el suelo de detalle (cráteres pequeños y rocas, detalle.ts) sobre el relieve LOLA
  const detail = makeDetail(site.site);
  const enDetalle = (x, z) => Math.abs(x) < DETAIL_HALF && Math.abs(z) < DETAIL_HALF;
  const groundY = (x, z) => (enDetalle(x, z) ? baseY(x, z) + detail.height(x, z) : baseY(x, z));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const movil = esTactil(); // celular o tableta: menos resolución y sombras más baratas, y controles en pantalla
  renderer.setPixelRatio(movil ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.187 ya no trae PCFSoftShadowMap
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.08; // reflejos (la lámina dorada del LM); sin atmósfera no hay luz de cielo

  // Terreno: malla fina (6 km) sobre la amplia (20 km), y el anillo del relieve lejano con el ángulo exacto del horizonte
  const reg = regolith();
  const matFine = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 1, metalness: 0, map: reg, bumpMap: reg, bumpScale: 0.6 });
  reg.repeat.set(750, 750);
  const regW = reg.clone(); regW.repeat.set(250, 250); regW.needsUpdate = true;
  const matWide = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 1, metalness: 0, map: regW });
  // La malla LOLA se hunde bajo el parche de detalle (los cuencos de los cráteres bajan hasta ~4,5 m) para no asomar
  const mallaFina = terrainMesh(fineC, site.fine.half, site.fine.n, matFine, (x, z) => (Math.abs(x) < DETAIL_HALF - 12 && Math.abs(z) < DETAIL_HALF - 12 ? 6 : 0));
  scene.add(mallaFina);
  const detailMesh = buildDetail(detail, baseY, matFine); // también deja detail.rocks: las usa el contacto del aterrizaje
  scene.add(detailMesh);
  const mallaAmplia = terrainMesh(wideC, site.wide.half, site.wide.n, matWide, (x, z) => (Math.abs(x) < FH - 60 && Math.abs(z) < FH - 60 ? 4 : 0));
  scene.add(mallaAmplia);
  const ringDeg = site.ringDeg, bins = ringDeg.length - 1, rp = new Float32Array((bins + 1) * 6), col = new Float32Array((bins + 1) * 6), idx = [];
  for (let i = 0; i <= bins; i++) {
    const az = (i / bins) * 2 * Math.PI, r0 = site.wide.half * 0.97, x0 = Math.sin(az) * r0, z0 = -Math.cos(az) * r0;
    rp.set([x0, wide(x0, z0) - 40, z0, Math.sin(az) * RING_R, Math.tan(ringDeg[i] * D2R) * RING_R, -Math.cos(az) * RING_R], i * 6);
    if (i < bins) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.BufferAttribute(col, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  scene.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 1, side: THREE.DoubleSide, vertexColors: true })));

  // Cielo: estrellas, Sol (HDR) y la Tierra (se ve solo si está sobre el horizonte)
  const sp = new Float32Array(4000 * 3); for (let i = 0; i < 4000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY_D * 1.5); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  const dir = (az, el) => new THREE.Vector3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), -Math.cos(el * D2R) * Math.cos(az * D2R));
  let sd = dir(site.sun.az, site.sun.el);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(site.sun.radius * D2R) * SKY_D, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8e6).multiplyScalar(9), toneMapped: false }));
  scene.add(sun);
  // Resplandor del Sol (el vacío no lo difunde: es el de la óptica, como en las fotos del Apollo)
  const glow = document.createElement('canvas'); glow.width = glow.height = 128;
  { const g = glow.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.15, 'rgba(255,220,150,.5)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const glowTex = new THREE.CanvasTexture(glow); glowTex.colorSpace = THREE.SRGBColorSpace;
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sunGlow.scale.setScalar(Math.tan(site.sun.radius * D2R) * SKY_D * 14); scene.add(sunGlow);
  // La Tierra: continentes, nubes y su fase según dónde está el Sol
  const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256;
  { const g = ec.getContext('2d');
    g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, 512, 256);
    const blob = (color, n, rmin, rmax) => { for (let k = 0; k < n; k++) { const x = Math.random() * 512, y = 256 * (0.15 + Math.random() * 0.7), r = rmin + Math.random() * (rmax - rmin); g.fillStyle = color; g.beginPath(); g.ellipse(x, y, r * 1.6, r, Math.random() * 3, 0, Math.PI * 2); g.fill(); } };
    blob('#4f7a3a', 26, 8, 30); blob('#a68a5b', 10, 6, 18); g.globalAlpha = 0.75; blob('#ffffff', 60, 4, 20); g.fillRect(0, 0, 512, 18); g.fillRect(0, 238, 512, 18); }
  const earthMap = new THREE.CanvasTexture(ec); earthMap.colorSpace = THREE.SRGBColorSpace;
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: earthMap }, sunDir: { value: sd.clone() } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ vec3 c = texture2D(map, vUv).rgb; float l = max(dot(normalize(vN), sunDir), 0.0); gl_FragColor = vec4(c * (0.1 + 1.25 * l), 1.0); }',
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(Math.tan(site.earth.radius * D2R) * SKY_D, 48, 32), earthMat);
  scene.add(earth);

  // Luz: Sol rasante con sombras que siguen a la nave, luz rebotada por el regolito y un mínimo de ambiente
  const sunLight = new THREE.DirectionalLight(0xfff6e8, 0);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(movil ? 1024 : 2048, movil ? 1024 : 2048); sunLight.shadow.bias = -0.0005;
  Object.assign(sunLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 3000 });
  const hemi = new THREE.HemisphereLight(0x05060a, 0xbdb7aa, 0.01);
  scene.add(sunLight, sunLight.target, new THREE.AmbientLight(0x9aa6c0, 0.012), hemi);
  // Luz cenicienta: la Tierra, si se ve, ilumina un poco las sombras (azulada)
  const tierraL = new THREE.DirectionalLight(0x8fb4ff, 0.06); scene.add(tierraL);

  /** Ilumina la escena para un cielo (Sol y Tierra del motor del Planificador): sombras del relieve, astros y luces. */
  function iluminar(c, sombras = true) {
    sd = dir(c.sun.az, c.sun.el);
    if (sombras) {
    // Sombras del relieve hacia el Sol (luz.ts): rasante en el polo, casi todo lo que no mira al Sol queda negro
    const luzFina = rejillaDeLuz(groundY, sd, FH, movil ? 40 : 20, 6000), luzAmplia = rejillaDeLuz(groundY, sd, site.wide.half, movil ? 160 : 100, 8000);
    const luzDe = (x, z) => (Math.abs(x) < FH && Math.abs(z) < FH ? luzFina(x, z) : luzAmplia(x, z));
    pintarLuz(mallaFina, luzDe); pintarLuz(mallaAmplia, luzDe);
    pintarLuz(detailMesh.children[0], (x, z) => verSol(groundY, sd, x, z, 160, 1) * luzFina(x, z)); // cráteres y rocas: su propia sombra
    }
    // El relieve lejano solo brilla por la cara que mira al Sol (con el Sol a la espalda de quien mira); el resto, en sombra
    for (let i = 0; i <= bins; i++) { const az = (i / bins) * 2 * Math.PI, cara = Math.max(0, -Math.cos(az - c.sun.az * D2R)) * c.sun.frac, k = 0.03 + 0.55 * Math.sqrt(cara); col.set([0.02, 0.02, 0.02, k, k, k * 0.97], i * 6); }
    rg.attributes.color.needsUpdate = true;
    sun.position.copy(sd).multiplyScalar(SKY_D); sunGlow.position.copy(sun.position);
    earth.visible = c.earth.visible; earth.position.copy(dir(c.earth.az, c.earth.el)).multiplyScalar(SKY_D); earthMat.uniforms.sunDir.value.copy(sd);
    sunLight.intensity = 4.2 * c.sun.frac; hemi.intensity = 0.14 * c.sun.frac + 0.01;
    tierraL.visible = c.earth.visible; tierraL.position.copy(dir(c.earth.az, c.earth.el)).multiplyScalar(1500);
  }
  iluminar(site);

  // La simulación espera una "vista" con estas piezas (en nuestro navegador las da la escena 3D completa)
  // Efectos del descenso (alarma, impacto, estática). La voz es la de EVA, la de toda la aplicación (avisarEva).
  const sonido = new Sonido();
  const sfx = { radio: (abre) => sonido.radio(abre), static: (d) => sonido.staticNoise(d), boom: () => sonido.boom(), programAlarm: () => sonido.programAlarm() };
  const cielo = { t: Date.parse(site.time), sombras: Date.parse(site.time), pidiendo: false }; // último cielo calculado (reloj de la misión): al cargar, el del alunizaje
  const view = {
    host, renderer, scene, camera, groundY, baseY, detail, siteName: site.site, time: Date.parse(site.time),
    now: { sun: { ...site.sun }, earth: { ...site.earth } },
    // El plan: la ruta elegida en el Planificador y cuándo sale la EVA (horas después del alunizaje)
    plan: { ruta: ruta ?? 'cientifica', evaH: evaH ?? 0, tipo: tipo ?? 'tripulada', roverKmh: roverKmh ?? 0.8, paradaH: paradaH ?? 2, panelM: panelM ?? 2, antenaM: antenaM ?? 2, estadiaH: estadiaH ?? 168, fallos: !!fallos },
    tAlunizaje: Date.parse(site.time),
    sitio: site, // para el informe del panel y la antena (equipoEn)
    /** Vuelve a iluminar la escena con el cielo de otro instante (la hora de la EVA). */
    async iluminarEn(t) {
      const c = await cieloEn(site, t);
      iluminar(c); view.now = { sun: { ...c.sun }, earth: { ...c.earth } }; view.time = Date.parse(c.time);
      cielo.t = cielo.sombras = t;
    },
    /** Durante la EVA o el recorrido: el cielo avanza con el reloj de la misión. Sol y Tierra cada 10 min de misión
     *  (barato: un punto del motor); las sombras del relieve, cada 2 h (caro: se vuelven a calcular). */
    async cieloAl(t) {
      if (cielo.pidiendo || (cielo.t != null && Math.abs(t - cielo.t) < 600e3)) return;
      cielo.pidiendo = true;
      try {
        const c = await cieloEn(site, t), sombras = cielo.sombras == null || Math.abs(t - cielo.sombras) >= 7200e3;
        iluminar(c, sombras); view.now = { sun: { ...c.sun }, earth: { ...c.earth } }; view.time = Date.parse(c.time);
        cielo.t = t; if (sombras) cielo.sombras = t; view.cieloMovido = true;
      } catch { /* sin tabla: se queda el cielo de antes */ } finally { cielo.pidiendo = false; }
    },
    eva: { fp: true, root: { style: {} }, briefing: { open: false }, sfx, yaw: 0, pitch: 0, _lookT: 0 }, sonido,
    controls: { target: new THREE.Vector3(), update() {}, enabled: false },
    astro: createAstronaut(), // procedural: baja la escalera y camina (en primera persona casi no se ve)
    pos: new THREE.Vector3(), heading: 0, quality: 0,
  };
  scene.add(view.astro.object, view.astro.dust);
  view.astro.object.visible = false;
  // Caminata con el casco después del primer paso; Q vuelve a volar el descenso
  const caminata = (view.caminata = new Caminata(view, { onSalir: () => void sim.start(), sonido }));
  const rover = (view.rover = new Rover(view, { onSalir: () => void sim.start(), sonido }));
  view.estacion = new Estacion(view);
  const sim = new LandingSim(view);
  const tactil = movil ? new Tactil(view, { sim, caminata, rover }) : null;
  await sim.start();
  const quitarAviso = avisarSitio(host, view, site.id); // pendiente real peligrosa: se dice antes de bajar
  if (import.meta.env.DEV) window.__alunizaje = sim; // para probar a mano en desarrollo (p. ej. forzar un fallo)

  const onKey = (e) => {
    if (e.target.closest?.('button,input,select,textarea,[contenteditable="true"]')) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') sim.skip();
    if (e.code === 'KeyH' && !e.repeat) { e.preventDefault(); abrirEva(); } // hablar con EVA: suelta el ratón y abre su panel (sin que la «h» caiga en su campo)
  };
  // Lo que EVA ve de esta pantalla (features/assistant/eva/acciones.ts lo lee como contexto de cada pregunta)
  window.HorizonSimulador = { text: () => estadoSimulador(view, sim, caminata, rover) };
  window.addEventListener('keydown', onKey);
  // AFK: si nadie toca teclado ni ratón, EVA se burla de la ausencia (tres frases por turnos; ella además se limita
  // a un comentario cada 90 s y no lo dice si está hablando de otra cosa)
  let tocado = performance.now(), ausencias = 0;
  const marcar = () => { tocado = performance.now(); };
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) window.addEventListener(ev, marcar, { passive: true });
  const afk = window.setInterval(() => {
    if (document.hidden || performance.now() - tocado < AFK_S * 1000) return;
    avisarEva(`ausente-${(ausencias++ % 3) + 1}`);
    tocado = performance.now() - (AFK_S - 90) * 1000; // la siguiente, tras 90 s más sin tocar nada
  }, 5000);
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    sim.update(dt);
    caminata.update(dt);
    rover.update(dt);
    tactil?.update();
    view.estacion.update();
    // Las sombras se calculan alrededor de la nave (o del astronauta, en la caminata)
    const f = caminata.active ? caminata.pos : rover.active ? rover.pos : sim.lm?.position ?? camera.position;
    sunLight.target.position.copy(f); sunLight.position.copy(f).addScaledVector(sd, 1500);
    if (caminata.active) caminata.render(dt); // a través del vidrio del casco, con su HUD
    else renderer.render(scene, camera);
  });

  return () => {
    quitarAviso();
    document.querySelector('.sim-informe')?.remove(); // el informe vive en el body
    delete window.HorizonSimulador;
    renderer.setAnimationLoop(null); ro.disconnect(); window.removeEventListener('keydown', onKey);
    window.clearInterval(afk); for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) window.removeEventListener(ev, marcar);
    sim.stop(true); sim.active = false; sim.distant = false;
    if (import.meta.env.DEV && window.__alunizaje === sim) delete window.__alunizaje;
    sonido.dispose();
    caminata.dispose(); rover.dispose(); tactil?.dispose(); view.estacion.dispose(); view.astro.dispose();
    disposeDetail(detailMesh); glowTex.dispose();
    renderer.dispose(); pmrem.dispose(); host.replaceChildren();
  };
}
