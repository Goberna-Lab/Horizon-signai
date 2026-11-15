// Sombreador del visor: toma la escena ya dibujada y la muestra como se vería
// desde dentro del casco. Todo lo de este archivo es representación, no física:
// la forma del visor, el canto del vidrio, el polvo, los destellos y la curva
// de tonos están hechos a ojo contra la imagen de referencia. Tampoco son
// físicos el vaho ni la película de polvo. Las piezas que rodean el vidrio
// (visor solar dorado, sello, carcasa, bisagras, aro del cuello, micrófonos,
// almohadilla de Valsalva, tubo de agua) existen en cascos reales y están
// tomadas de docs/referencias.md, pero su forma, tamaño y posición aquí son a
// ojo: no hay planos detrás.

import { CANTO, VISOR } from './optica.ts'

const f = (x: number) => x.toFixed(4)

export const VERTICE = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}
`

export const FRAGMENTO = /* glsl */ `
precision highp float;

uniform sampler2D tEscena;
uniform float uAspecto;
uniform float uThetaV;      // ángulo desde el eje en el borde superior (rad)
uniform float uThetaMax;
uniform vec2 uTanMitad;     // medio ancho y medio alto del encuadre de la escena (tangentes)
uniform vec2 uSolPantalla;  // dónde cae el Sol, en coordenadas de pantalla
uniform vec2 uSolUv;        // dónde cae el Sol en la textura de la escena
uniform float uSolDelante;
uniform float uSolSinTapar;  // 1: no mirar la escena para saber si algo tapa el Sol
uniform vec2 uCascoDesp;    // el casco se queda atrás cuando gira la cabeza
uniform float uCascoGiro;
uniform float uTiempo;
uniform float uExposicion;
uniform sampler2D tHud;     // el HUD ya pintado, con alfa premultiplicado
uniform float uHud;         // 0 apagado, 1 encendido
uniform float uVisorSol;    // ángulo del filo del visor solar alrededor de las bisagras (rad)
uniform float uAliento;     // 0 al terminar de inspirar, 1 al terminar de espirar
varying vec2 vUv;

const float CANTO = ${f(CANTO)};          // grosor aparente del canto del vidrio
// Abertura del visor (los mismos números que optica.ts).
const float V_CY = ${f(VISOR.centroY)};
const float V_MA = ${f(VISOR.medioAncho)};
const float V_MH = ${f(VISOR.medioAlto)};
const float V_RA = ${f(VISOR.radioArriba)};
const float V_RB = ${f(VISOR.radioAbajo)};

float azar(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 azar3(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(azar(i), azar(i + vec2(1., 0.)), f.x),
             mix(azar(i + vec2(0., 1.)), azar(i + vec2(1., 1.)), f.x), f.y);
}
// Campana centrada en c, de ancho w.
float campana(float x, float c, float w) {
  float u = (x - c) / w;
  return exp(-u * u);
}
vec2 girar(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Ojo de pez equidistante: la distancia al centro de la pantalla es
// proporcional al ángulo desde el eje de la mirada.
vec2 aEscena(vec2 p) {
  float r = length(p);
  float th = min(r * uThetaV, uThetaMax);
  vec2 t = r > 1e-5 ? p / r * tan(th) : vec2(0.);
  return t / uTanMitad * .5 + .5;
}
vec3 escena(vec2 p) {
  return texture2D(tEscena, aEscena(p)).rgb;
}
// Versión borrosa (niveles altos del mipmap): la luz general que entra.
vec3 escenaBorrosa(vec2 p, float nivel) {
  return texture2D(tEscena, aEscena(p), nivel).rgb;
}

// Abertura del visor: rectángulo muy redondeado. Negativo dentro del vidrio.
float sdVisor(vec2 p) {
  p -= vec2(0., V_CY);
  vec2 b = vec2(uAspecto * V_MA, V_MH);
  float r = min(p.y > 0. ? V_RA : V_RB, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.) + length(max(q, 0.)) - r;
}

// Distancia a lo largo del borde de la abertura: 0 arriba al centro, crece
// bajando por el costado (igual a izquierda y derecha) hasta abajo al centro.
float largoBorde(vec2 p) {
  p -= vec2(0., V_CY);
  vec2 b = vec2(uAspecto * V_MA, V_MH);
  float arriba = b.x + V_RA * .5708 + b.y - V_RA;   // largo del cuarto de arriba
  float abajo = b.x + V_RB * .5708 + b.y - V_RB;
  bool sup = p.y > 0.;
  float r = sup ? V_RA : V_RB;
  vec2 q = abs(p) - b + r;
  float s;
  if (q.y <= 0. && q.x > q.y) s = b.x - r + r * 1.5708 - q.y;   // costado
  else if (q.x <= 0.) s = abs(p.x);                             // tramo recto de arriba o de abajo
  else s = b.x - r + r * atan(q.x, q.y);                        // esquina
  return sup ? s : arriba + abajo - s;
}

// Relieve de lo que rodea el vidrio, según la distancia hacia fuera (d). Junto
// al vidrio va el sello de goma. Más allá, abajo está el aro del cuello (una
// meseta de aluminio con chaflanes y una ranura) y arriba y a los lados la
// carcasa (un escalón y la costura de la visera lateral).
float relieveAro(float d, float cuello) {
  float x = (d - .017) / .017;
  float h = .017 * sqrt(max(1. - x * x, 0.));
  float aro = smoothstep(.042, .054, d) * (1. - smoothstep(.150, .164, d));
  float hCuello = .014 * aro - .004 * campana(d, .100, .006);
  float hCarcasa = .006 * smoothstep(.045, .060, d) - .004 * campana(d, .190, .006);
  return h + mix(hCarcasa, hCuello, cuello);
}

// Ángulo de un punto (en coordenadas del casco) alrededor del eje que une las
// dos bisagras del visor solar: 0 al frente, positivo hacia arriba. El filo del
// visor es un arco de ángulo constante.
float anguloBisagra(vec2 q) {
  float r = length(q);
  float th = min(r * uThetaV, 1.45);
  return atan(sin(th) * q.y / max(r, 1e-5), cos(th));
}

float motas(vec2 p, float escala, float densidad) {
  vec2 g = p * escala;
  vec2 i = floor(g), f = fract(g);
  vec3 h = azar3(i);
  float r = length(f - (.15 + .7 * h.xy));
  float tam = .04 + .13 * h.z * h.z;
  return step(1. - densidad, azar(i + 7.3)) * (1. - smoothstep(tam * .25, tam, r));
}

vec3 curvaTonos(vec3 x) {
  // Ajuste ACES de Narkowicz.
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}

void main() {
  vec2 p = (vUv * 2. - 1.) * vec2(uAspecto, 1.);

  // ---- Geometría del casco
  vec2 pc = girar(p - uCascoDesp, uCascoGiro);
  float d = sdVisor(pc);
  const float e = .004;
  vec2 n = vec2(sdVisor(pc + vec2(e, 0.)) - sdVisor(pc - vec2(e, 0.)),
                sdVisor(pc + vec2(0., e)) - sdVisor(pc - vec2(0., e)));
  n = girar(normalize(n + 1e-6), -uCascoGiro);   // normal del borde, hacia fuera
  float borde = smoothstep(-.60, -CANTO, d);     // 0 en el centro, 1 junto al canto

  // ---- Sol
  vec2 ds = p - uSolPantalla;
  float rs = length(ds);
  float angS = atan(ds.y, ds.x);
  float lumSol = dot(texture2D(tEscena, uSolUv).rgb, vec3(.3, .6, .1));
  float solVisible = uSolDelante * max(uSolSinTapar, smoothstep(2., 12., lumSol));   // 0 si lo tapa el relieve
  float dSol = sdVisor(girar(uSolPantalla - uCascoDesp, uCascoGiro));
  float solEnVidrio = solVisible * (1. - smoothstep(-CANTO - .03, -CANTO + .05, dSol));
  vec3 luzSol = vec3(1., .93, .82);
  vec3 ambiente = escenaBorrosa(p * .55, 7.) * uExposicion;       // luz general de la escena

  // ---- 1. La escena a través del vidrio
  vec2 pe = p * (1. - .03 * borde * borde);        // el vidrio curvo aprieta la imagen en la orilla
  float ca = .0012 + .005 * borde * borde;         // aberración cromática
  vec3 vidrio = vec3(escena(pe * (1. + ca)).r, escena(pe).g, escena(pe * (1. - ca)).b);
  vidrio *= uExposicion;
  vidrio *= mix(1., .38, pow(borde, 1.6));         // el vidrio oscurece hacia la orilla
  // Visor solar: una lámina con una capa de oro que baja girando sobre las
  // bisagras. Lo que queda detrás se ve más oscuro y algo verdoso.
  // SUPUESTO: cuánta luz deja pasar y con qué tinte está puesto a ojo.
  const vec3 PASO_VISOR = vec3(.17, .22, .20);
  float xv = anguloBisagra(pc) - uVisorSol;        // > 0: detrás del visor solar
  float trasVisor = smoothstep(0., .004, xv);
  vidrio *= mix(vec3(1.), PASO_VISOR, trasVisor);
  float solTrasVisor = smoothstep(0., .004, anguloBisagra(girar(uSolPantalla - uCascoDesp, uCascoGiro)) - uVisorSol);

  // Destello del Sol: núcleo, halo, puntas y raya horizontal.
  float nucleo = 30. * exp(-rs * rs * 900.);
  float halo = .9 / (1. + rs * rs * 160.) + .07 / (1. + rs * rs * 6.);
  float puntas = pow(abs(cos(angS * 3. + .35)), 50.) + .5 * pow(abs(cos(angS * 2. + 1.2)), 90.);
  puntas *= .9 / (1. + rs * rs * 60.);
  float finas = pow(ruido(vec2(angS * 14., 3.)), 5.) * .5 * exp(-rs * 9.);
  float raya = .22 * exp(-abs(ds.y) * 90.) / (1. + ds.x * ds.x * 8.);
  vec3 destello = luzSol * (nucleo + halo + puntas + finas) + vec3(.75, .85, 1.) * raya;
  // Reflejos internos, sobre la línea que une el Sol con el centro.
  destello += vec3(.5, .7, 1.) * .010 * (1. - smoothstep(.04, .12, length(p + uSolPantalla * .35)));
  destello += vec3(1., .7, .4) * .006 * (1. - smoothstep(.08, .22, length(p + uSolPantalla * .75)));
  // Con el Sol detrás del visor solar llega menos luz, y entre las dos
  // láminas aparece una segunda imagen del Sol, corrida y tenue.
  destello *= mix(1., .28, solTrasVisor);
  vec2 dg = p - uSolPantalla * .94 + vec2(0., .025);
  destello += luzSol * .05 * solTrasVisor * exp(-dot(dg, dg) * 500.);
  vidrio += destello * solEnVidrio;

  // Polvo y rayones del vidrio: solo se notan cerca del Sol.
  float polvo = motas(pc, 46., .10) + .6 * motas(pc + 3.1, 115., .12);
  float cercaSol = 1. / (1. + rs * rs * 4.);
  vidrio += polvo * (.003 + .16 * solEnVidrio * cercaSol) * luzSol;
  // Los rayones finos brillan en arcos alrededor de la fuente de luz.
  float arcos = smoothstep(.86, .97, ruido(vec2(rs * 300., angS * 2.2 + 5.)));
  arcos *= smoothstep(.55, .8, ruido(vec2(angS * 7., rs * 6.)));
  vidrio += luzSol * arcos * .07 * exp(-rs * 3.) * solEnVidrio;
  // Huellas y manchas de grasa: un velo desigual que solo enciende el Sol.
  float huellas = pow(ruido(pc * 2.3 + 11.), 3.) + .5 * pow(ruido(pc * 6.1 - 4.), 4.);
  vidrio += luzSol * huellas * .045 * solEnVidrio * cercaSol;
  // Película de polvo pegado por fuera, más espesa hacia abajo.
  float pelicula = (1. - smoothstep(-1., -.25, pc.y)) * (.45 + .55 * ruido(pc * 9.));
  vidrio += ambiente * .05 * pelicula + luzSol * .012 * pelicula * solVisible;
  // El filo del visor solar: brilla de canto, deja una sombra fina debajo, y
  // la capa de oro devuelve un reflejo cálido del interior.
  vec3 oro = vec3(1., .76, .38);
  vidrio += oro * campana(xv, .005, .004) * (ambiente * 2.2 + luzSol * solVisible * .10 + .004);
  vidrio *= 1. - .6 * campana(xv, -.004, .004);
  vidrio += oro * ambiente * (.05 + .22 * exp(-xv * 14.)) * trasVisor;
  // Velo: reflejo tenue del interior en el vidrio.
  vidrio += ambiente * .035 * borde;
  // Vaho: el aliento empaña la parte baja del vidrio; crece al espirar y se
  // retira al inspirar. Detrás del vaho la escena se ve borrosa y lavada.
  vec2 qv = (pc - vec2(0., -1.02)) / vec2(.78, .16 + .16 * uAliento);
  float vaho = exp(-dot(qv, qv)) * (.35 + .65 * uAliento);
  vaho *= .6 + .4 * ruido(pc * 6. + vec2(0., uTiempo * .04));
  vaho = clamp(vaho * 1.15, 0., .85);
  vec3 empanado = escenaBorrosa(pe, 5.5) * uExposicion * .8 + ambiente * .3;
  empanado *= .9 + .2 * ruido(pc * 90.);            // gotas muy finas
  vidrio = mix(vidrio, empanado, vaho);

  // ---- 2. El canto del vidrio: una lente gruesa que comprime y voltea la escena
  float t = clamp((d + CANTO) / CANTO, 0., 1.);    // 0 en el bisel interior, 1 en el casco
  vec2 pr = p - n * (.06 + .25 * t + .55 * t * t);
  vec3 canto = escena(pr) * uExposicion * mix(.30, .02, t);
  float bisel = campana(t, .06, .05);
  float medio = campana(t, .45, .13);
  float exterior = campana(t, .90, .06);
  float caraAlSol = max(dot(n, normalize(uSolPantalla - p + 1e-5)), 0.);
  canto += luzSol * solVisible * pow(caraAlSol, 3.) * exp(-rs * .9) * (2.6 * bisel + .9 * medio);
  canto += ambiente * (.9 * bisel + .35 * exterior) + .003;
  // Vetas a lo largo del canto: reflejos estirados, como en un vidrio grueso.
  float angC = atan(pc.y, pc.x);
  float vetas = ruido(vec2(angC * 16., t * 3.)) * (.6 + .8 * ruido(vec2(angC * 55., t * 1.5)));
  canto *= .35 + 1.3 * vetas;
  canto += destello * solEnVidrio * .35 * (1. - t);

  // ---- 3. Alrededor del vidrio. Arriba y a los lados, la carcasa del conjunto
  // de visores, negra por dentro; abajo, el aro del cuello, de aluminio.
  float sA = largoBorde(pc);
  float cuello = 1. - smoothstep(-.62, -.40, pc.y);
  const float ea = .004;
  // Normal del relieve: (a lo largo del borde, hacia fuera, hacia el ojo).
  vec3 nA = normalize(vec3(0., relieveAro(d, cuello) - relieveAro(d + ea, cuello), ea));
  float enSello = 1. - smoothstep(.030, .038, d);
  float fuera = smoothstep(.040, .052, d);
  float enAro = fuera * (1. - smoothstep(.150, .164, d)) * cuello;
  vec3 albedo = enSello * vec3(.035) + fuera * mix(vec3(.022, .022, .024), vec3(.07, .068, .065), cuello);
  albedo = mix(albedo, vec3(.30, .31, .33), enAro);
  albedo *= 1. + enAro * (.5 * ruido(vec2(sA * 260., d * 9.)) - .25);          // aluminio cepillado
  // La luz entra por la abertura: llega rasante, desde el lado del vidrio.
  const vec3 LUZ_ABERTURA = vec3(0., -.91, .41);
  float caraAbertura = max(dot(nA, LUZ_ABERTURA), 0.);
  float brilloAro = pow(max(dot(nA, normalize(LUZ_ABERTURA + vec3(0., 0., 1.))), 0.), 50.);
  brilloAro *= .5 * enSello + enAro + .3 * fuera * (1. - cuello);              // la carcasa es negra pero lisa
  vec3 entra = ambiente * exp(-d * 5.);
  vec3 casco = vec3(.0025, .0027, .0031);
  casco += albedo * (entra * (.3 + 2.4 * caraAbertura) + ambiente * .10) + entra * brilloAro;
  // La burbuja sigue más allá de la abertura: sobre la carcasa negra se ve un
  // reflejo muy tenue de la escena en su cara interior.
  casco += escenaBorrosa(vec2(-p.x, p.y) * .5, 5.) * uExposicion * .03 * fuera * (1. - cuello) * exp(-d * 2.5);
  // Sol directo: entra por el visor y da en el lado contrario.
  float lejosDelEje = min(length(uSolPantalla) * .5, 1.);
  float alSol = solVisible * lejosDelEje * mix(1., .28, solTrasVisor)
    * smoothstep(.15, .75, dot(-n, uSolPantalla / max(length(uSolPantalla), 1e-4)));
  casco += luzSol * alSol * exp(-d * 4.) * (albedo * (.10 + 1.1 * caraAbertura) + .5 * brilloAro);
  casco += luzSol * solVisible * .06 * exp(-rs * 2.) * exp(-d * 14.);
  casco += vec3(.10, .45, .55) * .004 * uHud * exp(-d * 9.);   // luz del HUD

  // Bisagras del visor: un buje torneado a cada lado, a la altura de las sienes.
  vec2 qb = vec2(abs(pc.x) - (uAspecto * V_MA + .115), pc.y - .14);
  float rb = length(qb);
  float relieveBuje = .5 * campana(rb, .074, .006) + .35 * campana(rb, .046, .004)
    + .5 * (1. - smoothstep(.016, .020, rb)) + .6 * campana(rb, .020, .003);
  vec3 buje = vec3(.16, .165, .175) * (.75 + .5 * ruido(vec2(atan(qb.y, qb.x) * 40., rb * 30.)));
  buje *= entra * (.5 + 2. * relieveBuje) + luzSol * alSol * (.2 + relieveBuje) + ambiente * .08;
  casco = mix(casco, buje + .002, 1. - smoothstep(.074, .080, rb));

  // Luces de estado en la carcasa, arriba a la izquierda. NO FÍSICO: son
  // inventadas. La primera late con la respiración, la segunda parpadea al
  // azar y la tercera está encendida mientras lo está el HUD.
  float sL = (sA - (uAspecto * V_MA - .12)) / .05;
  float iL = floor(sL);
  float rL = length(vec2((fract(sL) - .5) * .05, d - .095));
  float enFila = step(0., iL) * step(iL, 2.) * step(pc.x, 0.);
  vec3 colorLuz = iL < .5 ? vec3(.25, 1., .45) * (.15 + .85 * uAliento)
    : iL < 1.5 ? vec3(.25, 1., .45) * (.10 + .90 * step(.6, azar(vec2(7., floor(uTiempo * 2.3)))))
    : vec3(.22, .80, 1.) * .7 * uHud;
  vec3 luces = colorLuz * enFila * (1.2 * exp(-rL * rL / .00002) + .15 * exp(-rL * rL / .0005));

  vec3 col = mix(vidrio, canto, smoothstep(-CANTO - .004, -CANTO + .004, d));
  col = mix(col, casco, smoothstep(-.005, .005, d));
  col += luces;

  // ---- 4. Lo que queda entre el ojo y el vidrio. Está tan cerca que sale
  // desenfocado.
  float tapado = 0.;
  // Pegadas al casco: la almohadilla de Valsalva (espuma, abajo a la izquierda)...
  vec2 qa = abs(pc - vec2(-.80, -1.04)) - vec2(.085, .10);
  float almohadilla = 1. - smoothstep(0., .05, length(max(qa, 0.)) - .03);
  vec3 espuma = vec3(.10, .095, .085) * (.8 + .4 * ruido(pc * 160.));
  espuma *= ambiente * (.5 + 1.4 * smoothstep(-1.12, -.92, pc.y));
  col = mix(col, espuma + .002, almohadilla);
  tapado = max(tapado, almohadilla);
  // ...y la boquilla del tubo de agua (abajo a la derecha).
  vec2 pt = pc - vec2(.82, -1.30);
  vec2 bt = vec2(-.04, .41);
  float ht = clamp(dot(pt, bt) / dot(bt, bt), 0., 1.);
  float dTubo = length(pt - bt * ht) - .028;
  float tubo = 1. - smoothstep(-.012, .03, dTubo);
  vec3 goma = mix(vec3(.50, .56, .60), vec3(.20, .42, .62), smoothstep(.82, .90, ht));   // la boquilla es azul
  goma *= ambiente * (.35 + 1.1 * (1. - smoothstep(-.028, 0., dTubo)));
  col = mix(col, goma + .002, tubo);
  tapado = max(tapado, tubo);
  // Pegados a la cabeza: los dos micrófonos de la cofia. No siguen al casco,
  // así que se quedan quietos en pantalla mientras el casco se retrasa.
  for (int i = 0; i < 2; i++) {
    float lado = i == 0 ? -1. : 1.;
    vec2 pm = p - vec2(lado * .40, -1.05 + .004 * sin(uTiempo * 1.15));
    vec2 q = pm / vec2(.17, .13);
    float l = length(q);
    vec2 bb = vec2(lado * (uAspecto * .9 - .40), -.22);
    float hb = clamp(dot(pm, bb) / dot(bb, bb), 0., 1.);
    float brazo = 1. - smoothstep(0., .05, length(pm - bb * hb) - .03);
    float cabeza = 1. - smoothstep(.72, 1.05, l);
    vec3 N = normalize(vec3(q, sqrt(max(1. - l * l, 0.)) + .15));
    float luz = max(dot(N, normalize(vec3(-lado * .3, .8, .45))), 0.);
    vec3 micro = ambiente * (.05 + .28 * luz * luz) * (.85 + .3 * ruido(p * 90.)) + .0015;   // espuma del micrófono
    float cubre = max(cabeza, brazo);
    col = mix(col, micro, cubre);
    tapado = max(tapado, cubre);
  }

  // ---- Salida
  col *= 1. - .30 * smoothstep(.5, 1.9, length(p / vec2(uAspecto, 1.)) * 1.6);
  col = curvaTonos(col);
  col = pow(col, vec3(1. / 2.2));

  // ---- 5. HUD: luz proyectada sobre la cara interior del vidrio. Se suma ya
  // en valores de pantalla para que no la apague la curva de tonos.
  float k = uHud * (1. - tapado) * (1. - smoothstep(-CANTO - .03, -CANTO - .005, d));
  k *= smoothstep(0., .08, uHud * 1.1 - abs(vUv.x - .5) * 2.);   // al encender se abre desde el centro
  k *= .985 + .015 * azar(vec2(floor(uTiempo * 24.), 3.));       // parpadeo leve
  vec2 c = vUv - .5;
  vec4 hud = texture2D(tHud, vUv);
  hud.r = texture2D(tHud, .5 + c * 1.0010).r;                     // el proyector separa un poco los colores
  hud.b = texture2D(tHud, .5 + c * .9990).b;
  vec4 brillo = texture2D(tHud, vUv, 3.);
  vec4 brilloAncho = texture2D(tHud, vUv, 5.);
  vec3 doble = texture2D(tHud, vUv + vec2(.0022, -.0045), 1.).rgb;  // segundo reflejo, en la cara exterior
  col *= 1. - k * .5 * brillo.a;                                  // el vidrio se oscurece detrás de cada trazo
  col += k * (brillo.rgb * .40 + brilloAncho.rgb * .30 + doble * .10);
  col = col * (1. - k * hud.a) + k * hud.rgb;
  col += (azar(p * 517. + fract(uTiempo) * 91.) - .5) * .012;   // grano
  gl_FragColor = vec4(col, 1.);
}
`
