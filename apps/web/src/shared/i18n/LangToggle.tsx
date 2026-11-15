import { lang, setLang } from "./index"
import "./lang.css"

/** El selector EN / ES. Cambiar de idioma recarga la página (ver `index.ts`). */
export function LangToggle({ className }: { className?: string }) {
  return (
    <div className={`ui-lang${className ? ` ${className}` : ""}`} role="group" aria-label="Language / Idioma">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
        EN
      </button>
      <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")}>
        ES
      </button>
    </div>
  )
}
