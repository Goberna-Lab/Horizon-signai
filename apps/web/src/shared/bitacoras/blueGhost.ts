// Blue Ghost Mission 1 (Firefly Aerospace, NASA CLPS, marzo de 2025): la que salió bien. Alunizó derecha en Mare Crisium
// y operó un día lunar entero: 346 horas de luz y algo más de 5 horas ya de noche.
// Consultado el 2026-11-15. Cada hecho cita sus fuentes; las cifras van tal como las publican.
// El sitio (18,56° N) está lejos del polo sur, fuera de nuestro relieve: se vuela sobre un relieve de referencia.
import type { Bitacora } from "./tipos.ts"

export const BLUE_GHOST_1: Bitacora = {
  id: "blue-ghost-1",
  nombre: "Blue Ghost M1",
  nave: "Blue Ghost",
  operador: "Firefly Aerospace",
  programa: "NASA CLPS",
  tipo: "fija",
  sitio: { nombre: "Mare Crisium · Mons Latreille", lat: 18.562, lon: 61.81, fuentes: ["nssdc"] },
  simulador: {
    sitio: "connecting-ridge-roi-6",
    nota: {
      en: "3D relief for reference: Connecting Ridge, at the south pole. The real site is in Mare Crisium (18.56° N, 61.81° E), far from the pole and outside our terrain data.",
      es: "Relieve 3D de referencia: Connecting Ridge, en el polo sur. El sitio real está en Mare Crisium (18,56° N, 61,81° E), lejos del polo y fuera de nuestros datos de relieve.",
    },
  },
  contactoUtc: "2025-03-02T08:34:00Z",
  finUtc: "2025-03-16",
  prevista: { en: "About one lunar day: some 14 Earth days", es: "Alrededor de un día lunar: unos 14 días terrestres" },
  real: { en: "More than 14 days: 346 hours of daylight and just over 5 hours into the lunar night", es: "Más de 14 días: 346 horas de luz y algo más de 5 horas ya en la noche lunar" },
  resumen: {
    en: "The one that went right. Blue Ghost landed upright in Mare Crisium with ten NASA instruments and worked a whole lunar day: it drilled, tracked GPS from the Moon, watched Earth eclipse the Sun and filmed the sunset, then kept going five hours into the night.",
    es: "La que salió bien. Blue Ghost alunizó derecha en Mare Crisium con diez instrumentos de la NASA y trabajó un día lunar entero: perforó, siguió el GPS desde la Luna, vio a la Tierra eclipsar al Sol y filmó el atardecer, y aún siguió cinco horas ya de noche.",
  },
  hechos: [
    {
      id: "sitio",
      utc: null,
      precision: "dia",
      fase: "antes",
      temas: ["sitio", "sol"],
      titulo: { en: "Why this site", es: "Por qué este lugar" },
      texto: {
        en: "Mare Crisium is a basin about 550 kilometers wide, formed by an asteroid impact and later flooded with basaltic lava: flat ground. The instruments were to operate for about one lunar day, some 14 Earth days.",
        es: "Mare Crisium es una cuenca de unos 550 kilómetros, formada por el impacto de un asteroide y después inundada de lava basáltica: terreno llano. Los instrumentos debían operar alrededor de un día lunar, unos 14 días terrestres.",
      },
      porQue: {
        en: "Far from the poles the Sun climbs high and stays up 14 days in a row: easy power, and then 14 days of night. At the pole it is the other way round: low Sun, but short nights on the right ridge.",
        es: "Lejos de los polos el Sol sube alto y dura 14 días seguidos: energía fácil, y luego 14 días de noche. En el polo es al revés: Sol bajo, pero noches cortas en la cresta correcta.",
      },
      fuentes: ["nasa-contacto"],
    },
    {
      id: "contacto",
      utc: "2025-03-02T08:34:00Z",
      precision: "minuto",
      fase: "superficie",
      temas: ["descenso", "terreno"],
      titulo: { en: "Touchdown, upright", es: "Contacto, y derecha" },
      texto: {
        en: "Blue Ghost landed at 3:34 a.m. EST near Mons Latreille, in Mare Crisium, with its ten NASA instruments. The SCALPSS cameras captured the descent and how the engine plume disturbed the surface.",
        es: "Blue Ghost alunizó a las 3:34 a. m. (hora del este de EE. UU.) cerca de Mons Latreille, en Mare Crisium, con sus diez instrumentos de la NASA. Las cámaras SCALPSS captaron el descenso y cómo el chorro del motor alteró la superficie.",
      },
      porQue: {
        en: "Flat ground and a low, wide lander: nothing to tip over. Compare it with IM-1 and IM-2, tall landers on polar slopes.",
        es: "Terreno llano y una nave baja y ancha: nada que la vuelque. Compárala con IM-1 e IM-2, naves altas en pendientes polares.",
      },
      fuentes: ["nasa-contacto", "firefly-fin"],
    },
    {
      id: "suelo",
      utc: "2025-03-02",
      precision: "dia",
      hastaUtc: "2025-03-16",
      fase: "superficie",
      temas: ["ciencia"],
      titulo: { en: "Into the ground", es: "Hacia dentro del suelo" },
      texto: {
        en: "LISTER drilled about three feet into the surface to measure the temperature and the heat flowing out of the Moon. Lunar PlanetVac collected and sorted regolith with bursts of nitrogen gas. The magnetotelluric sounder laid four electrodes up to 60 feet from the lander.",
        es: "LISTER perforó cerca de un metro (tres pies) para medir la temperatura y el calor que sale del interior de la Luna. Lunar PlanetVac recogió y clasificó regolito con chorros de nitrógeno. El sondeador magnetotelúrico tendió cuatro electrodos hasta a 18 metros (60 pies) de la nave.",
      },
      porQue: {
        en: "These measurements take days, not minutes: that is why the mission needed a full lunar day of sunlight.",
        es: "Estas medidas llevan días, no minutos: por eso la misión necesitaba un día lunar entero de Sol.",
      },
      fuentes: ["firefly-fin"],
    },
    {
      id: "senales",
      utc: "2025-03-02",
      precision: "dia",
      hastaUtc: "2025-03-16",
      fase: "superficie",
      temas: ["tierra", "ciencia"],
      titulo: { en: "Signals from Earth, on the Moon", es: "Señales de la Tierra, en la Luna" },
      texto: {
        en: "LuGRE acquired and tracked navigation satellite signals (GPS and Galileo) on the way to the Moon and on its surface, a first. A retroreflector returned laser pulses fired from observatories on Earth, and LEXI took X-ray images of the solar wind meeting Earth's magnetic field.",
        es: "LuGRE captó y siguió señales de satélites de navegación (GPS y Galileo) camino a la Luna y en su superficie, algo que nunca se había hecho. Un retrorreflector devolvió pulsos láser disparados desde observatorios en la Tierra, y LEXI tomó imágenes en rayos X del viento solar al chocar con el campo magnético terrestre.",
      },
      porQue: {
        en: "All of this needs Earth in the sky. From Mare Crisium, on the near side, Earth never sets; at the pole it sits on the horizon and the terrain can hide it.",
        es: "Todo esto necesita la Tierra en el cielo. Desde Mare Crisium, en la cara visible, la Tierra nunca se pone; en el polo queda sobre el horizonte y el relieve puede taparla.",
      },
      fuentes: ["firefly-fin"],
    },
    {
      id: "eclipse",
      utc: "2025-03-14",
      precision: "dia",
      fase: "superficie",
      temas: ["sol", "energia"],
      titulo: { en: "Earth eclipses the Sun", es: "La Tierra eclipsa al Sol" },
      texto: {
        en: "Blue Ghost captured high-definition images of a total solar eclipse seen from the Moon: Earth blocked the Sun and its shadow fell on the lunar surface. Three instruments kept measuring how dust and radiation changed.",
        es: "Blue Ghost captó imágenes en alta definición de un eclipse total de Sol visto desde la Luna: la Tierra tapó al Sol y su sombra cayó sobre la superficie lunar. Tres instrumentos siguieron midiendo cómo cambiaban el polvo y la radiación.",
      },
      porQue: {
        en: "During the eclipse the panels give nothing: the lander lived on its battery, as it would in any night.",
        es: "Durante el eclipse los paneles no dan nada: la nave vivió de su batería, como en cualquier noche.",
      },
      fuentes: ["firefly-fin"],
    },
    {
      id: "atardecer",
      utc: "2025-03-16",
      precision: "dia",
      fase: "superficie",
      temas: ["sol"],
      titulo: { en: "Sunset on the Moon", es: "Atardecer en la Luna" },
      texto: {
        en: "The lander filmed the lunar sunset, to learn whether dust lifts off the ground and makes the horizon glow.",
        es: "La nave filmó el atardecer lunar, para saber si el polvo se levanta del suelo y hace brillar el horizonte.",
      },
      fuentes: ["firefly-fin"],
    },
    {
      id: "noche",
      utc: "2025-03-16T23:15:00Z",
      precision: "minuto",
      fase: "noche",
      temas: ["sol", "energia", "datos"],
      titulo: { en: "Five hours into the night", es: "Cinco horas de noche" },
      texto: {
        en: "After 346 hours of daylight, Blue Ghost kept working just over 5 hours into the lunar night, on battery. The last data arrived around 6:15 p.m. CDT. In total, more than 119 gigabytes, 51 of them science and technology data.",
        es: "Tras 346 horas de luz, Blue Ghost siguió trabajando algo más de 5 horas ya en la noche lunar, con batería. Los últimos datos llegaron hacia las 6:15 p. m. (hora central de EE. UU.). En total, más de 119 gigabytes, 51 de ellos de ciencia y tecnología.",
      },
      porQue: {
        en: "Five hours is what its battery gave. The Planner asks you the same number: how many hours without Sun your mission can take.",
        es: "Cinco horas es lo que dio su batería. El Planificador te pide ese mismo número: cuántas horas sin Sol aguanta tu misión.",
      },
      fuentes: ["firefly-fin"],
    },
  ],
  fuentes: [
    { id: "nasa-contacto", titulo: "NASA · Touchdown! Carrying NASA Science, Firefly's Blue Ghost Lands on Moon (2025-03-02)", url: "https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/" },
    { id: "firefly-fin", titulo: "Firefly Aerospace · Firefly Aerospace Successfully Completes 14 Days of Surface Operations on the Moon (2025-03-17)", url: "https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon" },
    { id: "nssdc", titulo: "NASA NSSDCA · Blue Ghost Mission 1 (landing coordinates)", url: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=BLUEGHOST" },
  ],
}
