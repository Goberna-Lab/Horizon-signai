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

// Secciones de la documentación que son del proyecto por dentro (estructura del repositorio, cómo correrlo, con qué
// modelos y servidores, pruebas por archivo, arquitectura y diferencias con el código): el RAG no las entrega nunca,
// aunque se parezcan a la pregunta. Así la IA no puede contarlas aunque la convenzan.
const DOCS_INTERNOS = new Set(["docs/10-diferencias-spec-codigo.md", "docs/11-flujo-y-arquitectura.md"])
const SECCIONES_INTERNAS = /repository map|run it locally|use of ai|definiciones que usa el c[oó]digo|pruebas por archivo|qui[eé]n lee cada archivo|generan archivos|c[oó]mo leer estos documentos/i

/** ¿Este trozo del índice es del proyecto por dentro? */
export const esInterno = (t: { ruta: string; titulo: string }): boolean =>
  DOCS_INTERNOS.has(t.ruta) || /(^|\/)(CLAUDE|ARCHITECTURE|AGENTS)\.md$/i.test(t.ruta) || SECCIONES_INTERNAS.test(t.titulo)
