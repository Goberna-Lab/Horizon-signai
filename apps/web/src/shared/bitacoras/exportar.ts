// La bitácora como documento (Markdown, para descargar) y como datos para las páginas estáticas del planificador
// (prototipos/lunar-map/, que no importan TypeScript). Lo escribe apps/web/scripts/exportar-bitacoras.ts; la prueba
// bitacoras.test.ts avisa si el archivo del prototipo quedó viejo.
import { BITACORAS, diaDeMision, fuentesDe } from "./index.ts"
import type { Bitacora } from "./tipos.ts"

type Idioma = "en" | "es"

const MES: Record<Idioma, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}
const fecha = (iso: string, l: Idioma) => `${+iso.slice(8, 10)} ${MES[l][+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`
const cuando = (iso: string, precision: "minuto" | "dia", l: Idioma) =>
  precision === "minuto" ? `${fecha(iso, l)}, ${iso.slice(11, 16)} UTC` : fecha(iso, l)

const T = {
  en: { op: "Operator", prog: "Program", ship: "Lander", site: "Site", slope: "slope", planned: "Planned", actual: "Actual", log: "Log", before: "Before the mission", day: "Day", why: "Why it matters", src: "Sources", srcs: "Sources", note: "Compiled by Horizon Signai from the sources listed. The «why it matters» notes are our explanation, not mission data." },
  es: { op: "Operador", prog: "Programa", ship: "Módulo", site: "Sitio", slope: "pendiente", planned: "Previsto", actual: "Real", log: "Bitácora", before: "Antes de la misión", day: "Día", why: "Por qué importa", src: "Fuentes", srcs: "Fuentes", note: "Recopilada por Horizon Signai a partir de las fuentes indicadas. Las notas «por qué importa» son explicación nuestra, no datos de la misión." },
}

/** La bitácora como documento Markdown en un idioma. */
export function bitacoraMarkdown(b: Bitacora, l: Idioma): string {
  const t = T[l], s = b.sitio
  const grados = (n: number) => (l === "es" ? Math.abs(n).toFixed(2).replace(".", ",") : Math.abs(n).toFixed(2)) + "°"
  const out = [
    `# ${b.nombre} · ${b.nave}`,
    "",
    b.resumen[l],
    "",
    `- **${t.op}:** ${b.operador}`,
    `- **${t.prog}:** ${b.programa}`,
    `- **${t.site}:** ${s.nombre} · ${grados(s.lat)} ${s.lat < 0 ? "S" : "N"}, ${grados(s.lon)} E${s.elevacionM ? ` · ${s.elevacionM} m` : ""}${s.pendienteDeg ? ` · ${t.slope} ${s.pendienteDeg}°` : ""}`,
    `- **${t.planned}:** ${b.prevista[l]}`,
    `- **${t.actual}:** ${b.real[l]}`,
    "",
    `## ${t.log}`,
  ]
  for (const h of b.hechos) {
    const d = diaDeMision(b, h)
    const encabezado = h.utc == null ? t.before
      : `${t.day} ${d}${h.hastaUtc ? `–${diaDeMision(b, { ...h, utc: h.hastaUtc })}` : ""} · ${cuando(h.utc, h.precision, l)}${h.hastaUtc ? ` → ${cuando(h.hastaUtc, h.precision, l)}` : ""}`
    out.push("", `### ${encabezado} — ${h.titulo[l]}`, "", h.texto[l])
    if (h.porQue) out.push("", `> **${t.why}:** ${h.porQue[l]}`)
    out.push("", `${t.src}: ${fuentesDe(b, h).map((f) => `[${f.id}](${f.url})`).join(", ")}`)
  }
  out.push("", `## ${t.srcs}`, "", ...b.fuentes.map((f) => `- **${f.id}** · [${f.titulo}](${f.url})`), "", `*${t.note}*`, "")
  return out.join("\n")
}

/** El archivo `prototipos/lunar-map/data/bitacoras.js`: las bitácoras, con su Markdown ya hecho en los dos idiomas. */
export function bitacorasJs(): string {
  const datos = BITACORAS.map((b) => ({ ...b, markdown: { en: bitacoraMarkdown(b, "en"), es: bitacoraMarkdown(b, "es") } }))
  return (
    "/* Bitácoras de misiones reales, día por día y con fuentes. NO editar a mano: sale de apps/web/src/shared/bitacoras/\n" +
    " * con `node apps/web/scripts/exportar-bitacoras.ts` (la prueba bitacoras.test.ts avisa si quedó viejo). */\n" +
    "window.LunarData = window.LunarData || {};\n" +
    `LunarData.bitacoras = ${JSON.stringify(datos)};\n`
  )
}
