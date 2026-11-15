// Estereográfica polar sur (la del mapa LOLA de map.png, ±300 km): x hacia 90° E, y hacia 0° E, en metros.
// Funciones puras, copiadas de dem.js del navegador de NASA (solo la proyección: aquí no hay relieve global).

export const R_LUNA = 1_737_400
const RAD = Math.PI / 180

export function llToXY(latDeg: number, lonDeg: number): [number, number] {
  const r = 2 * R_LUNA * Math.tan(Math.PI / 4 + (latDeg * RAD) / 2)
  return [r * Math.sin(lonDeg * RAD), r * Math.cos(lonDeg * RAD)]
}

export function xyToLL(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y)
  const lat = (2 * Math.atan(r / (2 * R_LUNA)) - Math.PI / 2) / RAD
  const lon = Math.atan2(x, y) / RAD
  return [lat, lon]
}

/** Punto de destino sobre la esfera desde (lat, lon) con rumbo y distancia angular (radianes). */
export function destination(latR: number, lonR: number, bearingR: number, deltaR: number): [number, number] {
  const sLat = Math.sin(latR), cLat = Math.cos(latR)
  const sD = Math.sin(deltaR), cD = Math.cos(deltaR)
  const lat2 = Math.asin(sLat * cD + cLat * sD * Math.cos(bearingR))
  const lon2 = lonR + Math.atan2(Math.sin(bearingR) * sD * cLat, cD - sLat * Math.sin(lat2))
  return [lat2, lon2]
}
