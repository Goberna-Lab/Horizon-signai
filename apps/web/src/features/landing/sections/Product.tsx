import { useRef, useState } from "react"
import { Link } from "react-router"
import { lang } from "@/shared/i18n"
import { product } from "../content"
import { Reveal } from "./Reveal"

/** El vídeo de cada paso: grabado de la app, un archivo por idioma (`public/landing-tour/hover-<paso>-en|es`). */
const clip = (media: string, extension: string) => `/landing-tour/hover-${media}-${lang}.${extension}`

export function Product() {
  const [media, setMedia] = useState<string | null>(null)
  /** Con ratón: al pasar por un paso aparece su vídeo en medio de la fila. En pantallas táctiles no hay vista previa. */
  const canHover = useRef(typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches)

  return (
    <section className="ln-sec" id="product">
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {product.title}
        </Reveal>
        <ol className="ln-steps">
          {product.steps.map((step, i) => (
            <Reveal
              as="li"
              key={step.verb}
              className="ln-step"
              delay={i * 90}
              data-active={media === step.media || undefined}
              onPointerEnter={(event: React.PointerEvent) => {
                if (canHover.current && event.pointerType === "mouse") setMedia(step.media)
              }}
              onPointerLeave={() => setMedia(null)}
            >
              <span className="ln-step__verb">{step.verb}</span>
              {/* Vista previa, en la columna del medio. Decorativa: el texto del paso ya lo cuenta. */}
              <div className="ln-step__preview" aria-hidden="true">
                {media === step.media && (
                  <video src={clip(step.media, "mp4")} poster={clip(step.media, "jpg")} autoPlay muted loop playsInline />
                )}
              </div>
              <div className="ln-step__text">
                <p className="ln-step__question">{step.question}</p>
                <p className="ln-step__body">{step.body}</p>
                {step.action && (
                  <Link className="btn" to={step.action.to}>
                    {step.action.label}
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
