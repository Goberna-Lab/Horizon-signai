import { useEffect, useState } from 'react'
import { CONOCIDOS, DIAGNOSTICO, mensajes, oyentes } from './diagnosticoDatos'

/**
 * Diagnóstico en pantalla: cuadros por segundo, tiempo por cuadro, llamadas de dibujo, GPU y mensajes capturados
 * (errores y avisos de la consola, incluidos los de compilación de shaders que three envía a console.error).
 * Sirve para reportar problemas del navegador sin abrir la consola (el agente no abre el navegador: AGENTS.md regla 10).
 */
export function Diagnostico() {
  const [, setVersion] = useState(0)
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const f = () => setVersion((v) => v + 1)
    oyentes.add(f)
    const id = setInterval(f, 500)
    return () => {
      oyentes.delete(f)
      clearInterval(id)
    }
  }, [])
  const errores = mensajes.filter((m) => m.tipo === 'error')
  const avisos = mensajes.filter((m) => m.tipo === 'aviso' && !CONOCIDOS.some((r) => r.test(m.texto)))
  const informe = [
    `fps ${DIAGNOSTICO.fps.toFixed(0)} · ${DIAGNOSTICO.msCuadro.toFixed(1)} ms/cuadro · ${DIAGNOSTICO.llamadas} llamadas · ${DIAGNOSTICO.triangulos} triángulos`,
    `GPU: ${DIAGNOSTICO.gpu}`,
    `Navegador: ${navigator.userAgent}`,
    ...mensajes.map((m) => `[${m.tipo}${m.veces > 1 ? ` ×${m.veces}` : ''}] ${m.texto}`),
  ].join('\n')
  const estado = errores.length ? 'diag--error' : avisos.length ? 'diag--aviso' : 'diag--ok'
  return (
    <div className={`diag ${estado}`}>
      <button className="diag__resumen" onClick={() => setAbierto((a) => !a)} title="Diagnóstico (clic para ver)">
        {DIAGNOSTICO.fps.toFixed(0)} fps · {DIAGNOSTICO.msCuadro.toFixed(1)} ms · {errores.length ? `${errores.length} error(es)` : 'sin errores'}
      </button>
      {abierto && (
        <div className="diag__detalle">
          <p>{DIAGNOSTICO.llamadas} llamadas de dibujo · {DIAGNOSTICO.triangulos.toLocaleString('es-PE')} triángulos</p>
          <p>GPU: {DIAGNOSTICO.gpu || '—'}</p>
          {mensajes.length === 0 && <p>Sin mensajes en la consola.</p>}
          {mensajes.map((m, i) => (
            <p key={i} className={m.tipo === 'error' ? 'diag__error' : CONOCIDOS.some((r) => r.test(m.texto)) ? 'diag__conocido' : 'diag__aviso'}>
              {m.tipo === 'error' ? '✗' : '⚠'} {m.veces > 1 ? `×${m.veces} ` : ''}
              {m.texto}
            </p>
          ))}
          <button className="boton-texto" onClick={() => void navigator.clipboard?.writeText(informe)}>Copiar informe</button>
        </div>
      )}
    </div>
  )
}
