// Materiales del regolito (representación). Lambertianos (E8) con la luz indirecta de ENV-009 inyectada en el shader:
// - Terreno (E11): irradiancia de un rebote calculada por el motor sobre el relieve real (atributo por vértice).
// - Poste: luz devuelta por un suelo plano infinito, ρ·E·(1 − n_y)/2 (ángulo sólido proyectado, PBR pp. 191–193; exacto
//   en ese supuesto, prueba T2). Simplificación: ignora su propia franja de sombra (sobreestima hasta ~2× al pie,
//   cálculo MC de la auditoría) y el relieve.
// Reemplazan a la hemisphereLight de E2.1, que contaba la misma luz dos veces sobre el terreno (PBR p. 580).
import { Color, LinearSRGBColorSpace, MeshLambertMaterial, ShaderChunk, type MeshStandardMaterial } from 'three'
import { ESCALA_VISUAL, SUPERFICIE } from '../engine/environment'
import { HAPKE_H, HAPKE_P, PARAMETROS_WAC, W_SITIO } from '../engine/hapke'

const colorRegolito = new Color().setRGB(SUPERFICIE.albedo, SUPERFICIE.albedo, SUPERFICIE.albedo, LinearSRGBColorSpace)

/** E15.5: semilla por cuadro del ruido de la penumbra (acumulación temporal). */
export const UNIFORME_SEMILLA = { value: 0 }

/** D4: 1 mientras la escena se mueve (menos muestras de penumbra por cuadro); 0 quieta. Lo fija la acumulación. */
export const UNIFORME_RAPIDO = { value: 0 }

/** Irradiancia (unidades de la escena) que el suelo plano devuelve hacia el poste: ESCALA·ρ·E_suelo. */
export const UNIFORME_SUELO = { value: 0 }

/**
 * ENV-009 (E12): luz directa sobre el terreno con la BRDF de Hapke (LSB p. 559), f = r/µ0, con w calibrado para un
 * albedo normal de 0,085 (src/engine/hapke.ts). La luz indirecta (rebote, E11) sigue siendo lambertiana con ρ = 0,085.
 */
const LINEA_LAMBERT_DIRECTA = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );'
const f = (x: number) => x.toFixed(6)
/**
 * PI para los ShaderMaterial (Valle, globo): three lo define en el chunk <common>, que un ShaderMaterial no incluye.
 * Con #ifndef no choca con <common> dentro de los materiales Lambert.
 */
export const GLSL_PI = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
`

/** GLSL de la BRDF de Hapke del sitio (E12); también la usan el globo (E14) y el valle (E16). */
export const GLSL_HAPKE = /* glsl */ `${GLSL_PI}
#define LUNA_W ${f(W_SITIO)}
#define LUNA_B0 ${f(Math.exp((-W_SITIO * W_SITIO) / 2))}
#define LUNA_HH ${f(HAPKE_H)}
#define LUNA_P ${f(HAPKE_P)}
#define LUNA_RAIZ_1W ${f(Math.sqrt(1 - W_SITIO))}
float lunaH( float x ) { return ( 1.0 + 2.0 * x ) / ( 1.0 + 2.0 * x * LUNA_RAIZ_1W ); }
float lunaB( float g ) {
  if ( g > 1.5707963 ) return 0.0;
  float t = tan( g );
  if ( t < 1e-6 ) return LUNA_B0;
  float e = exp( - LUNA_HH / t );
  return LUNA_B0 * ( 1.0 - t * ( 3.0 - e ) * ( 1.0 - e ) / ( 2.0 * LUNA_HH ) );
}
// E17: Hapke con parámetros medidos por LROC WAC (Sato et al. 2014), ecs. de Schröder et al. 2017 (13–16), sin rugosidad;
// c > 0 = retrodispersión (ver src/engine/hapke.ts).
#define WAC_W ${f(PARAMETROS_WAC.w)}
#define WAC_B ${f(PARAMETROS_WAC.b)}
#define WAC_C ${f(PARAMETROS_WAC.c)}
#define WAC_BS0 ${f(PARAMETROS_WAC.Bs0)}
#define WAC_HS ${f(PARAMETROS_WAC.hs)}
float lunaHapkeWAC( vec3 haciaLuz, vec3 n, vec3 haciaObservador ) {
  float mu0 = max( dot( n, haciaLuz ), 0.0 );
  float mu = max( dot( n, haciaObservador ), 1e-4 );
  float cg = clamp( dot( haciaLuz, haciaObservador ), -1.0, 1.0 );
  float g = acos( cg );
  float raiz = sqrt( 1.0 - WAC_W );
  float h0 = ( 1.0 + 2.0 * mu0 ) / ( 1.0 + 2.0 * mu0 * raiz );
  float h1 = ( 1.0 + 2.0 * mu ) / ( 1.0 + 2.0 * mu * raiz );
  float bsh = 1.0 + WAC_BS0 / ( 1.0 + tan( 0.5 * g ) / WAC_HS );
  float b2 = WAC_B * WAC_B;
  float p = 0.5 * ( 1.0 + WAC_C ) * ( 1.0 - b2 ) / pow( 1.0 - 2.0 * WAC_B * cg + b2, 1.5 )
          + 0.5 * ( 1.0 - WAC_C ) * ( 1.0 - b2 ) / pow( 1.0 + 2.0 * WAC_B * cg + b2, 1.5 );
  return WAC_W / ( 4.0 * PI ) / ( mu0 + mu ) * ( bsh * p + h0 * h1 - 1.0 );
}
// BRDF de Hapke f = r/µ0 = (w/4π)/(µ0 + µ)·{[1 + B(g)]P + H(µ0)H(µ) − 1}  (LSB p. 559).
float lunaHapke( vec3 haciaLuz, vec3 n, vec3 haciaObservador ) {
  float mu0 = max( dot( n, haciaLuz ), 0.0 );
  float mu = max( dot( n, haciaObservador ), 1e-4 );
  float g = acos( clamp( dot( haciaLuz, haciaObservador ), -1.0, 1.0 ) );
  return LUNA_W / ( 4.0 * PI ) / ( mu0 + mu ) * ( ( 1.0 + lunaB( g ) ) * LUNA_P + lunaH( mu0 ) * lunaH( mu ) - 1.0 );
}
`
/** E17: modelo del regolito para la luz directa del terreno: 0 = Hapke calibrado (E12), 1 = Hapke medido (WAC). */
export const UNIFORME_MODELO = { value: 0 }

const CHUNK_HAPKE = (() => {
  const original = ShaderChunk.lights_lambert_pars_fragment
  if (original.split(LINEA_LAMBERT_DIRECTA).length !== 2) {
    throw new Error('E12: el chunk lambert de three cambió; revisar src/scene/materiales.ts.')
  }
  return 'uniform float uModeloRegolito;\n' + GLSL_HAPKE + original.replace(
    LINEA_LAMBERT_DIRECTA,
    // E15.1: la Hapke del sitio (albedo normal 0,085) se escala por el albedo local de la textura (si la hay).
    // E17: uModeloRegolito = 0 → Hapke calibrado (E12); 1 → Hapke medido por LROC WAC.
    'reflectedLight.directDiffuse += irradiance * ( uModeloRegolito > 0.5 ? lunaHapkeWAC( directLight.direction, geometryNormal, geometryViewDir ) : lunaHapke( directLight.direction, geometryNormal, geometryViewDir ) ) * ( material.diffuseColor.r / 0.085 );',
  )
})()

export const MATERIAL_TERRENO = new MeshLambertMaterial({ color: colorRegolito })
MATERIAL_TERRENO.customProgramCacheKey = () => 'luna-terreno-hapke-wac-rebote'
MATERIAL_TERRENO.onBeforeCompile = (shader) => {
  shader.uniforms.uEscalaRebote = { value: ESCALA_VISUAL }
  shader.uniforms.uModeloRegolito = UNIFORME_MODELO
  shader.uniforms.lunaSemilla = UNIFORME_SEMILLA
  shader.uniforms.lunaRapido = UNIFORME_RAPIDO
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float rebote;\nvarying float vRebote;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRebote = rebote;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vRebote;\nuniform float uEscalaRebote;')
    .replace('#include <lights_lambert_pars_fragment>', CHUNK_HAPKE)
    .replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += uEscalaRebote * vRebote * BRDF_Lambert( material.diffuseColor );',
    )
}

export const MATERIAL_POSTE = new MeshLambertMaterial({ color: colorRegolito })
MATERIAL_POSTE.customProgramCacheKey = () => 'luna-poste-suelo-plano'
MATERIAL_POSTE.onBeforeCompile = (shader) => {
  shader.uniforms.uRadiosidadSuelo = UNIFORME_SUELO
  shader.uniforms.lunaSemilla = UNIFORME_SEMILLA
  shader.uniforms.lunaRapido = UNIFORME_RAPIDO
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uRadiosidadSuelo;')
    .replace(
      '#include <lights_fragment_end>',
      [
        '#include <lights_fragment_end>',
        'vec3 nMundo = inverseTransformDirection( normal, viewMatrix );',
        'reflectedLight.indirectDiffuse += uRadiosidadSuelo * ( 1.0 - nMundo.y ) * 0.5 * BRDF_Lambert( material.diffuseColor );',
      ].join('\n'),
    )
}

/**
 * E15.6 / ENV-009: luz que devuelve el regolito sobre un material físico (MeshStandardMaterial) del módulo lunar.
 * Misma hipótesis que el poste: el suelo es un plano infinito lambertiano iluminado, de radiancia L = ρ·E/π, y el cielo
 * es negro (ENV-001). uRadiosidadSuelo = ESCALA·ρ·E_suelo = ESCALA·π·L.
 * - Difusa: irradiancia π·L·(1 − n_y)/2 (ángulo sólido proyectado, PBR pp. 191–193; exacta en ese supuesto, prueba T2).
 * - Especular (lámina metálica): el reflejo ve L si apunta hacia abajo y 0 (cielo negro) si apunta hacia arriba; el
 *   paso por el horizonte se suaviza con la rugosidad (aproximación, supuesto).
 * Simplificaciones: el suelo bajo el LM se toma iluminado entero (ignora la sombra del propio LM) y sin relieve.
 */
export function conLuzDelSuelo<M extends MeshStandardMaterial>(material: M): M {
  material.customProgramCacheKey = () => 'luna-lm-luz-del-suelo'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRadiosidadSuelo = UNIFORME_SUELO
    shader.uniforms.lunaRapido = UNIFORME_RAPIDO
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRadiosidadSuelo;')
      .replace(
        '#include <lights_fragment_end>',
        [
          'vec3 nSuelo = inverseTransformDirection( geometryNormal, viewMatrix );',
          'vec3 rSuelo = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );',
          'iblIrradiance += vec3( uRadiosidadSuelo * ( 1.0 - nSuelo.y ) * 0.5 );',
          'float haciaSuelo = clamp( 0.5 - rSuelo.y / ( 2.0 * max( material.roughness, 0.05 ) ), 0.0, 1.0 );',
          'radiance += vec3( uRadiosidadSuelo * RECIPROCAL_PI * haciaSuelo );',
          '#include <lights_fragment_end>',
        ].join('\n'),
      )
  }
  return material
}
