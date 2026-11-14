// Datos del diagnóstico (sin componentes, para que Vite pueda recargar Diagnostico.tsx en caliente).
// Las métricas del render las escribe MedidorRender (dentro del Canvas) en DIAGNOSTICO.
export const DIAGNOSTICO = { fps: 0, msCuadro: 0, llamadas: 0, triangulos: 0, gpu: '' }

export type Mensaje = { tipo: 'error' | 'aviso'; texto: string; veces: number }
export const mensajes: Mensaje[] = []
export const oyentes = new Set<() => void>()

export function registrar(tipo: Mensaje['tipo'], partes: unknown[]) {
  const texto = partes.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ').slice(0, 600)
  const previo = mensajes.find((m) => m.texto === texto)
  if (previo) previo.veces++
  else mensajes.push({ tipo, texto, veces: 1 })
  if (mensajes.length > 50) mensajes.shift()
  oyentes.forEach((f) => f())
}

let instalado = false
/** Intercepta console.error/console.warn y los errores globales (una sola vez). */
export function instalarCaptura() {
  if (instalado) return
  instalado = true
  const error = console.error.bind(console)
  const aviso = console.warn.bind(console)
  console.error = (...a: unknown[]) => {
    registrar('error', a)
    error(...a)
  }
  console.warn = (...a: unknown[]) => {
    registrar('aviso', a)
    aviso(...a)
  }
  window.addEventListener('error', (e) => registrar('error', [e.message]))
  window.addEventListener('unhandledrejection', (e) => registrar('error', [String(e.reason)]))
}

/** Avisos conocidos de bibliotecas que no afectan la simulación (se muestran aparte). */
export const CONOCIDOS = [/THREE\.Clock/, /mozPressure/, /mozInputSource/]

