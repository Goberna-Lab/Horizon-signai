// ENV-007: penumbra calibrada al tamaño angular de cada luz direccional (Sol 0,533°, Tierra 1,90°).
// Representación (three), no reglas: los diámetros angulares y sus fuentes viven en engine/environment.ts.
//
// Técnica: PCSS (Real-Time Rendering, 4.ª ed., cap. 7.6, pp. 250–252, ec. 7.6) adaptada a una luz
// direccional. Para una fuente lejana de diámetro angular θ, un bloqueador a Δd metros del receptor
// (a lo largo del rayo) solo lo afecta dentro de un radio Δd · tan(θ/2), medido perpendicular a la luz.
// En una cámara de sombras ortográfica la profundidad es lineal: Δd = Δz · (far − near).
//
// Por qué shadows="basic": en three 0.187 el modo PCF guarda la profundidad en un sampler2DShadow con
// comparación por hardware y no deja leer la profundidad cruda que necesita la búsqueda de bloqueadores
// (WebGLShadowMap.js:261-272; shadowmap_pars_fragment.glsl.js:51-57). En modo básico es un sampler2D.
//
// Por luz, sin uniforms nuevos: light.shadow.radius lleva tan(θ/2). En modo básico three no usa
// ese valor (LightShadow.js:82), así que se reinterpreta aquí.
//
// Aproximaciones de PCSS (RTR p. 252): un bloqueador "promedio" por píxel; si hay bloqueadores a
// distintas profundidades la penumbra es aproximada. Aquí hay un solo obstáculo.
// ENV-006 (no físico, declarado en la interfaz): radio mínimo de medio píxel del mapa de sombras y
// grano por el muestreo con ruido.
import { ShaderChunk } from 'three'
import { OBSTACULO } from '../engine/environment'
import { ALTURA_MAX_M, ALTURA_MIN_M, LADO_ESTE_M, LADO_NORTE_M } from '../engine/terreno'

/** Cámara ortográfica de sombras compartida por el Sol y la Tierra (en metros). */
export const CAMARA_SOMBRA = {
  /** Distancia de la luz al origen, a lo largo de su dirección. */
  distanciaM: 500,
  /**
   * Semilado de la caja: la mayor distancia del origen a un punto del terreno o a la tapa del poste (≈ 284 m),
   * así cabe con cualquier dirección de la luz (F4). Más chica = píxel de sombra más fino (~14 cm para el Sol).
   */
  mediaCajaM: Math.ceil(
    Math.hypot(LADO_ESTE_M / 2, LADO_NORTE_M / 2, Math.max(-ALTURA_MIN_M, ALTURA_MAX_M + OBSTACULO.alturaM)),
  ) + 2,
  nearM: 1,
  farM: 1000,
  /**
   * Sesgo de profundidad en metros a lo largo del rayo (F3). Desde E6 el terreno proyecta sombra sobre sí
   * mismo: el acné de las pendientes lo evita el plano del receptor en el shader (RTR p. 250), así que basta
   * un sesgo pequeño. El poste no recibe sombra.
   */
  sesgoM: 0.02,
} as const

/** Sesgo en unidades de profundidad normalizada de three (profundidad lineal en [0, 1] entre near y far). */
export const SESGO_NORMALIZADO = -CAMARA_SOMBRA.sesgoM / (CAMARA_SOMBRA.farM - CAMARA_SOMBRA.nearM)

const MARCA = '/* luna ENV-007 penumbra */'
const LLAMADA_ORIGINAL = 'getShadow( directionalShadowMap[ i ]'
const LLAMADA_NUEVA = 'getShadowPenumbra( directionalLight.direction, directionalShadowMap[ i ]'

const f = (x: number) => x.toFixed(4)

const GLSL = /* glsl */ `
${MARCA}
#if NUM_DIR_LIGHT_SHADOWS > 0
#if defined( SHADOWMAP_TYPE_BASIC ) && ! defined( USE_REVERSED_DEPTH_BUFFER )
#define LUNA_PROFUNDIDAD_M ${f(CAMARA_SOMBRA.farM - CAMARA_SOMBRA.nearM)}
#define LUNA_ANCHO_M ${f(2 * CAMARA_SOMBRA.mediaCajaM)}
// Mayor altura de un bloqueador sobre un receptor: desnivel del terreno + poste + 1 m de margen.
#define LUNA_ALTURA_MAX_M ${f(ALTURA_MAX_M - ALTURA_MIN_M + OBSTACULO.alturaM + 1)}
// Límite del gradiente del plano del receptor: pendiente de 84° respecto del plano perpendicular a la luz
// (tan 84° ≈ 10), en unidades de profundidad normalizada por unidad de coordenada del mapa.
#define LUNA_GRADIENTE_MAX ${f((10 * 2 * CAMARA_SOMBRA.mediaCajaM) / (CAMARA_SOMBRA.farM - CAMARA_SOMBRA.nearM))}
#define LUNA_MUESTRAS_BUSQUEDA 32
#define LUNA_MUESTRAS_FILTRO 32
// D4: con la escena en movimiento (reloj corriendo o cámara girando) cada cuadro se ve una sola vez y la acumulación
// no llega a promediar: se usan 8 muestras por paso en vez de 32 (más grano, el mismo valor medio). Quieta, vuelven las
// 32 y la acumulación de E15.5 limpia el grano. Los materiales sin el uniforme lo leen como 0 (calidad completa).
#define LUNA_MUESTRAS_RAPIDO 8
uniform float lunaRapido;
// Ruido de gradiente intercalado: rota el patrón por píxel (convierte bandas en grano, RTR p. 249).
float lunaRuido( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
// E15.5: semilla por cuadro para la acumulación temporal (RTR p. 251: el patrón cambia de cuadro a cuadro).
// Solo la reciben los materiales que la declaran (terreno y poste); en el resto vale 0.
uniform float lunaSemilla;
// Espiral de Vogel: muestras uniformes en un disco = disco de brillo uniforme (sin limbo, supuesto).
vec2 lunaVogel( int i, int n, float giro ) {
	float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
	float t = float( i ) * 2.399963229728653 + giro;
	return vec2( cos( t ), sin( t ) ) * r;
}
// shadowRadius = tan(θ/2) de esta luz. dirLuzVista apunta hacia la luz, en espacio de vista.
float getShadowPenumbra( vec3 dirLuzVista, sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
	shadowCoord.xyz /= shadowCoord.w;
	// ENV-008: plano del receptor (receiver plane depth bias, RTR p. 250). Las derivadas en pantalla dan cómo
	// cambia la profundidad con la coordenada del mapa; cada muestra se compara contra ese plano y no contra un
	// punto, para que una pendiente no se sombree a sí misma. Va antes de cualquier rama: dFdx necesita flujo uniforme.
	vec3 dX = dFdx( shadowCoord.xyz );
	vec3 dY = dFdy( shadowCoord.xyz );
	float det = dX.x * dY.y - dX.y * dY.x;
	vec2 gradZ = abs( det ) > 1e-14 ? vec2( dY.y * dX.z - dX.y * dY.z, dX.x * dY.z - dY.x * dX.z ) / det : vec2( 0.0 );
	gradZ = clamp( gradZ, vec2( - LUNA_GRADIENTE_MAX ), vec2( LUNA_GRADIENTE_MAX ) );
	shadowCoord.z += shadowBias;
	bool dentro = all( greaterThanEqual( shadowCoord.xy, vec2( 0.0 ) ) ) && all( lessThanEqual( shadowCoord.xy, vec2( 1.0 ) ) ) && shadowCoord.z <= 1.0;
	if ( ! dentro ) return 1.0;
	float tanSemi = shadowRadius;
	float zR = shadowCoord.z;
	float texel = 1.0 / shadowMapSize.x;
	float giro = fract( lunaRuido( gl_FragCoord.xy ) + lunaSemilla * 0.6180339887 ) * PI2;
	// Holgura por el muestreo al vecino más cercano: la profundidad guardada es la del centro del píxel, hasta
	// medio píxel en cada eje del punto pedido.
	float holgura = 0.5 * ( abs( gradZ.x ) + abs( gradZ.y ) ) * texel;
	// 1) Búsqueda de bloqueadores. Ningún obstáculo supera LUNA_ALTURA_MAX_M, así que un bloqueador
	//    está a lo sumo a altura / sin(elevación) metros del receptor a lo largo del rayo.
	vec3 arribaVista = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	float senoElevacion = max( dot( normalize( dirLuzVista ), arribaVista ), 0.02 );
	float distanciaMaxM = min( LUNA_ALTURA_MAX_M / senoElevacion, LUNA_PROFUNDIDAD_M );
	float radioBusqueda = max( distanciaMaxM * tanSemi / LUNA_ANCHO_M, texel );
	int nBusqueda = lunaRapido > 0.5 ? LUNA_MUESTRAS_RAPIDO : LUNA_MUESTRAS_BUSQUEDA;
	int nFiltro = lunaRapido > 0.5 ? LUNA_MUESTRAS_RAPIDO : LUNA_MUESTRAS_FILTRO;
	float sumaZ = 0.0;
	float bloqueadores = 0.0;
	for ( int i = 0; i < LUNA_MUESTRAS_BUSQUEDA; i ++ ) {
		if ( i >= nBusqueda ) break;
		vec2 o = lunaVogel( i, nBusqueda, giro ) * radioBusqueda;
		float z = texture2D( shadowMap, shadowCoord.xy + o ).r;
		if ( z < zR + dot( gradZ, o ) - holgura ) { sumaZ += z; bloqueadores += 1.0; }
	}
	if ( bloqueadores == 0.0 ) return 1.0;
	float zB = sumaZ / bloqueadores;
	// 2) Radio físico de la penumbra: Δd · tan(θ/2), pasado a coordenadas del mapa.
	float radio = ( zR - zB ) * LUNA_PROFUNDIDAD_M * tanSemi / LUNA_ANCHO_M;
	radio = max( radio, 0.5 * texel ); // ENV-006: piso de resolución, no físico
	// 3) Fracción del disco visible: promedio de pruebas de profundidad sobre el disco.
	float visible = 0.0;
	for ( int i = 0; i < LUNA_MUESTRAS_FILTRO; i ++ ) {
		if ( i >= nFiltro ) break;
		vec2 o = lunaVogel( i, nFiltro, giro ) * radio;
		float z = texture2D( shadowMap, shadowCoord.xy + o ).r;
		visible += step( zR + dot( gradZ, o ) - holgura, z );
	}
	return mix( 1.0, visible / float( nFiltro ), shadowIntensity );
}
#elif defined( SHADOWMAP_TYPE_PCF )
// Si alguien vuelve a PCF, o activa la profundidad invertida, se usa el getShadow original (sin penumbra física).
float getShadowPenumbra( vec3 dirLuzVista, sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
	return getShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord );
}
#else
float getShadowPenumbra( vec3 dirLuzVista, sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
	return getShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord );
}
#endif
#endif
`

/**
 * Parcha los fragmentos globales de three antes de la primera compilación (se importa por efecto).
 * Idempotente (Vite HMR) y ruidoso si la versión de three cambia el texto que reemplaza.
 */
function aplicarParche() {
  const pars = ShaderChunk.shadowmap_pars_fragment
  if (pars.includes(MARCA)) return
  const fin = pars.lastIndexOf('#endif') // cierra #ifdef USE_SHADOWMAP (verificado en three 0.187)
  const luces = ShaderChunk.lights_fragment_begin
  const ocurrencias = luces.split(LLAMADA_ORIGINAL).length - 1
  if (fin < 0 || ocurrencias !== 1) {
    throw new Error(
      `ENV-007: el parche de penumbra no coincide con esta versión de three (llamadas encontradas: ${ocurrencias}). Revisar src/scene/penumbra.ts.`,
    )
  }
  ShaderChunk.shadowmap_pars_fragment = pars.slice(0, fin) + GLSL + pars.slice(fin)
  ShaderChunk.lights_fragment_begin = luces.replace(LLAMADA_ORIGINAL, LLAMADA_NUEVA)
}

aplicarParche()

// Las constantes (caja, profundidad, altura máxima) quedan escritas en el GLSL al primer import. Si este
// módulo cambia durante el desarrollo, se recarga la página para no dejar el shader con valores viejos.
if (import.meta.hot) {
  import.meta.hot.accept(() => location.reload())
}
