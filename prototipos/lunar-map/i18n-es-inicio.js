/* Horizon Signai · diccionario en español de inicio.html (Missions: la campaña de ejemplo). Ver i18n.js.
 *
 * Cubre el HTML de la página, lo que dibuja su script y los datos de campaign.js y mission.js (misiones, decisiones y
 * bitácora). Los números, las unidades y los nombres propios se dejan como están. Los textos con cifras, fechas o
 * nombres van en «patterns»; los de frase entera primero y los de trozos (roles, días, meses) al final.
 */
(function () {
  'use strict';
  var MES = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
  var DIA = { Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb' };
  /* quién registra un movimiento y de qué tipo es (campaign.js) */
  var ROL = { 'Science team': 'Equipo científico', Data: 'Datos', Planning: 'Planificación', Coordination: 'Coordinación', 'Flight Director': 'Dirección de vuelo', Navigation: 'Navegación', EVA: 'EVA' };
  var TIPO = { Decision: 'Decisión', Planning: 'Planificación', Simulation: 'Simulación', Data: 'Datos', Review: 'Revisión', Operation: 'Operación' };
  /* reparto de estados del indicador «Missions in the campaign» */
  var MIX = { approved: 'aprobada', 'to sign': 'por firmar', 'under review': 'en revisión', draft: 'borrador' };
  /* indicador «Operations scheduled»: el principio del texto del siguiente movimiento */
  var SIG = {
    'Final campaign Go/No-Go': 'Go/No-Go final de la campaña',
    'Contact in zone A': 'Contacto en la zona A',
    'Leaves the lander on the scientific route': 'Salida del módulo por la ruta científica',
    'Leaves the lander on the scientific (pending sign-off) route': 'Salida del módulo por la ruta científica (pendiente de firma)',
    'Stop 1': 'Parada 1',
    'Stop 2': 'Parada 2',
    'Decision point': 'Punto de decisión',
    'Return to the lander': 'Regreso al módulo',
    'Liftoff at the end of the 3-day stay on the surface': 'Despegue al final de la estadía de 3 días en superficie',
    'Deadline to choose the date': 'Plazo para elegir la fecha',
    /* movimientos ya registrados: solo serían «el siguiente» con el reloj del equipo atrasado */
    'Opens the draft': 'Abre el borrador',
    'Registers the mission': 'Da de alta la misión',
    'Changes zone C to RoI 4 on the Shackleton rim': 'Cambia la zona C a la RoI 4 del borde de Shackleton',
    'First simulated descent with the Apollo 11 profile': 'Primer descenso simulado con el perfil del Apollo 11',
    'Put under review': 'Queda en revisión',
    'Draws three routes for the walk': 'Traza tres rutas para la caminata',
    'Short route not viable': 'Ruta corta no viable',
    'JPL Horizons DE441 ephemeris for Dec 2026': 'Efemérides JPL Horizons DE441 para dic 2026',
    'Confirms zone A': 'Confirma la zona A',
    'Second simulated descent': 'Segundo descenso simulado',
    'Earth is at +6.5° at contact (antenna at 2 m)': 'La Tierra queda a +6.5° en el contacto (antena a 2 m)',
    'Dry run of the scientific route': 'Ensayo de la ruta científica',
    'Sends the scientific route for sign-off': 'Envía a firma la ruta científica'
  };
  function tiene(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function siguiente(h) {
    if (tiene(SIG, h)) return SIG[h];
    if (tiene(EXACT, h)) return EXACT[h];
    return h.replace(/^Arrival at the Shackleton rim, at ([\d.,]+) km$/, 'Llegada al borde de Shackleton, a $1 km')
      .replace(/^Approves the safe route as backup \(([\d.,]+) km, max slope ([\d.,]+)°\)$/, 'Aprueba la ruta segura como respaldo ($1 km, pend. máx. $2°)');
  }
  /* «1 movimiento», «3 movimientos» */
  function n(c, uno, varios) { return c + ' ' + (c === '1' ? uno : varios); }

  var EXACT = {
    /* ---------- cabecera ---------- */
    'Horizon Signai · Missions': 'Horizon Signai · Misiones',
    'Horizon Signai: back to the start': 'Horizon Signai: volver al inicio',
    'Example campaign · south pole': 'Campaña de ejemplo · polo sur',
    'Sections': 'Secciones',
    'Missions': 'Misiones',
    'Planner': 'Planificador',
    '3D Map': 'Mapa 3D',
    'Landing': 'Alunizaje',
    'Walk · concept': 'Caminata · concepto',
    'Mission coordination': 'Coordinación de misión',
    'South pole · shift A': 'Polo sur · turno A',

    /* ---------- próximo hito ---------- */
    'Next milestone': 'Próximo hito',
    'Landing at Connecting Ridge': 'Alunizaje en Connecting Ridge',
    'Contact · 18 Dec 2026 · 09:00 UTC': 'Contacto · 18 dic 2026 · 09:00 UTC',
    'Countdown to contact': 'Cuenta regresiva hasta el contacto',
    'DAYS': 'DÍAS',
    'HOURS': 'HORAS',
    'SEC': 'SEG',
    'CR campaign progress': 'Avance de la campaña CR',
    'Zone confirmed': 'Zona confirmada',
    'Descent simulated': 'Descenso simulado',
    'Walk approved': 'Caminata aprobada',
    'Final Flight Director Go': 'Go final de dirección de vuelo',

    /* ---------- pendiente de firma ---------- */
    'Awaiting your sign-off': 'Pendiente de tu firma',
    '1 PENDING SIGN-OFF': '1 POR APROBAR',
    'UP TO DATE': 'AL DÍA',
    'CR-02 · Scientific route to the Shackleton rim': 'CR-02 · Ruta científica al borde de Shackleton',
    'Walk on 19 Dec · two stops · sent by Planning on 13 Nov': 'Caminata del 19 dic · dos paradas · enviada por Planificación el 13 nov',
    'Distance': 'Distancia',
    'Max slope': 'Pend. máx.',
    'O₂ on return': 'O₂ al volver',
    'Approve': 'Aprobar',
    'Confirm approval': 'Confirmar aprobación',
    'Approved': 'Aprobada',
    'You have no pending decisions. The next one will come with the final Flight Director Go.': 'No tienes decisiones pendientes. La siguiente llegará con el Go final de dirección de vuelo.',

    /* ---------- decisiones aprobadas ---------- */
    'Approved decisions': 'Decisiones aprobadas',
    'signed': 'firmadas',
    'Apollo 11 descent profile adapted to the pole': 'Perfil de descenso del Apollo 11 adaptado al polo',
    'Zone A · Connecting Ridge RoI 6 confirmed for the landing': 'Zona A · Connecting Ridge RoI 6 confirmada para el alunizaje',
    'Safe backup route for the walk': 'Ruta segura de respaldo para la caminata',
    'Scientific route, with mandatory return at stop 2': 'Ruta científica, con retorno obligatorio en la parada 2',

    /* ---------- indicadores ---------- */
    'Campaign indicators': 'Indicadores de la campaña',
    'Missions in the campaign': 'Misiones en campaña',
    'To sign': 'Por firmar',
    'CR-02 scientific route': 'ruta científica de CR-02',
    'up to date · no open decisions': 'al día · sin decisiones abiertas',
    'Movements logged': 'Movimientos registrados',
    'Operations scheduled': 'Operaciones programadas',
    'calculating…': 'calculando…',

    /* ---------- calendario de campaña ---------- */
    'Campaign calendar': 'Calendario de campaña',
    'Oct 2026 → Jan 2027 · UTC': 'oct 2026 → ene 2027 · UTC',
    'Preparation': 'Preparación',
    'On the surface': 'En superficie',
    'Sun above the horizon': 'Sol sobre el horizonte',
    'Movement': 'Movimiento',
    'Scheduled': 'Programado',
    'Milestone': 'Hito',
    'Today': 'Hoy',
    'Campaign calendar with the Sun windows, preparation, the stay on the surface and the movements of each mission': 'Calendario de la campaña con las ventanas de Sol, la preparación, la estadía en superficie y los movimientos de cada misión',
    'Oct 2026': 'oct 2026',
    'Nov': 'nov',
    'Dec': 'dic',
    'Jan 2027': 'ene 2027',
    'Sun': 'Sol',
    'zone A · panel at 2 m': 'zona A · panel a 2 m',
    'pending sign-off': 'por aprobar',
    'review': 'revisar',
    'draft': 'borrador',
    'approved': 'aprobada',
    'draft · no date': 'borrador · sin fecha',
    'today': 'hoy',
    /* globos del calendario */
    'Sun above the real horizon': 'Sol sobre el horizonte real',
    'Landing preparation': 'Preparación del alunizaje',
    'until contact on 18 Dec': 'hasta el contacto del 18 dic',
    '18 Dec 09:00 → 21 Dec 09:00 UTC · 3 days': '18 dic 09:00 → 21 dic 09:00 UTC · 3 días',
    'Walk preparation': 'Preparación de la caminata',
    'scientific route approved': 'ruta científica aprobada',
    'scientific route pending sign-off': 'ruta científica pendiente de firma',
    'Walk · 19 Dec 10:00 UTC': 'Caminata · 19 dic 10:00 UTC',
    'Possible window · date to be chosen': 'Ventana posible · fecha por elegir',

    /* ---------- movimientos de las misiones ---------- */
    'Mission movements': 'Movimientos de las misiones',
    'logged and scheduled': 'registrados y programados',
    'Filter by mission': 'Filtrar por misión',
    'Movement type': 'Tipo de movimiento',
    'Filter by time': 'Filtrar por tiempo',
    'All': 'Todo',
    'Logged': 'Registrado',
    'All types': 'Todos los tipos',
    'Decision': 'Decisión',
    'Planning': 'Planificación',
    'Simulation': 'Simulación',
    'Data': 'Datos',
    'Review': 'Revisión',
    'Operation': 'Operación',
    'DATA': 'DATOS',
    'OPS': 'OP',
    'Measuring the routes over the terrain…': 'Midiendo las rutas sobre el relieve…',
    'No movements match these filters.': 'No hay movimientos con estos filtros.',
    'Open in Planner · Landing': 'Abrir en Planificador · Alunizaje',
    'Open in Planner · Walk': 'Abrir en Planificador · Caminata',
    /* bitácora (campaign.js) */
    'Opens the draft: sampling at the de Gerlache rim': 'Abre el borrador: muestreo en el borde de de Gerlache',
    'Loads the 5 m DTM of Connecting Ridge and the LOLA LDEM_75S': 'Carga el DTM de 5 m de Connecting Ridge y el LDEM_75S de LOLA',
    'Registers the mission: survey of the peak next to Shackleton': 'Da de alta la misión: reconocimiento del pico junto a Shackleton',
    '18.6-year illumination sweep over zones A, B and C (Mazarico 2011)': 'Barrido de iluminación de 18.6 años sobre las zonas A, B y C (Mazarico 2011)',
    'Changes zone C to RoI 4 on the Shackleton rim: the mosaic centre falls on the inner wall (11% Sun)': 'Cambia la zona C a la RoI 4 del borde de Shackleton: el centro del mosaico cae en la pared interior (11% de Sol)',
    'First simulated descent with the Apollo 11 profile: P63 · P64 · P66 in 11 min 50 s': 'Primer descenso simulado con el perfil del Apollo 11: P63 · P64 · P66 en 11 min 50 s',
    'Put under review: without a local illumination series the date cannot be set': 'Queda en revisión: sin serie local de iluminación no se puede fijar la fecha',
    'Draws three routes for the walk: safe, short and scientific': 'Traza tres rutas para la caminata: segura, corta y científica',
    'JPL Horizons DE441 ephemeris for Dec 2026: Sun at +2.7° at contact (panel at 2 m)': 'Efemérides JPL Horizons DE441 para dic 2026: Sol a +2.7° en el contacto (panel a 2 m)',
    'Confirms zone A · Connecting Ridge for the landing': 'Confirma la zona A · Connecting Ridge para el alunizaje',
    'Second simulated descent: the line of sight to the Sun holds through P64': 'Segundo descenso simulado: la línea de vista al Sol se mantiene en P64',
    'Earth is at +6.5° at contact (antenna at 2 m): direct link, no relay': 'La Tierra queda a +6.5° en el contacto (antena a 2 m): enlace directo, sin relé',
    'Approves the Apollo 11 descent profile adapted to the pole': 'Aprueba el perfil de descenso del Apollo 11 adaptado al polo',
    'Dry run of the scientific route: two stops, no stretches beyond the limit': 'Ensayo de la ruta científica: dos paradas, sin tramos fuera de límite',
    'Adds three sampling points to the draft': 'Añade tres puntos de muestreo al borrador',
    'Final campaign Go/No-Go': 'Go/No-Go final de la campaña',
    'P63 · braking begins from 15 km altitude': 'P63 · empieza el frenado desde 15 km de altura',
    'P64 · approach with the site in view': 'P64 · aproximación con el sitio a la vista',
    'P66 · vertical descent': 'P66 · descenso vertical',
    'Contact in zone A · Connecting Ridge RoI 6': 'Contacto en la zona A · Connecting Ridge RoI 6',
    'Leaves the lander on the scientific route': 'Salida del módulo por la ruta científica',
    'Leaves the lander on the scientific (pending sign-off) route': 'Salida del módulo por la ruta científica (pendiente de firma)',
    'Decision point: mandatory return if O₂ use runs above forecast': 'Punto de decisión: retorno obligatorio si el O₂ va por encima de lo previsto',
    'Liftoff at the end of the 3-day stay on the surface': 'Despegue al final de la estadía de 3 días en superficie',
    'Deadline to choose the date: at the peak (RoI 2) the Sun is cut off on 28 Jan': 'Plazo para elegir la fecha: en el pico (RoI 2) el Sol se corta el 28 ene',
    'Approves the scientific route with mandatory return at stop 2': 'Aprueba la ruta científica con retorno obligatorio en la parada 2',

    /* ---------- sitios de misión ---------- */
    'Mission sites': 'Sitios de misión',
    'polar stereographic': 'estereográfica polar',
    'Map of the south pole with the mission sites': 'Mapa del polo sur con los sitios de las misiones',
    'Sun at 8° · generated terrain · PGDA sites': 'Sol a 8° · relieve generado · sitios PGDA',
    'Peak near Shackleton · RoI 2': 'Pico cerca de Shackleton · RoI 2',
    'Shackleton rim · RoI 4': 'Borde de Shackleton · RoI 4',
    'de Gerlache rim': 'Borde de de Gerlache',

    /* ---------- misiones (campaign.js) ---------- */
    'in the campaign': 'en la campaña',
    'Science walk to the Shackleton rim': 'Caminata científica al borde de Shackleton',
    'Survey of the peak next to Shackleton': 'Reconocimiento del pico junto a Shackleton',
    'Sampling at the de Gerlache rim': 'Muestreo en el borde de de Gerlache',
    '18 Dec 2026 · 09:00 UTC · Zone A': '18 dic 2026 · 09:00 UTC · Zona A',
    '19 Dec 2026 · 10:00 UTC · 2 stops': '19 dic 2026 · 10:00 UTC · 2 paradas',
    'Jan 2027 · date to be chosen · Zone B': 'ene 2027 · fecha por elegir · Zona B',
    'no date · science team draft': 'sin fecha · borrador del equipo científico',
    'fuel · light · Sun · Earth · night': 'comb · luz · Sol · Tierra · noche',
    'slope · O₂ · power · Earth · light': 'pend · O₂ · energía · Tierra · luz',
    'PENDING SIGN-OFF': 'POR APROBAR',
    'REVIEW': 'REVISAR',
    'DRAFT': 'BORRADOR',
    'APPROVED': 'APROBADA',

    /* ---------- pie ---------- */
    'Example campaign: the missions, sign-offs and log are sample data · real sites, Sun and Earth (JPL Horizons DE441, LOLA/PGDA horizons) · map relief generated to illustrate': 'Campaña de ejemplo: las misiones, las firmas y la bitácora son datos de muestra · sitios, Sol y Tierra reales (JPL Horizons DE441, horizontes LOLA/PGDA) · relieve del mapa generado para ilustrar',
    'Reset demo': 'Restablecer demo',

    /* ---------- tarjeta de firma ---------- */
    'Open walk': 'Abrir caminata'
  };

  LunarI18n.add({
    exact: EXACT,

    patterns: [
      /* ---------- frases enteras ---------- */
      /* indicadores */
      [/^\d+ (?:GO|approved|to sign|under review|draft)(?: · \d+ (?:GO|approved|to sign|under review|draft))*$/, function (m) { return m.replace(/approved|to sign|under review|draft/g, function (w) { return MIX[w]; }); }],
      [/^(\d+) in the last 7 days$/, '$1 en los últimos 7 días'],
      [/^next: (.+) · (\d{1,2}) ([A-Z][a-z]{2})$/, function (m, h, d, mes) { return 'siguiente: ' + siguiente(h) + ' · ' + d + ' ' + (MES[mes] || mes); }],
      /* contadores */
      [/^(\d+) movements · (\d+) logged · (\d+) scheduled$/, function (m, a, b, c) { return n(a, 'movimiento', 'movimientos') + ' · ' + n(b, 'registrado', 'registrados') + ' · ' + n(c, 'programado', 'programados'); }],
      [/^(\d+) logged · (\d+) scheduled$/, function (m, a, b) { return n(a, 'registrado', 'registrados') + ' · ' + n(b, 'programado', 'programados'); }],
      [/^(\d+|—) movements$/, function (m, a) { return n(a, 'movimiento', 'movimientos'); }],
      [/^(\d+) missions$/, '$1 misiones'],
      /* bitácora: textos con cifras medidas sobre el relieve */
      [/^Short route not viable: one stretch reaches ([\d.,]+)°, above the 15° limit$/, 'Ruta corta no viable: un tramo llega a $1°, por encima del límite de 15°'],
      [/^Approves the safe route as backup \(([\d.,]+) km, max slope ([\d.,]+)°\)$/, 'Aprueba la ruta segura como respaldo ($1 km, pend. máx. $2°)'],
      [/^Sends the scientific route for sign-off: ([\d.,]+) km, max slope ([\d.,]+)°, O₂ on return (\d+)%$/, 'Envía a firma la ruta científica: $1 km, pend. máx. $2°, O₂ al volver $3%'],
      [/^Stop 1 · lit rim, at ([\d.,]+) km$/, 'Parada 1 · borde iluminado, a $1 km'],
      [/^Stop 2 · permanent shadow with possible ice, at ([\d.,]+) km$/, 'Parada 2 · sombra permanente con posible hielo, a $1 km'],
      [/^Arrival at the Shackleton rim, at ([\d.,]+) km$/, 'Llegada al borde de Shackleton, a $1 km'],
      [/^Return to the lander · (\d+ h \d\d) in total$/, 'Regreso al módulo · $1 en total'],
      [/^(Science team|Data|Planning|Coordination|Flight Director|Navigation|EVA) · (Decision|Planning|Simulation|Data|Review|Operation)( · scheduled)?$/, function (m, quien, tipo, prog) { return ROL[quien] + ' · ' + TIPO[tipo] + (prog ? ' · programado' : ''); }],
      /* calendario */
      [/^(\d+ h \d\d) round trip$/, '$1 ida y vuelta'],
      /* sitio elegido en el mapa */
      [/^([A-Z]{2}-\d{2}) · Peak near Shackleton · RoI 2$/, '$1 · Pico cerca de Shackleton · RoI 2'],
      [/^([A-Z]{2}-\d{2}) · de Gerlache rim$/, '$1 · Borde de de Gerlache'],

      /* ---------- trozos: «ahora», rol antes de una fecha, día de la semana y mes ---------- */
      [/^NOW · (?=\d{1,2} [A-Z][a-z]{2} \d{4}\b)/, 'AHORA · '],
      [/^(Science team|Data|Planning|Coordination|Flight Director|Navigation) · (?=\d{1,2} [A-Z][a-z]{2} \d{4}\b)/, function (m, quien) { return ROL[quien] + ' · '; }],
      [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (?=\d{1,2} [A-Z][a-z]{2} \d{4}\b)/, function (m, dia) { return DIA[dia] + ' '; }],
      [/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, function (m, d, mes) { return d + ' ' + MES[mes]; }]
    ]
  });
})();
