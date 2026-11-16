# horizon-voz: el chat de voz de Horizon, en Geografo

Oído y boca **en inglés** para `/prueba-ia`. La conversación por voz pasó de español a inglés
porque el proyecto prioriza el inglés (decisión del 2026-11-14). La respuesta de texto de la
voz sigue saliendo del `qwen3.6:27b` de la Z6; solo oír y hablar viven aquí.

| Pieza | Modelo | Dónde | Por qué |
|---|---|---|---|
| Boca | **Kokoro-82M, voz `am_michael`** (Apache 2.0), inglés americano nativo | GPU de Geografo (RTX A4000), 0,9 GB | ~0,12 s por frase: la voz suena casi a la vez que llega la respuesta |
| Boca alternativa | Qwen3-TTS 12Hz 0.6B CustomVoice, voz Ryan (Apache 2.0) | misma GPU, float32 (4,4 GB) | Más natural, pero en producción tardaba 9-11 s la primera frase y dejaba silencios de ~5 s entre frases (~2× más lento que el audio). Se cambió a Kokoro el 2026-11-14. Volver: `HVOZ_MOTOR=qwen` (ver la unidad) |
| Oído | faster-whisper **`large-v3-turbo`**, float16 (MIT), con pistas de vocabulario | GPU de Geografo, ~1,6 GB | ~0,22 s por pregunta y el más preciso del banco (ver abajo). Antes `small.en` (~0,12 s, más errores); en CPU tardaba ~1,7 s. `argus-voz` (Z6) solo transcribe español |

**Voces de las asistentes (2026-11-15):** el API pide a este servicio la voz de cada asistente
(`ASSISTANTS` en `packages/shared/src/assistant.ts`; se cambia sin desplegar con `HVOZ_VOZ_ASSISTANT` o
`HVOZ_VOZ_EDUCATIONAL` en el `.env` de VPS2). EVA usa `af_heart` **tal cual, sin filtro**: Manuel la
eligió en la prueba de personalidades («Exploradora curiosa», voz sin procesar). VERA también usa
`af_heart`, pero el navegador le pone entonación y timbre robótico (`apps/web/src/prueba-ia/personajes.ts`
y `vozRobot.ts`). El servicio de Geografo no cambió: su voz por defecto sigue siendo `am_michael`.
Las frases fijas de EVA están grabadas (`apps/web/public/eva-voz/`): si cambia su voz, hay que
regrabarlas con `node apps/web/scripts/grabar-voz-eva.ts --todo --solo=en`.

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

`small.en` oía mal algunas correcciones («I meant the north pole» → «I'm at the North Pole»): se
cambió a `large-v3-turbo` (sección siguiente).

### Qué Whisper usar (banco `voz/banco-stt`, 2026-11-14)

20 frases de esta conversación (correcciones, «wait», nombres como Malapert Massif) × 4 voces de
Kokoro, limpias y con ruido (SNR 12 dB). Error por palabra (WER) y mediana de latencia en la A4000:

| Modelo | Limpio | Ruido | Latencia |
|---|---|---|---|
| `small.en` | 1,7 % | 2,8 % | 120 ms |
| `small.en` + pistas | 1,3 % | 1,8 % | ~115 ms |
| `distil-large-v3` | 0,7 % | 1,8 % | 214 ms |
| `medium.en` + pistas | 0,3 % | 1,4 % | 216 ms |
| **`large-v3-turbo`** | **0,1 %** | **1,0 %** | 212 ms |
| `large-v3-turbo` + pistas | 0,0 % | 1,1 % | 223 ms |

- Se usa `large-v3-turbo` con pistas (`HVOZ_PISTAS_STT`): las pistas son neutras en el total pero
  arreglan nombres (Malapert) y no hicieron alucinar a Whisper con ruido ni silencio (con el VAD del
  servicio, dan vacío).
- Pasarle la conversación como `initial_prompt` **empeoró** `small.en` (1,7 % → 2,3 %): lo empuja a
  repetir palabras («I'm at the north pole» siguió igual y apareció «I met»). No se usa.
- El «uh-huh» de Kokoro sale como «It's home» (dos palabras): no lo atrapan las reglas, pero el 8B lo
  clasifica `ignore`. Las voces son sintéticas: falta medir con voz humana real.

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

### En pantalla (etapa 4)

Lo que dices encima aparece como un chip bajo la respuesta: «entendiendo…» mientras el 8B decide,
«sigo» (se desvanece) si era un comentario, «me callo» si pediste parar, y «agregando a la
respuesta» / «corrigiendo la respuesta» / «pregunta nueva» mientras el 27B regenera, con lo que la
IA alcanzó a decir atenuado encima. Los «uh-huh» detectados por reglas no muestran chip (Whisper
los transcribe como «y'all» o «YHWH»). El halo del orbe toma luz de Tierra mientras te oye encima.

## Red: VPS2 está en Alemania y la voz en Perú (2026-11-14)

La Z6 y Geografo están en la misma red de la oficina (1 ms entre ellas), pero el API corre en VPS2
(Contabo, cerca de Frankfurt) y el dominio pasa por Cloudflare (que atiende desde Río, `GIG`).
Medido desde Geografo:

| Tramo | Ida y vuelta |
|---|---|
| Navegador ⇄ VPS2 (vía Cloudflare) | ~0,30 s, aun con la conexión abierta |
| VPS2 ⇄ Geografo o Z6 (Tailscale, conexión directa) | ~0,18 s (igual que por internet: es la distancia) |
| Geografo ⇄ Z6 | 0,001 s |

Qué se hizo:
- **Conexiones abiertas**: el API usa un agente de undici con keep-alive de 60 s (`apps/api/src/index.ts`)
  y uvicorn acepta 120 s (`servidor.py`). Antes, tras 4-5 s sin uso, cada pedido pagaba otra ida y
  vuelta para abrir la conexión. Transcribir tras una pausa: ~1,0 s → ~0,84 s.
- **Un viaje por turno**: `POST /api/z6/voz/escuchar` recibe el audio (multipart) y transcribe,
  decide (`clasificarOido`, en `packages/shared`) y, según el caso, responde en el mismo stream o
  clasifica con el 8B. Turno normal: 2 viajes del navegador → 1. Interrupción: 3 → 2 (el turno va
  aparte para cortar con lo que la IA de verdad alcanzó a decir).

Lo que queda: cada paso del turno sigue cruzando el Atlántico desde VPS2 (primer token de la Z6,
voz de cada frase en Geografo). Llevar la coordinación del turno a Perú (o un túnel de Cloudflare
directo a Geografo) ahorraría ~0,3-0,5 s más, pero cambia la infraestructura.

## IA en la nube: Claude y ElevenLabs (opcional, 2026-11-15)

Con claves en el `.env`, el API cambia el cerebro y la boca de EVA y VERA por servicios en la nube. Sin claves,
todo sigue como arriba. El oído (Whisper en Geografo) y los embeddings del RAG (bge-m3) no cambian.

| Ruta | Sin claves | Con `ANTHROPIC_API_KEY` / `ELEVENLABS_API_KEY` |
|---|---|---|
| Turno de voz, clasificador de lo que dices encima, eco | 27B en la Z6, 8B en Geografo | **Claude Haiku 5.5**, sin pensamiento extendido, esfuerzo bajo (lo más rápido) |
| Chat de texto (`/chat/stream`) | 8B en Geografo | **Claude Sonnet 5.5**, pensamiento adaptativo, esfuerzo bajo, respaldo del servidor si declina |
| Voz de cada frase (`/voz/turno`, `/decir`, `/hablar`) | Kokoro (inglés) y Piper (español) | **ElevenLabs** `eleven_flash_v2_5`, mp3, la misma voz en los dos idiomas |

- **Código:** `apps/api/src/assistant/claude.ts` (SDK oficial `@anthropic-ai/sdk`) y `assistant/elevenlabs.ts`; `z6.ts`
  elige en cada pedido. La parte fija del prompt (personaje, hechos, reglas) va con caché de Claude; los recuerdos y
  la pantalla no (`partesVoz` / `partesTexto` en `asistentes.ts`, que unidas dan el mismo texto que recibe Ollama).
- **Tiempos por palabra con ElevenLabs:** su endpoint `with-timestamps` da el tiempo de cada carácter y el API los
  junta en el mismo `[[texto, espacio, inicio, fin], …]` de horizon-voz. Las palabras que lee mal («Signai», «NO GO»,
  «EVA», «DE441») se le mandan escritas como se dicen y el subtítulo muestra el original (`partesParaDecir`, con prueba).
- **Si algo falla, vuelve solo a lo local:** ElevenLabs con error → Kokoro/Piper y no lo reintenta por 2 min.
  Topes diarios (en memoria, UTC): `CLAUDE_MAX_PEDIDOS_DIA` (3000) y `ELEVENLABS_MAX_CARACTERES_DIA` (60000); pasado el
  tope, Ollama y voz local hasta el día siguiente. El sitio es público: el tope es lo que acota el gasto.
- **Costo aproximado** (precios de lista de Anthropic, nov. 2026): un turno de voz con Haiku ~0,05 centavos de dólar;
  un mensaje de texto con Sonnet ~0,6 centavos. ElevenLabs cobra por carácter según el plan.
- **Qué motor atiende:** `GET /api/z6/motores` (sin claves; modelos y contadores del día).

### Encender, apagar, verificar

```bash
scripts/configurar-ia-nube.sh             # pide las claves (no se ven), las prueba, elige voces, sube a VPS2 y reinicia sin cortes
scripts/configurar-ia-nube.sh --estado    # qué cerebro y qué voz atienden ahora
scripts/configurar-ia-nube.sh --apagar    # IA_MOTOR=ollama y VOZ_MOTOR=local: vuelve a lo local sin borrar las claves
scripts/configurar-ia-nube.sh --encender
scripts/configurar-ia-nube.sh --local     # mismas claves en apps/api/.env para `npm run dev` (ignorado por git y Docker)
```

El script entra por `ssh vps2` (otro host: `HORIZON_SSH=usuario@host`) y usa `sudo` para el `.env`. Las claves viajan
por stdin; el respaldo del `.env` anterior queda en `/var/backups/horizon-signai/`, **fuera** de `/srv/horizon-signai`
(ahí entraría en la imagen: `.dockerignore` solo excluía `.env`). Variables para no preguntar o cambiar modelos y
topes: ver la cabecera del script.

**Tras encender ElevenLabs:** las frases fijas de EVA (`apps/web/public/eva-voz/`) siguen grabadas con Kokoro y Piper,
así que sonarían distinto de sus respuestas en vivo. Regrabarlas (unos 31 000 caracteres, los dos idiomas):
`node apps/web/scripts/grabar-voz-eva.ts --todo` y subir los archivos. Si ElevenLabs falla a mitad, esa frase queda con
la voz local: revisar `--comprobar` o volver a grabarla.
