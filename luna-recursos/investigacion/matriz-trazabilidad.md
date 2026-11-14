# Matriz de trazabilidad: libros → reglas → código → prueba

Auditoría del 2026-11-06. Cinco revisiones independientes, una por libro (LSB, RTR, FA, PBR, DI), contrastadas con el código al cierre de E6 (sin commit todavía). Cada revisión verificó las páginas citadas en el texto o en el PDF. Las cifras marcadas "cálculo" salieron de scripts de comprobación (Monte Carlo o fórmulas), no de los libros. Los ítems se confirman otra vez al implementarlos.

Estados: ✅ implementado y con fuente · 🟡 parcial · ⬜ falta · ❌ contradice al libro · 🔧 cita por corregir.

## 1. Estado por regla

| Regla | Fuentes | Estado | Qué falta o está mal | Prueba que lo demostraría |
|---|---|---|---|---|
| ENV-001 sin atmósfera | LSB p. 40 (2×10⁵ / 10⁴ moléculas/cm³, 14 órdenes de magnitud menos que la Tierra), p. 41, tabla 3.1 p. 28; LSB p. 603; RTR pp. 375–376 | ✅ 🔧 | La regla no cita el LSB (solo RTR). El LSB dice que "sin atmósfera" a secas es inexacto, y por eso decimos "prácticamente" | Sombra en suelo plano = 0 en lectura lineal |
| ENV-002 Sol | LSB p. 603; FA p. 543 (haz paralelo); PBR p. 489 | ✅ 🟡 | Falta la irradiancia en W/m²: 1361/r² (FA p. 542, PBR p. 187), entre 1369 y 1395 W/m² en este día lunar | `bun test`: E☉ con la `distanciaAu` de Horizons |
| ENV-003 sombras | RTR cap. 7; experimento 01 | ✅ | — | L(12°) = 47,05 m en suelo plano |
| ENV-004 escala | — | ✅ 🔧 | R = 1 737 400 m sin cita (el LSB da 1738 km, tabla 3.1, p. 28; FA da 1737,1 km, tabla B.1) | — |
| ENV-005 tiempo | LSB p. 58; FA pp. 252–257, 461 | 🟡 ❌ | **Repetir el día lunar no es físico**: al cerrar el ciclo, la Tierra salta 3,65° y la fase pasa de 76,8 % a 74,7 % (FA pp. 257, 413). El mediodía va por la fila de mayor elevación (07:00) y no por el tránsito por el meridiano (07:21 UTC, FA pp. 252–254). Falta fijar `TIME_TYPE='UT'` en la consulta | Salto en el borde < 0,01°; tránsito con az = 180° |
| ENV-006 lo no físico se declara | — | 🟡 | El tone mapping ACES no está declarado (RTR pp. 285–287); `ESCALA_VISUAL = 10` no tiene ancla (RTR p. 289); el tinte `#cfe0ff` de la luz terrestre no tiene fuente | Lista "No físico" completa; modo de medición lineal |
| ENV-007 disco solar y penumbra | FA pp. 543, 671, 673; RTR pp. 250–252, 375; PBR pp. 490, 545 | ✅ 🟡 | PCSS supone un bloqueador promedio (RTR **p. 252**), que falla con poste y terreno a la vez. La tapa redonda del poste deja ver ~2 % más de disco que el borde recto (cálculo MC). La penumbra se resuelve con un píxel de 14 cm | Imagen de referencia: N sombras puntuales sobre el disco (RTR p. 228) y prueba MC T5 |
| ENV-008 relieve | DTM de LROC; Fielder SM cap. 4; LSB pp. 33–34 | ✅ 🟡 | **Falta el horizonte lejano**: los macizos de 2000–2300 m con 25° de pendiente, en un valle de ~8 km (LSB pp. 33, 37). La salida del Sol es la astronómica, no la del sitio | Horizonte por azimut (RTR p. 466); salida local más tarde que la de Horizons |
| ENV-009 luz reflejada | LSB pp. 59, 30, 559–560; RTR pp. 392, 431, 446; PBR pp. 193, 575, 597 | ❌ | (1) **Albedo equivocado**: 0,15 es de tierras altas; el Apollo 17 está en un mar con manto oscuro (LSB p. 631), con 7–10 % (p. 59) y ≈0,08–0,09 para el suelo 75081 (fig. 7.10, p. 308, lectura aproximada). (2) **Tipo de albedo**: el de la p. 59 es normal (medido con Luna llena) y lo usamos como lambertiano. (3) **El material no es lambertiano**: `meshStandardMaterial` agrega un brillo especular GGX con F0 = 0,04; el ρ_dh real queda en 0,156–0,197 y la superficie brilla 2–3 veces hacia adelante (cálculo MC), lo contrario de la Luna, que retrorrefleja (LSB p. 559; RTR pp. 330, 350; PBR p. 331). (4) **En el relieve el rebote está mal**: el fondo de un cráter en sombra recibe 0 y debería recibir ~0,004 Sol (cálculo MC); la cara del poste en sombra recibe hasta 2 veces de más cerca de la base | Pruebas MC T2, T3, T4 y T7 (sección 4) |
| ENV-010 luz terrestre | LSB pp. 29–30, 58; FA pp. 410, 542; PBR pp. 193, 554 | ❌ | El 1e-4 no tiene fuente. Con la Tierra como esfera lambertiana de albedo 0,32 (FA p. 542) da **5,86e-5**; la cota superior con 435 W/m² da 8,8e-5. La fase lineal en k no es la de una esfera lambertiana, Φ(g) = [sin g + (π − g)cos g]/π. La luz terrestre tiene el mismo espectro que la solar (FA p. 542), así que el tinte azul sobra. Falta escalar con la distancia Tierra–Luna (±12 %) | Prueba T8 (fase); E⊕/E☉ contra la fórmula |

## 2. Contradicciones confirmadas por más de un libro

| # | Contradicción | Libros que coinciden | Gravedad |
|---|---|---|---|
| C1 | El regolito brilla hacia adelante (especular de three) en vez de retrorreflejar | LSB p. 559, RTR pp. 314, 330, 349–350, PBR pp. 331, 351 | Alta |
| C2 | Albedo de tierras altas en un sitio de mar, y albedo normal usado como lambertiano | LSB pp. 59, 308, 559–560, 631; PBR pp. 335–336 | Alta |
| C3 | El rebote no ve el relieve (cráteres negros, poste sobreestimado) | LSB p. 30, RTR pp. 392, 446, 466, PBR pp. 575–580, 597 | Media-alta |
| C4 | Luz terrestre supuesta, fase lineal y tinte sin fuente | FA p. 542, PBR pp. 193, 554, RTR p. 381 | Media |
| C5 | Repetir el día lunar contradice la libración | FA pp. 257, 413 | Media |
| C6 | Horizonte plano en un valle entre macizos de 2 km | LSB pp. 33–34, 37; RTR p. 466 | Media |
| C7 | Sol en el horizonte: F·sin α en vez del centroide del segmento visible (−38 % con α = 0,1°) | PBR p. 545 (cálculo) | Baja |

## 3. Citas por corregir

| Dónde | Dice | Debe decir | Fuente de la corrección |
|---|---|---|---|
| SPEC (1°32') | LSB p. 39 | **LSB p. 40** | auditoría LSB |
| SPEC, ENV-001 | sin cita del LSB | LSB pp. 40–41, tabla 3.1 p. 28 | auditoría LSB |
| SPEC y código (fig. 9.18) | RTR cap. 9.4, p. 314 | **RTR §9.3, p. 314** | auditoría RTR |
| SPEC (la Luna como superficie rugosa) | RTR p. 351 | **RTR p. 350** | auditoría RTR |
| SPEC y `penumbra.ts` (supuesto del bloqueador promedio) | RTR p. 251 | **RTR p. 252** | auditoría RTR |
| SPEC (luminancias) | PBR p. 305 | **PBR p. 306** | auditoría PBR |
| SPEC (la Tierra mide 1,90°) | "FA p. 410" | **Derivado** de FA p. 410; Horizons usa el radio ecuatorial, 6378,137 km (FA p. 672) | auditoría FA |
| SPEC (día lunar de 29,572 d) | "variación del mes sinódico" | Rotación uniforme más el Sol aparente más rápido cerca del perihelio y el cambio de la latitud subsolar (FA pp. 413, 461, 673) | auditoría FA |
| SPEC (mediodía) | 07:00 UTC | **07:21 UTC** (tránsito) | auditoría FA |
| SPEC, patrones DI | Center Stage p. 231; Collapsible p. 249; Dynamic Queries p. ~454; Datatips pp. 446–448; Multilevel Undo p. ~418 | **pp. 231–232; pp. 249–250; pp. 455–458; p. 446 + pp. 447–451**; lo que hacemos con el tiempo es **Safe Exploration, cap. 1, pp. 12–13** | auditoría DI |
| `simulation.ts:13` | "NASA NSSDCA" | LROC | auditoría FA y LSB |
| Erratas del borrador de PBR | ρ_dh con 1/π (pp. 335, 538); `Radians(sigma)` (p. 354) | No copiarlas: usar ρ_dh = ∫f·cos dω | auditoría PBR |

## 4. Pruebas automáticas propuestas (`bun test`, ya viene con Bun)

| Prueba | Qué demuestra | Valor esperado | Fuente |
|---|---|---|---|
| T0 efemérides | La tabla cumple la teoría | Latitud subsolar ≤ 1,59°; libración en latitud ≤ 6,7° y en longitud ≤ ~8°; distancia Tierra–Luna entre 363 100 y 405 700 km; día de 29,57 ± 0,02 d; elevación del Sol en el tránsito 68,442° | FA pp. 411–413, 461, 671; LSB pp. 40, 58 |
| T1 horno (furnace) | El integrador Monte Carlo está bien | L/Le = 1/(1 − ρ) = 1,176471 con ρ = 0,15 | PBR p. 575 |
| T2 plano infinito | El hemisferio es exacto en su supuesto | Cara vertical a 12°: 0,015593 Sol | PBR pp. 191–193 |
| T3 poste | Error del hemisferio junto a la sombra | Real/hemisferio: 0,50 / 0,84 / 0,95 / 0,97 / 0,985 a 0,25 / 1 / 3 / 6 / 9,5 m | PBR pp. 577–580 (cálculo) |
| T4 cráter esférico | Rebote dentro de un cráter (forma cerrada) | E = 0,003787 Sol con d/D = 0,2 (supuesto) y α = 12° | PBR pp. 194, 577 |
| T5 penumbra | PCSS contra la referencia | 0 en 45,9 m y 1 en 48,2 m; tapa redonda +2 % | PBR p. 545 |
| T6 Sol en el horizonte | Centroide del segmento visible | 9,88e-4 con α = 0 | PBR p. 545 |
| T7 energía de la BRDF | ρ_dh ≤ 1 y reciprocidad | Lambert = 0,15 exacto | PBR pp. 197, 538; RTR pp. 312–313 |
| T8 fase de la Tierra | Esfera lambertiana | Φ(g) = [sin g + (π − g)cos g]/π | PBR (cálculo) |
| T9 sombra sobre el relieve | ENV-008 | 44,15 m a las 12° de la mañana; h deducida 9,39 m | DTM |

## 5. Lo que no tiene fuente en ningún libro (sigue como supuesto)

- Oscurecimiento del limbo solar (ninguno de los cinco).
- Parámetros de Hapke para el Apollo 17: el LSB da la forma y h ≈ 0,4, B₀ ≈ e^(−w²/2) (p. 559), pero no w ni P(g). Fuente posible: LROC WAC (Sato et al. 2014).
- Ley de fase real y espectro de la Tierra.
- Emisividad del regolito (solo haría falta si se modela la temperatura).

## 6. Fuera del alcance actual, con fuente lista

- **Temperatura de la superficie:** 374 K / 92 K en el Apollo 15, ~10 K más en el Apollo 17 (LSB p. 34); tabla 3.2 (p. 36); ~90 K antes del amanecer (p. 566).
- **Huellas y rover:** 0,7 cm y 1,6 cm (pp. 498–499); LRV de 708 kg a 6–7 km/h, pendiente máxima de 19–23° (pp. 522–524); g = 1,62 m/s² (p. 28).
- **Interfaz de verificación:** patrones de DI sin implementar: Multi-Y Graph pp. 462–464, Small Multiples pp. 465–467, Alternative Views pp. 97–98, Annotated Scroll Bar pp. 199–201, Command History pp. 422–423.

## 7. Estado tras E7–E15 (2026-11-06)

| # | Contradicción | Estado | Paso y prueba |
|---|---|---|---|
| C1 | Brillo especular hacia adelante | ✅ resuelta | E8 (Lambert) y E12 (Hapke, LSB p. 559); pruebas T7 y E12 (reciprocidad, energía, oposición) |
| C2 | Albedo de tierras altas y tipo de albedo | ✅ resuelta | E8 (0,085 de mar) y E12 (albedo normal calibrado, LSB p. 560); E15.1 agrega las variaciones reales |
| C3 | El rebote no veía el relieve | ✅ resuelta (un rebote) | E11; prueba T4 del cráter esférico (−9,5 % con parches de 8 m, converge) |
| C4 | Luz terrestre supuesta | ✅ derivada | E9 (FA p. 542; Tierra lambertiana, supuesto); pruebas T8 y 5,86·10⁻⁵ |
| C5 | Repetición del día lunar | ✅ resuelta | E7 (el reloj se detiene al final) |
| C6 | Horizonte plano | ✅ resuelta | E10 (SLDEM2015); pruebas de la salida local |
| C7 | Sol en el horizonte | ✅ resuelta | E9 (centroide del segmento visible); prueba T6 |

Citas corregidas en E7. Pruebas automáticas: 47 (`bun test`). Supuestos que quedan (sección 5): oscurecimiento del limbo, P(g) de Hapke, ley de fase real de la Tierra, densidades del detalle sintético, orientación de los equipos.
