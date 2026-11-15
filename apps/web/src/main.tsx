import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// Fuentes autoalojadas (sin peticiones a terceros): Archivo variable (peso y ancho), IBM Plex Mono y, para las
// pantallas del software, Playfair Display.
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"
import "@fontsource-variable/playfair-display/wght.css"
import "@/styles/global.css"
import { App } from "@/app/App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
