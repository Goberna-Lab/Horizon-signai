/* Horizon Signai · diccionario en español de index.html (planificador, paso 1: alunizaje). Ver i18n.js.
 *
 * - «exact»: el texto entero de un nodo (o de un title, aria-label o placeholder). Un texto con etiquetas dentro son
 *   varios nodos: «<b>On plan</b> (18 Dec 2026). Move the date…» se busca como «On plan» y como «(18 Dec 2026). Move…».
 * - «patterns»: lo que lleva cifras, fechas o letras de zona. Primero las frases enteras (ancladas con ^ y $) y al final
 *   los trozos (nombres de zona y meses). Se aplican todos, uno tras otro: la frase se traduce y después sus meses.
 * - El español sale de la versión original de la página (5b6bdc4). Las cifras, las unidades y GO / NO GO / REVIEW no cambian.
 */
LunarI18n.add({
  exact: {
    /* ---------- cabecera ---------- */
    'Horizon Signai · Planner · Landing': 'Horizon Signai · Planificador · Alunizaje',
    'Horizon Signai: back to the start': 'Horizon Signai: volver al inicio',
    'Planner steps': 'Pasos del planificador',
    'Landing': 'Alunizaje',
    'Concept: what comes after the landing. Illustrative data.': 'Concepto: lo que viene después del alunizaje. Datos ilustrativos.',
    'Walk · concept': 'Caminata · concepto',
    'Sections': 'Secciones',
    'Missions': 'Misiones',
    'Planner': 'Planificador',
    'Mission log': 'Bitácora de misión',
    'Opens the 3D Moon': 'Abre la Luna en 3D',
    'Evaluating zones': 'Evaluando zonas',
    'Simulation complete': 'Simulación completada',
    'Zone confirmed': 'Zona confirmada',

    /* ---------- panel izquierdo: zonas candidatas ---------- */
    'Candidate zones': 'Zonas candidatas',
    'Compare scenarios (up to 6)': 'Comparar escenarios (hasta 6)',
    'Copy a link to this zone and scenario': 'Copiar un enlace a esta zona y este escenario',
    'Link': 'Enlace',
    'Copied': 'Copiado',
    'Move the landing date': 'Mover la fecha de aterrizaje',
    'Land one week earlier': 'Aterrizar una semana antes',
    'Land one day earlier': 'Aterrizar un día antes',
    'Land one day later': 'Aterrizar un día después',
    'Land one week later': 'Aterrizar una semana después',
    '−1 wk': '−7 d',
    '+1 wk': '+7 d',
    'On plan': 'En el plan',
    'Slip': 'Cambio',
    'That point is outside the planner range': 'Ese punto está fuera del dominio del planificador',
    '(190 km around the south pole). Showing the catalogue zones.': '(190 km alrededor del polo sur). Se muestran las zonas del catálogo.',
    'Figures for the 1-day stay from landing': 'Cifras de 1 día desde el aterrizaje',
    'Peak near Shackleton · RoI 2': 'Pico cerca de Shackleton · RoI 2',
    'Shackleton rim · RoI 4': 'Borde de Shackleton · RoI 4',
    'Own point': 'Punto propio',
    'approx.': 'aprox.',
    'Horizon from the 240 m LOLA terrain: terrain smaller than ~500 m does not appear (SPEC E24)': 'Horizonte del relieve LOLA de 240 m: no aparece el relieve de menos de ~500 m (SPEC E24)',
    'Sunlight': 'Luz solar',
    'Earth visible': 'Tierra visible',
    'Sun + Earth': 'Sol + Tierra',
    'Longest night': 'Noche más larga',
    'Meets them, but the Sun is at the horizon at landing': 'Cumple, pero el Sol queda al ras al aterrizar',
    'Meets them, but Earth is at the horizon at landing': 'Cumple, pero la Tierra queda al ras al aterrizar',
    'Sun hidden at landing': 'Sol oculto al aterrizar',
    'Earth hidden at landing': 'Tierra oculta al aterrizar',
    'Simulate descent': 'Simular descenso',
    'Simulating descent…': 'Simulando descenso…',
    'Next step: plan the walk': 'Siguiente paso: planificar la caminata',
    'Does not meet them: see “How to meet it”': 'No cumple: mira «Cómo cumplir»',
    'At the horizon: adjust the scenario': 'Al ras: ajusta el escenario',

    /* ---------- pantalla central: mapa ---------- */
    'Main display': 'Pantalla principal',
    'Map of the lunar south pole in polar stereographic projection, with the pole next to the Shackleton rim and three real candidate zones from the PGDA catalogue': 'Mapa del polo sur lunar en estereográfica polar, con el polo junto al borde de Shackleton y tres zonas candidatas reales del catálogo de PGDA',
    'South Pole': 'Polo sur',
    'Point P': 'Punto P',
    'powered descent start · heading 026°': 'inicio del descenso motorizado · rumbo 026°',
    'South polar stereographic · zone positions: PGDA (Barker 2021) · relief drawn to illustrate': 'Estereográfica polar sur · posiciones de las zonas: PGDA (Barker 2021) · relieve dibujado para ilustrar',
    'Slope > 15°': 'Pendiente > 15°',
    'High mean light': 'Luz media alta',
    'Permanent shadow': 'Sombra permanente',
    'Click on the map': 'Haz clic en el mapa',
    'ALTITUDE': 'ALTITUD',
    'VELOCITY': 'VELOCIDAD',
    'PHASE': 'FASE',
    'P63 · braking': 'P63 · frenado',
    'P64 · approach': 'P64 · aproximación',
    'contact · 710 s': 'contacto · 710 s',
    'Plan the walk': 'Planificar la caminata',

    /* ---------- panel derecho: horizonte, descenso y Go / No-Go ---------- */
    'Descent and checks': 'Descenso y verificación',
    'Real horizon · Zone': 'Horizonte real · Zona',
    'Real horizon of the chosen zone, 360° from north, with the Sun and Earth': 'Horizonte real de la zona elegida, en 360° desde el norte, con el Sol y la Tierra',
    '360° panorama from the north. The vertical scale is exaggerated and the discs are not to scale.': 'Panorámica de 360° desde el norte. La escala vertical está exagerada y los discos no están a escala.',
    'No change in the period': 'Sin cambios en el período',
    'Sun': 'Sol',
    'Earth': 'Tierra',
    'Sunlight left': 'Luz solar restante',
    'Sunrise in': 'Sale el Sol en',
    'Earth contact left': 'Contacto restante',
    'Earthrise in': 'Sale la Tierra en',
    'in view': 'a la vista',
    'hidden': 'no se ve',
    'to the end of the period': 'hasta el fin del período',
    'HIGH GATE': 'PUERTA ALTA',
    'TOTAL ΔV': 'ΔV TOTAL',
    'FUEL': 'COMBUSTIBLE',
    '496 kg spare': 'sobran 496 kg',
    'How to meet it': 'Cómo cumplir',
    'Apply': 'Aplicar',
    'No date meets them within 120 d': 'Ninguna fecha cumple en 120 d',
    'Searched from 30 d before to 120 d after': 'Se buscó desde 30 d antes hasta 120 d después',
    'Same day, stay and gear': 'Mismo día, estadía y equipo',
    'No other zone meets them': 'Ninguna otra zona cumple',
    'None of the other zones meets them that day with the same gear': 'Ninguna de las otras zonas cumple ese día con el mismo equipo',
    'Not even 30 m meets them': 'Ni subiendo a 30 m cumple',
    'Heights tried: 2, 5, 10, 15, 20 and 30 m': 'Alturas probadas: 2, 5, 10, 15, 20 y 30 m',
    'Go / No-Go · Zone': 'Go / No-Go · Zona',
    'Descent (Apollo 11 profile)': 'Descenso (perfil del Apollo 11)',
    '496 kg spare · on the Sun line at P64 · TN D-6846': 'sobran 496 kg · sobre la línea del Sol en P64 · TN D-6846',
    'Sun at landing': 'Sol al aterrizar',
    'Earth at landing': 'Tierra al aterrizar',
    'Longest night during the stay': 'Noche más larga en la estadía',
    'Earth during the stay': 'Tierra en la estadía',

    /* ---------- créditos ---------- */
    'Sun and Earth above the real horizon: JPL Horizons DE441 + LOLA / PGDA 5 m terrain (Barker 2021) · zone positions and mean illumination: PGDA, Mazarico 2011 · the map relief and its overlays are generated to illustrate · descent: Apollo 11 profile as an example vehicle (R-695, TN D-6846), 18.5 × 5 km dispersion ellipse': 'Sol y Tierra sobre el horizonte real: JPL Horizons DE441 + relieve LOLA / PGDA de 5 m (Barker 2021) · posiciones de las zonas e iluminación media: PGDA, Mazarico 2011 · el relieve del mapa y sus capas se generan para ilustrar · descenso: perfil del Apollo 11 como vehículo de ejemplo (R-695, TN D-6846), elipse de dispersión de 18.5 × 5 km',

    /* ---------- línea de tiempo ---------- */
    'Mission timeline': 'Línea de tiempo de la misión',
    'Play': 'Reproducir',
    'Pause': 'Pausar',
    'Timeline · Zone': 'Línea de tiempo · Zona',
    'Date on the timeline: drag or use the arrow keys': 'Fecha en la línea de tiempo: arrastra o usa las flechas',
    'Period summary': 'Resumen del período',
    'Sun visible · Earth visible': 'Sol visible · Tierra visible',
    'Sun visible · Earth hidden': 'Sol visible · Tierra oculta',
    'Sun hidden · Earth visible': 'Sol oculto · Tierra visible',
    'Sun hidden · Earth hidden': 'Sol oculto · Tierra oculta',
    'Landing · Sun visible · Earth visible': 'Aterrizaje · Sol visible · Tierra visible',
    'Landing · Sun visible · Earth hidden': 'Aterrizaje · Sol visible · Tierra oculta',
    'Landing · Sun hidden · Earth visible': 'Aterrizaje · Sol oculto · Tierra visible',
    'Landing · Sun hidden · Earth hidden': 'Aterrizaje · Sol oculto · Tierra oculta',
    'Both': 'Ambos',
    'Max night': 'Noche máx.',
    'Max silence': 'Silencio máx.',
    'Mean panel': 'Panel medio',
    'Sun visible: any part of the disc above the real horizon': 'Sol visible: alguna parte del disco sobre el horizonte real',
    'Earth visible: its centre above the real horizon': 'Tierra visible: su centro sobre el horizonte real',
    'Sun and Earth at the same time': 'Sol y Tierra a la vez',
    'Longest night: longest run without the Sun visible; it is what the battery must last': 'Noche más larga: mayor racha sin Sol visible; es lo que debe aguantar la batería',
    'Longest silence: longest run without Earth in view (no direct link)': 'Silencio más largo: mayor racha sin la Tierra a la vista (sin enlace directo)',
    'Vertical panel that tracks the Sun (assumed): 1361 W/m² × visible disc × cos(elevation), period average': 'Panel vertical que sigue al Sol (supuesto): 1361 W/m² × disco visible × cos(elevación), promedio del período',

    /* ---------- diálogo: comparar escenarios ---------- */
    'Compare scenarios': 'Comparar escenarios',
    'Add the current scenario': 'Añadir el escenario actual',
    'The current scenario is already added': 'El escenario actual ya está',
    'Maximum 6 scenarios': 'Máximo 6 escenarios',
    'Up to 6 scenarios, each with its zone. Stay figures use the engine definitions; underlined in red, the best of each column. Click a row to load it.': 'Hasta 6 escenarios, cada uno con su zona. Cifras de la estadía con las definiciones del motor; subrayada en rojo, la mejor de cada columna. Clic en una fila para cargarla.',
    'There are no scenarios yet. Adjust the scenario or the zone and press “Add the current scenario”.': 'Todavía no hay escenarios. Ajusta el escenario o la zona y pulsa «Añadir el escenario actual».',
    'Loading the LOLA terrain for the own point…': 'Cargando el relieve LOLA para el punto propio…',
    'Zone': 'Zona',
    'Landing (UTC)': 'Aterrizaje (UTC)',
    'Stay': 'Estadía',
    'Gear': 'Equipo',
    'Sun / Earth': 'Sol / Tierra',
    'Sun on top and Earth below, aligned from landing': 'Sol arriba y Tierra abajo, alineados desde el aterrizaje',
    'Sun and Earth during the stay': 'Sol y Tierra durante la estadía',
    'Load this scenario': 'Cargar este escenario',
    'P · own': 'P · propio',
    'Remove': 'Quitar',
    'Clear': 'Vaciar',
    'Close': 'Cerrar',

    /* ---------- diálogo: punto propio ---------- */
    'Anywhere within 190 km of the south pole (down to ~83.7° S). The horizon comes from the 240 m LOLA terrain and is': 'Cualquier lugar a menos de 190 km del polo sur (hasta ~83.7° S). El horizonte sale del relieve LOLA de 240 m y es',
    'approximate': 'aproximado',
    ': at that resolution terrain smaller than ~500 m does not appear, and on ridges and crater rims it can differ a lot from the RoI horizons. To decide, use an RoI from the catalogue (SPEC E24).': ': a esa resolución no aparece el relieve de menos de ~500 m, y en crestas y bordes de cráter puede diferir mucho del de las RoI. Para decidir, usa una RoI del catálogo (SPEC E24).',
    'Latitude (°; south, negative)': 'Latitud (°; sur, negativa)',
    'Longitude east (°)': 'Longitud este (°)',
    'Pick on the map': 'Elegir en el mapa',
    'Remove the point': 'Quitar el punto',
    'Cancel': 'Cancelar',
    'Use this point': 'Usar este punto',
    'Enter the latitude and longitude.': 'Escribe la latitud y la longitud.',
    'Loading the LOLA terrain (8 MB) and computing the horizon…': 'Cargando el relieve LOLA (8 MB) y calculando el horizonte…',
    'Could not load the LOLA terrain (data/dem-polo.js).': 'No se pudo cargar el relieve LOLA (data/dem-polo.js).',

    /* ---------- diálogo: escenario de alunizaje ---------- */
    'Landing scenario': 'Escenario de alunizaje',
    'The equipment and requirements apply to all three zones, so they can be compared.': 'El equipo y los requisitos valen para las tres zonas; así se pueden comparar.',
    'Stay (days)': 'Estadía (días)',
    'Battery: hours without Sun': 'Batería: horas sin Sol',
    'Panel height (m)': 'Altura del panel (m)',
    'Antenna height (m)': 'Altura de la antena (m)',
    'Minimum Earth during the stay (%)': 'Tierra mínima en la estadía (%)',
    'Sun in view at landing': 'Sol a la vista al aterrizar',
    'Earth in view at landing': 'Tierra a la vista al aterrizar',
    'Assumptions of the team planner: the Sun is measured from the panel and Earth from the antenna, at the same terrain point; vertical panel that tracks the Sun. Dates from 2026 to 2030, in UTC.': 'Supuestos del planificador del equipo: el Sol se mide desde el panel y la Tierra desde la antena, en el mismo punto del terreno; panel vertical que sigue al Sol. Fechas de 2026 a 2030, en UTC.',
    'CR-01 plan': 'Plan de CR-01'
  },
  patterns: [
    /* ---------- frases enteras ---------- */
    /* tarjetas de zona */
    [/^Meets all (\d+) requirements$/, 'Cumple los $1 requisitos'],
    [/^Night of (\d+ h|\d+ d \d+ h): longer than the battery$/, 'Noche de $1: más que la batería'],
    [/^Earth (\d+)% of the stay \(min\. (\d+)%\)$/, 'Tierra el $1% de la estadía (mín. $2%)'],
    [/^Figures for the (\d+)-day stay from landing$/, 'Cifras de los $1 días desde el aterrizaje'],
    [/^(\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d · \d+ d) · gear (.+)$/, '$1 · equipo $2'],
    [/^CR-01 plan: battery (\d+) h, minimum Earth (\d+)% of the stay\. Click to edit\.$/, 'Plan de CR-01: batería $1 h, Tierra mínima $2% de la estadía. Clic para editar.'],
    [/^Scenario different from the CR-01 plan: battery (\d+) h, minimum Earth (\d+)% of the stay\. Click to edit\.$/, 'Escenario distinto del plan de CR-01: batería $1 h, Tierra mínima $2% de la estadía. Clic para editar.'],
    /* cifras de las tarjetas (title): el final «· Mazarico…» o «· approximate horizon» lo traducen los dos patrones siguientes */
    [/^Stay of (\d+) d from landing · 2026–2030 mean with the panel at ([\d.]+ m): (\d+%)/, 'Estadía de $1 d desde el aterrizaje · media 2026–2030 con el panel a $2: $3'],
    [/^Stay of (\d+) d from landing · 2026–2030 mean with the antenna at ([\d.]+ m): (\d+%)/, 'Estadía de $1 d desde el aterrizaje · media 2026–2030 con la antena a $2: $3'],
    [/ · Mazarico 2011, at ground level: ([\d.]+%)$/, ' · Mazarico 2011, a ras del suelo: $1'],
    [/ · approximate horizon$/, ' · horizonte aproximado'],
    [/^Stay of (\d+) d from landing · 2026–2030 mean: (\d+%)$/, 'Estadía de $1 d desde el aterrizaje · media 2026–2030: $2'],
    [/^Longest run without Sun during the stay; the battery lasts (\d+) h$/, 'Racha más larga sin Sol en la estadía; la batería aguanta $1 h'],
    /* cambio de fecha */
    [/^Schedule slip ([+−]\d+) d$/, 'Cambio de fecha $1 d'],
    [/^from the (\d{1,2} [A-Z][a-z]{2} \d{4}) plan: 1 of (\d+) zones fail\.$/, 'respecto al plan del $1: 1 de $2 zonas no cumple.'],
    [/^from the (\d{1,2} [A-Z][a-z]{2} \d{4}) plan: (\d+) of (\d+) zones fail\.$/, 'respecto al plan del $1: $2 de $3 zonas no cumplen.'],
    [/^from the (\d{1,2} [A-Z][a-z]{2} \d{4}) plan: every zone still passes\.$/, 'respecto al plan del $1: todas las zonas siguen cumpliendo.'],
    [/^\((\d{1,2} [A-Z][a-z]{2} \d{4})\)\. Move the date: what does a slip do to each zone\?$/, '($1). Mueve la fecha: ¿qué le pasa a cada zona si cambia?'],
    [/^Back to the plan: (\d{1,2} [A-Z][a-z]{2} \d{4})$/, 'Volver al plan: $1'],
    [/^Example slip: land on (\d{1,2} [A-Z][a-z]{2} \d{4})$/, 'Cambio de ejemplo: aterrizar el $1'],
    /* Go / No-Go */
    [/^edge of the disc shows · panel ([\d.]+ m)$/, 'asoma el borde del disco · panel $1'],
    [/^([+−][\d.]+°) above the horizon · panel ([\d.]+ m)$/, '$1 sobre el horizonte · panel $2'],
    [/^([+−][\d.]+°) above the horizon · antenna ([\d.]+ m)$/, '$1 sobre el horizonte · antena $2'],
    [/^(\d+ h|\d+ d \d+ h) · battery (\d+) h$/, '$1 · batería $2 h'],
    [/^(\d+)% · minimum (\d+)%$/, '$1% · mínimo $2%'],
    [/^Landing: (.+ UTC) · rises in (\d+ h|\d+ d \d+ h)$/, 'Aterrizaje: $1 · sale en $2'],
    [/^Landing: (.+ UTC) · sets in (\d+ h|\d+ d \d+ h)$/, 'Aterrizaje: $1 · se pone en $2'],
    [/^Landing: (.+ UTC) · the Sun does not set in 60 d$/, 'Aterrizaje: $1 · el Sol no se pone en 60 d'],
    [/^Landing: (.+ UTC) · the Sun does not rise in 60 d$/, 'Aterrizaje: $1 · el Sol no sale en 60 d'],
    /* cómo cumplir */
    [/^Land on (\d{1,2} [A-Z][a-z]{2} \d{4})$/, 'Aterrizar el $1'],
    [/^Centre of a (\d+) d window in which landing meets the requirements \(same time, stay and gear\)$/, 'Centro de una ventana de $1 d en que aterrizar cumple (misma hora, estadía y equipo)'],
    [/^Switch to zone ([A-Z])$/, 'Cambiar a la zona $1'],
    [/^Raise the gear to ([\d.]+) m$/, 'Subir el equipo a $1 m'],
    [/^Panel and antenna at ([\d.]+) m, same place and day \(heights tried: 2, 5, 10, 15, 20 and 30 m\)$/, 'Panel y antena a $1 m, mismo lugar y día (alturas probadas: 2, 5, 10, 15, 20 y 30 m)'],
    /* horizonte y lo que queda */
    [/^Rises in (\d+ h|\d+ d \d+ h)$/, 'Sale en $1'],
    [/^Sets in (\d+ h|\d+ d \d+ h)$/, 'Se pone en $1'],
    [/^over (\d+ h|\d+ d \d+ h)$/, 'más de $1'],
    [/^LOLA 240 m, approx\. · panel at ([\d.]+ m) · Horizons$/, 'LOLA 240 m, aprox. · panel a $1 · Horizons'],
    [/^LOLA · panel at ([\d.]+ m) · Horizons$/, 'LOLA · panel a $1 · Horizons'],
    /* línea de tiempo */
    [/^Night longer than the battery \((\d+) h\)$/, 'Noche más larga que la batería ($1 h)'],
    [/^Stay: (\d+) d from landing$/, 'Estadía: $1 d desde el aterrizaje'],
    [/^Period summary (.+) – (.+) · panel at ([\d.]+ m), antenna at ([\d.]+ m) · JPL Horizons DE441 \+ LOLA\/PGDA horizon$/, 'Resumen del período $1 – $2 · panel a $3, antena a $4 · JPL Horizons DE441 + horizonte LOLA/PGDA'],
    [/^(\d+)-day window · (?=\d)/, 'Ventana de $1 d · '],
    /* comparar escenarios y punto propio */
    [/^Add the current scenario \(zone ([A-Z])\)$/, 'Añadir el escenario actual (zona $1)'],
    [/^Own point \(approximate horizon\): (.+)$/, 'Punto propio (horizonte aproximado): $1'],
    [/^Remove scenario (\d+)$/, 'Quitar el escenario $1'],
    [/^Out of range: the point is (\d+) km from the pole \(maximum 190 km\)\.$/, 'Fuera del dominio: el punto está a $1 km del polo (máximo 190 km).'],
    /* zona elegida */
    [/^Zone ([A-Z])$/, 'Zona $1'],
    [/^Zone ([A-Z]) confirmed$/, 'Zona $1 confirmada'],
    [/^Confirm zone ([A-Z])$/, 'Confirmar zona $1'],
    [/^Zone ([A-Z]) · (.+) confirmed for the landing$/, 'Zona $1 · $2 confirmada para el alunizaje'],

    /* ---------- trozos: nombres de zona dentro de una frase y meses de las fechas ---------- */
    [/\bPeak near Shackleton\b/, 'Pico cerca de Shackleton'],
    [/\bShackleton rim\b/, 'Borde de Shackleton'],
    [/\bOwn point\b/, 'Punto propio'],
    [/\b(\d{1,2}) Jan\b/g, '$1 ene'],
    [/\b(\d{1,2}) Feb\b/g, '$1 feb'],
    [/\b(\d{1,2}) Mar\b/g, '$1 mar'],
    [/\b(\d{1,2}) Apr\b/g, '$1 abr'],
    [/\b(\d{1,2}) May\b/g, '$1 may'],
    [/\b(\d{1,2}) Jun\b/g, '$1 jun'],
    [/\b(\d{1,2}) Jul\b/g, '$1 jul'],
    [/\b(\d{1,2}) Aug\b/g, '$1 ago'],
    [/\b(\d{1,2}) Sep\b/g, '$1 sep'],
    [/\b(\d{1,2}) Oct\b/g, '$1 oct'],
    [/\b(\d{1,2}) Nov\b/g, '$1 nov'],
    [/\b(\d{1,2}) Dec\b/g, '$1 dic']
  ]
});

/* añadidos después del diccionario inicial */
LunarI18n.add({
  exact: {
    'See this place in LROC Quickmap ↗': 'Ver este lugar en LROC Quickmap ↗',
    "Opens NASA's LROC Quickmap centred on this place, in south polar projection": 'Abre LROC Quickmap de la NASA centrado en este lugar, en proyección polar sur'
  }
});

/* añadidos tras la auditoría de pantallas (2026-11-15) */
LunarI18n.add({
  exact: {
    'Compare': 'Comparar',
    'Illustrative layers': 'Capas ilustrativas',
    'These two overlays are drawn over generated relief to illustrate. They are not measurements, and the verdict does not use them.': 'Estas dos capas se dibujan sobre relieve generado, para ilustrar. No son mediciones y el veredicto no las usa.',
    'Descent (Apollo 11 example)': 'Descenso (ejemplo del Apollo 11)',
    '496 kg spare · the same for every zone and date · TN D-6846': 'sobran 496 kg · igual para toda zona y fecha · TN D-6846'
  },
  patterns: [
    [/^Sun: over (\d+ h|\d+ d \d+ h)$/, 'Sol: más de $1']
  ]
});

