import "./map3d.css"

/**
 * El mapa 3D de la Luna: relieve LOLA (globo y polo sur), los 62 sitios de alunizaje con filtros y fuente,
 * los 8876 nombres IAU, el Sol y la Tierra reales por fecha (JPL Horizons) y horizontes de 5 m en el polo.
 *
 * Es una página autónoma (`public/mapa-3d.html`, generada por `scripts/mapa-3d/construir-mapa.py`) que lleva dentro
 * sus datos y su propio three.js, así que se muestra en un iframe a pantalla completa: no suma nada al bundle de la app
 * y solo se descarga al entrar a esta ruta. Se abre en inglés (`?lang=en`, la entrega lo pide); el botón ES/EN sigue.
 */
export function Map3dPage() {
  return (
    <section className="screen map3d" aria-label="3D map of the Moon">
      <iframe
        className="map3d__frame"
        src="/mapa-3d.html?lang=en"
        title="3D map of the Moon: LOLA relief, landing sites and IAU names"
        allow="fullscreen"
      />
    </section>
  )
}
