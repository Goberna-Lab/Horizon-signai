// IM-2 Athena (Intuitive Machines, NASA CLPS, marzo de 2025): el alunizaje más cercano al polo sur hasta entonces, en
// Mons Mouton. Cayó dentro de un cráter y quedó de lado: sin poder recargar, la misión duró horas en vez de diez días.
// Consultado el 2026-11-15. Cada hecho cita sus fuentes; las cifras van tal como las publican.
// El sitio está en el catálogo del Planificador (`im-2`) y tiene paquete 3D: se vuela en su relieve real.
// Hora del contacto: la NASA dice «approximately 11:30 a.m. March 6» sin zona; el mismo comunicado da el fin en CST,
// así que `contactoUtc` usa 11:30 CST (17:30 UTC). El hecho va con precisión de día y cita la hora tal como está.
import type { Bitacora } from "./tipos.ts"

export const IM2: Bitacora = {
  id: "im-2",
  nombre: "IM-2",
  nave: "Athena (Nova-C)",
  operador: "Intuitive Machines",
  programa: "NASA CLPS",
  tipo: "fija",
  sitio: { nombre: "Mons Mouton", lat: -84.7906, lon: 29.1957, fuentes: ["lroc"] },
  simulador: { sitio: "im-2" },
  contactoUtc: "2025-03-06T17:30:00Z",
  finUtc: "2025-03-07",
  prevista: { en: "10 days of surface operations", es: "10 días de operaciones en la superficie" },
  real: { en: "Closer to 10 hours: the batteries ran out before it could recharge", es: "Más cerca de 10 horas: las baterías se agotaron antes de poder recargar" },
  resumen: {
    en: "Athena landed closer to the Moon's south pole than any lander before it, carrying a drill to look for ice. It came down inside a crater, more than 400 meters from its target, and ended up on its side. With the Sun low, the panels pointing the wrong way and the cold of the crater, it could not recharge: the mission ended the next day.",
    es: "Athena alunizó más cerca del polo sur de la Luna que ninguna nave antes, con un taladro para buscar hielo. Cayó dentro de un cráter, a más de 400 metros de su objetivo, y quedó de lado. Con el Sol bajo, los paneles mal orientados y el frío del cráter, no pudo recargar: la misión terminó al día siguiente.",
  },
  hechos: [
    {
      id: "sitio",
      utc: null,
      precision: "dia",
      fase: "antes",
      temas: ["sitio", "ciencia"],
      titulo: { en: "Why this site", es: "Por qué este lugar" },
      texto: {
        en: "Mons Mouton is a plateau near the Moon's south pole. Athena carried PRIME-1: a drill (TRIDENT) and a mass spectrometer (MSOLO) to measure what is in the ground below the surface, including water ice.",
        es: "Mons Mouton es una meseta cerca del polo sur de la Luna. Athena llevaba PRIME-1: un taladro (TRIDENT) y un espectrómetro de masas (MSOLO) para medir qué hay en el suelo bajo la superficie, incluido hielo de agua.",
      },
      porQue: {
        en: "Ice near the pole would mean water, air and fuel for a future base without bringing them from Earth. That is why so many missions aim here.",
        es: "Hielo cerca del polo significaría agua, aire y combustible para una base futura sin traerlos de la Tierra. Por eso tantas misiones apuntan aquí.",
      },
      fuentes: ["nasa-taladro", "nasa-fin"],
    },
    {
      id: "contacto",
      utc: "2025-03-06",
      precision: "dia",
      fase: "superficie",
      temas: ["descenso", "sitio", "terreno"],
      titulo: { en: "Touchdown inside a crater", es: "Contacto dentro de un cráter" },
      texto: {
        en: "Athena touched down at approximately 11:30 a.m. on March 6, inside a crater, more than 1,300 feet (400 meters) from its intended landing site. It is closer to the south pole than any lander before it.",
        es: "Athena tocó el suelo hacia las 11:30 a. m. del 6 de marzo, dentro de un cráter, a más de 400 metros (1300 pies) de su punto de alunizaje previsto. Es la nave que más cerca del polo sur había alunizado.",
      },
      porQue: {
        en: "400 meters is enough to change everything: the planned spot was lit; the crater floor was not. A small change of place changes the Sun you get.",
        es: "400 metros bastan para cambiarlo todo: el punto previsto tenía luz; el fondo del cráter, no. Un pequeño cambio de lugar cambia el Sol que recibes.",
      },
      fuentes: ["nasa-fin", "nasa-lro"],
    },
    {
      id: "de-lado",
      utc: "2025-03-06",
      precision: "dia",
      fase: "superficie",
      temas: ["terreno", "energia"],
      titulo: { en: "On its side, again", es: "De lado, otra vez" },
      texto: {
        en: "Images sent later confirmed the lander was on its side, which kept it from fully operating the drill and the other instruments.",
        es: "Las imágenes que mandó después confirmaron que la nave estaba de lado, lo que le impidió operar del todo el taladro y los demás instrumentos.",
      },
      porQue: {
        en: "It is the same fate as IM-1 a year earlier: a tall lander on rough polar ground. The terrain under the footpads decides the mission.",
        es: "Es el mismo destino que IM-1 un año antes: una nave alta sobre terreno polar irregular. El suelo bajo las patas decide la misión.",
      },
      fuentes: ["nasa-fin"],
    },
    {
      id: "taladro",
      utc: "2025-03-06",
      precision: "dia",
      fase: "superficie",
      temas: ["ciencia", "datos"],
      titulo: { en: "The drill moves, on the Moon", es: "El taladro se mueve, en la Luna" },
      texto: {
        en: "Even so, TRIDENT and MSOLO started right up. Commanded from Earth, the drill rotated its auger, extended to its full range and hammered. MSOLO made several scans and detected gases, likely from the lander's own propulsion system.",
        es: "Aun así, TRIDENT y MSOLO arrancaron a la primera. Con órdenes desde la Tierra, el taladro giró su barrena, se extendió del todo y martilló. MSOLO hizo varios barridos y detectó gases, probablemente del propio sistema de propulsión de la nave.",
      },
      porQue: {
        en: "Every command went up by radio and every reading came down the same way: the hours the instruments worked were hours with Earth in view and battery left.",
        es: "Cada orden subió por radio y cada lectura bajó igual: las horas que trabajaron los instrumentos fueron horas con la Tierra a la vista y batería disponible.",
      },
      fuentes: ["nasa-taladro", "nasa-fin"],
    },
    {
      id: "fin",
      utc: "2025-03-07T06:15:00Z",
      precision: "minuto",
      fase: "noche",
      temas: ["sol", "energia", "datos"],
      titulo: { en: "It cannot recharge", es: "No puede recargar" },
      texto: {
        en: "At 12:15 a.m. CST Intuitive Machines called an early end of mission, with the batteries depleted. With the direction of the Sun, the orientation of the solar panels and the extreme cold in the crater, the company did not expect Athena to recharge. The plan was 10 days; it got closer to 10 hours, and about 6.6 gigabytes of data.",
        es: "A las 12:15 a. m. (hora central de EE. UU.) Intuitive Machines dio por terminada la misión antes de tiempo, con las baterías agotadas. Por la dirección del Sol, la orientación de los paneles solares y el frío extremo del cráter, la empresa no esperaba que Athena recargara. El plan era de 10 días; fueron más cerca de 10 horas, y unos 6,6 gigabytes de datos.",
      },
      porQue: {
        en: "Direction of the Sun and where the panel looks: that is exactly what the Planner computes for a site, a date and a panel height.",
        es: "Dirección del Sol y hacia dónde mira el panel: es justo lo que el Planificador calcula para un lugar, una fecha y una altura de panel.",
      },
      fuentes: ["nasa-fin", "nasa-taladro", "sciam"],
    },
    {
      id: "lro",
      utc: "2025-03-07T17:54:00Z",
      precision: "minuto",
      fase: "noche",
      temas: ["sitio"],
      titulo: { en: "Seen from orbit", es: "Visto desde la órbita" },
      texto: {
        en: "NASA's Lunar Reconnaissance Orbiter imaged the site at 12:54 p.m. EST on March 7, about a day after landing: the lander is near the center of Mons Mouton.",
        es: "El Lunar Reconnaissance Orbiter de la NASA fotografió el sitio a las 12:54 p. m. (hora del este de EE. UU.) del 7 de marzo, cerca de un día después del alunizaje: la nave está cerca del centro de Mons Mouton.",
      },
      fuentes: ["nasa-lro"],
    },
  ],
  fuentes: [
    { id: "nasa-fin", titulo: "NASA · NASA Receives Some Data Before Intuitive Machines Ends Lunar Mission (2025-03-07)", url: "https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/" },
    { id: "nasa-taladro", titulo: "NASA · NASA's Lunar Drill Technology Passes Tests on the Moon", url: "https://www.nasa.gov/missions/artemis/nasas-lunar-drill-technology-passes-tests-on-the-moon/" },
    { id: "nasa-lro", titulo: "NASA · NASA's Lunar Reconnaissance Orbiter Views IM-2 on Moon's Surface", url: "https://www.nasa.gov/image-article/nasas-lunar-reconnaissance-orbiter-views-im-2-on-moons-surface/" },
    { id: "lroc", titulo: "LROC (Arizona State University) · IM-2 landing site (coordinates as in our site catalog)", url: "https://www.lroc.asu.edu/images/1401" },
    { id: "sciam", titulo: "Scientific American · Athena Lunar Lander Declared Dead on the Moon", url: "https://www.scientificamerican.com/article/athena-lunar-lander-declared-dead-on-the-moon/" },
  ],
}
