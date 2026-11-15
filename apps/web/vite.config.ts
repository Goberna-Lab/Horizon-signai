import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      // El visor del mapa 3D lo sirve la API (manifiesto incrustado + preloads).
      "/mapa-3d.html": "http://localhost:3000",
    },
  },
})
