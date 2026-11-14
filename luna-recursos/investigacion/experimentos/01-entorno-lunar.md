<!-- Enunciado original (2026-11-06), copiado literal. No se reescribe: los cambios van a SPEC.md. -->

Estamos en una etapa de experimentación, no de construir un sistema completo de misiones.

Vamos a comenzar con algo pequeño: un entorno lunar 3D que tenga reglas físicas claras y una arquitectura sencilla para probarlas.

No necesitamos todavía NASA APIs, bases de datos, backend ni simuladores complejos.

# Experimento 01 — Nuestro primer entorno lunar

## 1. ¿Qué vamos a construir?

Una escena 3D con cuatro elementos:

- Una superficie lunar plana.
- Un Sol que ilumina el terreno.
- Una cámara que representa al observador.
- Un reloj que permite avanzar el tiempo.

Por ahora, el Sol tendrá un movimiento controlado y simplificado. No afirmaremos que reproduce efemérides reales.

## 2. Primeras reglas del entorno

Estas son las reglas que implementaría inicialmente.

| ID      | Regla                                                                | Aplicación                                                          |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| ENV-001 | La Luna prácticamente no tiene atmósfera                             | Cielo negro, sin niebla ni dispersión atmosférica                   |
| ENV-002 | La iluminación principal proviene del Sol                            | Una luz direccional representa la radiación solar                   |
| ENV-003 | Los objetos bloquean la luz solar                                    | Generan sombras sobre la superficie                                 |
| ENV-004 | La escala tiene unidades físicas                                     | 1 unidad 3D = 1 metro                                               |
| ENV-005 | El tiempo controla el estado de la escena                            | Podemos avanzar, retroceder y pausar                                |
| ENV-006 | La iluminación física y la exposición visual son conceptos distintos | Aclarar si aumentamos artificialmente la visibilidad de las sombras |

Importante: el cielo negro es una propiedad del entorno; los colores y brillos del render dependen también del material y de la configuración de cámara.

## 3. Arquitectura mínima del motor

No usaría microservicios ni una arquitectura extensa. Solamente separaría las reglas de la representación.

Environment

Constantes y reglas físicas

Simulation

Tiempo y posición solar simplificada

Renderer — Three.js

Terreno · Luz · Sombras · Cámara

En React + Vite + Three.js podríamos comenzar con esta estructura:

```
src/
├── engine/
│   ├── environment.ts
│   └── simulation.ts
├── scene/
│   └── LunarScene.tsx
└── App.tsx
```

`environment.ts` define las reglas. `simulation.ts` calcula el estado de la escena. `LunarScene.tsx` lo representa.

## 4. Primera prueba: las sombras lunares

En el primer experimento no necesitamos una Luna completa. Solo un terreno plano con una elevación que proyecte sombra.

Elevación del Sol

12°

Altura del obstáculo

## 10 m

Longitud de sombra

## 47.0 m

El dibujo es esquemático; el valor numérico procede de la geometría de un obstáculo vertical ideal sobre terreno horizontal.

La primera fórmula que usaríamos:

\\[ L=\frac{h}{\tan(\alpha)} \\]

Donde \\(L\\) es la longitud de sombra, \\(h\\) la altura del obstáculo y \\(\alpha\\) la elevación solar.

Esto ya nos permite comprobar una característica importante del polo lunar: cuanto más bajo está el Sol, más largas son las sombras.

## 5. ¿Cuándo consideramos terminado este experimento?

Cuando podamos abrir nuestra aplicación y comprobar que:

1. El cielo permanece negro.
2. Existe una superficie con escala definida.
3. Podemos cambiar manualmente la elevación solar.
4. Las sombras cambian coherentemente con el ángulo.
5. Podemos pausar y retroceder a un estado anterior obteniendo el mismo resultado.

Eso sería suficiente para la primera versión. Todavía no simulamos la órbita lunar, la libración ni posiciones astronómicas reales.

Después podremos sustituir el Sol simplificado por posiciones calculadas, sin tener que reconstruir la escena.

Nuestro principio de trabajo será: una regla física, una implementación pequeña y una prueba verificable. Así iremos convirtiendo cada nueva lectura sobre la Luna en una capacidad real del motor.
