// Resume los tiempos de las conversaciones con EVA que el API escribe en su log («[eva-tiempos] {json}», ver
// /eva/tiempos en apps/api/src/z6.ts y apps/web/src/features/assistant/eva/tiempos.ts).
//
// Producción: el log de nginx, que sobrevive a los deploys (los de Docker se borran al recrear el contenedor). Cada
// registro va en la URL del pedido (/api/z6/eva/tiempos?r=<base64url>):
//   ssh vps2 'sudo cat /var/log/nginx/domains/signal-horizon.goberna.us.log' | npx tsx apps/api/scripts/tiempos-eva.ts
// También lee las líneas «[eva-tiempos] {json}» del API (docker logs horizon_signai_app_a / _app_b).
// Opciones: --json (cada registro en una línea, para guardarlos) · --ultimos=N (la tabla de los N más recientes; 20).
import { createInterface } from "node:readline"

type Registro = {
  id?: string
  origen?: string
  idioma?: string
  hora?: string
  marcas: Record<string, number>
  datos: Record<string, string | number | boolean>
}

const registros: Registro[] = []
const valido = (r: unknown): r is Registro =>
  !!r && typeof r === "object" && typeof (r as Registro).marcas === "object" && typeof (r as Registro).datos === "object"
for await (const linea of createInterface({ input: process.stdin })) {
  try {
    const i = linea.indexOf("[eva-tiempos] ")
    const u = linea.match(/\/api\/z6\/eva\/tiempos\?r=([\w-]+)/)
    const r: unknown = i >= 0 ? JSON.parse(linea.slice(i + 14)) : u ? JSON.parse(Buffer.from(u[1]!, "base64url").toString("utf8")) : null
    if (valido(r)) registros.push(r)
  } catch {
    /* línea cortada o ajena */
  }
}
// Una misma conversación no se repite, aunque se lean los logs de las dos copias.
const vistos = new Set<string>()
const unicos = registros.filter((r) => !r.id || (!vistos.has(r.id) && vistos.add(r.id))).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""))

if (process.argv.includes("--json")) {
  for (const r of unicos) console.log(JSON.stringify(r))
  process.exit(0)
}
if (!unicos.length) {
  console.log("No hay registros [eva-tiempos] en la entrada.")
  process.exit(0)
}

const s = (ms?: number) => (ms === undefined ? "—" : (ms / 1000).toFixed(2))
const n = Number(process.argv.find((a) => a.startsWith("--ultimos="))?.split("=")[1] ?? 20)
console.log(`${unicos.length} conversaciones (${unicos[0]!.hora?.slice(0, 16)} → ${unicos.at(-1)!.hora?.slice(0, 16)} UTC)\n`)
console.log("Últimas, en segundos desde que la persona terminó de hablar (o envió lo escrito):")
console.table(
  unicos.slice(-n).map((r) => ({
    hora: r.hora?.slice(11, 19),
    origen: `${r.origen}/${r.idioma}`,
    tipo: r.datos.tipo,
    habló: s(Number(r.datos.hablaMs) || undefined),
    entendió: s(r.marcas.oido),
    murmullo: s(r.marcas.murmullo),
    eco: s(r.marcas.ecoSuena),
    respuesta: s(r.marcas.respuestaSuena),
    fin: s(r.marcas.fin),
    cómo: r.datos.fin,
  })),
)

// Mediana y percentil 90 de cada marca, por tipo de respuesta.
const pct = (xs: number[], p: number) => {
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.floor((o.length - 1) * p))]
}
const tipos = [...new Set(unicos.map((r) => String(r.datos.tipo ?? "?").split(":")[0]))]
for (const tipo of tipos) {
  const grupo = unicos.filter((r) => String(r.datos.tipo ?? "?").split(":")[0] === tipo)
  const filas: Record<string, { n: number; mediana: string; p90: string }> = {}
  const claves = [...new Set(grupo.flatMap((r) => Object.keys(r.marcas)))]
  for (const k of claves) {
    const xs = grupo.map((r) => r.marcas[k]).filter((x): x is number => typeof x === "number")
    filas[k] = { n: xs.length, mediana: s(pct(xs, 0.5)), p90: s(pct(xs, 0.9)) }
  }
  for (const k of ["servidor_rag", "servidor_primerToken", "servidor_primeraFrase", "servidor_ecoTema", "servidorPrimeraVozMs", "servidorMs"]) {
    const xs = grupo.map((r) => r.datos[k]).filter((x): x is number => typeof x === "number")
    if (xs.length) filas[`(servidor) ${k.replace(/^servidor_?/, "")}`] = { n: xs.length, mediana: s(pct(xs, 0.5)), p90: s(pct(xs, 0.9)) }
  }
  const finales = grupo.reduce<Record<string, number>>((a, r) => ((a[String(r.datos.fin)] = (a[String(r.datos.fin)] ?? 0) + 1), a), {})
  console.log(`\n${tipo} · ${grupo.length} conversaciones · ${Object.entries(finales).map(([k, v]) => `${k} ${v}`).join(", ")}`)
  console.table(filas)
}
