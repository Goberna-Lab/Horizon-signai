import type { ComponentPropsWithoutRef, ElementType } from "react"

type DisplayCapsProps<T extends ElementType> = { as?: T } & Omit<ComponentPropsWithoutRef<T>, "as">

/**
 * Texto en "display caps": Archivo 900 (Black), en mayúsculas, espaciado -0.03em; la tipografía de la marca de la
 * barra de la landing. El estilo vive en `public/ui/display-caps.css` (clase `display-caps`, enlazada en
 * `index.html`) para que las páginas estáticas (`prototipos/lunar-map/`) usen exactamente la misma.
 * El tamaño lo pone quien la usa. Ej.: `<DisplayCaps as="h2" className="mi-titulo">Missions</DisplayCaps>`.
 */
export function DisplayCaps<T extends ElementType = "span">({ as, className, ...rest }: DisplayCapsProps<T>) {
  const Tag: ElementType = as ?? "span"
  return <Tag className={className ? `display-caps ${className}` : "display-caps"} {...rest} />
}
