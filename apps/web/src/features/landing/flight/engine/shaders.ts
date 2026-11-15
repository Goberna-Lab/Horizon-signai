/**
 * Shaders de la lámina. El dibujo imita una impresión a tres tintas sobre papel: sombra (gris), tinta (negro) y
 * señal (rojo). No hay degradados: los medios tonos son trama de puntos, como en una lámina impresa.
 *
 * Qué es dato y qué es convención de dibujo:
 * - Sombras: calculadas con la dirección real del Sol sobre el relieve de LOLA (ver `shadow.ts`).
 * - Curvas de nivel y retícula de latitud y longitud: salen de la altura y de la posición de cada punto.
 * - Trama de relieve: sombreado cartográfico (una luz a 35° sobre el rumbo del Sol). Es convención, no física:
 *   sirve para leer la forma del terreno.
 *
 * Modo realista (`uReal`, el inicio a ras de suelo): regolito gris iluminado por el Sol real, con las mismas sombras
 * calculadas, más un grano procedural fino (convención: el dato no tiene detalle por debajo de ~380 m). El vuelo
 * pasa del modo realista a la lámina impresa al alejarse.
 *
 * Rendimiento: se dibuja en una gráfica integrada, así que por píxel no hay trigonometría (los paralelos y
 * meridianos salen de distancias y productos) y cada derivada se calcula una sola vez.
 */

const COMMON = /* glsl */ `
precision highp float;
uniform float uPixel;
uniform float uInk;
uniform float uRadius;
uniform vec3 cPaper;
uniform vec3 cShade;
uniform vec3 cInk;
uniform vec3 cSignal;
uniform float uReal;
uniform vec3 uSunDir;

/** Ruido de valor 2D y su suma por octavas: el grano del regolito en el modo realista. */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** fbm con las octavas que se resuelven a esta escala (fp: km por píxel): las demás se apagan para que no centelleen. */
float fbm(vec2 p, float fp) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    float fade = 1.0 - smoothstep(0.25, 0.6, fp * freq);
    sum += amp * vnoise(p * freq) * fade;
    freq *= 2.17;
    amp *= 0.5;
  }
  return sum;
}
/** Color del regolito iluminado: luz rasante, sombra calculada y un velo mínimo de luz de la Tierra. */
vec3 regolith(vec3 n, float sunlit, vec2 p, float fp) {
  // Grano y relieve fino: el gradiente del ruido inclina la normal.
  float e = max(fp, 0.004);
  float g0 = fbm(p * 3.0, fp * 3.0);
  float gx = fbm((p + vec2(e, 0.0)) * 3.0, fp * 3.0);
  float gy = fbm((p + vec2(0.0, e)) * 3.0, fp * 3.0);
  vec3 nn = normalize(n + vec3(-(gx - g0), -(gy - g0), 0.0) / e * 0.012);
  float diffuse = max(dot(nn, uSunDir), 0.0);
  // Las laderas de cara al Sol se iluminan del todo aunque esté a ras del horizonte.
  // En sombra pasa algo de luz (convención: la que rebota en las crestas iluminadas), para que se lea el relieve.
  float light = diffuse * 15.0 * mix(0.3, 1.0, sunlit);
  // Manchas de albedo grandes (material más claro u oscuro) y el grano fino.
  float patchy = fbm(p * 0.35, fp * 0.35);
  vec3 albedo = vec3(0.155, 0.15, 0.142) * (0.7 + 0.35 * patchy + 0.2 * g0);
  // Relleno: la luz que rebota de las crestas iluminadas, para que la sombra no sea negro puro.
  vec3 c = albedo * (light + 0.13);
  return 1.0 - exp(-c * 2.2);
}

/** Trazo de ancho fijo en pantalla: distancePx es la distancia al eje del trazo. */
float stroke(float distancePx, float widthPx) {
  return 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, distancePx);
}

/**
 * Línea donde v es entero. fw es el cambio de v por píxel (ya calculado): da el ancho fijo en pantalla y apaga las
 * líneas cuando quedan a menos de unos píxeles entre sí, para evitar el muaré.
 */
float ruled(float v, float fw, float widthPx) {
  float d = abs(fract(v - 0.5) - 0.5) / max(fw, 1e-7);
  return stroke(d, widthPx) * (1.0 - smoothstep(0.22, 0.5, fw));
}

/** Distancia (en las unidades de s) al meridiano más cercano de los doce que hay cada 30 grados. */
float toMeridian(vec2 s) {
  float a = min(abs(s.x), abs(s.y));
  float b = min(abs(s.x * 0.8660254 - s.y * 0.5), abs(s.x * 0.5 - s.y * 0.8660254));
  float c = min(abs(s.x * 0.8660254 + s.y * 0.5), abs(s.x * 0.5 + s.y * 0.8660254));
  return min(a, min(b, c));
}
`

export const TERRAIN_VERTEX = /* glsl */ `
uniform float uRadius;
in float aSkirt;
in float aHeight;
out vec2 vUv;
out vec3 vPos;
out vec3 vUp;
out float vSkirt;
out float vHeight;
void main() {
  vUv = uv;
  vPos = position;
  vUp = normalize(position + vec3(0.0, 0.0, uRadius));
  vSkirt = aSkirt;
  vHeight = aHeight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const TERRAIN_FRAGMENT = /* glsl */ `
${COMMON}
in vec2 vUv;
in vec3 vPos;
in vec3 vUp;
in float vSkirt;
in float vHeight;
uniform sampler2D tDetail;
uniform sampler2D tSun;
uniform sampler2D tSunFine;
uniform sampler2D tEarth;
uniform vec3 uSunShear;
uniform vec3 uSunFineShear;
uniform vec3 uEarthShear;
uniform float uNodes;
uniform float uFineNodes;
uniform float uSunFine;
uniform float uExtent;
uniform float uEarthLayer;
uniform float uRing;
uniform float uCalm;
uniform vec3 uCarto;
uniform vec4 uSite;
uniform vec4 uBearings;

/** Lee un mapa de visibilidad guardado en rejilla cizallada (ver shadow.ts). nodes es el lado de esa rejilla. */
float sheared(sampler2D map, vec3 sh, float nodes) {
  vec2 g = vUv * (nodes - 1.0);
  float line = sh.x < 0.5 ? g.y : g.x;
  float across = sh.x < 0.5 ? g.x : g.y;
  float j = across - sh.y * line - sh.z;
  return texture(map, vec2((j + 0.5) / (2.0 * nodes), (line + 0.5) / nodes)).r;
}

/** Trama de puntos a 45 grados; coverage es la fracción de tinta. */
float dots(float coverage, float pitch) {
  vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / pitch);
  float r = sqrt(clamp(coverage, 0.0, 0.78) * 0.3183099);
  float aa = 0.8 / pitch;
  return (1.0 - smoothstep(r - aa, r + aa, length(fract(p) - 0.5))) * smoothstep(0.0, 0.05, coverage);
}

void main() {
  float px = uPixel;
  // Kilómetros de terreno por píxel: decide el intervalo de las curvas y el grosor de los trazos.
  float fp = max(max(length(dFdx(vPos)), length(dFdy(vPos))), 1e-6);

  if (vSkirt > 1e-4) {
    // Canto de la lámina: corte del relieve con una marca por kilómetro de altura.
    vec3 edge = mix(cShade, cInk, ruled(vHeight, fwidth(vHeight), px) * 0.45 * uInk);
    gl_FragColor = vec4(mix(edge, vec3(0.01), uReal), 1.0);
    return;
  }

  vec4 detail = texture(tDetail, vUv);
  float h = detail.r * 1000.0;
  float fh = fwidth(h);
  vec3 n = normalize(vec3(-detail.g, -detail.b, 1.0));

  // Sombra: el mapa rápido mientras la cámara se mueve y el fino cuando se detiene.
  float lit = sheared(tSun, uSunShear, uNodes);
  if (uSunFine > 0.001) lit = mix(lit, sheared(tSunFine, uSunFineShear, uFineNodes), uSunFine);
  float shadow = 1.0 - smoothstep(0.3, 0.7, lit);

  // Trama de relieve. En movimiento se aligera para que los puntos no bailen sobre el terreno.
  float relief = clamp((dot(vUp, uCarto) - dot(n, uCarto)) * 2.4, 0.0, 1.0);
  float screen = dots(mix(relief * 0.52, relief * 0.2, shadow), 6.0 * px) * mix(0.35, 1.0, uCalm);

  // Curvas de nivel: el intervalo se duplica al alejarse, con transición suave entre niveles.
  float level = clamp(log2(fp * 48.0), 0.0, 5.0);
  float interval = 62.5 * exp2(floor(level));
  float blend = fract(level);
  float fine = ruled(h / interval, fh / interval, px) * (1.0 - blend) * mix(0.5, 1.0, uCalm);
  float mid = ruled(h / (interval * 2.0), fh / (interval * 2.0), px);
  float index = ruled(h / (interval * 8.0), fh / (interval * 8.0), px * 1.7);
  float contour = max(max(fine, mid) * 0.36, index * 0.62);

  // Retícula: un paralelo por grado y un meridiano cada 30 grados.
  vec2 s = vec2(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0) * uExtent;
  float rho = length(s);
  float x = rho / uRadius;
  // Colatitud = 2·atan(x/2); con x < 0,17 basta la serie x − x³/12 (error menor que una millonésima de radián).
  float colatitude = degrees(x - x * x * x / 12.0);
  float parallel = ruled(colatitude, fwidth(colatitude), px);
  float meridian = stroke(toMeridian(s) / fp, px) * smoothstep(4.0, 14.0, 0.5235988 * rho / fp);
  float graticule = max(parallel, meridian) * 0.32;

  // Marco de la lámina.
  float toEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)) * 2.0 * uExtent / fp;
  float frame = stroke(toEdge, px * 2.0);

  vec3 color = mix(cPaper, cShade, shadow);
  color = mix(color, cInk, max(max(screen, contour), max(graticule, frame)) * uInk);

  // Capa de señal.
  float signal = 0.0;
  if (uEarthLayer > 0.001) {
    // Rayado: desde aquí el centro de la Tierra está sobre el horizonte del relieve (enlace directo posible).
    float link = sheared(tEarth, uEarthShear, uNodes);
    float pitch = 8.0 * px;
    float hatch = stroke(abs(fract((gl_FragCoord.x + gl_FragCoord.y) / pitch - 0.5) - 0.5) * pitch * 0.7071, px);
    signal = hatch * smoothstep(0.4, 0.6, link) * uEarthLayer * 0.85;
  }
  if (uRing > 0.001) {
    // Anillo del sitio y rumbos al Sol (continuo) y a la Tierra (a trazos).
    vec2 q = vPos.xy - uSite.xy;
    float ring = stroke(abs(length(q) - uSite.z) / fp, px * 1.6);
    float along = dot(q, uBearings.xy);
    float across = abs(q.x * uBearings.y - q.y * uBearings.x);
    float toSun = stroke(across / fp, px * 1.6) * step(uSite.z, along) * step(along, uSite.w);
    along = dot(q, uBearings.zw);
    across = abs(q.x * uBearings.w - q.y * uBearings.z);
    float toEarth = stroke(across / fp, px * 1.6) * step(uSite.z, along) * step(along, uSite.w) * step(0.45, fract(along / (uSite.z * 0.8)));
    signal = max(signal, max(ring, max(toSun, toEarth)) * uRing);
  }
  color = mix(color, cSignal, signal);

  if (uReal > 0.001) color = mix(color, regolith(n, 1.0 - shadow, vPos.xy, fp), uReal);
  gl_FragColor = vec4(color, 1.0);
}
`

export const SPHERE_VERTEX = /* glsl */ `
uniform float uRadius;
out vec3 vPos;
out float vColatitude;
void main() {
  vPos = position;
  // La colatitud se calcula por vértice: entre anillos de la esfera varía de forma lineal.
  vec3 p = position + vec3(0.0, 0.0, uRadius);
  vColatitude = degrees(acos(clamp(p.z / length(p), -1.0, 1.0)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** La Luna más allá del dato: esfera lisa con la misma retícula (un paralelo cada 2 grados). */
export const SPHERE_FRAGMENT = /* glsl */ `
${COMMON}
in vec3 vPos;
in float vColatitude;
void main() {
  float fp = max(max(length(dFdx(vPos)), length(dFdy(vPos))), 1e-6);
  float parallel = ruled(vColatitude * 0.5, fwidth(vColatitude) * 0.5, uPixel);
  float meridian = stroke(toMeridian(vPos.xy) / fp, uPixel);
  vec3 color = mix(cPaper, cInk, max(parallel, meridian) * 0.2 * uInk);
  if (uReal > 0.001) {
    // Más allá del dato: la Luna lisa, iluminada por el mismo Sol.
    vec3 up = normalize(vPos + vec3(0.0, 0.0, uRadius));
    float light = max(dot(up, uSunDir), 0.0) * 9.0;
    vec3 c = vec3(0.15) * (light + 0.035);
    color = mix(color, 1.0 - exp(-c * 2.2), uReal);
  }
  gl_FragColor = vec4(color, 1.0);
}
`

export const BODY_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Sol y Tierra: un disco con el borde suavizado en el propio shader. uInner > 0 deja un aro (la Tierra). uMargin es
 * cuántos radios mide el cuadro (el Sol realista lo agranda para su resplandor). En modo realista (uReal) el disco es
 * blanco y lleva resplandor (uGlow).
 */
export const BODY_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uFill;
uniform float uInner;
uniform float uMargin;
uniform float uReal;
uniform float uGlow;
in vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0) * uMargin;
  float aa = max(fwidth(r), 1e-4);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  vec3 print = mix(uFill, uColor, smoothstep(uInner - aa, uInner + aa, r));
  // Resplandor: fuerte junto al disco y una cola larga y tenue; se apaga antes del borde del cuadro.
  float edge = 1.0 - smoothstep(uMargin * 0.7, uMargin, r);
  float glow = (exp(-(r - 1.0) * 0.9) * 0.85 + exp(-(r - 1.0) * 0.12) * 0.28) * step(1.0, r) * edge * uGlow;
  vec3 real = mix(vec3(1.0, 0.93, 0.8), vec3(1.0), disc);
  vec3 color = mix(print, real, uReal);
  float alpha = max(disc, glow * uReal);
  gl_FragColor = vec4(color, alpha);
}
`

/** Estrellas del cielo realista: puntos fijos con su brillo; se apagan con la lámina impresa. */
export const STAR_VERTEX = /* glsl */ `
uniform float uPixel;
in float aSize;
out float vBright;
void main() {
  vBright = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (0.8 + aSize * 1.6) * uPixel;
}
`

export const STAR_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uReal;
in float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.4, 1.0, d)) * (0.35 + vBright * 0.65) * uReal;
  gl_FragColor = vec4(vec3(0.95, 0.94, 0.9), a);
}
`
