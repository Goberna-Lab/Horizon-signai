// Lo interno del proyecto no sale por la IA (pedido de Manuel, 2026-11-15): EVA no habla del código ni de las carpetas
// del repositorio. La regla va en el prompt (REGLAS, ../asistentes.ts) y, por si el modelo no obedece, los extractos de
// la documentación (RAG) llegan sin rutas, sin código entre comillas invertidas y sin enlaces a archivos.

/** Carpetas del repositorio: una ruta que empieza por una de ellas es interna. */
const CARPETAS = "apps|packages|docs|prototipos|luna-recursos|scripts|db|deploy|voz|src|public|features|shared|calculos|interfaz-referencia"

/** El texto de un extracto sin rutas, sin código y sin enlaces a archivos del repositorio. */
export function sinInterno(texto: string): string {
  return (
    texto
      // [texto](ruta/a/archivo.md) → texto
      .replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, "$1")
      // `cualquier código`, `archivo.ts:154`, `funcion()`
      .replace(/`[^`\n]*`/g, "")
      // rutas sueltas: apps/web/src/…, docs/04-planificador.md
      .replace(new RegExp(`(?<![\\w/])(?:${CARPETAS})\\/[\\w./@-]+`, "g"), "")
      // nombres de archivo sueltos: index.html, recorridos.ts, indice-rag.json
      .replace(/(?<![\w/])[\w-]+\.(?:tsx?|jsx?|json|md|html|css|py|sh|yml|yaml)(?::\d+)?\b/g, "")
      // lo que quedó vacío: «( )», «(, )», dobles espacios
      .replace(/\(\s*[,;·]?\s*\)/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ ([,.;:])/g, "$1")
  )
}
