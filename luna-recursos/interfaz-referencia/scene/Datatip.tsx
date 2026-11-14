import { Html } from '@react-three/drei'
import { OBSTACULO, limitesSombra } from '../engine/environment'
import { alturaSuelo, limitesSombraSobreTerreno } from '../engine/terreno'

/**
 * Datatips (Designing Interfaces, 3.ª ed., cap. 9, p. 446 y pp. 447–451): el dato aparece donde está el puntero,
 * sin ensuciar la vista. Solo representación: los números vienen del motor (ENV-003, ENV-007, ENV-008).
 * ENV-006: es una ayuda de lectura, no física.
 */
export function Datatip(props: { elevacionGrados: number; diametroSolGrados: number; sombraX: number; sombraZ: number }) {
  const { elevacionGrados, diametroSolGrados, sombraX, sombraZ } = props
  const h = OBSTACULO.alturaM
  const D = 2 * OBSTACULO.radioM
  const plano = limitesSombra(h, D, elevacionGrados, diametroSolGrados)
  const real = limitesSombraSobreTerreno(h, D, elevacionGrados, diametroSolGrados, sombraX, sombraZ)
  const haySombra = elevacionGrados > 1e-6
  const metros = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '∞')
  return (
    <Html position={[0, alturaSuelo(0, 0) + h + 1.5, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="datatip" role="tooltip">
        <div className="datatip__linea">
          h {h} m · α {elevacionGrados.toFixed(1)}° · L {haySombra ? `${metros(real.centroM)} m sobre el relieve` : 'sin sombra solar'}
        </div>
        {haySombra && (
          <div className="datatip__secundaria">
            suelo plano: {metros(plano.centroM)} m · penumbra {metros(real.finNucleoM)}–{metros(real.finPenumbraM)} m
          </div>
        )}
      </div>
    </Html>
  )
}
