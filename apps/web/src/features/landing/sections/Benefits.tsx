import { useState } from "react"
import { Link } from "react-router"
import { lang, tr } from "@/shared/i18n"
import { software as copy } from "../content"
import { Reveal } from "./Reveal"
import "./product/product.css"

/**
 * Los beneficios del sistema, en verbos: Compara, Organiza, Ten un plan B, Anticipa, Ubica. Cada pestaña muestra la
 * pantalla real de la aplicación que lo hace (foto de producción, una por idioma), su beneficio en una frase y un
 * botón para abrirla.
 */
export function Benefits() {
  const [id, setId] = useState<string>(copy.benefitList[0].id)
  const benefit = copy.benefitList.find((item) => item.id === id) ?? copy.benefitList[0]
  return (
    <section className="ln-sec" id="software">
      <div className="ln-wrap">
        <p className="ln-kicker ln-mono">{copy.label}</p>
        <Reveal as="h2" className="ln-title" wipe>
          {copy.title} <span className="ln-accent">{copy.titleAccent}</span>
        </Reveal>

        <Reveal className="sw-views" role="tablist" aria-label={tr("What the system does", "Lo que hace el sistema")} delay={100}>
          {copy.benefitList.map((item) => (
            <button key={item.id} type="button" role="tab" id={`sw-tab-${item.id}`} aria-selected={item.id === id} aria-controls="sw-panel" onClick={() => setId(item.id)}>
              {item.tab}
            </button>
          ))}
        </Reveal>

        <div className="sw-benefit-row">
          <p className="sw-benefit" aria-live="polite">
            {benefit.text}
          </p>
          <Link className="btn" to={benefit.to}>
            {copy.open}
          </Link>
        </div>

        <Reveal className="sw-photo" delay={120}>
          <figure role="tabpanel" id="sw-panel" aria-labelledby={`sw-tab-${benefit.id}`}>
            <img key={benefit.id} src={`/landing-tour/benefit-${benefit.id}-${lang}.jpg`} alt={benefit.alt} width={1600} height={1000} decoding="async" />
          </figure>
          <p className="ln-note ln-mono">{copy.photoNote}</p>
        </Reveal>
      </div>
    </section>
  )
}
