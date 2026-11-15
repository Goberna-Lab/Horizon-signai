// Materiales de EVA. Todo se dibuja con geometría simple y shaders propios, sin archivos ni nada que se
// baje de la red: una esfera cuyo material pinta la cerámica, el labio del visor, el vidrio con fondo, la
// pantalla de LED (ojos, cejas y corchetes) y las líneas grabadas; más el propulsor y su estela.
import * as THREE from "three"

/** Luz de sus ojos, líneas y propulsor: «luz de Tierra» (comunicaciones), la misma de la página de voz. */
export const LUZ = "#9AD7FF"
/** Rojo de la marca: solo para avisos (marcas del visor en alerta y batería baja). */
export const ROJO = "#C8102E"
export const BLANCO = "#FBFAF7" // cerámica blanca, apenas cálida
/** Plomo oscuro: el color de la cerámica cuando está apagada. */
export const PLOMO = "#3B3E44"

/** Forma de la ventana del visor. `domo` es la de la referencia de Estephano; las demás son opciones. */
export type VisorEva = "domo" | "ovalo" | "banda" | "ventana"
type FormaVisor = {
  /** Semiancho, alto hacia arriba y alto hacia abajo de la ventana (radianes sobre la esfera). */
  semiancho: number
  arriba: number
  abajo: number
  /** 2 = óvalo; más alto = esquinas más cuadradas. */
  exponente: number
  /** Latitud del centro de la ventana. */
  latitud: number
  /** Tamaño de lo que se dibuja en la pantalla y cuánto sube respecto del centro. */
  escala: number
  ojosY: number
}
export const VISORES: Record<VisorEva, FormaVisor> = {
  domo: { semiancho: 0.76, arriba: 0.4, abajo: 0.27, exponente: 2.35, latitud: 0.07, escala: 1, ojosY: 0.03 },
  ovalo: { semiancho: 0.56, arriba: 0.27, abajo: 0.27, exponente: 2, latitud: 0.13, escala: 0.78, ojosY: 0.02 },
  banda: { semiancho: 1.15, arriba: 0.2, abajo: 0.2, exponente: 5, latitud: 0.1, escala: 0.8, ojosY: 0.02 },
  ventana: { semiancho: 0.64, arriba: 0.3, abajo: 0.3, exponente: 5, latitud: 0.07, escala: 0.95, ojosY: 0.02 },
}

/** Plano de la estela del propulsor: tamaño y centro, en unidades del modelo (la esfera mide 1 de radio). */
export const ESTELA = { ancho: 2, alto: 0.9, y: -1.3, z: 0.25 }

const HONDURA = 0.055 // qué tan adentro del vidrio está la pantalla (fracción del radio)
const LABIO = 0.042 // ancho del borde redondeado entre la cerámica y el vidrio
const CONTORNO = 0.05 // distancia de la línea grabada que rodea el visor

export type UniformesEva = ReturnType<typeof crearUniformes>

const dir = (lon: number, lat: number) => {
  const a = THREE.MathUtils.degToRad(lon)
  const b = THREE.MathUtils.degToRad(lat)
  return new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b))
}

/**
 * Líneas grabadas: cada una es un círculo sobre la esfera (un «plano de órbita»), dado por su eje y su radio
 * angular. Se dibujan espejadas a los dos lados. Diseño propio: un horizonte que pasa bajo el visor, dos
 * órbitas que cuelgan de él y se rozan al centro, y un aro a cada lado.
 */
function orbitas(v: FormaVisor) {
  const horizonte = v.latitud - v.abajo - CONTORNO
  const centro = dir(33, -38)
  // Desde el centro de los arcos, la dirección hacia el plano del medio: ahí está la «cintura» del reloj de arena.
  const haciaMedio = new THREE.Vector3(-1, 0, 0).addScaledVector(centro, centro.x).normalize()
  const cintura = (radio: number) => centro.clone().multiplyScalar(Math.cos(radio)).addScaledVector(haciaMedio, Math.sin(radio))
  /** Tramo visible: `medio` es su punto central y `abertura` cuánto se abre a cada lado (ángulo sobre el círculo). */
  type Linea = { eje: THREE.Vector3; radio: number; pulsos: number; medio?: THREE.Vector3; abertura?: number }
  const grados = THREE.MathUtils.degToRad
  const lista: Linea[] = [
    { eje: new THREE.Vector3(0, 1, 0), radio: Math.PI / 2 - horizonte, pulsos: 3 },
    { eje: centro, radio: grados(26.2), pulsos: 2, medio: cintura(grados(26.2)), abertura: grados(86) },
    { eje: centro, radio: grados(22.6), pulsos: 2, medio: cintura(grados(22.6)), abertura: grados(78) },
    { eje: new THREE.Vector3(1, 0, 0), radio: grados(19), pulsos: 1 },
  ]
  const planos: THREE.Vector4[] = []
  const ejes: THREE.Vector4[] = []
  const tramos: THREE.Vector4[] = []
  for (const o of lista) {
    planos.push(new THREE.Vector4(o.eje.x, o.eje.y, o.eje.z, Math.cos(o.radio)))
    // Un vector cualquiera perpendicular al eje: desde ahí se mide el ángulo por donde corre el pulso.
    const lado = Math.abs(o.eje.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    const e1 = lado.addScaledVector(o.eje, -lado.dot(o.eje)).normalize()
    ejes.push(new THREE.Vector4(e1.x, e1.y, e1.z, o.pulsos))
    // Un punto del círculo a un ángulo f del medio cumple P·medio = cos²r + sen²r·cos f.
    const corte = o.medio && o.abertura !== undefined ? Math.cos(o.radio) ** 2 + Math.sin(o.radio) ** 2 * Math.cos(o.abertura) : -2
    tramos.push(new THREE.Vector4(o.medio?.x ?? 0, o.medio?.y ?? 0, o.medio?.z ?? 0, corte))
  }
  return { planos, ejes, tramos, horizonte }
}

export function crearUniformes(visor: VisorEva, luz: THREE.ColorRepresentation = LUZ) {
  const v = VISORES[visor]
  const o = orbitas(v)
  return {
    uTiempo: { value: 0 },
    uLuz: { value: new THREE.Color(luz) },
    uRojo: { value: new THREE.Color(ROJO) },
    uPlomo: { value: new THREE.Color(PLOMO) },
    /** semiancho, alto arriba, alto abajo, exponente */
    uVisor: { value: new THREE.Vector4(v.semiancho, v.arriba, v.abajo, v.exponente) },
    /** latitud del centro, hondura, labio, escala de la pantalla */
    uCaja: { value: new THREE.Vector4(v.latitud, HONDURA, LABIO, v.escala) },
    /** subida de la pantalla, seno de la latitud del horizonte */
    uCaja2: { value: new THREE.Vector4(v.ojosY, Math.sin(o.horizonte), 0, 0) },
    uOjo: { value: new Float32Array(32) },
    uNivel: { value: new Float32Array(10).fill(1) },
    /** abertura, luz, giro, nivel */
    uHud: { value: new THREE.Vector4(0, 0.65, 0, 1) },
    /** alerta, batería baja, barrido (altura), barrido (luz) */
    uHud2: { value: new THREE.Vector4() },
    /** centro de los corchetes (x, y), corrimiento por la mirada (x, y) */
    uHud3: { value: new THREE.Vector4(0.265, -0.03, 0, 0) },
    /** cuánto «busca» (pensando: una luz recorre los corchetes) */
    uHud4: { value: new THREE.Vector4() },
    /** luz, falla, líneas, pulso */
    uPant: { value: new THREE.Vector4(1, 0, 0.35, 0.12) },
    /** propulsor, apagado (1 = sin energía: cerámica en plomo y mate) */
    uCuerpo: { value: new THREE.Vector4(0.75, 0, 0, 0) },
    uOrbita: { value: o.planos },
    uOrbitaE: { value: o.ejes },
    uOrbitaC: { value: o.tramos },
  }
}

// ───────────────────────────── Shader del cuerpo ─────────────────────────────
// Se injerta en MeshPhysicalMaterial: three sigue haciendo la luz (reflejos del estudio, barniz) y aquí se
// decide, punto por punto de la esfera, qué hay: cerámica, junta, vidrio o línea grabada.

const PARS = /* glsl */ `
#define EVA_ORBITAS 4
varying vec3 vEvaPos;
uniform mat3 normalMatrix;
uniform float uTiempo;
uniform vec3 uLuz;
uniform vec3 uRojo;
uniform vec3 uPlomo;
uniform vec4 uVisor;
uniform vec4 uCaja;
uniform vec4 uCaja2;
uniform vec4 uOjo[8];
uniform float uNivel[10];
uniform vec4 uHud;
uniform vec4 uHud2;
uniform vec4 uHud3;
uniform vec4 uHud4;
uniform vec4 uPant;
uniform vec4 uCuerpo;
uniform vec4 uOrbita[EVA_ORBITAS];
uniform vec4 uOrbitaE[EVA_ORBITAS];
uniform vec4 uOrbitaC[EVA_ORBITAS];

const float EVA_PASO = 0.02;    // separación entre filas de LED
const float EVA_JUNTA = 0.014;   // ancho de la junta oscura entre cerámica y vidrio
const float EVA_TRAZO = 0.0045;  // semiancho de las líneas grabadas
const float EVA_CONTORNO = ${CONTORNO.toFixed(3)};

// Ventana del visor: superelipse con más alto arriba que abajo. Devuelve la distancia al borde
// (negativa dentro) y hacia dónde crece, en coordenadas de longitud y latitud.
float evaVisor(vec2 q, out vec2 g) {
  vec2 b = vec2(uVisor.x, q.y > 0.0 ? uVisor.y : uVisor.z);
  vec2 k = abs(q) / b + 1e-4;
  float n = uVisor.w;
  vec2 kn = pow(k, vec2(n - 1.0));
  float f = dot(kn, k);
  vec2 grad = kn / b * pow(f, 1.0 / n - 1.0);
  float largo = max(length(grad), 1e-3);
  g = sign(q) * grad / largo;
  return (pow(f, 1.0 / n) - 1.0) / largo;
}

float evaCaja(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// Forma del ojo i en el punto p (negativa dentro). hueco: cuánto cae en la rendija entre barras.
float evaOjo(vec2 p, int i, out float hueco) {
  vec4 a = uOjo[i * 4];
  vec4 b = uOjo[i * 4 + 1];
  vec4 c = uOjo[i * 4 + 2];
  float lado = i == 0 ? -1.0 : 1.0;
  vec2 q = p - a.xy;
  float cs = cos(c.z), sn = sin(c.z);
  q = vec2(cs * q.x + sn * q.y, cs * q.y - sn * q.x);
  vec2 h = vec2(max(a.z, 0.002), max(a.w, EVA_PASO * 0.5));
  float d = evaCaja(q, h, b.x * min(h.x, h.y));
  // Párpado: una recta que corta por arriba; s crece hacia la nariz.
  float s = -lado * q.x;
  d = max(d, q.y - (h.y - 2.0 * h.y * b.y - b.z * s));
  // Sonrisa: un círculo muerde por abajo y queda un arco.
  float r2 = h.x * 0.9;
  d = max(d, r2 - length(vec2(q.x, q.y + h.y + r2 - b.w * h.y * 1.1)));
  // Aro.
  float grosor = min(h.x, h.y) * 0.5;
  d = mix(d, abs(d + grosor * 0.5) - grosor * 0.5, c.y);
  // Barras de la voz: cinco columnas, cada una con su altura.
  float u = clamp(q.x / h.x * 0.5 + 0.5, 0.0, 0.999) * 5.0;
  float nivel = uNivel[i * 5 + int(floor(u))];
  d = max(d, abs(q.y) - mix(h.y + 0.02, nivel * h.y, c.x));
  hueco = c.x * smoothstep(0.34, 0.42, abs(fract(u) - 0.5));
  return d;
}

// Lo que emite la pantalla en el punto p (radianes desde su centro). px: tamaño de un píxel ahí.
vec3 evaPantalla(vec2 p, vec2 px) {
  float aa = max(px.x, px.y) * 0.9 + 1e-4;
  float fila = floor(p.y / EVA_PASO);
  // Falla: cada fila se corre a un lado durante un instante.
  p.x += uPant.y * (fract(sin(fila * 91.7 + floor(uTiempo * 30.0) * 7.31) * 43758.5453) - 0.5) * 0.1;
  int i = p.x < 0.0 ? 0 : 1;
  float lado = i == 0 ? -1.0 : 1.0;
  vec4 oa = uOjo[i * 4];
  vec4 oc = uOjo[i * 4 + 2];
  vec4 ce = uOjo[i * 4 + 3];

  // Ojo hecho de filas de LED: cada fila se enciende según la forma evaluada en su centro.
  float hueco, nada;
  float dq = evaOjo(vec2(p.x, (fila + 0.5) * EVA_PASO), i, hueco);
  float dc = evaOjo(p, i, nada);
  float fy = abs(fract(p.y / EVA_PASO) - 0.5) * 2.0;
  float aaF = clamp(px.y / EVA_PASO * 2.0, 0.03, 1.0);
  float filaLuz = 1.0 - smoothstep(0.62 - aaF, 0.62 + aaF, fy);
  // Si una fila mide menos que un píxel, relleno liso (evita el muaré en tamaños chicos).
  float fino = smoothstep(0.3, 0.75, px.y / EVA_PASO);
  float led = mix((1.0 - smoothstep(-px.x - 1e-4, px.x + 1e-4, dq)) * filaLuz, (1.0 - smoothstep(-aa, aa, dc)) * 0.8, fino) * (1.0 - hueco) * oc.w;
  float halo = (exp(-max(dc, 0.0) * 24.0) * 0.5 + exp(-max(dc, 0.0) * 6.5) * 0.12) * oc.w;

  // Ceja: un trazo fino sobre el ojo.
  vec2 q = p - oa.xy;
  float s = -lado * q.x;
  float yc = ce.x - ce.y * s - ce.z * q.x * q.x / max(oa.z, 0.02);
  float ceja = (1.0 - smoothstep(-aa, aa, max(abs(q.y - yc) - 0.0062, abs(q.x) - oa.z * 0.8))) * ce.w;

  // Corchete: un arco por fuera de cada ojo con dos remates, y tres marcas de nivel.
  vec2 r = p - vec2(lado * uHud3.x, uHud3.y) - uHud3.zw;
  r.x *= lado;
  float R = 0.24 + uHud.x;
  float rr = length(r);
  float ang = atan(r.y, r.x);   // 0 = hacia afuera
  float da = abs(ang);
  float dArco = max(abs(rr - R) - 0.0052, (da - 0.78) * R);
  dArco = min(dArco, max(abs(da - 0.78) * R - 0.0052, abs(rr - (R - 0.014)) - 0.014));
  float arco = 1.0 - smoothstep(-aa, aa, dArco);
  // Pensando: el corchete se apaga un poco y una luz lo recorre de punta a punta.
  arco *= mix(1.0, 0.35 + 2.4 * exp(-pow((ang - 0.72 * sin(uHud.z)) / 0.2, 2.0)), uHud4.x);
  vec2 m = vec2(r.x - (R + 0.04), r.y);
  float k = clamp(floor(m.y / 0.036 + 1.5), 0.0, 2.0);
  float marca = 1.0 - smoothstep(-aa, aa, evaCaja(vec2(m.x, m.y - (k - 1.0) * 0.036), vec2(0.0085, 0.0115), 0.003));
  float encendida = clamp(uHud.w * 3.0 - k + 0.15, 0.12, 1.0);
  // Alerta: marcas en rojo que parpadean juntas. Batería baja: solo la de abajo, roja e intermitente.
  vec3 colHud = mix(uLuz, uRojo * 2.4, uHud2.x);
  encendida *= mix(1.0, 0.3 + 0.7 * step(0.0, sin(uTiempo * 9.0)), uHud2.x);
  encendida = mix(encendida, k < 0.5 ? 0.5 + 0.5 * sin(uTiempo * 7.0) : 0.05, uHud2.y);
  vec3 colMarca = mix(colHud, uRojo * 2.6, uHud2.y);

  // Repaso: una línea de luz que baja por la pantalla.
  float repaso = exp(-pow((p.y - uHud2.z) / 0.02, 2.0)) * uHud2.w;

  vec3 col = uLuz * (led * (1.75 + repaso) + halo * 0.5 + repaso * 0.07) + vec3(0.42) * led;
  col += uLuz * ceja * 1.3 + colHud * arco * uHud.y * 1.1 + colMarca * marca * encendida * uHud.y * 1.4;
  return col * uPant.x;
}

// Líneas grabadas en la cerámica: cuánta línea hay en P, cuánto pulso corre por ella y su halo.
float evaGrabado(vec3 P, float dVisor, float px, out float pulso, out float halo, out float mancha) {
  vec3 Pm = vec3(abs(P.x), P.y, P.z);
  float fino = clamp(EVA_TRAZO / px * 1.3, 0.0, 1.0);   // línea más fina que un píxel: se atenúa
  float fuera = smoothstep(EVA_CONTORNO - 0.006, EVA_CONTORNO + 0.004, dVisor);
  float bajo = smoothstep(uCaja2.y + 0.004, uCaja2.y - 0.006, P.y);
  float m = 0.0;
  pulso = 0.0;
  halo = 0.0;
  mancha = 0.0;
  for (int i = 0; i < EVA_ORBITAS; i++) {
    vec4 o = uOrbita[i];
    float dist = abs(dot(Pm, o.xyz) - o.w) / sqrt(max(1.0 - o.w * o.w, 1e-3));
    // Los arcos (1 y 2) solo se ven por debajo del horizonte y en su tramo; todo queda fuera del contorno del visor.
    float tramo = smoothstep(uOrbitaC[i].w - 0.04, uOrbitaC[i].w + 0.04, dot(Pm, uOrbitaC[i].xyz));
    float visible = fuera * tramo * ((i == 1 || i == 2) ? bajo : 1.0);
    float l = (1.0 - smoothstep(EVA_TRAZO - px, EVA_TRAZO + px, dist)) * fino * visible;
    vec3 e1 = uOrbitaE[i].xyz;
    float fase = atan(dot(Pm, cross(o.xyz, e1)), dot(Pm, e1));
    float ola = pow(0.5 + 0.5 * cos(fase * uOrbitaE[i].w - uTiempo * 2.6 + float(i) * 1.7), 18.0);
    pulso = max(pulso, l * ola);
    halo += exp(-dist * 38.0) * visible;
    mancha += exp(-dist * 60.0) * ola * visible;
    m = max(m, l);
  }
  // Contorno: una línea que rodea el visor a poca distancia.
  float dc = abs(dVisor - EVA_CONTORNO);
  m = max(m, (1.0 - smoothstep(EVA_TRAZO - px, EVA_TRAZO + px, dc)) * fino);
  halo += exp(-dc * 38.0);
  return m;
}
`

const COLOR = /* glsl */ `
vec3 evaP = normalize(vEvaPos);
vec3 evaVer = normalize(vViewPosition * normalMatrix);   // hacia la cámara, en el espacio de la esfera
vec2 evaA = vec2(atan(evaP.x, evaP.z), asin(clamp(evaP.y, -1.0, 1.0))) - vec2(0.0, uCaja.x);
float evaPx = length(fwidth(evaP)) * 0.7 + 1e-5;         // un píxel, medido sobre la esfera
vec2 evaPxA = min(fwidth(evaA), vec2(0.06)) + 1e-5;
vec2 evaG;
float evaD = evaVisor(evaA, evaG);
float evaVidrio = 1.0 - smoothstep(-evaPx, evaPx, evaD + EVA_JUNTA);
float evaCeramica = smoothstep(-evaPx, evaPx, evaD);
float evaJunta = clamp(1.0 - evaVidrio - evaCeramica, 0.0, 1.0);
// Labio: el borde baja redondeado de la cerámica al vidrio (1 en el borde, 0 a un labio de distancia).
float evaLabio = 1.0 - smoothstep(0.0, uCaja.z, abs(evaD + EVA_JUNTA * 0.5));
evaLabio *= evaLabio;
vec3 evaEmision = vec3(0.0);

if (evaVidrio > 0.001) {
  // El rayo entra al vidrio, se quiebra y llega a la pantalla, que está más adentro: por eso los ojos
  // se corren respecto del borde al girarla y se ve la pared del hueco.
  vec3 evaRayo = refract(-evaVer, evaP, 0.69);
  float evaB = dot(evaP, evaRayo);
  float evaRi = 1.0 - uCaja.y;
  float evaDisc = evaB * evaB - (1.0 - evaRi * evaRi);
  vec3 evaQ = normalize(evaP + (-evaB - sqrt(max(evaDisc, 0.0))) * evaRayo);
  vec2 evaA2 = vec2(atan(evaQ.x, evaQ.z), asin(clamp(evaQ.y, -1.0, 1.0))) - vec2(0.0, uCaja.x);
  vec2 evaG2;
  float evaD2 = evaVisor(evaA2, evaG2);
  float evaPared = max(smoothstep(-0.03, -0.008, evaD2), step(evaDisc, 0.0));
  vec3 evaLed = evaPantalla((evaA2 - vec2(0.0, uCaja2.x)) / uCaja.w, evaPxA / uCaja.w);
  vec3 evaFondo = vec3(0.006, 0.007, 0.010) + vec3(0.016, 0.019, 0.024) * smoothstep(0.1, -0.3, evaA2.y);
  float evaSol = 0.5 - 0.5 * evaG2.y;
  vec3 evaColPared = mix(vec3(0.010, 0.011, 0.014), vec3(0.03, 0.033, 0.04) + vec3(0.2, 0.21, 0.23) * evaSol * evaSol, smoothstep(-0.02, 0.07, evaD2)) + uLuz * uPant.x * 0.02;
  evaEmision = mix(evaFondo + evaLed, evaColPared, evaPared) * evaVidrio;
}

float evaPulso, evaHalo, evaMancha;
float evaLinea = evaGrabado(evaP, evaD, evaPx, evaPulso, evaHalo, evaMancha) * evaCeramica;
evaHalo *= evaCeramica;
// El pulso que corre por las líneas: sobre blanco no puede brillar más, así que tiñe la cerámica a su paso.
evaMancha = clamp(evaMancha * uPant.w * uPant.z * 0.8, 0.0, 0.45) * evaCeramica;
// Cerámica: sombra de contacto junto al visor y tinte de las líneas.
diffuseColor.rgb *= 1.0 - 0.22 * evaLabio * evaCeramica;
diffuseColor.rgb = mix(diffuseColor.rgb, uLuz * 0.55 + 0.2, evaLinea * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, uLuz * 0.8, evaMancha);
// Apagada: la cerámica se vuelve plomo oscuro (las líneas quedan apenas más claras).
diffuseColor.rgb = mix(diffuseColor.rgb, uPlomo * (1.0 + 0.5 * evaLinea), uCuerpo.y * 0.95);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), evaJunta);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0015), evaVidrio);
// Luz propia sobre la cerámica: las líneas, el resplandor de la pantalla en el borde y el del propulsor abajo.
evaEmision += uLuz * (evaLinea * (0.2 + 1.5 * evaPulso * uPant.w) + evaHalo * 0.09 * (1.0 + 2.0 * uPant.w * evaPulso)) * uPant.z;
evaEmision += uLuz * uPant.x * 0.1 * exp(-max(evaD, 0.0) * 26.0) * evaCeramica;
evaEmision += uLuz * uCuerpo.x * 0.34 * smoothstep(-0.66, -1.0, evaP.y) * evaCeramica;
`

const RUGOSIDAD = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.58, uCuerpo.y);
roughnessFactor = mix(roughnessFactor, 0.6, evaJunta);
roughnessFactor = mix(roughnessFactor, 0.07, evaVidrio);
`

const NORMAL = /* glsl */ `
{
  // Normal exacta de la esfera, inclinada hacia el visor en el labio.
  vec3 evaEste = normalize(vec3(evaP.z, 0.0, -evaP.x) + 1e-6);
  vec3 evaNorte = cross(evaP, evaEste);
  vec3 evaHacia = normalize(evaG.x * evaEste + evaG.y * evaNorte + 1e-6);
  normal = normalize(normalMatrix * normalize(evaP - 0.85 * evaLabio * evaHacia));
}
`

const BARNIZ = /* glsl */ `
#ifdef USE_CLEARCOAT
  clearcoatNormal = normal;
#endif
`

const BRILLO = /* glsl */ `
material.specularColor *= 1.0 - 0.9 * evaVidrio;
material.specularColorBlended *= 1.0 - 0.9 * evaVidrio;
material.specularF90 *= 1.0 - 0.9 * evaVidrio;
`

const EMISION = /* glsl */ `
totalEmissiveRadiance += evaEmision;
`

/** Cerámica + visor + pantalla + líneas, todo en la esfera. */
export function crearMaterialCuerpo(u: UniformesEva, entorno: THREE.Texture) {
  const m = new THREE.MeshPhysicalMaterial({
    color: BLANCO,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMap: entorno,
    envMapIntensity: 1,
  })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEvaPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEvaPos = position;")
    s.fragmentShader = s.fragmentShader
      .replace("#include <clipping_planes_pars_fragment>", "#include <clipping_planes_pars_fragment>\n" + PARS)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + COLOR)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + RUGOSIDAD)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + NORMAL)
      .replace("#include <clearcoat_normal_fragment_maps>", "#include <clearcoat_normal_fragment_maps>\n" + BARNIZ)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + EMISION)
      .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n" + BRILLO)
  }
  m.customProgramCacheKey = () => "eva-cuerpo"
  return m
}

/** Aro del propulsor: la misma cerámica, sin dibujo. */
export function crearMaterialAro(entorno: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({ color: BLANCO, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMap: entorno })
}

/** Lente del propulsor: pura luz. Su color se ajusta en cada cuadro. */
export function crearMaterialLente(luz: THREE.ColorRepresentation = LUZ) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(luz), toneMapped: false })
}

/**
 * Estela del propulsor: un plano de cara a la cámara con el resplandor pegado a la lente, un charco de luz
 * más abajo y tres anillos que bajan y se abren. No es un chorro real: es la señal de que flota.
 */
export function crearMaterialEstela(luz: THREE.ColorRepresentation = LUZ) {
  return new THREE.ShaderMaterial({
    uniforms: { uLuz: { value: new THREE.Color(luz) }, uFuerza: { value: 0.75 }, uTiempo: { value: 0 }, uLente: { value: new THREE.Vector2(0, 0.27) } },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uLuz;
      uniform float uFuerza;
      uniform float uTiempo;
      uniform vec2 uLente;   // dónde está la lente, en unidades del modelo desde el centro del plano
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        vec2 w = p * vec2(${(ESTELA.ancho / 2).toFixed(3)}, ${(ESTELA.alto / 2).toFixed(3)});   // unidades del modelo, desde el centro del plano
        vec2 c = w - uLente;
        float nucleo = exp(-dot(c, c) / 0.017);
        vec2 e = (w - vec2(0.0, -0.06)) / vec2(0.5, 0.085);
        float charco = exp(-dot(e, e) * 1.7);
        float anillos = 0.0;
        for (int k = 0; k < 3; k++) {
          float f = fract(uTiempo * 0.42 + float(k) / 3.0);
          vec2 q = (w - vec2(uLente.x * (1.0 - f), uLente.y - 0.12 - f * 0.3)) / vec2(0.14 + f * 0.36, 0.03 + f * 0.055);
          anillos += exp(-pow((length(q) - 1.0) / 0.2, 2.0)) * (1.0 - f) * (1.0 - f) * smoothstep(0.0, 0.15, f);
        }
        float borde = smoothstep(1.0, 0.8, abs(p.x)) * smoothstep(1.0, 0.75, abs(p.y));
        float a = (nucleo * 0.8 + charco * 0.34 + anillos * 0.34) * uFuerza * borde;
        // Recorta la cola más tenue y trama el resto: sin esto el borde hace bandas sobre fondos claros.
        a = max(a - 0.014, 0.0) + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(uLuz, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }
    `,
  })
}

// ───────────────────────────── Estudio de luz ─────────────────────────────

const estudios = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/**
 * Estudio de fotografía hecho con formas de luz (sin HDR ni archivos): una caja de luz grande arriba, un
 * relleno a un lado, dos tiras detrás que marcan el contorno y un suelo oscuro. Se convierte una sola vez
 * por lienzo en el mapa de reflejos que usan la cerámica y el vidrio. No reproduce ninguna luz real.
 */
export function estudioDeLuz(gl: THREE.WebGLRenderer): THREE.Texture {
  const hecho = estudios.get(gl)
  if (hecho) return hecho
  const escena = new THREE.Scene()
  const cosas: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
  const poner = (malla: THREE.Mesh) => {
    escena.add(malla)
    cosas.push(malla as { geometry: THREE.BufferGeometry; material: THREE.Material })
  }
  // Cúpula: techo claro, horizonte medio, suelo oscuro.
  poner(
    new THREE.Mesh(
      new THREE.SphereGeometry(30, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "varying vec3 vDir; void main() { float y = normalize(vDir).y; vec3 c = mix(vec3(0.56), vec3(0.95), smoothstep(-0.05, 0.9, y)); c = mix(c, vec3(0.5), smoothstep(0.02, -0.55, y)); gl_FragColor = vec4(c, 1.0); }",
      }),
    ),
  )
  const caja = (x: number, y: number, z: number, ancho: number, alto: number, fuerza: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ color: new THREE.Color(fuerza, fuerza, fuerza), side: THREE.DoubleSide }))
    m.position.set(x, y, z)
    m.lookAt(0, 0, 0)
    poner(m)
  }
  caja(-3.5, 9, 5, 9, 9, 5.5) // principal: arriba, adelante y a la izquierda
  caja(9, 2.5, 4, 5, 7, 1) // relleno a la derecha
  caja(-8, 1, -7, 1.6, 9, 4) // tiras de contorno, detrás
  caja(8, 1, -7, 1.6, 9, 4)
  const pmrem = new THREE.PMREMGenerator(gl)
  const textura = pmrem.fromScene(escena, 0.07).texture
  pmrem.dispose()
  for (const c of cosas) {
    c.geometry.dispose()
    c.material.dispose()
  }
  estudios.set(gl, textura)
  return textura
}

// ───────────────────────────── Geometría ─────────────────────────────

let geometrias: { esfera: THREE.SphereGeometry; aro: THREE.TorusGeometry; lente: THREE.SphereGeometry; plano: THREE.PlaneGeometry } | null = null
/** Geometría común a todas las EVA (se crea una vez y no se libera). */
export function geometriasEva() {
  geometrias ??= {
    esfera: new THREE.SphereGeometry(1, 96, 64),
    aro: new THREE.TorusGeometry(0.29, 0.055, 16, 64),
    lente: new THREE.SphereGeometry(0.25, 32, 16),
    plano: new THREE.PlaneGeometry(1, 1),
  }
  return geometrias
}
