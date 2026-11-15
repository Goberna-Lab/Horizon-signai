import "./lunarMap.css"

/**
 * El Dashboard y el Planificador (prototipo estático de `prototipos/lunar-map/`, en inglés), a pantalla completa.
 *
 * Es HTML/CSS/JS sin dependencias que sirve la API en `/lunar-map/` (en dev, Vite lo reenvía). Esta pantalla es solo
 * el marco: un iframe de `/lunar-map/inicio.html`. La ruta de React (`/planner`) y la carpeta estática (`/lunar-map/`)
 * son distintas a propósito para que no choquen. No se copia a `public/`: la única fuente es `prototipos/lunar-map/`.
 */
export function LunarMapPage() {
  return (
    <section className="screen lunar-map" aria-label="Dashboard and mission planner">
      <iframe
        className="lunar-map__frame"
        src="/lunar-map/inicio.html"
        title="Lunar Map: mission dashboard and planner"
        allow="fullscreen"
      />
    </section>
  )
}
