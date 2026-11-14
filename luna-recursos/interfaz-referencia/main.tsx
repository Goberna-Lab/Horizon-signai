import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { instalarCaptura } from './ui/diagnosticoDatos'

// Diagnóstico: captura errores y avisos desde el inicio, antes de compilar shaders.
instalarCaptura()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
