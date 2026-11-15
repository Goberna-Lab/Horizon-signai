/* Horizon Signai · diccionario en español de planificar.html (planificador, paso 2: caminata, concepto). Ver i18n.js.
 *
 * Cubre el HTML de la página, lo que dibuja su script y los textos de mission.js (rutas, estados y consumibles).
 * Los números, las unidades, las coordenadas y los nombres propios se dejan como están.
 */
(function () {
  'use strict';
  var MES = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };

  LunarI18n.add({
    exact: {
      /* ---------- cabecera ---------- */
      'Horizon Signai · Planner · Walk (concept)': 'Horizon Signai · Planificador · Caminata (concepto)',
      'Horizon Signai: back to the start': 'Horizon Signai: volver al inicio',
      'Planner steps': 'Pasos del planificador',
      'Landing': 'Alunizaje',
      'Walk · concept': 'Caminata · concepto',
      'Concept: what comes after the landing. Illustrative data.': 'Concepto: lo que viene después del alunizaje. Datos ilustrativos.',
      'Sections': 'Secciones',
      'Missions': 'Misiones',
      'Planner': 'Planificador',
      'Mission log': 'Bitácora de misión',
      'Opens the 3D Moon': 'Abre la Luna en 3D',
      'Example campaign · south pole': 'Campaña de ejemplo · polo sur',
      '19 Dec 2026 · 10:00 UTC': '19 dic 2026 · 10:00 UTC',

      /* ---------- mapa ---------- */
      'Connecting Ridge, at the lunar south pole, with the planned route to the Shackleton rim': 'Connecting Ridge, en el polo sur lunar, con la ruta planificada hacia el borde de Shackleton',
      'Sun 5°': 'Sol 5°',
      'Lander': 'Módulo',
      'Shackleton rim': 'Borde de Shackleton',
      'One stretch crosses a slope beyond the limit': 'Un tramo cruza una pendiente fuera del límite',
      'Map controls': 'Controles del mapa',
      'Zoom in': 'Acercar',
      'Zoom out': 'Alejar',
      'North up and initial view': 'Norte arriba y vista inicial',

      /* ---------- capas ---------- */
      'Layers': 'Capas',
      'active': 'activas',
      'CNT': 'CUR',
      'SLP': 'PEN',
      'ICE': 'HIE',
      'TMP': 'TEM',
      'Base image': 'Imagen base',
      'Terrain · 10 m contours': 'Relieve · curvas 10 m',
      'Slope': 'Pendiente',
      'Possible ice': 'Posible hielo',
      'Temperature': 'Temperatura',
      'Radiation': 'Radiación',
      'Generated relief ·': 'Relieve generado ·',
      'Generated relief': 'Relieve generado',
      'Placeholder layer ·': 'Capa provisional ·',
      'Placeholder layer': 'Capa provisional',
      'Illustrative': 'Ilustrativo',
      'Computed': 'Calculado',

      /* ---------- plan de caminata (rutas de mission.js) ---------- */
      'Walk plan': 'Plan de caminata',
      'Start simulator': 'Iniciar simulador',
      'Route goal': 'Objetivo de la ruta',
      'Safe': 'Segura',
      'Short': 'Corta',
      'Scientific': 'Científica',
      'Goes around both slope zones. It is the longest.': 'Rodea las dos zonas de pendiente. Es la más larga.',
      'The most direct, but one stretch crosses a slope beyond the limit.': 'La más directa, pero un tramo cruza una pendiente fuera del límite.',
      'Passes the lit rim and a shadowed area with possible ice, without crossing hazards.': 'Pasa por el borde iluminado y una zona en sombra con posible hielo, sin cruzar peligros.',
      'Distance': 'Distancia',
      'Round-trip time': 'Tiempo ida y vuelta',
      'Elevation gain': 'Desnivel',
      'Max slope': 'Pendiente máx.',

      /* ---------- supervivencia ---------- */
      'Survival': 'Supervivencia',
      'Within reserve': 'Dentro de la reserva',
      'Tight oxygen': 'Oxígeno ajustado',
      'Route not viable': 'Ruta no viable',
      'Estimated use against the reserve': 'Consumo estimado frente a la reserva',
      'Oxygen is just enough on the way back': 'El oxígeno queda justo al volver',
      'Consumables suffice; the problem is the slope': 'Los consumibles alcanzan; el problema es la pendiente',
      'Oxygen': 'Oxígeno',
      'Power': 'Energía',
      'Water': 'Agua',
      'Oxygen: estimated use against the reserve': 'Oxígeno: consumo estimado frente a la reserva',
      'Power: estimated use against the reserve': 'Energía: consumo estimado frente a la reserva',
      'Water: estimated use against the reserve': 'Agua: consumo estimado frente a la reserva',

      /* ---------- perfil y leyenda ---------- */
      'Elevation profile': 'Perfil de elevación',
      'Elevation profile of the route': 'Perfil de elevación de la ruta',
      'Computed over the generated terrain': 'Calculada sobre el relieve generado',
      '15° limit': 'límite 15°',
      'Concept preview.': 'Vista conceptual.',
      'The terrain, layers, routes and survival figures on this screen are generated to illustrate; they are not NASA data. The landing step uses the real data.': 'El relieve, las capas, las rutas y las cifras de supervivencia de esta pantalla se generan para ilustrar; no son datos de la NASA. El paso de alunizaje usa los datos reales.'
    },

    patterns: [
      /* rótulo del perfil: «0–3.8 km · lander in RoI 6 · 89.47° S · 222.61° E» */
      [/^(0–[\d.,]+ km) · lander in RoI 6 · /, '$1 · módulo en la RoI 6 · '],
      /* trozo: mes abreviado después del día */
      [/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, function (m, d, mes) { return d + ' ' + MES[mes]; }]
    ]
  });
})();
