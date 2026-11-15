/**
 * El Sol y lo que lo rodea, detrás del relieve: el disco blanco y quemado, su resplandor inmediato, y la corona y
 * la luz zodiacal, que solo se distinguen cuando la cresta tapa el disco (así las vieron las sondas y los
 * astronautas desde la Luna). El destello de cámara va aparte, por delante del relieve (`HorizonScene.tsx`).
 * Un solo shader (WebGL 1, sin bibliotecas). El lienzo sale con alfa premultiplicado.
 */
import { GLOW, type Quality, type Rgb, SUN_COLORS } from "./config"

export type SunFrame = {
  /** Centro y radio del disco, en px de la escena (y hacia abajo). */
  x: number
  y: number
  radius: number
  /** Segundos de animación. */
  time: number
  /** Brillo del disco y de su resplandor, de 0 a 1. */
  disc: number
  /** Brillo de la corona y de la luz zodiacal, de 0 a 1. */
  corona: number
}

export type Sun = {
  resize(width: number, height: number, scale: number): void
  draw(frame: SunFrame): void
  clear(): void
  dispose(): void
}

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const fragment = (quality: Quality) => `
precision highp float;
#define OCTAVES ${quality.octaves}
#define FINE ${quality.fine ? 1 : 0}
uniform vec2 uSun;
uniform float uRadius, uTime, uDisc, uCorona;
uniform vec3 uWhite, uPearl, uZodiacal;
uniform vec2 uLevels; // halo, exposición

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float amp = 0.5, sum = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
mat2 turn(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 p = (gl_FragCoord.xy - uSun) / uRadius;
  float r = length(p);
  vec2 d = p / max(r, 0.0001);
  float h = max(r - 1.0, 0.0);

  // Resplandor pegado al disco.
  vec3 col = uWhite * uDisc * uLevels.x * (1.5 * exp(-h * 1.1) + 0.6 / (1.0 + h * h * 0.5));

  if (uCorona > 0.002) {
    // Luz zodiacal: una banda tenue tendida sobre el horizonte (en el polo la eclíptica va casi a ras de suelo).
    col += uZodiacal * uCorona * (0.11 * exp(-abs(p.y) / 13.0 - abs(p.x) / 75.0) + 0.05 * exp(-r / 26.0));
    if (r < 24.0) {
      // Corona: el ruido se lee sobre la dirección, así salen rayos largos; gira muy despacio.
      vec2 q = turn(uTime * 0.006) * d;
      float broad = fbm(q * 2.2 + vec2(0.0, h * 0.05 - uTime * 0.01));
      float corona = pow(broad * 1.3, 2.2) * exp(-h * (0.16 + 0.5 * (1.0 - broad))) + 0.9 * exp(-h * 0.9);
#if FINE
      float thin = fbm(q * 6.0 + vec2(h * 0.08 - uTime * 0.015, 3.7));
      corona += 0.5 * pow(thin * 1.25, 3.0) * exp(-h * 0.45);
#endif
      col += uPearl * corona * uCorona * (0.94 + 0.06 * sin(uTime * 0.5 + broad * 9.0));
    }
  }

  // El disco: blanco quemado, sin detalle (ninguna cámara lo resuelve).
  col = mix(col, uWhite * 6.0 * uDisc, smoothstep(1.0 + 1.0 / uRadius, 1.0 - 1.0 / uRadius, r));

  col = 1.0 - exp(-col * uLevels.y);
  // Un punto de ruido evita las bandas en los degradados oscuros.
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(clamp(col, 0.0, alpha), alpha);
}`

const UNIFORMS = ["uSun", "uRadius", "uTime", "uDisc", "uCorona", "uWhite", "uPearl", "uZodiacal", "uLevels"] as const

function createGlSun(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, quality: Quality): Sun {
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  const at = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
  let scale = 1
  let cssHeight = 0

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader")
    return shader
  }
  const build = () => {
    program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment(quality)))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program")
    gl.useProgram(program)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // Un triángulo que cubre toda la pantalla.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "p")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (const name of UNIFORMS) at[name] = gl.getUniformLocation(program, name)
    const set = (name: (typeof UNIFORMS)[number], value: Rgb) => gl.uniform3f(at[name], value[0], value[1], value[2])
    set("uWhite", SUN_COLORS.disc)
    set("uPearl", SUN_COLORS.corona)
    set("uZodiacal", SUN_COLORS.zodiacal)
    gl.uniform2f(at.uLevels, GLOW.halo, GLOW.exposure)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
  }
  build()

  // Si el navegador retira el contexto (pasa al cambiar de pestaña en equipos justos), se rehace al volver.
  const lost = (event: Event) => event.preventDefault()
  const restored = () => build()
  canvas.addEventListener("webglcontextlost", lost)
  canvas.addEventListener("webglcontextrestored", restored)

  return {
    resize(width, height, next) {
      scale = next
      cssHeight = height
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },
    draw(frame) {
      if (gl.isContextLost()) return
      gl.uniform2f(at.uSun, frame.x * scale, (cssHeight - frame.y) * scale)
      gl.uniform1f(at.uRadius, frame.radius * scale)
      gl.uniform1f(at.uTime, frame.time)
      gl.uniform1f(at.uDisc, frame.disc)
      gl.uniform1f(at.uCorona, frame.corona * GLOW.corona)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    clear() {
      if (!gl.isContextLost()) gl.clear(gl.COLOR_BUFFER_BIT)
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", lost)
      canvas.removeEventListener("webglcontextrestored", restored)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}

/** Sin WebGL: el disco y un resplandor con degradados, sin corona. */
function createFlatSun(canvas: HTMLCanvasElement): Sun | null {
  const context = canvas.getContext("2d")
  if (!context) return null
  let scale = 1
  const tone = (colour: Rgb, alpha: number) => `rgb(${colour.map((value) => Math.round(value * 255)).join(" ")} / ${alpha.toFixed(3)})`
  return {
    resize(width, height, next) {
      scale = next
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
    },
    draw(frame) {
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      const { x, y, radius } = frame
      const reach = radius * 9
      const halo = context.createRadialGradient(x, y, radius * 0.9, x, y, reach)
      halo.addColorStop(0, tone(SUN_COLORS.disc, 0.8 * frame.disc))
      halo.addColorStop(0.25, tone(SUN_COLORS.disc, 0.2 * Math.max(frame.disc, frame.corona)))
      halo.addColorStop(1, tone(SUN_COLORS.disc, 0))
      context.fillStyle = halo
      context.fillRect(x - reach, y - reach, reach * 2, reach * 2)
      context.fillStyle = tone(SUN_COLORS.disc, frame.disc)
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    },
    clear() {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
    },
    dispose() {},
  }
}

export function createSun(canvas: HTMLCanvasElement, quality: Quality): Sun | null {
  try {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" })
    if (gl) return createGlSun(canvas, gl, quality)
  } catch (error) {
    console.warn("Sun shader unavailable:", error)
  }
  return createFlatSun(canvas)
}
