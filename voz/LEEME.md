# horizon-voz: el chat de voz de Horizon, en Geografo

Oído y boca **en inglés** para `/prueba-ia`. La conversación por voz pasó de español a inglés
porque el proyecto prioriza el inglés (decisión del 2026-11-14). La respuesta de texto de la
voz sigue saliendo del `qwen3.6:27b` de la Z6; solo oír y hablar viven aquí.

| Pieza | Modelo | Dónde | Por qué |
|---|---|---|---|
| Boca | **Kokoro-82M, voz `am_michael`** (Apache 2.0), inglés americano nativo | GPU de Geografo (RTX A4000), 0,9 GB | ~0,12 s por frase: la voz suena casi a la vez que llega la respuesta |
| Boca alternativa | Qwen3-TTS 12Hz 0.6B CustomVoice, voz Ryan (Apache 2.0) | misma GPU, float32 (4,4 GB) | Más natural, pero en producción tardaba 9-11 s la primera frase y dejaba silencios de ~5 s entre frases (~2× más lento que el audio). Se cambió a Kokoro el 2026-11-14. Volver: `HVOZ_MOTOR=qwen` (ver la unidad) |
| Oído | faster-whisper `small.en`, float16 (MIT) | GPU de Geografo, ~0,5 GB | ~0,17 s por pregunta (en CPU int8 tardaba ~1,7 s; pasó a GPU el 2026-11-14). `argus-voz` (Z6) solo transcribe español |

## Por qué Geografo y no la Z6

Se instaló primero en la Z6 y la segunda frase falló con `CUDA out of memory`: la Quadro RTX 6000
tiene 23,5 GB útiles, el `qwen3.6:27b` de Ollama ocupa ~18,6 GB y Ryan 4,4 GB más sus picos al
decodificar el audio. No caben juntos. En la Z6 quedó instalado pero **desactivado**
(`/opt/horizon-voz`, `systemctl disable horizon-voz`); se puede borrar.

## Medido (2026-11-14)

- Kokoro `am_michael`: **0,12-0,13 s** por frase (2,8-5,7 s de audio). VRAM 0,9 GB.
- Ryan (alternativa): ~1,7-2,7× tiempo real, 4,4 GB. La página pide la voz **frase por frase**
  y reproduce una mientras se genera la siguiente, lo que con Ryan disimulaba parte de la espera.
- Oído: ~0,17 s en GPU float16 (int8_float16: ~0,20 s; CPU int8: ~1,7 s), con la misma transcripción
  de una pregunta de 6 s. La primera llamada en GPU tarda ~0,9 s: el servicio calienta el modelo al arrancar.
  CTranslate2 pide `libcublas.so.12` y el torch del venv trae CUDA 13: por eso `nvidia-cublas-cu12`
  en `requisitos.txt`, que `servidor.py` precarga. Si la GPU falla, el oído vuelve solo a la CPU
  (`/v1/salud` → `stt_en`).
  Ojo: `decode_audio` de faster-whisper hace `gc.collect()` en cada llamada; con torch y Kokoro en el
  proceso eso sumaba ~200 ms por pregunta. `servidor.py` hace `gc.freeze()` tras cargar los modelos.
- Kokoro necesita `misaki[en]`, el modelo `en_core_web_sm` de spaCy (en `requisitos.txt`) y
  `espeak-ng` del sistema. Sus pesos y voces están en la caché HF del servicio
  (`cache/hub/models--hexgrad--Kokoro-82M`, copiados sin enlaces) y se leen sin red.

## Turno en streaming (fase 1 y 2, 2026-11-14)

- **Fase 1:** `/v1/hablar` acepta `formato: "opus" | "mp3" | "wav"`. Opus pesa ~11 veces menos que
  WAV (23 KB contra 248 KB por frase): subirlo desde Geografo y bajarlo al navegador costaba ~1,5-2 s.
- **Fase 2:** el API de VPS2 expone `POST /api/z6/voz/turno`. Lee la respuesta de la Z6 en
  streaming, manda cada frase a esta voz apenas se completa (la primera puede cortarse en una coma
  si ya pasa de 25 caracteres; el prompt pide abrir con una frase de ≤ 8 palabras) y devuelve NDJSON: texto, audio de cada frase (base64) y los tiempos
  de cada palabra (`palabras: true` → cabecera `X-Palabras`). El navegador agenda las frases sin
  huecos con Web Audio y muestra cada palabra al pronunciarse.
- Medido en local: primer texto 0,4 s, **primera voz ~1,0-1,5 s** desde que llega la pregunta
  (antes: la respuesta entera y 2-3 s más para oír la primera frase).

## Cómo está instalado

Servicio **de usuario** de `manolito` (no hay sudo sin contraseña en Geografo), con
`loginctl enable-linger manolito` para que arranque sin sesión abierta.

| Qué | Dónde |
|---|---|
| Código | `~/.local/share/horizon-voz/src/` (copia de `voz/servidor.py`) |
| Python, venv y `uv` | `~/.local/share/horizon-voz/{python,venv,bin/uv}` |
| Modelos | `~/.local/share/horizon-voz/modelos/` (carpetas fijas: `qwen-tts` consulta la API de HF aunque el modelo esté en caché, y el servicio corre offline) |
| Token | `~/.config/horizon-voz/token` (600). Su copia está en el `.env` de VPS2 como `HVOZ_TOKEN` |
| Unidad | `~/.config/systemd/user/horizon-voz.service` (copia de `voz/horizon-voz.service`) |

Escucha solo en `100.117.204.80:8796` (tailnet). Todo pide `Authorization: Bearer`, comprobado
antes de leer el cuerpo.

```bash
systemctl --user status horizon-voz
journalctl --user -u horizon-voz -f          # espera «modelos cargados»
systemctl --user restart horizon-voz         # tras cambiar servidor.py (cópialo antes a src/)
systemctl --user disable --now horizon-voz   # apagar: libera la VRAM al instante
```

Requisitos: `requisitos.txt` (ojo: `av<16`, porque faster-whisper 1.2 usa un parámetro que
PyAV 16 quitó).

## En VPS2

`/srv/horizon-signai/.env`: `HVOZ_URL=http://100.117.204.80:8796` y `HVOZ_TOKEN=…`. Sin ellas,
el API vuelve a `argus-voz` (español, Piper, en la Z6).

## Verificar (desde VPS2)

```bash
T=$(sudo sed -n 's/^HVOZ_TOKEN=//p' /srv/horizon-signai/.env)
curl -s -H "Authorization: Bearer $T" http://100.117.204.80:8796/v1/salud
```

## Micrófono abierto: hablar mientras la IA responde (2026-11-14)

El modo voz escucha todo el tiempo con Silero VAD (`@ricky0123/vad-web`, en el navegador; modelo y
wasm desde jsDelivr en versiones fijas). Lo que dices mientras la IA piensa o habla se transcribe y
se clasifica (`apps/web/src/prueba-ia/eco.ts`): eco de la propia IA, «uh-huh», «stop» o habla real.
El habla real corta la respuesta: lo que alcanzó a decir queda en el historial terminado en
`[interrupted]` y la IA vuelve a responder con lo que agregaste (instrucción en `SISTEMA_VOZ`).

- **Eco, medido con un prototipo** (rama `prototipo/eco-microfono-abierto`): con parlantes, Chrome
  en Linux **no** cancela la voz de la IA. Con `echoCancellation: true`, ~20 % de los frames pasan
  el umbral de Silero con la IA hablando sola. Igual por WebRTC loopback, y Chrome no admite `"all"`.
  Con auriculares baja a ~3 %. Por eso la defensa es propia: mientras la IA habla, el VAD pide más
  certeza (umbral 0,7) y lo que oye se compara con lo que la IA pronunció en esos segundos
  (`dichoDesde`, con los tiempos por palabra). Si coincide en su mayoría, es eco y se ignora.
- Mientras decide, la voz de la IA baja al 30 % en lugar de cortarse.
- Whisper transcribe mal las interjecciones («Uh-huh» → «y'all», «YHWH»): mientras la IA habla,
  una sola palabra que no es pregunta cuenta como asentimiento.
- Tests de la clasificación: `npm test -w @horizon-signai/web`.

### Clasificador de lo que dices encima (etapa 2)

Cuando las reglas de `eco.ts` dicen «habla real» con la IA en su turno, `POST /api/z6/voz/clasificar`
le pregunta al `qwen3:8b` de **Geografo** (no a la Z6: pisaría la caché del 27B) si fue `add`,
`correct`, `new`, `stop` o `ignore` (comentario o charla con otra persona). 11/11 en casos de prueba.
~0,4-0,7 s con el modelo caliente: Ollama 0.31 suma ~300 ms de «carga» en cada pedido aunque el
modelo ya esté en la GPU. Frío tardó 28 s, por eso `GET /voz` (al abrir el modo voz) lo precalienta
y se pide con `keep_alive: 2h`. Si falla o tarda más de 4 s, se asume adición.

La intención viaja al 27B en la marca al final de la respuesta cortada (`marcaDeCorte`), por ejemplo
`[interrupted: the user is correcting something]`, y `SISTEMA_VOZ` dice qué hacer con cada una.

Pendiente: Whisper `small.en` oye mal algunas correcciones («I meant the north pole» → «I'm at the
North Pole»). Opciones: pasarle contexto (`initial_prompt`) o un modelo más grande ahora que va en GPU.

### El 8B como «hablante rápido» (etapa 3)

La misma llamada a `/voz/clasificar` devuelve también un **acuse** de 2 a 6 palabras («Good point,
adding Mars.», «Got it, the north pole then.») para `add`, `correct` y `new`. Si viene vacío o largo,
uno fijo (`ACUSE_FIJO`). Solo reconoce, nunca afirma contenido: así no promete algo que el 27B no haga.
`/voz/turno` recibe `acuse`: Kokoro lo dice primero mientras el 27B genera, y el 27B lo recibe como
nota al final del último mensaje («You already said out loud: … Continue right after it»).

- **Prefill no:** dejarle al 27B la respuesta empezada con el acuse sale vacío o se corta en modo
  chat con `think: false` (medido en la Z6). Funciona por `/api/generate` con `raw` y el bloque
  `<think>` vacío, pero ata el código a la plantilla del modelo; la nota da la misma calidad.
- Medido en local: el acuse suena ~2,0 s después de que te callas (VAD 0,8 s + Whisper ~0,2 s +
  8B ~0,8 s + Kokoro ~0,15 s) y el contenido del 27B llega pegado detrás, sin silencio.
- El 8B es ahora el tramo más largo: ~0,3 s son overhead de Ollama 0.31 en cada pedido.
