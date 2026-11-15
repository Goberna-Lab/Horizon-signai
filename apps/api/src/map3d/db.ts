import postgres from "postgres"

/** Cliente PostgreSQL del mapa 3D (base en `db/`). Sin DATABASE_URL la API arranca igual y /api/map3d responde 503. */
let sql: postgres.Sql | null = null

export class DbNoDisponible extends Error {}

export function db(): postgres.Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new DbNoDisponible("DATABASE_URL no está definida")
  sql ??= postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 30, onnotice: () => {} })
  return sql
}

const CODIGOS_CONEXION = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "CONNECT_TIMEOUT", "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED", "CONNECTION_ENDED", "57P01", "08006", "08001", "28P01", "3D000",
])

export function esFalloDeConexion(e: unknown): boolean {
  if (e instanceof DbNoDisponible) return true
  const code = (e as { code?: string })?.code
  if (code && CODIGOS_CONEXION.has(code)) return true
  const errors = (e as { errors?: unknown[] })?.errors
  return Array.isArray(errors) && errors.some(esFalloDeConexion)
}

/** Memoria con vencimiento para respuestas de metadatos (una sola consulta en vuelo por clave). */
const memo = new Map<string, { hasta: number; valor: Promise<unknown> }>()
export function enMemoria<T>(clave: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const ahora = Date.now()
  const hit = memo.get(clave)
  if (hit && hit.hasta > ahora) return hit.valor as Promise<T>
  const valor = f()
  memo.set(clave, { hasta: ahora + ttlMs, valor })
  valor.catch(() => memo.delete(clave))
  return valor
}
