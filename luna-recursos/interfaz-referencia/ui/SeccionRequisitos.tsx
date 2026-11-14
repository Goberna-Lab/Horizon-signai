// E26.4: los requisitos de la misión y el veredicto, en el panel lateral durante la simulación (Center Stage, DI p. 232:
// el panel inferior queda chico para que la escena domine). Los umbrales se editan en línea y el veredicto se recalcula al
// instante (Dynamic Queries, p. 455). Cada criterio lleva la escena al momento que lo decide (Data Brushing, p. 460).
import type { Requisitos, Simulacion } from '../engine/simulacion'
import { Seccion } from './Secciones'

/** Umbral editable de cada criterio (los que tienen número). */
const UMBRALES: Partial<Record<string, { clave: keyof Requisitos; unidad: string; escala?: number; paso?: number }>> = {
  combustible: { clave: 'margenCombustibleKg', unidad: 'kg', paso: 10 },
  noche: { clave: 'bateriaHoras', unidad: 'h' },
  'tierra-estadia': { clave: 'tierraMinimaEstadia', unidad: '%', escala: 100 },
  inclinacion: { clave: 'inclinacionMaximaGrados', unidad: '°' },
}
const OPCIONES: Partial<Record<string, keyof Requisitos>> = { 'sol-contacto': 'solEnContacto', 'tierra-contacto': 'tierraEnContacto' }

export function SeccionRequisitos(props: { sim: Simulacion; requisitos: Requisitos; alCambiar: (r: Partial<Requisitos>) => void; alEnfocar: (id: string) => void; enfocado: string | null }) {
  const { sim, requisitos: r } = props
  const cumplidos = sim.veredicto.filter((c) => c.cumple).length
  return (
    <Seccion titulo={`Tus requisitos (${cumplidos} de ${sim.veredicto.length})`}>
      <ul className="requisitos">
        {sim.veredicto.map((c) => {
          const u = UMBRALES[c.id]
          const o = OPCIONES[c.id]
          return (
            <li key={c.id} className={`${c.cumple ? 'cumple' : 'no-cumple'} ${props.enfocado === c.id ? 'requisitos__item--enfocado' : ''}`}>
              <button className="requisitos__criterio" aria-current={props.enfocado === c.id ? 'true' : undefined} onClick={() => props.alEnfocar(c.id)} title={`Ver en la escena. Fuente: ${c.fuente}`}>
                <span className="requisitos__marca">{c.cumple ? 'Cumple' : 'No cumple'}</span> {c.nombre}
              </button>
              <div className="requisitos__valor">
                {c.valor}
                {u && (
                  <label className="requisitos__umbral">
                    {' '}
                    · tu límite{' '}
                    <input
                      type="number"
                      className="valor__campo"
                      value={Number(((r[u.clave] as number) * (u.escala ?? 1)).toFixed(2))}
                      step={u.paso ?? 1}
                      onChange={(e) => Number.isFinite(e.target.valueAsNumber) && props.alCambiar({ [u.clave]: e.target.valueAsNumber / (u.escala ?? 1) })}
                      aria-label={`Límite: ${c.nombre}`}
                    />{' '}
                    {u.unidad}
                  </label>
                )}
                {o && (
                  <label className="requisitos__umbral">
                    {' '}
                    · <input type="checkbox" checked={r[o] as boolean} onChange={(e) => props.alCambiar({ [o]: e.target.checked })} /> exigir
                  </label>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <label className="requisitos__umbral">
        Días en superficie (dato de la misión){' '}
        <input
          type="number"
          className="valor__campo"
          value={r.diasSuperficie}
          min={1}
          max={30}
          onChange={(e) => Number.isFinite(e.target.valueAsNumber) && props.alCambiar({ diasSuperficie: Math.min(30, Math.max(1, e.target.valueAsNumber)) })}
        />
      </label>
      <p className="nota">Los límites son tuyos (nuestras fuentes no traen umbrales para aterrizar). Clic en un criterio: la escena va al momento que lo decide.</p>
    </Seccion>
  )
}
