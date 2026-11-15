# Arquitectura de `apps/web`

```
src/
  main.tsx                 Punto de entrada
  app/                     Arranque de la app: router, rutas, layouts
    router.tsx             Rutas con carga diferida por pantalla
    routes.ts              Paths centralizados (routes.landing, ...)
    layouts/RootLayout.tsx Layout común (header/nav)
  features/                Una carpeta por pantalla/dominio
    landing/               /             Landing
      content.ts           Todo el texto (en inglés) y sus cifras, que salen de flight/data/facts.json
      landing.css          Estilos de la página
      sections/            Una sección por archivo: Header, Product, Audience, Validation, Sources, Closing y Footer.
                           Reveal.tsx es la entrada al hacer scroll; data/ guarda los datos de las figuras
        product/           La ventana del producto: las pantallas del software funcionando con datos reales.
                           ProductWindow.tsx es el marco (selector de vistas, tiempo compartido, día y noche) y
                           cada vista es un archivo: Lander, Compare, Calendar, Map, PlanB y Learn. PolarSky.tsx
                           dibuja el cielo en polar, Timeline.tsx las ventanas, HorizonScene.tsx el horizonte de fondo
                           (sus piezas están en horizon/) y sky.ts lee los datos
      flight/              El vuelo sobre el polo sur: un escenario fijo que el scroll recorre
        FlightStage.tsx    Escenario: lienzo, texto de las escenas, tablero y scroll (GSAP ScrollTrigger)
                           El inicio: pantalla de carga (porcentaje y paso real: motor, relieve, malla, sombras);
                           al terminar, sobre el relieve 3D real de Connecting Ridge a ras de suelo (modo realista
                           del motor: regolito, cielo negro, estrellas) se escribe "Horizon Signal", se borra "al" y
                           queda "Horizon SignAI"; el día avanza y el Sol sale de verdad tras el horizonte. El HUD
                           (enlace, Live, fecha con cuenta atrás, energía) arranca apagado y se recupera con el Sol.
                           Si el 3D falla, queda el dibujo 2D del inicio
        ScenePanel.tsx     El panel de cada escena: primero pregunta ("Guess first", tres respuestas) y al responder
                           revela el dato; las preguntas van con cada escena en content.ts (`quiz`)
        stops.ts           Paradas de la cámara, una por escena
        telemetry.ts       Lecturas del tablero (fecha, Sol, Tierra, cuenta regresiva)
        createFlight.ts    Entrada del trozo diferido: three.js, datos y motor
        engine/            Motor sin React: relieve (plate), sombras (shadow + worker), efemérides, cámara (story),
                           shaders y renderizador
        data/              Datos generados: relieve LOLA, efemérides y cifras (ver "Datos de la landing")
    mission-planner/       /planificador Planificador de misiones
      model/               Tipos y lógica de dominio
    map-3d/                /3d-map       Mapa 3D de la Luna: muestra a pantalla completa public/mapa-3d.html, página
                           autónoma (datos y three.js dentro) generada por scripts/mapa-3d/construir-mapa.py
    lunar-map/             /planner      Dashboard y Planificador: iframe a pantalla completa del prototipo estático
                           prototipos/lunar-map/ (en inglés), que la API sirve en /lunar-map/ (una sola copia)
    simulator/             /simulador    Simulador 3D
      components/SceneCanvas.tsx  Canvas base de react-three-fiber
      scenes/registry.ts          Registro de escenas 3D
  shared/                  Código usado por más de una feature
    lib/api.ts             Cliente tipado del API (Hono RPC)
    ui/ComingSoon.tsx      Pantalla provisional ("SOON") para las rutas sin contenido
  styles/
    tokens.css             Paleta, tipografías y medidas, compartidas por las tres pantallas
    global.css             Estilos base
scripts/
  build-landing-data.ts    Genera los datos de la landing a partir de luna-recursos/
  mapa-3d/                 Fuente y generador del mapa 3D (mapa.src.html, sitios.json, nombres IAU, verificar-mapa.py)
  capture-landing-plates.mjs  Guarda como imagen las láminas fijas, capturadas del propio lienzo (Playwright)
  check-landing.mjs        Comprueba rutas, enlaces y la ventana del producto con interacciones reales (Playwright)
```

## Reglas

- Cada feature expone lo público desde su `index.ts`. Las demás partes importan
  desde `@/features/<feature>`, no desde sus archivos internos.
- Una feature no importa de otra. Lo compartido va a `shared/`.
- Tipos que también usa el backend van a `@horizon-signai/shared`.
- `@/` apunta a `src/`.

## Agregar una escena 3D

1. Crear el componente en `features/simulator/scenes/MiEscena.tsx` (solo
   contenido de three: mallas, luces, etc.).
2. Registrarlo en `scenes/registry.ts`.
3. Se renderiza dentro de `<SceneCanvas>`.

three.js no entra en el arranque: se descarga al entrar a `/simulador` y, en la landing, después de pintar el
texto (el vuelo se importa de forma diferida desde `FlightStage.tsx`).

## Diseño

- Paleta del equipo en `styles/tokens.css`: fondo `#F4EFE6`, sombra `#C9C1B6`, textos `#111111`, CTA `#C8102E`.
  Los matices salen de la tinta con transparencia o de tramas. La única ampliación es su versión de noche (la misma
  lámina con la luz apagada), que usa la landing cuando el Sol se pone en la ventana del software.
- Tipografías autoalojadas (sin peticiones a terceros): Archivo variable para títulos y texto, IBM Plex Mono para
  datos. Se importan en `main.tsx`.
- Lenguaje visual: impresión industrial suiza. Retícula a la vista, esquinas a 90 grados, un solo color de señal.
- La interfaz va en inglés: la entrega de Space Apps lo exige (`docs/09-entrega.md`).

## Datos de la landing

`luna-recursos/` no entra en la imagen de Docker, así que la landing guarda en `features/landing/flight/data/`
lo que necesita, ya procesado:

| Archivo | Qué es | Se carga |
|---|---|---|
| `terrain.z.bin` | Relieve del polo sur (LOLA LDEM_75S_240M) a 1025 x 1025 nodos, comprimido (0,76 MB) | Con el vuelo |
| `plate.json` | Efemérides de JPL Horizons para el día lunar del relato, sitios del catálogo y series del sitio destacado | Con el vuelo |
| `facts.json` | Las cifras que cita el texto y la serie mes a mes de 2026 a 2030 | Con la página |
| `poster.webp` | La lámina del inicio, capturada del propio lienzo: fondo mientras carga el vuelo y en modo estático | Con la página |

Y en `features/landing/sections/data/`, para las figuras de debajo del vuelo:

| Archivo | Qué es |
|---|---|
| `sky.json` | El cielo de Connecting Ridge en el día lunar del relato: horizonte real por azimut (suelo y mástil de 10 m), Sol y Tierra hora a hora, ventanas de visibilidad y energía del panel. Pestañas Lander y Learn |
| `product.json` | Tres sitios a menos de 12 km con su horizonte, su cielo y sus cifras (pestaña Compare) y las salidas frente al plan original (pestaña Plan B) |
| `catalog.json` | Los 11 sitios del catálogo con sus cifras (suelo y 10 m) y sus zonas candidatas (RoI). Pestaña Map |
| `catalog-plate.webp`, `catalog-positions.json` | La lámina cuadrada del mapa, capturada del lienzo, y dónde cae cada sitio en ella |

Para regenerarlos (hace falta [Bun](https://bun.sh)):

```sh
bun apps/web/scripts/build-landing-data.ts
```

Las dos láminas fijas (`poster.webp` y `catalog-plate.webp`) no se generan: se capturan del propio lienzo con
Playwright, con el servidor de desarrollo levantado y Chrome instalado (no descarga navegadores):

```sh
npm run dev:web
node apps/web/scripts/capture-landing-plates.mjs http://localhost:5173/
```

## La ventana del producto

Debajo del vuelo, la landing muestra el software funcionando: una ventana con las vistas Lander, Compare, Calendar,
Map, Plan B y Learn, con el diseño de las pantallas del producto.

- **No son capturas ni maquetas:** cada vista lee los datos que genera `build-landing-data.ts` con el motor
  original. Se puede reproducir el día lunar, arrastrar el tiempo (también con el teclado), cambiar la altura del
  observador y elegir sitios en el mapa.
- **Sin barra propia.** La ventana no lleva cabecera: el selector de vistas va encima, con los controles de la
  página.
- **Día y noche los marca el Sol del sitio.** En la vista Lander la pantalla entera sigue a la cuenta regresiva:
  papel mientras dice "Sunset in" y negra en las 40 horas del cambio. El cielo se oscurece pronto (en el primer
  tercio de ese tramo: la Luna no tiene atmósfera) y sigue negro toda la noche; tras la salida vuelve al papel cuando
  el Sol ya está alto. `sky.ts` (`darkness`) da la oscuridad de cada hora y `ProductWindow.tsx` la escribe en la raíz
  de la landing como `--night` (el fondo) y `--night-text` (la tinta, que cambia de oscura a clara a mitad del
  fundido). De esos dos valores cuelgan todos los colores de la página (`.ln` en `landing.css`; la paleta de noche
  está en `styles/tokens.css`). Solo ocurre con la ventana en pantalla: al seguir bajando, la página vuelve al
  papel. El vuelo conserva siempre los colores de día, porque su lienzo se dibuja con ellos.
- **El tiempo se frena en el cambio.** Con el reloj corriendo, la puesta y la salida pasan a un tercio de la
  velocidad (`TURN_TEMPO` en `sky.ts`): unos siete segundos en vez de dos y medio.
- **El momento de la puesta.** Con el reloj corriendo, unas 20 horas antes de que el Sol se oculte la ventana se
  aparta y deja el paisaje a pantalla completa: se van el fondo, los filetes y todo menos la cuenta del Sol, la
  fecha y el botón de pausa; vuelve unas horas después del cambio. Al pausar o tocar la línea de tiempo (que sigue
  ahí, invisible) vuelve al instante. `spotlight` en `sky.ts` da el cuánto y `ProductWindow.tsx` lo escribe en la
  sección como `--cinema`, registrada como número en `product.css` para que el navegador la anime. Mientras dura,
  en la cresta aparece la marca del punto por donde el Sol se oculta (o sale), con su rumbo y su hora reales.
- **El horizonte de fondo** (`HorizonScene.tsx` y `product/horizon/`): detrás de la vista Lander va la puesta del
  Sol vista desde el suelo del sitio, filmada con una cámara de cine. Solo existe en el cambio: de día la página
  queda limpia, sin relieve ni Sol. Al empezar el cambio el cielo se vuelve negro, entra el relieve y el Sol baja
  desde arriba por la derecha hasta perderse tras la cresta justo cuando la cuenta pasa a "Sunrise in". Entonces
  asoman la corona y la luz zodiacal y salen las estrellas. Al amanecer ocurre lo mismo al revés.
  - Qué es real: el tamaño del Sol (medio grado, como desde la Tierra) y su color (blanco: no hay atmósfera);
    dónde y cuándo se oculta (durante el cambio la cámara mira al rumbo de la puesta, de las efemérides de
    `sky.json`, y la cresta que lo tapa es el horizonte real de Connecting Ridge, de `sections/data/horizon.json`);
    que con el Sol en cuadro no se vean estrellas; y la Tierra, que solo aparece cuando está sobre el horizonte del
    sitio y con su fase real.
  - Qué es puesta en escena: el recorrido (en el polo el Sol real no baja, resbala casi a ras del horizonte; aquí
    entra por arriba a la derecha y baja, `SUN.enterX` y `SUN.setX`); el destello de la cámara (velo de luz, rayos
    de difracción, línea anamórfica y reflejos), que es lo que hace grande al Sol en pantalla; el disco, 1,5 veces
    mayor que el real (`SUN.scale`); la escala vertical, exagerada; la Tierra, en una esquina y no en su rumbo; y
    el primer plano (suelo, rocas y cráteres), decorativo.
  - Capas, de atrás hacia delante: estrellas lejanas, estrellas medias y polvo, la Tierra, el Sol (disco,
    resplandor, corona y luz zodiacal), montañas lejanas, cresta con cráteres, primer plano con rocas y sombras
    larguísimas, y el destello de la cámara por delante de todo. Cada una tiene su profundidad: se mueven distinto
    con el puntero, con el scroll y, en el teléfono, al inclinarlo.
  - Archivos: `horizon/config.ts` tiene todos los mandos (tamaño del Sol, profundidades, colores, intensidades y
    calidad por pantalla); `horizon/sun.ts`, el shader del Sol (WebGL 1 sin bibliotecas); `horizon/backdrop.ts`,
    estrellas, polvo, Tierra y rayos de difracción; `horizon/terrain.ts`, el relieve.
  - Rendimiento: un solo bucle, que solo corre con la vista en pantalla. El parallax, el giro de la cámara y los
    fundidos son solo `transform` y `opacity`. Las estrellas y los rayos se pintan una vez; el relieve, solo cuando
    cambia la luz (en escalones de un 4 %) o la cámara giró más que su margen; el shader, solo mientras el Sol está
    en escena y solo si algo cambió, con un tope de píxeles que baja solo si el equipo no llega. En pantallas pequeñas hay menos
    estrellas, menos rocas y un ruido más barato.
  - Con "reducir movimiento" no hay parallax ni titileo y la corona queda quieta: la escena es una lámina fija de
    la hora elegida. Sin WebGL el Sol se dibuja con degradados.
  - Legibilidad: con el fondo visible la ventana es casi transparente de día y hace de visor ahumado de noche,
    lo justo para leer con el Sol detrás.
- **La vista Lander cabe entera en la pantalla** (desde 900 px de ancho): el bloque central toma el alto que queda
  libre y el cielo y las cifras se miden contra él (`cqh`). La nota de la vista va debajo de la ventana, como pie.
- **Colores de dato:** el Sol va en el rojo de señal y la Tierra en azul (`--earth`), solo dentro de las figuras.
  Los títulos y las cifras usan la serif del software (Playfair Display, autoalojada).
- **Veredictos:** "Viable", "Limited" y "Not viable" usan umbrales de ejemplo, escritos en la propia pantalla
  (viable desde 75 % de Sol y 25 % de Tierra; no viable por debajo de 35 % de Sol o 5 % de Tierra). Están en
  `sections/product/sky.ts` (`verdictOf`); en el planificador real los define el usuario.

## Pantallas: de teléfono a monitor ancho

La página se compone sola para cada pantalla. Los cortes son por ancho, salvo el vuelo, que además mira la
orientación:

| Parte | Cómo se adapta |
|---|---|
| Vuelo (`flight/`) | Tres composiciones. **Lateral** (apaisada): texto a la izquierda y escena desplazada a la derecha, el encuadre de `stops.ts`. **Apilada** (vertical: teléfonos y tabletas): titular arriba, escena en medio y panel abajo; en tableta el panel es una franja de dos columnas. **Compacta** (apaisada y de menos de 520 px de alto, un teléfono girado): panel de dos columnas a la izquierda y escena en el hueco de la derecha |
| Tablero del vuelo | Cuatro celdas desde 760 px; fecha y sitio por debajo. Las dos lecturas del sitio van en una línea desde 1100 px |
| Ventana del software | Las vistas van en columnas desde 700 px y en una sola por debajo. Desde 900 px la vista Lander se ajusta al alto de la pantalla. El gráfico polar agranda sus rótulos según el tamaño al que se dibuja (consulta de contenedor) |
| Bandas del producto | Dos columnas desde 700 px; por debajo, el verbo arriba y el texto debajo. El verbo se mide contra el ancho de la lista |
| Celdas de validación | Dos por fila desde 600 px |
| Marca del pie | Mide siempre el ancho exacto del pie (unidades `cqi`) |

- **El encuadre del vuelo se mide, no se supone.** `FlightStage.tsx` mide el titular, los paneles, la barra y el
  tablero reales y le pasa al motor un encuadre por parada (`Frame`: hacia dónde va el centro óptico y en cuántos
  píxeles debe caber la lámina). El motor no sabe nada de dispositivos. Las mismas consultas de medios deciden la
  composición en `flight.css` y en `FlightStage.tsx`.
- **Alturas en `svh`.** Lo que va anclado abajo usa la altura visible más pequeña, que no cambia cuando el
  navegador del teléfono esconde sus barras: la página no salta al empezar a desplazarse. Por eso tampoco hay
  cortes por alto en los teléfonos en vertical.
- **La barra superior** mide 64 px, 56 px en teléfonos y 48 px en pantallas de menos de 520 px de alto (`--bar`).

## Comprobar la landing

Con el servidor de desarrollo levantado, Playwright recorre las rutas, los enlaces y la ventana del producto con
interacciones reales, y sale con código 1 si algo falla:

```sh
npm run check:landing -w @horizon-signai/web -- http://localhost:5173/           # escritorio
npm run check:landing -w @horizon-signai/web -- http://localhost:5173/ --mobile  # 390 x 844, táctil
```

Con `--shots <carpeta>` guarda además una captura por pestaña.

El script corre el motor original de `luna-recursos/calculos/motor`, sin modificar, y se detiene si sus cifras no
coinciden con el ejemplo del SPEC E23 (Connecting Ridge, 2026-12-01: Sol 56,8 %, Tierra 19,9 %, salida del Sol a las
08:51 UTC del día 4).

Qué es dato y qué es dibujo en la lámina:

- **Dato:** el relieve, las curvas de nivel, la retícula, la posición del Sol y de la Tierra y las cifras.
- **Vista previa:** las sombras. Se calculan en el navegador con la dirección real del Sol sobre la rejilla de 381 m
  y no cuentan el relieve de fuera de la lámina. Las cifras no salen de ahí, sino del motor validado.
- **Convención:** la trama de puntos es sombreado cartográfico, para leer la forma del terreno.

El vuelo se apaga solo sin WebGL2 o con "reducir movimiento" activado en el sistema: las escenas quedan como una
página normal con la lámina fija. Se puede forzar con `/?flight=off`.

### Rendimiento del vuelo

Está ajustado para una gráfica integrada (medido en una Intel HD 530 con un lienzo de 2545 x 963: de ~24 ms a
4-7 ms por cuadro):

- **Un dibujo por cuadro y solo si algo cambió.** GSAP lleva el reloj: avanza el scroll y después llama a
  `Flight.frame()`. En reposo no se dibuja.
- **Scroll suavizado con Lenis.** La rueda ya no avanza a saltos; el scroll sigue siendo el del navegador, así que
  `position: sticky`, el teclado y el táctil funcionan igual.
- **Malla de detalle variable** (`engine/mesh.ts`): fina cerca del polo y gruesa vista desde arriba, sin grietas
  entre bloques.
- **Sin trigonometría por píxel** en los shaders y sin antialiasing por hardware en escritorio (en móvil sí).
- **Tope de píxeles y resolución adaptativa**: el lienzo mide el tiempo real de la gráfica
  (`EXT_disjoint_timer_query_webgl2`) y baja o sube de resolución solo.
- **Sombras en dos niveles**: un mapa rápido a mitad de resolución sigue a la cámara cuadro a cuadro y el mapa fino
  entra cuando se detiene.
- **Menos ruido en movimiento**: la trama de puntos y las curvas finas se aligeran mientras la cámara se mueve.
