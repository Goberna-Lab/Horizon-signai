// Escribe prototipos/lunar-map/data/bitacoras.js desde apps/web/src/shared/bitacoras/ (las bitácoras reales y su
// Markdown en inglés y español), para el panel de misiones del planificador estático.
// Uso: node apps/web/scripts/exportar-bitacoras.ts
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { bitacorasJs } from "../src/shared/bitacoras/exportar.ts"

const destino = fileURLToPath(new URL("../../../prototipos/lunar-map/data/bitacoras.js", import.meta.url))
writeFileSync(destino, bitacorasJs())
console.log(`bitacoras.js → ${destino}`)
