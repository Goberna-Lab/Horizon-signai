import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef, useState } from "react"

type RevealProps = {
  as?: ElementType
  className?: string
  /** Retardo de la entrada (ms), para escalonar elementos vecinos. */
  delay?: number
  /**
   * Entrada como pasada de tinta, de izquierda a derecha (para títulos). El recorte va en un elemento interior:
   * si se recortara el propio elemento observado, el navegador nunca lo daría por visible.
   */
  wipe?: boolean
  style?: CSSProperties
  children?: ReactNode
  [attribute: string]: unknown
}

/**
 * Entrada al hacer scroll: el elemento aparece cuando entra en pantalla, una sola vez. Dirige la vista hacia lo
 * que acaba de llegar; no se repite ni se mueve después.
 *
 * Con "reducir movimiento" (o sin IntersectionObserver) el contenido se muestra directamente. La transición está
 * en `landing.css`, sobre el atributo `data-reveal`.
 */
export function Reveal({ as: Tag = "div", className, delay = 0, wipe = false, style, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<"idle" | "armed" | "in">("idle")

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("in")
      return
    }
    setState("armed")
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("in")
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={className} data-reveal={state} data-wipe={wipe || undefined} style={delay ? { ...style, transitionDelay: `${delay}ms` } : style} {...rest}>
      {wipe ? <span className="ln-wipe">{children}</span> : children}
    </Tag>
  )
}
