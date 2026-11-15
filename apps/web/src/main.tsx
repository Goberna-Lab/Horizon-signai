import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// Fuentes autoalojadas (sin peticiones a terceros): Archivo variable (peso y ancho; también los títulos y cifras del
// software) e IBM Plex Mono.
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"
import "@/styles/global.css"
import { App } from "@/app/App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
