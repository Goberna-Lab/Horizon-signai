// E26.4: Datatip del terreno (DI cap. 9, pp. 447–448): al pasar el puntero, junto a él, temporal y compacto: posición,
// altura, pendiente, inclinación de un LM apoyado ahí (E19) y si en ese punto y ese instante se ven el Sol y la Tierra desde
// la altura del observador elegida en Evaluación (la misma en las dos vistas: Data Brushing, p. 460). Se pone del lado
// que tape menos (p. 448) y avisa qué hace el clic (drill-down, p. 448).
import { Html } from '@react-three/drei'
import { apoyoLM, cieloEnPunto, huellaDentro } from '../engine/evaluacion'
import type { EstadoEscena } from '../engine/simulation'
import { alturaSuelo, dentroDelTerreno, pendienteGrados } from '../engine/terreno'
import { usePuntoSobreTerreno } from './sobreTerreno'

/** Ancho y alto aproximados del datatip (px), para cambiar de lado antes de tapar un panel. */
const ANCHO_DATATIP_PX = 300
const ALTO_DATATIP_PX = 90

/** Bordes libres de la escena: a la izquierda del panel lateral (si está abierto) y encima del panel inferior (si lo hay). */
function bordesLibres(): { derecha: number; abajo: number } {
  const panel = document.querySelector('.panel--abierto')?.getBoundingClientRect()
  const inferior = document.querySelector('.simulacion')?.getBoundingClientRect()
  return { derecha: panel ? panel.left : window.innerWidth, abajo: inferior ? inferior.top : window.innerHeight }
}

export function DatatipTerreno({ estado, alturaM, textoClic }: { estado: EstadoEscena; alturaM: number; textoClic: string }) {
  const p = usePuntoSobreTerreno()
  if (!p || !dentroDelTerreno(p.x, p.z)) return null
  const h = alturaSuelo(p.x, p.z)
  const c = cieloEnPunto(estado, p.x, p.z, alturaM)
  const apoyo = huellaDentro(p.x, p.z) ? apoyoLM(p.x, p.z) : null
  const libres = bordesLibres()
  const izquierda = p.pantallaX + 14 + ANCHO_DATATIP_PX > libres.derecha
  const arriba = p.pantallaY + ALTO_DATATIP_PX / 2 > libres.abajo
  const transform = `translate(${izquierda ? 'calc(-100% - 14px)' : '14px'}, ${arriba ? 'calc(-100% - 10px)' : '-50%'})`
  const g = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`
  return (
    <Html position={[p.x, h + 0.5, p.z]} style={{ pointerEvents: 'none', transform }} zIndexRange={[4, 0]}>
      <div className="datatip">
        <div>
          {Math.abs(p.x).toFixed(0)} m {p.x >= 0 ? 'E' : 'O'}, {Math.abs(p.z).toFixed(0)} m {p.z >= 0 ? 'S' : 'N'} · altura {g(h)} m · pendiente{' '}
          {pendienteGrados(p.x, p.z).toFixed(1)}°{apoyo ? ` · LM inclinado ${apoyo.inclinacionGrados.toFixed(1)}°` : ''}
        </div>
        <div className="datatip__secundaria">
          Desde {alturaM === 0 ? 'el suelo' : `${String(alturaM).replace('.', ',')} m`}: Sol {estadoAstro(c.solVisible, c.solSobreHorizonteGrados, 'o')} · Tierra{' '}
          {estadoAstro(c.tierraVisible, c.tierraSobreHorizonteGrados, 'a')}
        </div>
        <div className="datatip__secundaria">{textoClic}</div>
      </div>
    </Html>
  )
}

/** "visible (+1,8°)", "oculto bajo el horizonte (−0,5°)" o "tapado por el relieve cercano" (sobre el horizonte lejano pero bloqueado). */
function estadoAstro(visible: boolean, sobreHorizonte: number, genero: 'o' | 'a'): string {
  const g = `${sobreHorizonte >= 0 ? '+' : '−'}${Math.abs(sobreHorizonte).toFixed(1)}°`
  if (visible) return `visible (${g} sobre el horizonte)`
  if (sobreHorizonte > 0) return `tapad${genero} por el relieve cercano`
  return `ocult${genero} bajo el horizonte (${g})`
}
