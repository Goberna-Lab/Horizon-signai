// E26.4: punto del terreno bajo el puntero, compartido entre el terreno (que lo escribe) y el datatip (que lo lee) sin
// volver a dibujar toda la escena en cada movimiento del puntero. Guarda también la posición en pantalla, para que el
// datatip se ponga del lado que tape menos (DI p. 448).
import { useSyncExternalStore } from 'react'

export type PuntoSobreTerreno = { x: number; z: number; pantallaX: number; pantallaY: number }
let punto: PuntoSobreTerreno | null = null
const oyentes = new Set<() => void>()

export function fijarPuntoSobreTerreno(p: PuntoSobreTerreno | null) {
  if (p === punto || (p && punto && Math.abs(p.x - punto.x) < 0.25 && Math.abs(p.z - punto.z) < 0.25)) return
  punto = p
  oyentes.forEach((f) => f())
}

export function usePuntoSobreTerreno() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => punto,
  )
}
