import { useFrame, useThree } from '@react-three/fiber'
import {
  HalfFloatType,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'
import { UNIFORME_RAPIDO, UNIFORME_SEMILLA } from './materiales'

/**
 * E15.5: acumulación temporal. Con la imagen quieta (reloj en pausa, cámara y controles sin cambios), cada cuadro se
 * dibuja con otra semilla para el ruido de la penumbra y se promedia con los anteriores: el grano desaparece y el valor
 * medio no cambia (RTR cap. 5.4.2, p. 142; cap. 12.2, p. 523, ec. 12.2: "particularly recommended for… soft shadows").
 * Se acumula en lineal (media precisión) y la curva de tono y la exposición se aplican al final, sobre el promedio:
 * así el promedio es de radiancias, no de valores ya comprimidos (RTR p. 286).
 */

/** Cuadros que se promedian como máximo (después la imagen queda fija). */
const MAXIMO = 64

/** Recursos de la acumulación: hay una sola escena del sitio, así que viven en el módulo (se crean una vez). */
function crearRecursos() {
  const opciones = { type: HalfFloatType, depthBuffer: true, samples: 4 }
  const actual = new WebGLRenderTarget(1, 1, opciones)
  // D4: destino reducido para los cuadros en movimiento (densidad de píxeles 1 en vez de la de la pantalla).
  const actualRapido = new WebGLRenderTarget(1, 1, opciones)
  const acumuladas = [new WebGLRenderTarget(1, 1, { type: HalfFloatType }), new WebGLRenderTarget(1, 1, { type: HalfFloatType })]
  const camaraPlana = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mezcla = new ShaderMaterial({
    uniforms: { uActual: { value: null }, uPrevio: { value: null }, uPeso: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uActual; uniform sampler2D uPrevio; uniform float uPeso; varying vec2 vUv;
      void main() { gl_FragColor = mix( texture2D( uPrevio, vUv ), texture2D( uActual, vUv ), uPeso ); }`,
    depthTest: false,
    depthWrite: false,
  })
  const salida = new ShaderMaterial({
    uniforms: { uImagen: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uImagen; varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D( uImagen, vUv );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  })
  const cuadro = new Mesh(new PlaneGeometry(2, 2), mezcla)
  const escenaPlana = new Scene()
  escenaPlana.add(cuadro)
  return { actual, actualRapido, acumuladas, camaraPlana, mezcla, salida, cuadro, escenaPlana, n: 0, lectura: 0, ultimaFirma: '', ultimaCamara: new Matrix4(), tam: new Vector2(), rapidoAntes: false }
}
let RECURSOS: ReturnType<typeof crearRecursos> | null = null

export function Acumulacion({ activa, firma }: { activa: boolean; firma: string }) {
  const { gl, scene, camera } = useThree()
  useFrame(() => {
    RECURSOS ??= crearRecursos()
    const r = RECURSOS
    gl.getDrawingBufferSize(r.tam)
    const ancho = Math.max(1, Math.floor(r.tam.x))
    const alto = Math.max(1, Math.floor(r.tam.y))
    if (r.actual.width !== ancho || r.actual.height !== alto) {
      r.actual.setSize(ancho, alto)
      r.acumuladas.forEach((x) => x.setSize(ancho, alto))
      r.n = 0
    }
    const camaraQuieta = r.ultimaCamara.equals(camera.matrixWorld)
    // D4: la escena se mueve si cambió algo desde el cuadro anterior (reloj, cámara, opciones).
    const rapido = !camaraQuieta || firma !== r.ultimaFirma
    // Al detenerse se descarta el último cuadro rápido: el promedio queda solo con cuadros de calidad completa.
    if (!activa || rapido || r.rapidoAntes) r.n = 0
    r.rapidoAntes = rapido
    r.ultimaCamara.copy(camera.matrixWorld)
    r.ultimaFirma = firma
    UNIFORME_SEMILLA.value = r.n
    UNIFORME_RAPIDO.value = rapido ? 1 : 0
    // D4: en movimiento se dibuja con densidad de píxeles 1 (en una pantalla de 1,6×, 2,6 veces menos píxeles); la
    // mezcla lo amplía al tamaño de la pantalla. Quieta, vuelve la resolución completa.
    const escala = rapido ? Math.min(1, 1 / gl.getPixelRatio()) : 1
    const destino = escala < 1 ? r.actualRapido : r.actual
    if (escala < 1) {
      const w = Math.max(1, Math.floor(ancho * escala))
      const h = Math.max(1, Math.floor(alto * escala))
      if (r.actualRapido.width !== w || r.actualRapido.height !== h) r.actualRapido.setSize(w, h)
    }

    if (!activa) {
      gl.setRenderTarget(null)
      gl.render(scene, camera)
      return
    }
    if (r.n >= MAXIMO) {
      // Imagen ya convergida: se vuelve a mostrar el promedio sin dibujar la escena.
      r.cuadro.material = r.salida
      r.salida.uniforms.uImagen.value = r.acumuladas[r.lectura].texture
      gl.setRenderTarget(null)
      gl.render(r.escenaPlana, r.camaraPlana)
      return
    }
    // 1) Escena en lineal (sin curva de tono: three solo la aplica al dibujar en pantalla).
    gl.setRenderTarget(destino)
    gl.clear()
    gl.render(scene, camera)
    // 2) Promedio móvil: nuevo = previo + (actual − previo)/(n + 1).
    const escritura = 1 - r.lectura
    r.cuadro.material = r.mezcla
    r.mezcla.uniforms.uActual.value = destino.texture
    r.mezcla.uniforms.uPrevio.value = r.acumuladas[r.lectura].texture
    r.mezcla.uniforms.uPeso.value = 1 / (r.n + 1)
    gl.setRenderTarget(r.acumuladas[escritura])
    gl.render(r.escenaPlana, r.camaraPlana)
    r.lectura = escritura
    r.n++
    // 3) A pantalla, con exposición, curva de tono y espacio de color.
    r.cuadro.material = r.salida
    r.salida.uniforms.uImagen.value = r.acumuladas[r.lectura].texture
    gl.setRenderTarget(null)
    gl.render(r.escenaPlana, r.camaraPlana)
  }, 1)

  return null
}
