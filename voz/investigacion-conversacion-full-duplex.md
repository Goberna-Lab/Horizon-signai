# Conversación por voz con entrada superpuesta ("full-duplex") para `/prueba-ia`

Investigación del 2026-11-14 contra fuentes primarias: papers de arXiv, repos oficiales, docs de las APIs y model cards.
Convenciones del documento:

- **[Fuente]**: lo dice la fuente enlazada.
- **[Inferencia]**: razonamiento mío; no lo afirma ninguna fuente.
- **[Medido aquí]**: lo medí el 2026-11-14/15 contra el Ollama de la Z6 (`0.34.4`, `qwen3.6:27b`), con peticiones de 1 token o solo de render.

---

## Resumen ejecutivo

1. Ningún modelo speech-to-speech abierto **integra** de forma documentada una pregunta añadida a mitad de respuesta. Lo habitual es cortar y responder de nuevo (Moshi, Freeze-Omni, NemotronLabs VoiceChat, DuplexCascade, MiniCPM-Duplex). Además, todos razonan peor que un 27B de texto, y los que caben en 16-24 GB no conviven con el `qwen3.6:27b` de la Z6.
2. Las APIs comerciales tampoco "integran". OpenAI Realtime y Gemini Live **cancelan** la respuesta, guardan solo lo que el usuario alcanzó a oír y generan otra con el contexto ampliado. La "integración" que se percibe sale de que el modelo ve en el historial lo dicho más la entrada nueva.
3. Por eso **la recomendación es quedarse con la cascada y añadir un "gestor de turnos"** que cancela y regenera. Al historial van lo hablado más la adición del usuario como mensaje nuevo, con instrucciones de reconocerla brevemente y seguir sin repetir. Es el patrón de OpenAI, LiveKit, Pipecat y del paper *Never Stop Thinking*.
4. **[Medido aquí]** Regenerar es barato **si se añade al final**. Con `asistente parcial + usuario nuevo`, el Z6 reutiliza 665 de 688 tokens de caché y prefilla en 0,32 s. Si se ponen dos mensajes de usuario seguidos o se edita el anterior, reutiliza solo 157 tokens y tarda ~1,0 s. La causa es que el `qwen3.6:27b` es híbrido (SSM + atención) y llama.cpp solo retrocede a *checkpoints*.
5. **[Medido aquí]** Ollama 0.34.4 **sí continúa** un mensaje final de `assistant` (prefill). El template queda abierto, sin `<|im_end|>`.
6. Hay tres opciones, en orden de esfuerzo: **A** micrófono siempre abierto con Silero VAD, clasificación de la entrada superpuesta y cancelar-regenerar (días). **B** STT en streaming en Geografo, Smart Turn y generación preventiva (1-2 semanas). **C** "hablante" rápido (`qwen3:8b` o frases fijas) más "pensador" 27B (semanas). La opción D (un modelo full-duplex de punta a punta) no se recomienda salvo como experimento.
7. El cuello de botella hoy es el **STT por lotes en CPU (1,7-2 s)**. Sin escuchar mientras la IA habla, y sin cancelar el eco del propio TTS, no hay entrada superpuesta posible. El AEC del navegador sobre audio de Web Audio **hay que probarlo**: la especificación solo garantiza cancelar audio de WebRTC.

---

## Glosario

| Término | Significado |
|---|---|
| Half/full-duplex | Por turnos (uno habla y el otro espera) o simultáneo (escuchar mientras se habla). |
| Barge-in | El usuario interrumpe mientras habla la IA. |
| Backchannel | Señal de escucha ("uh-huh", "right") que **no** pide el turno. |
| VAD | Detector de actividad de voz. Puede ir por volumen (RMS, como hoy) o por modelo (Silero). |
| EOT / endpointing | Decidir que el usuario terminó su turno. Es "semántico" si usa contenido o prosodia y no solo silencio. |
| AEC | Cancelación de eco acústico: quitar del micrófono el audio que reproduce el propio equipo. |
| Prefill (del asistente) | Mandar el inicio de la respuesta del asistente para que el modelo lo **continúe**. |
| Prompt cache / KV cache | Reutilizar el cómputo del prefijo común entre peticiones. |
| TTFT | Tiempo hasta el primer token. |
| Generación preventiva | Empezar a generar con la transcripción parcial, antes de confirmar el fin de turno. |

---

## Lo que existe hoy (leído en el repo)

- `apps/web/src/prueba-ia/useVoz.ts` implementa un bucle `escuchando → pensando → hablando`. `grabar()` abre `getUserMedia({echoCancellation, noiseSuppression})` **solo mientras escucha** y cierra el turno con RMS > 0,02 seguido de 1300 ms de silencio. Durante "pensando" y "hablando" el micrófono está **cerrado**: se detienen las pistas en `liberar()`. El barge-in es manual (`tocar()` en "hablando"): aborta el `fetch` y `cola.detener()`, y al historial va `cola.hablado()`.
- `apps/web/src/prueba-ia/colaDeVoz.ts` agenda frases en un `AudioContext` y lleva una línea de tiempo por palabra. `detener()` devuelve **exactamente lo pronunciado**, que es justo lo que hace falta para truncar como OpenAI, LiveKit o Pipecat.
- `apps/api/src/z6.ts` (`turnoDeVoz`) hace un solo `POST /api/chat` a la Z6 con `stream:true, think:false`, corta frases (`cortarFrases`), pide TTS frase a frase en serie y devuelve NDJSON. Ya propaga la cancelación: `señal` → `corte.abort()` → aborta el `fetch` a Ollama y a la voz.
- `voz/servidor.py` ofrece `/v1/transcribir` por lotes (faster-whisper `small.en` int8 en CPU) y `/v1/hablar` (Kokoro), con **un pedido a la vez por tipo** (`asyncio.Lock`).

**[Inferencia]** La base sirve tal cual para un esquema de cancelar y regenerar. Lo que falta: (1) micrófono abierto también en "pensando" y "hablando", (2) un VAD que no se dispare con el eco del TTS, (3) decidir qué es la entrada nueva y (4) cómo armar el historial del reintento.

---

## 1. Modelos speech-to-speech full-duplex

### Moshi (Kyutai)
- **[Fuente]** Es full-duplex: modela dos flujos de audio, el suyo y el del usuario, más un "Inner Monologue" de texto alineado. Latencia teórica de 160 ms y ~200 ms en la práctica en una L4. Código MIT/Apache y pesos CC-BY 4.0. En PyTorch pide **24 GB**; hay int8 en Rust/Candle e int4/int8 en MLX. Fuentes: [arXiv 2410.00037](https://arxiv.org/abs/2410.00037) y [github.com/kyutai-labs/moshi](https://github.com/kyutai-labs/moshi).
- **[Fuente]** Solo inglés, 8B en BF16. "has limited abilities for complex tasks", sin herramientas, "for research only". Fuente: [HF kyutai/moshiko-pytorch-bf16](https://huggingface.co/kyutai/moshiko-pytorch-bf16).
- **[Fuente]** Sakana mide Moshi en **MT-Bench 2,05/10**, frente a 7,70 de Unmute con GPT-4.1. Fuente: [KAME, arXiv 2510.02327](https://arxiv.org/html/2510.02327).
- Entrada superpuesta: la *escucha*, porque es full-duplex por construcción. Ninguna fuente documenta que "integre" una adición; el repo no describe cómo maneja el barge-in.

### NVIDIA PersonaPlex-7B (2026, derivado de Moshi)
- **[Fuente]** Usa los pesos de Moshiko con flujo dual. Licencia NVIDIA Open Model License (+CC-BY-4.0); solo inglés. Hardware listado: A100/H100, probado en A100 80 GB. FullDuplexBench: latencia de interrupción 0,240 (la card no da unidad) y TOR de interrupción 0,950. Fuente: [HF nvidia/personaplex-7b-v1](https://huggingface.co/nvidia/personaplex-7b-v1).

### NemotronLabs VoiceChat (NVIDIA, sep. 2026)
- **[Fuente]** Backbone Nemotron-Nano-9B-v2, encoder de streaming de 600M y TTS de 977M. Checkpoint `nvidia/NVIDIA-NemotronLabs-VoiceChat-11B`, inferencia de referencia en una H100 de 80 GB. En FDB 1.0 mide 448 ms de turn-taking y 480 ms de interrupción. Ante una interrupción **se calla** con un token de interrupción. Ante un backchannel **sigue** (93 % en FDB 1.5). Las herramientas van por un canal paralelo y dice una frase fija mientras se ejecutan. El audio que llega durante la herramienta **no condiciona** la respuesta, y no hay barge-in mientras corre. Los autores admiten que razona peor que su backbone (VoiceBench 55,1). Fuente: [arXiv 2609.21967](https://arxiv.org/html/2609.21967v1).

### Sesame CSM
- **[Fuente]** **No es conversacional**: es un generador de habla de 1B (backbone Llama + decoder de códigos Mimi). "It cannot generate text"; recomiendan acoplarlo a un LLM aparte. Apache-2.0, pensado para inglés, sin cifra de VRAM. Fuente: [github.com/SesameAILabs/csm](https://github.com/SesameAILabs/csm).

### Qwen2.5-Omni y Qwen3-Omni
- **[Fuente]** Qwen2.5-Omni usa arquitectura Thinker-Talker, Apache-2.0, voces Chelsie y Ethan. VRAM mínima teórica en BF16: **7B = 31,11 GB** y **3B = 18,38 GB** (vídeo de 15 s); "at least 1.2 times higher" en la práctica. No menciona full-duplex. Fuentes: [HF Qwen2.5-Omni-7B](https://huggingface.co/Qwen/Qwen2.5-Omni-7B) y [arXiv 2503.20215](https://arxiv.org/abs/2503.20215).
- **[Fuente]** Qwen3-Omni-30B-A3B es Apache-2.0, entiende voz en 19 idiomas y la genera en 10 (incluido inglés). VRAM mínima del Instruct en BF16: **78,85 GB**. Primer paquete teórico de **234 ms** "cold-start". vLLM solo sirve el *thinker* (texto). No menciona full-duplex ni interrupciones. Fuentes: [github.com/QwenLM/Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni), [HF Instruct](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct) y [arXiv 2509.17765](https://arxiv.org/abs/2509.17765).
- **[Fuente]** La card de MiniCPM-o 4.5 reporta Qwen3-Omni en int4 con **20,3 GB** (OOM en bf16).

### MiniCPM-o 4.5 (OpenBMB, 2026)
- **[Fuente]** Tiene 9B (SigLip2 + Whisper-medium + CosyVoice2 + **Qwen3-8B**) y es full-duplex por **multiplexación por división de tiempo**. Decide "si hablar" a 1 Hz; inglés y chino; Apache-2.0. VRAM: 19,0 GB en bf16 y **11,0 GB en int4**. La demo full-duplex en PyTorch pide ≥28 GB, pero llama.cpp-omni en full-duplex pide "NVIDIA GPU ≥12GB". TTFT de 0,6 s (sin indicar hardware). En texto queda cerca de Qwen3-8B (MMLU 77,0 frente a 81,7). **No describe** qué hace cuando el usuario habla encima. Fuentes: [HF openbmb/MiniCPM-o-4_5](https://huggingface.co/openbmb/MiniCPM-o-4_5) y [github.com/OpenBMB/MiniCPM-o](https://github.com/OpenBMB/MiniCPM-o).

### Freeze-Omni
- **[Fuente]** Congela el LLM (Qwen2-7B-Instruct) y le añade una cabeza que predice el estado por chunk: 0 = sigue escuchando, 1 = "the user will interrupt the dialogue and the LLM will perform a new generate stage", 2 = fin sin interrupción. Latencia media de interrupción a primer PCM de **745 ms** (P90 1020 ms), ~1,2 s reales con red. **No dice** cómo combina lo ya dicho con la entrada nueva. Fuentes: [arXiv 2411.00774](https://arxiv.org/html/2411.00774) y [github.com/VITA-MLLM/Freeze-Omni](https://github.com/VITA-MLLM/Freeze-Omni). No pude verificar la licencia: el repo enlaza `License.txt` sin nombrarla.

### VITA / VITA-1.5
- **[Fuente]** VITA parte de Mixtral 8x7B. VITA-1.5 se apoya en Qwen2.5, inglés y chino, y baja la latencia de voz de ~4 s a **~1,5 s**. El repo no describe el comportamiento ante interrupciones y no muestra la licencia. Fuentes: [arXiv 2408.05211](https://arxiv.org/abs/2408.05211), [arXiv 2501.01957](https://arxiv.org/abs/2501.01957) y [github.com/VITA-MLLM/VITA](https://github.com/VITA-MLLM/VITA).

### LSLM (Listen-while-Speaking)
- **[Fuente]** Es un TTS decoder-only de ~106M más un encoder de escucha en streaming (~34M), con un token IRQ para **dejar de hablar**. No tiene componente de diálogo: es un demostrador de turn-taking. No dice si publica código o pesos. Fuente: [arXiv 2408.02622](https://arxiv.org/html/2408.02622).

### SyncLLM
- **[Fuente]** Parte de Llama3-8B con tokens HuBERT y alterna chunks de 160-240 ms del agente y del usuario, prediciendo el chunk del usuario para anticiparse. Datos en inglés (Fisher, CANDOR). M-MOS 3,74 frente a 1,55 de dGSLM. No dice si publica pesos. Fuente: [arXiv 2409.15594](https://arxiv.org/html/2409.15594).

### dGSLM
- **[Fuente]** Transformer de dos torres con atención cruzada, entrenado con ~2000 h de audio de dos canales de Fisher **sin texto**. Turn-taking más natural que una cascada, pero no evalúa la coherencia semántica. Fuente: [arXiv 2203.16502](https://arxiv.org/abs/2203.16502).

### OmniFlatten
- **[Fuente]** Qwen2-0.5B con chunks de texto y voz entrelazados. En los datos simulados, el usuario interrumpe y el asistente "stop abruptly". **No maneja backchannels**. Calidad en inglés 3,92 (voz) frente a 8,37 de Qwen2-7B-Instruct en texto. No dice si publica pesos. Fuente: [arXiv 2410.17799](https://arxiv.org/html/2410.17799).

### MiniCPM-Duplex ("Beyond the Turn-Based Game")
- **[Fuente]** Es el más cercano a lo que se busca en cuanto a *datos*. Entrena **cuatro tipos de interrupción**: terminación, regeneración (corrección), reset (cambio de tema) y **"back on topic"** (responde la pregunta lateral y **retoma lo que estaba diciendo**). Mecánicamente, ante una consulta nueva "immediately halts its current generation" y empieza otra secuencia que la incluye. Los autores lo llaman "pseudo-duplex". Usa MiniCPM-2.4B con código y dataset publicados. Fuente: [arXiv 2406.15718](https://arxiv.org/html/2406.15718).

### Tándem S2S + LLM: KAME (Sakana AI)
- **[Fuente]** Un front-end Moshi habla de inmediato, mientras un LLM de texto en back-end recibe **transcripciones parciales** cada 100-500 ms y le inyecta respuestas candidatas como tokens "oracle" en un cuarto flujo. El front-end **corrige** lo ya dicho si un oracle posterior lo contradice. MT-Bench: KAME+GPT-4.1 6,43, Unmute+GPT-4.1 7,70, Moshi 2,05; latencia mediana 0,0 s frente a 2,1 s de Unmute. No menciona publicar código ni pesos. Fuente: [arXiv 2510.02327](https://arxiv.org/html/2510.02327).

### Front-end/back-end para herramientas (NVIDIA, 2026)
- **[Fuente]** Un front-end duplex (Nemotron-Nano-9B) emite `<tc_bos>`, dice un relleno ("Let me pull that up") y luego calla mientras un back-end ReAct de texto (Qwen3-30B-A3B o 235B, sin thinking) resuelve. La respuesta del back-end se **prefilla** en el canal de texto del front-end. Relleno en 0,72-0,80 s y turno completo en 2,8-3,1 s. **No describe** qué pasa si el usuario habla mientras el back-end trabaja. Fuente: [arXiv 2609.19334](https://arxiv.org/html/2609.19334v2).

### Cascadas "full-duplex"
- **[Fuente]** **DuplexCascade** es ASR en streaming → Qwen2-7B con LoRA → TTS en streaming, sin VAD. Usa "micro-turnos" de 0,6 s y tokens de control `<user is interrupting>` (se detiene), `<user backchannel>` (lo ignora y sigue) y `<system backchannel>`. No dice si publica código. Fuente: [arXiv 2603.09180](https://arxiv.org/html/2603.09180).
- **[Fuente]** **Unmute (Kyutai)** es STT Kyutai → cualquier LLM compatible con OpenAI (**trae ejemplo para Ollama**) → TTS Kyutai, con licencia MIT. Pide ≥16 GB: LLM ~6,1 GB, STT ~2,5 GB y TTS ~5,3 GB. El README no dice si la voz del usuario a mitad de respuesta cancela o se integra. Fuente: [github.com/kyutai-labs/unmute](https://github.com/kyutai-labs/unmute).

### Evaluaciones que importan aquí
- **[Fuente]** Full-Duplex-Bench v1.5 distingue cuatro superposiciones: interrupción, backchannel, hablar con otros y voz de fondo. Encuentra dos estrategias: "responsiva" o "retener el turno" filtrando eventos. Fuente: [arXiv 2507.23159](https://arxiv.org/abs/2507.23159).
- **[Fuente]** Full-Duplex-Bench-v2 incluye tareas de *corrección* y *seguimiento de entidades*, y concluye que los sistemas full-duplex "struggle to handle corrections smoothly". Fuente: [arXiv 2510.07838](https://arxiv.org/abs/2510.07838).

**Conclusión del tema 1 [Inferencia]:** para el objetivo de integrar B sin perder A con razonamiento de 27B, ningún modelo de punta a punta abierto lo resuelve mejor que una cascada bien orquestada. Los que caben en Geografo (MiniCPM-o 4.5 int4) razonan como un 8B y no documentan la integración.

---

## 2. APIs comerciales (como referencia de diseño)

### OpenAI Realtime API
- **[Fuente]** "Realtime API handles interruptions when VAD is enabled": el servidor detecta voz, **cancela** la respuesta en curso y empieza otra. Con WebSocket, al llegar `input_audio_buffer.speech_started` el cliente debe "immediately stop playback … and discard any queued audio" y anotar cuántos ms escuchó el usuario. Luego manda `conversation.item.truncate` con `audio_end_ms`, que "removes the unplayed portion from the conversation". Con WebRTC el servidor trunca solo; para push-to-talk existe `output_audio_buffer.clear`. Fuente: [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations).
- **[Fuente]** `response.cancel` sirve para cancelar a mano. Con interrupción por VAD, el servidor manda `response.done` con estado *cancelled*. Hay respuestas "out-of-band" con `response.conversation: "none"`, que no entran al historial (útiles para clasificar sin ensuciar el contexto). Misma fuente.
- **[Fuente]** `turn_detection.interrupt_response` (por defecto `true`): "Whether or not to automatically interrupt (cancel) any ongoing response". Con `false` la respuesta termina, y entonces `create_response` "may fail to create a response if the model is already responding". El `eagerness` de `semantic_vad` (`low`/`medium`/`high`) tiene tiempos máximos de **8 s, 4 s y 2 s**. Fuente: [API reference, realtime sessions](https://developers.openai.com/api/docs/api-reference/realtime-sessions).
- **[Fuente]** `semantic_vad` usa un clasificador que puntúa si el usuario terminó: puntuación baja, espera un timeout; alta, no espera. Fuente: [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad).
- **[Fuente]** Para navegadores recomiendan WebRTC "for more consistent performance", porque la conexión maneja el audio por ti. Fuente: [Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc).

### Gemini Live API
- **[Fuente]** "When VAD detects an interruption, the ongoing generation is canceled and discarded. Only the information already sent to the client is retained in the session history." El servidor marca `serverContent.interrupted` y el cliente debe parar y vaciar la cola. `silenceDurationMs` vale ~800 ms por defecto. Hay "proactive audio" (el modelo puede decidir **no responder**). Fuente: [Live API capabilities](https://aistudio.google.com/docs/live-api/capabilities).
- **[Fuente]** `activityHandling`: `START_OF_ACTIVITY_INTERRUPTS` (por defecto, "barge in") o `NO_INTERRUPTION` ("The model's response will not be interrupted"). `turnCoverage` decide qué entrada entra al turno del usuario. Fuente: [API reference Live](https://aistudio.google.com/api-reference/live).

**Qué hacen exactamente con lo dicho a mitad de respuesta:** la respuesta en curso se cancela. Al historial queda lo ya reproducido (OpenAI) o lo ya enviado (Gemini), y el audio nuevo del usuario forma un turno nuevo que dispara otra respuesta. **[Inferencia]** Ninguna de las dos documenta "fusionar" la entrada en la respuesta en curso. La aparente integración viene de que el modelo regenera viendo `respuesta truncada + nueva entrada`. Es lo mismo que proponemos en la opción A. `NO_INTERRUPTION` e `interrupt_response:false` son lo opuesto: terminan de hablar y atienden después.

---

## 3. Frameworks de pipeline en cascada

### Pipecat
- **[Fuente]** Cuando se dispara una estrategia de inicio de turno, el agregador emite `InterruptionFrame`. El LLM en vuelo se cancela, el TTS descarta su cola y el transporte descarta el audio no reproducido. Al contexto va **solo lo realmente hablado**, porque los `TTSTextFrame` se empujan sincronizados con la reproducción. Fuente: [Pipecat interruptions](https://docs.pipecat.ai/pipecat/fundamentals/interruptions).
  ```python
  @assistant_aggregator.event_handler("on_assistant_turn_stopped")
  async def on_assistant_turn_stopped(aggregator, message):
      if message.interrupted:
          print(f"Bot was cut off after saying: {message.content}")
  ```
- **[Fuente]** Con `VADUserTurnStartStrategy(enable_interruptions=False)` la voz del usuario **no se ignora**: "Speech over the bot is still transcribed and processed as a normal user turn. The bot's reply is queued and plays after the current speech finishes". Para que un "okay" no interrumpa existe `MinWordsUserTurnStartStrategy(min_words=3)`, que solo aplica mientras habla el bot. También está Krisp VIVA para separar backchannel de interrupción. Misma fuente y [user turn strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies.md).
- **[Fuente]** Estrategias por defecto: inicio `[VADUserTurnStartStrategy(), TranscriptionUserTurnStartStrategy()]` y fin `TurnAnalyzerUserTurnStopStrategy(LocalSmartTurnAnalyzerV3())`. También existen `EagerUserTurnStopStrategy` (responde antes, especulando) y `LLMTurnCompletionUserTurnStopStrategy`. Fuente: [user turn strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies.md).
  ```python
  user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
      context,
      user_params=LLMUserAggregatorParams(
          user_turn_strategies=UserTurnStrategies(
              start=[MinWordsUserTurnStartStrategy(min_words=3)],
              stop=[SpeechTimeoutUserTurnStopStrategy()],
          ),
      ),
  )
  ```
- **[Fuente]** No encontré una página actual de `UserIdleProcessor`. La función de inactividad vive en `UserTurnProcessor(user_idle_timeout=…)` con el evento `on_user_turn_idle` (0 = desactivado). Fuente: [código de user_turn_processor](https://reference-server.pipecat.ai/en/latest/_modules/pipecat/turns/user_turn_processor.html). **[Inferencia]** `UserIdleProcessor` parece un nombre de versiones anteriores.

### LiveKit Agents
- **[Fuente]** Al interrumpir, el agente "truncates its conversation history to include only the portion of the speech that the user heard". Se puede marcar un `say()` o `generate_reply()` como no interrumpible con `allow_interruptions=False`. Fuente: [LiveKit turns](https://docs.livekit.io/agents/build/turns/).
- **[Fuente]** Ajustes de interrupción: `mode` (`"adaptive"`: "uses an audio model to distinguish real interruptions from backchannel acknowledgments"; si no, `"vad"`), `min_duration` 0,5 s, `min_words` 0, `false_interruption_timeout` 2,0 s y `resume_false_interruption` True (**retoma** lo que decía si era una falsa interrupción). Endpointing con `min_delay` 0,5 s y `max_delay` 3,0 s. **Generación preventiva** activada por defecto: arranca el LLM con la transcripción final antes de confirmar el turno, `preemptive_tts` False, `max_speech_duration` 10 s y `max_retries` 3, y se cancela si cambia la transcripción. Fuente: [Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning.md).
- **[Fuente]** El hook `on_user_turn_completed(turn_ctx, new_message)` corre antes de responder. Ahí se puede inyectar contexto (`turn_ctx.add_message(...)`, persistible con `update_chat_ctx`) o abortar con `raise StopResponse()`. Fuente: [Pipeline nodes & hooks](https://docs.livekit.io/agents/logic/nodes.md).

**¿Alguno incorpora la entrada nueva sin descartar la respuesta?** **[Fuente]** Ninguno lo hace de forma nativa. Pipecat, sin interrupciones, encola la respuesta nueva después de la actual. LiveKit retoma solo en falsas interrupciones. **[Inferencia]** El patrón práctico es: interrumpir, guardar en el historial lo oído, añadir el turno del usuario y regenerar con una instrucción de integrar. En LiveKit eso se monta en `on_user_turn_completed` y en Pipecat con el agregador de contexto. Nuestro stack puede replicarlo sin adoptar ninguno de los dos.

---

## 4. Detección semántica de fin de turno

| Modelo | Tamaño | Entrada | Licencia | Latencia publicada | Fuente |
|---|---|---|---|---|---|
| Pipecat **Smart Turn v3.2** | ~8M params (Whisper Tiny + clasificador). CPU int8 ~8 MB, GPU fp32 ~32 MB | Solo audio, 16 kHz, hasta 8 s; 23 idiomas incl. inglés | BSD-2-Clause (pesos, datos y entrenamiento abiertos) | "as little as 10ms on some CPUs", <100 ms en la mayoría, ~65 ms en Pipecat Cloud | [github.com/pipecat-ai/smart-turn](https://github.com/pipecat-ai/smart-turn) |
| LiveKit audio `TurnDetector` `v1-mini` | No publicado; 140-250 MB de RAM por copia | Audio crudo; VAD con silencio ≥0,25 s | LiveKit Model License | No publicada | [turn-detector](https://docs.livekit.io/agents/logic/turns/turn-detector.md) |
| LiveKit texto `MultilingualModel` (obsoleto) | Destilado de Qwen2.5-0.5B, 396 MB, <500 MB de RAM | Transcripción + contexto | LiveKit Model License | ~50-160 ms por turno en CPU | idem y [HF livekit/turn-detector](https://huggingface.co/livekit/turn-detector) |
| OpenAI `semantic_vad` | Cerrado | Audio | Comercial | Esperas máximas de 8/4/2 s según `eagerness` | [API reference](https://developers.openai.com/api/docs/api-reference/realtime-sessions) |
| Kyutai STT 1B (VAD semántico integrado) | ~1B | Audio en streaming | CC-BY 4.0 | Retraso de 0,5 s | [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling) |
| NVIDIA Parakeet Realtime EOU 120M | 120M | Audio en streaming, emite `<EOU>` | NVIDIA Open Model License | EOU P50 160 ms, P90 280 ms | [HF parakeet_realtime_eou_120m-v1](https://huggingface.co/nvidia/parakeet_realtime_eou_120m-v1) |

**[Inferencia]** Smart Turn v3 es el que mejor encaja: CPU, BSD-2, no necesita transcripción y corre en VPS2 (sin GPU) o en Geografo. La card de LiveKit dice "designed for use … within the LiveKit Agents framework" y no revisé el texto completo de su licencia, así que conviene leerlo antes de usarlo fuera de LiveKit.

---

## 5. Razonamiento interrumpible o asíncrono con LLMs de texto

### 5.1 Cancelar y regenerar conservando lo dicho (el patrón de base)
- **[Fuente]** Es lo que hacen OpenAI (truncate a `audio_end_ms`), Gemini ("only the information already sent … retained"), Pipecat ("Only the words that were actually spoken") y LiveKit ("only the portion … the user heard"). Ver secciones 2 y 3.
- **[Fuente]** *Never Stop Thinking* (Pine AI/UW, [arXiv 2609.17416](https://arxiv.org/html/2609.17416v1)) usa un orquestador de ~200 líneas sobre un modelo de texto **sin modificar** (Qwen3-8B, entre otros). "Force-closes the open think block, injects the observation as a chat turn, and resumes decoding". En un barge-in, la intervención del asistente se trunca en la última palabra oída y se añade un marcador `[INTERRUPTED]`. Se apoya en motores con *KV-cache append* (vLLM, SGLang, TensorRT-LLM). En una pipeline de voz real bajó la latencia media un 19 %. Código en `github.com/19PINE-AI/never-stop-thinking` (el enlace me dio 404 al consultarlo, así que no pude verificar el repo).
- **[Fuente]** Advertencia del mismo paper: transmitir *todo* en streaming empeora la exactitud cuando la intención real llega al final (Llama-3.1-8B −22 puntos). Una política con compuerta, que solo usa la entrada temprana para cosas seguras, recupera casi la exactitud por turnos.
- **[Fuente]** *Are Large Reasoning Models Interruptible?* encuentra caídas de hasta **60 %** cuando la actualización llega tarde en el razonamiento. Modos de falla: "reasoning leakage", "panic" y "self-doubt". Fuente: [arXiv 2510.11713](https://arxiv.org/abs/2510.11713).

### 5.2 Prefill y KV cache en **nuestro** Ollama
- **[Fuente]** llama-server prefilla por defecto un mensaje final de `assistant` (`--prefill-assistant`, "default: prefill enabled"). `cache_prompt` (por defecto `true`) solo evalúa el sufijo distinto. Fuente: [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
- **[Fuente]** Ollama 0.31.2 y 0.34.4 (las versiones de Geografo y de la Z6, consultadas en `/api/version`) lanzan `llama-server` y le mandan `"cache_prompt": true`. Fuente: [ollama v0.34.4 `llm/llama_server.go`](https://github.com/ollama/ollama/blob/v0.34.4/llm/llama_server.go). El API expone `prompt_eval_cached_count` ([api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)) y `_debug_render_only` ([api/types.go](https://github.com/ollama/ollama/blob/main/api/types.go)).
- **[Medido aquí] El prefill funciona.** Con `_debug_render_only`, `[user "Compare A.", assistant "Sure. A is fast"]` se renderiza como `…<|im_start|>assistant\nSure. A is fast`, sin `<|im_end|>`, así que el modelo **continúa** el texto. Dos mensajes de usuario seguidos se renderizan como **dos bloques `user` separados**, sin fusionarse.
- **[Medido aquí] El modelo es híbrido.** `/api/show` devuelve `qwen35`, 27,3B, Q4_K_M, `full_attention_interval: 4` y parámetros `ssm.*`, o sea, capas de estado recurrente. **[Inferencia]** Por eso llama.cpp no puede retroceder la caché a cualquier posición, solo a *checkpoints*. Explica la tabla siguiente.
- **[Medido aquí] Coste de regenerar** (prompt de sistema de ~580 tokens, 1 token generado):

  | Petición siguiente | Tokens del prompt | Cacheados | Prefill |
  |---|---|---|---|
  | Idéntica | 593 | 589 | 0,19 s |
  | Turno siguiente normal (`…user, assistant completo, user nuevo`) | 602 | 583 | 0,31 s |
  | **Asistente parcial + usuario nuevo** (`…user A, assistant "Sure.", user B`) | 688 | **665** | **0,32 s** |
  | Prefill (`…user A, assistant parcial`) | 584 | 583 | 0,19 s |
  | **Dos usuarios seguidos** (`…user A, user B`) | 681 | **157** | **1,01 s** |
  | Editar el mensaje de usuario anterior ("Compare A. And also B.") | 593-597 | 74-81 | ~1,0 s |
  | Sin caché | ~590-670 | 0 | 1,1-1,2 s (~500-550 tok/s) |

  **[Inferencia]** Regla de diseño: **nunca editar ni intercalar; siempre añadir al final después de un bloque `assistant`**. Con 20 mensajes de historial (varios miles de tokens), equivocarse aquí cuesta varios segundos por reintento. Ollama corre una sola ranura, así que **cualquier otra petición** a la Z6 entre medias pisa la caché (lo observé: una petición intermedia dejó solo 169 tokens cacheados).

### 5.3 "Pensar mientras se escucha" y generación preventiva
- **[Fuente]** **SHANKS** genera razonamiento no hablado por chunks mientras el usuario habla, con +37,1 % de exactitud al decidir interrumpir y el 56,9 % de las herramientas resueltas antes de que el usuario termine. Fuente: [arXiv 2510.06917](https://arxiv.org/abs/2510.06917).
- **[Fuente]** **LiveKit preemptive generation**: ver sección 3. Se cancela si la transcripción final cambia, con 3 reintentos como máximo.
- **[Fuente]** **KAME** responde antes de que termine la pregunta y se corrige con oracles posteriores (sección 1). Su peor MT-Bench frente a Unmute se debe, según los autores, a responder con información incompleta.
- **[Fuente]** **Asynchronous Reasoning** (Yandex et al.) maneja tres flujos (entrada, pensamiento privado y respuesta pública) reordenados con RoPE en la caché. Inserta "shards" de entrada nueva **sin recodificar** el contexto. TTFT de minutos a ≤5 s, retardo percibido hasta 12× menor y demo de asistente de voz. Necesita **kernels y caché propios** (vLLM queda como trabajo futuro; no menciona llama.cpp). Código: [github.com/yandex-research/AsyncReasoning](https://github.com/yandex-research/AsyncReasoning). Fuente: [arXiv 2512.10931](https://arxiv.org/html/2512.10931v2).
- **[Fuente]** **STITCH** alterna chunks de razonamiento no hablado con chunks hablados, aprovechando que el audio dura más que su generación. Iguala la latencia de modelos sin CoT y gana ~15 % en matemáticas. Fuente: [arXiv 2507.15375](https://arxiv.org/abs/2507.15375).

### 5.4 Dos agentes: hablante rápido + pensador lento
- **[Fuente]** *Talker-Reasoner* (System 1 / System 2): el Talker sintetiza la respuesta conversacional y el Reasoner planifica y usa herramientas. El abstract no aclara si corren a la vez. Fuente: [arXiv 2410.08328](https://arxiv.org/abs/2410.08328).
- **[Fuente]** *AsyncLM*: interrupciones in-flight cuando terminan las funciones, 1,6-5,4× menos latencia. Menciona como extensión las interrupciones humano-LLM, sin evaluarlas. Fuente: [arXiv 2412.07017](https://arxiv.org/abs/2412.07017).
- **[Fuente]** El front-end/back-end de NVIDIA y NemotronLabs VoiceChat dicen un relleno o acuse fijo mientras trabaja el back-end y luego prefillan su respuesta (sección 1). *Never Stop Thinking* tiene una política "dual-process": respuesta rápida limitada de System 1 mientras System 2 sigue razonando.

### 5.5 ¿Corrección, adición, backchannel o pregunta distinta?
- **[Fuente]** Taxonomías existentes:
  - MiniCPM-Duplex: terminación, regeneración, reset y "back on topic".
  - DuplexCascade: `<user is interrupting>` y `<user backchannel>`.
  - FDB v1.5: interrupción, backchannel, hablar con otros y voz de fondo.
  - LiveKit adaptive y Krisp VIVA, en Pipecat, separan backchannel de interrupción con un modelo de audio.
  - Pipecat `MinWordsUserTurnStartStrategy`: umbral de palabras solo mientras habla el bot.
- **[Inferencia]** Para este stack bastan dos capas:
  1. **Reglas baratas** en el navegador o el API: duración <~0,6 s, o ≤2 palabras de una lista ("uh-huh", "yeah", "okay", "right", "mm"), cuenta como backchannel: no interrumpir y, si se bajó el volumen, restaurarlo (como `resume_false_interruption`). "Stop", "wait" o "hold on" cuentan como parada.
  2. **Clasificador LLM** para el resto. Con `qwen3:8b` en Geografo y `format` JSON, salida `{tipo: "adicion"|"correccion"|"pregunta_nueva"|"parada"|"ruido"}`, con el historial corto y lo que la IA iba diciendo. Va a Geografo para **no pisar la caché de la Z6**. No medí su latencia.

  Corrección, adición y pregunta nueva comparten mecánica (cancelar y regenerar). Solo cambia la instrucción: "replace X with Y", "also cover B" o "answer the new question, then offer to return to A". La clasificación decide sobre todo **si cortar y cómo reconocer** la entrada.

---

## 6. STT en streaming en Geografo (RTX A4000, 16 GB)

| Opción | Licencia | Tamaño / VRAM | Latencia | Notas | Fuente |
|---|---|---|---|---|---|
| faster-whisper por lotes (hoy) | MIT | `small.en` int8 en CPU | 1,7-2 s medidos (LEEME) | No es streaming; pasarlo a la GPU de Geografo es lo más barato (no medido) | `voz/LEEME.md` |
| whisper_streaming (ÚFAL) | MIT | Backend faster-whisper | 3,3 s en long-form (paper) | LocalAgreement; el autor lo da por **reemplazado por SimulStreaming** (solo torch) | [ufal/whisper_streaming](https://github.com/ufal/whisper_streaming) |
| WhisperLive (Collabora) | MIT | faster-whisper / TensorRT / OpenVINO | No publicada | WebSocket, VAD en servidor, parciales y finales | [collabora/WhisperLive](https://github.com/collabora/WhisperLive) |
| **Kyutai STT 1B en_fr** | Código MIT/Apache, pesos CC-BY 4.0 | ~1B; ~2,5 GB según Unmute | Retraso de **0,5 s** | VAD semántico; servidor Rust con WebSocket; inglés y francés | [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling), [unmute](https://github.com/kyutai-labs/unmute) |
| Kyutai STT 2.6B en | idem | ~2,6B | Retraso de 2,5 s | Solo inglés, más preciso, más lento | idem |
| **NVIDIA Nemotron Speech Streaming EN 0.6B** | NVIDIA Open Model License (uso comercial) | 600M; VRAM no publicada | Chunks de 80/160/560/1120 ms; WER 8,43/7,67/7,07/6,93 % | Cache-aware, con puntuación; NeMo, Transformers ≥5.13 o GGUF | [HF nemotron-speech-streaming-en-0.6b](https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b) |
| NVIDIA Parakeet Realtime EOU 120M | NVIDIA Open Model License | 120M | 80-160 ms; EOU P50 160 ms | **Sin puntuación ni mayúsculas**; WER medio 9,30 % | [HF parakeet_realtime_eou_120m-v1](https://huggingface.co/nvidia/parakeet_realtime_eou_120m-v1) |
| Parakeet TDT 0.6B v3 | CC-BY 4.0 | 0.6B; VRAM no publicada | Streaming por chunks de 2 s + 2 s de contexto | Muy preciso (WER medio 6,34 %); streaming "buffered", no cache-aware | [HF parakeet-tdt-0.6b-v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) |
| Voxtral Mini 4B Realtime | Apache-2.0 | ~4B; **≥16 GB** | Retraso configurable de 80 ms a 2,4 s; a 480 ms, WER EN 4,90 % | No cabe junto a Kokoro y `qwen3:8b` en 16 GB | [HF Voxtral-Mini-4B-Realtime-2602](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602) |
| Moonshine | MIT (modelos en inglés) | Desde ~1 MB | No publicada en el README | Hecho para streaming; corre en JS/WASM (¿en el navegador?) | [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine) |

**[Inferencia]** Para escuchar *mientras la IA habla*, lo pragmático en el corto plazo es seguir con segmentos cortados por un VAD y transcripción por lotes, pero en la **GPU** de Geografo (opción A). Para la opción B, Kyutai STT 1B (CC-BY, VAD semántico, 0,5 s) o Nemotron Streaming 0.6B (puntuación, chunk ajustable) son los candidatos. Ninguna card publica la VRAM de Nemotron, así que hay que medirla.

---

## 7. Barge-in en el navegador

- **AEC [Fuente]:** en la especificación, `echoCancellation` acepta `true | false | "all" | "remote-only"`. Con `true`, el agente de usuario debe cancelar **al menos** el audio de los `MediaStreamTrack` entrantes (WebRTC) y "should" cancelar todo lo que reproduce el sistema. Fuente: [W3C Media Capture and Streams](https://w3c.github.io/mediacapture-main/). Chrome anunció `"all"` y `"remote-only"` con estimación para **Chrome 141**: [Intent to Ship (blink-dev)](https://groups.google.com/a/chromium.org/g/blink-dev/c/x5nfoaUAUWY). Un hilo antiguo del W3C cuenta que históricamente Chrome solo cancelaba el audio de una RTCPeerConnection: [public-webrtc-logs 2019](https://lists.w3.org/Archives/Public/public-webrtc-logs/2019Apr/0334.html).
  **[Inferencia]** Nuestro TTS suena por Web Audio (`AudioBufferSourceNode`), no por WebRTC, así que **no está garantizado** que se cancele. Hay que probar en Chrome y Firefox con altavoces, pidiendo `echoCancellation: "all"` donde exista y `true` como respaldo. Si el eco se cuela, hay tres defensas: (a) VAD con un umbral más alto mientras habla la IA, (b) descartar transcripciones que coincidan con el texto que la IA estaba diciendo (comparación difusa con `cola.hablado()` y la frase en curso) y (c) recomendar auriculares.
- **Silero VAD en el navegador [Fuente]:** `@ricky0123/vad-web` corre Silero (legacy, v5 y v6) con ONNX Runtime Web: `MicVAD.new({onSpeechStart, onSpeechEnd(audio Float32Array 16 kHz)})`. Fuente: [github.com/ricky0123/vad](https://github.com/ricky0123/vad). Valores por defecto: `positiveSpeechThreshold` 0,3, `negativeSpeechThreshold` 0,25, **`redemptionMs` 1400**, `preSpeechPadMs` 800 y `minSpeechMs` 400 (los segmentos más cortos son falsos positivos). Frames de 512 muestras en v5 y v6. Fuente: [docs: algorithm](https://docs.vad.ricky0123.com/user-guide/algorithm/). No verifiqué si acepta un `MediaStream` ya abierto ni su licencia (la página no la nombraba).
- **Backchannel frente a interrupción [Fuente]:** `min_duration`, `min_words` y el modo `adaptive` de LiveKit; `MinWordsUserTurnStartStrategy` de Pipecat; DuplexCascade ignora `<user backchannel>`. **[Inferencia]** En el navegador conviene, al detectar voz durante "hablando", **bajar el volumen** (ducking) en lugar de cortar. Se corta solo cuando la clasificación lo confirma, y si era backchannel se restaura el volumen. Así un "uh-huh" no destruye la respuesta.
- **Transporte [Fuente]:** OpenAI recomienda WebRTC en navegadores ([guía](https://developers.openai.com/api/docs/guides/realtime-webrtc)). **[Inferencia]** Aquí: la opción A **no necesita** cambiar de transporte; basta abortar el NDJSON y abrir otro POST, y el código ya propaga el abort hasta Ollama. La opción B (audio continuo hacia el STT en streaming) necesita un canal ascendente continuo. Un WebSocket por Hono, VPS2 → Geografo, con PCM o Opus de 16 kHz es lo más simple. WebRTC solo se justifica si el jitter de red se nota o si se quiere que el navegador trate el TTS como audio "remoto" para el AEC. Eso último es una conjetura que habría que probar.

---

## 8. Patrones de UX

**[Fuente]** Lo que hacen los sistemas documentados:
- Truncan el historial a lo oído: OpenAI, LiveKit, Pipecat, Gemini.
- Retoman tras una falsa interrupción: LiveKit `resume_false_interruption`.
- Ignoran backchannels: DuplexCascade, NemotronLabs VoiceChat (93 %).
- Dicen un relleno mientras piensan ("Let me pull that up", NVIDIA) o un acuse fijo durante herramientas (VoiceChat).
- "Back on topic": responden lo lateral y retoman lo pendiente (MiniCPM-Duplex).
- Corrigen lo ya dicho cuando llega mejor información (KAME).
- Marcan `[INTERRUPTED]` en el historial (Never Stop Thinking).

**[Inferencia]** Propuesta concreta para `/prueba-ia`:
1. **Voz**: al detectar una adición, la IA termina la palabra o frase corta en curso (no corta en seco a mitad de palabra) y abre la continuación con un acuse de ≤6 palabras: "Good point, adding B." / "Got it, comparing with B too." / "Ah, you mean X, not Y." Luego sigue **sin repetir** lo ya dicho y, si hacía falta, retoma A ("Back to A: …").
2. **Pantalla**:
   - La burbuja de la IA en curso muestra lo **pronunciado** en color normal y lo descartado no aparece (como hoy).
   - La entrada del usuario aparece como un **chip anidado** bajo esa burbuja ("+ and also compare it with B") mientras se clasifica, con estado "integrando…".
   - Si era backchannel, el chip se desvanece y la voz recupera el volumen.
   - Un orbe o indicador muestra "te escucho" mientras la IA habla (micrófono abierto); hoy solo escucha en "escuchando".
3. **Acuse inmediato**: si el usuario añade algo mientras la IA aún "piensa" (sin audio), suena un acuse pregrabado de Kokoro ("Sure, adding that.") mientras el 27B regenera. Ese mismo texto entra al historial como `assistant` parcial. Según la tabla de la sección 5.2, eso deja la caché en el caso barato (0,32 s) y no en el caro (1,0 s).

---

## Tabla comparativa

VRAM y latencia son las cifras publicadas por cada fuente. "—" significa no publicado o no verificado.

| Nombre | Tipo | Licencia | VRAM | Latencia publicada | ¿Integra entrada superpuesta? | ¿Viable aquí? |
|---|---|---|---|---|---|---|
| Moshi (Kyutai) | S2S full-duplex | Código MIT/Apache, pesos CC-BY 4.0 | 24 GB (PyTorch); int8 en Candle | 160 ms teórica / ~200 ms | La escucha; no documenta integración | No: 24 GB, razonamiento pobre (MT-Bench 2,05) |
| PersonaPlex-7B | S2S (Moshi) | NVIDIA Open Model | A100/H100 listadas | Interrupción 0,240 (sin unidad) | Corta y responde | No |
| NemotronLabs VoiceChat 11B | S2S + herramientas | — (paper CC-BY) | H100 80 GB de referencia | 448/480 ms en FDB | Corta; ignora backchannel | No |
| Sesame CSM-1B | Solo TTS | Apache-2.0 | — | — | No aplica | Solo como TTS |
| Qwen2.5-Omni 7B/3B | Omni Thinker-Talker | Apache-2.0 | 31,1 / 18,4 GB (BF16) | — | No documentado | No / muy justo |
| Qwen3-Omni-30B-A3B | Omni | Apache-2.0 | 78,9 GB BF16; 20,3 GB int4 | 234 ms teórica | No documentado | No |
| MiniCPM-o 4.5 | Omni full-duplex (TDM) | Apache-2.0 | 19 GB bf16 / 11 GB int4; llama.cpp-omni ≥12 GB | TTFT 0,6 s | No documentado | Solo experimento en Geografo (razona como 8B) |
| Freeze-Omni | Speech-LLM con LLM congelado | No verificada | — | 745 ms de media | Corta y genera de nuevo | No (Qwen2-7B, más débil) |
| VITA-1.5 | Omni | No verificada | — | ~1,5 s | No documentado | No |
| LSLM | Demostrador de turn-taking | — | — | — | Solo se detiene | No |
| SyncLLM | S2S síncrono | — | — | Tolera 160-240 ms | Modela solapamiento; no integra | No (sin pesos verificados) |
| dGSLM | S2S sin texto | — | — | — | No (sin contenido fiable) | No |
| OmniFlatten | S2S (0.5B) | — | — | 193/287 ms | Se detiene; sin backchannels | No |
| MiniCPM-Duplex | Texto pseudo-duplex | Código y datos publicados | — | — | Corta y regenera; "back on topic" entrenado | Idea útil (datos y taxonomía) |
| KAME | Tándem S2S + LLM | Sin código publicado | — | Mediana 0,0 s | Sí, se corrige con oracles | Idea útil |
| DuplexCascade | Cascada full-duplex | — | — | — | Corta / ignora backchannel | Idea útil |
| Unmute (Kyutai) | Cascada | MIT (STT y TTS CC-BY) | ≥16 GB (6,1 + 2,5 + 5,3) | TTS ~450-750 ms | No documentado | Parcial: STT de Kyutai |
| OpenAI Realtime | API | Comercial | — | — | Cancela, trunca y regenera | Referencia |
| Gemini Live | API | Comercial | — | — | Cancela y descarta lo no enviado | Referencia |
| Pipecat | Framework | BSD-2 (Smart Turn) | Smart Turn ~8 MB en CPU | Smart Turn 10-100 ms | Corta y trunca; o encola sin interrumpir | Copiar patrones |
| LiveKit Agents | Framework | Apache-2.0 (framework); detector con licencia propia | Detector <500 MB de RAM | 50-160 ms (texto) | Trunca; retoma si es falsa interrupción; preventiva | Copiar patrones |
| Never Stop Thinking | Orquestador | — (repo no verificado) | El del LLM | −19 % latencia | Sí: inyecta como turno, `[INTERRUPTED]` | **Sí, es el patrón** |
| Asynchronous Reasoning | Inferencia con RoPE | Repo publicado | Kernels propios | TTFT ≤5 s | Sí: "shards" sin recodificar | No con Ollama |

---

## Opciones para este stack, de menor a mayor esfuerzo

### Opción A: micrófono siempre abierto + clasificación + cancelar y regenerar integrando (esfuerzo bajo, impacto alto)

**Qué cambia**
- **Navegador (`useVoz.ts`, `colaDeVoz.ts`)**
  - Un solo `getUserMedia` abierto toda la conversación (hoy se cierra en cada turno), con `echoCancellation: "all"` si el navegador lo admite y `true` si no.
  - Silero VAD (`@ricky0123/vad-web`) en lugar del RMS, con `redemptionMs` ~600-800 en vez de 1300. Hay que ajustarlo: más corto parte frases.
  - Estados nuevos: `pensando+escuchando` y `hablando+escuchando`. Al empezar voz durante "hablando": ducking del `AudioContext` (un `GainNode` delante del `analizador`).
  - Al terminar el segmento: transcribir y clasificar.
    - backchannel → restaurar volumen.
    - parada → `cola.detener()` como hoy.
    - adición, corrección o pregunta nueva → `corte.abort()` y luego `cola.detener()`, que devuelve lo dicho. Después, nuevo `turnoDeVoz` con el historial `[…, user A, assistant <lo dicho> + " [interrupted]", user B]`.
  - Si se interrumpe en "pensando" (sin audio): reproducir un acuse pregrabado y usarlo como `assistant` parcial.
- **API (`z6.ts`)**
  - `/voz/turno` acepta un campo opcional `continuacion: { tipo }` que agrega, **solo en ese turno**, una instrucción al sistema. Ejemplo: "You were interrupted. The user just added something. Open with a ≤6-word acknowledgement, integrate it with the original request, do not repeat what you already said."
  - **No** editar mensajes previos ni mandar dos `user` seguidos (sección 5.2).
  - Nuevo `POST /voz/clasificar`, que llama a `qwen3:8b` en Geografo con `format` JSON, o reglas si son ≤2 palabras.
- **Servicios (`voz/servidor.py`)**
  - Mover faster-whisper a la GPU de Geografo (CTranslate2 con CUDA, `float16` o `int8_float16`) o subir a `base.en`/`small.en` en GPU.
  - Separar el candado de STT del de TTS (ya están separados) y permitir transcribir mientras se sintetiza.

**GPU y VRAM:** Z6 sin cambios (27B, ~19 GB). Geografo: Kokoro 0,9 GB + Whisper small en GPU (no medido; el modelo pesa cientos de MB) + `qwen3:8b` (descarga de 5,2 GB según [ollama.com/library/qwen3](https://ollama.com/library/qwen3), más KV) dan **~7-8 GB de 16** **[Inferencia]**.

**Latencia esperada [Inferencia, sumando medidas]:** fin de la adición → VAD (0,6-0,8 s) → STT (hoy 1,7-2 s en CPU; en GPU probablemente <0,5 s, sin medir) → clasificación (0 con reglas; `qwen3:8b` sin medir) → prefill en la Z6 de **0,32 s** (medido, caso con asistente parcial) → primeros tokens (~0,4 s según LEEME) → TTS de 0,12 s. Total: **~3-3,5 s con STT en CPU** y **~1,5-2 s con STT en GPU**. El acuse pregrabado suena en <1 s.

**Riesgos**
- Eco del TTS que dispare el VAD (AEC sobre Web Audio no garantizado).
- Whisper con segmentos cortos o ruido puede inventar texto. **[Inferencia]** Mitigación: `minSpeechMs` y descartar transcripciones de baja confianza.
- Que el 27B repita lo ya dicho o ignore A. Mitigación: instrucción y prueba con casos.
- Pisar la caché de la Z6 si otra petición (el chat de texto usa Geografo, bien; otro usuario de voz, mal) se cuela.

**Primeros pasos**
1. Prueba de AEC: reproducir Kokoro por Web Audio con el micrófono abierto y medir cuántas activaciones de Silero se producen con altavoces y con auriculares.
2. Mantener el `getUserMedia` abierto y añadir el ducking.
3. `continuacion` en `/voz/turno` y armado del historial con `cola.hablado()`.
4. Reglas de backchannel; después, el clasificador con `qwen3:8b`.
5. Whisper en GPU.

### Opción B: STT en streaming + fin de turno semántico + generación preventiva (esfuerzo medio, impacto alto en latencia y naturalidad)

**Qué cambia**
- **Navegador**: manda audio continuo (PCM de 16 kHz u Opus) por **WebSocket** al API y deja de cortar segmentos. Muestra la transcripción parcial en vivo, lo que también sirve para el chip de la adición.
- **API (Hono en VPS2)**:
  - Retransmite el WebSocket a Geografo.
  - Corre **Smart Turn v3** en CPU (8 MB; ~10-100 ms según la fuente) para decidir el fin de turno, en lugar de 1,3 s fijos.
  - **Generación preventiva** al estilo LiveKit: con la transcripción parcial estable, lanza el 27B. Si la transcripción cambia, aborta y relanza, con un máximo de 3 reintentos y solo para enunciados de ≤10 s.
  - Durante "hablando", la transcripción en vivo alimenta el clasificador de la opción A.
- **Servicios (Geografo)**: STT en streaming en GPU.
  - **Kyutai STT 1B**: retraso de 0,5 s, VAD semántico, servidor Rust con WebSocket, ~2,5 GB según Unmute.
  - o **Nemotron Speech Streaming 0.6B**: chunk de 160-560 ms y puntuación.
  - Smart Turn puede ir en VPS2 (CPU) o en Geografo.

**GPU y VRAM:** Geografo: Kokoro 0,9 GB + STT en streaming (~2,5 GB para Kyutai 1B; Nemotron sin publicar) + `qwen3:8b` dan **~9-11 GB** **[Inferencia]**. La Z6 no cambia.

**Latencia esperada [Inferencia]:** el fin de turno pasa de 1,3 s fijos a silencio corto + Smart Turn (~0,2-0,5 s). El STT ya está hecho al terminar, más 0,5 s de retraso en Kyutai. Con generación preventiva, el TTFT del 27B se solapa con el habla del usuario. Primera voz: ~0,8-1,5 s tras callar. Una adición a mitad de respuesta se detecta mientras se habla, no después.

**Riesgos**
- La generación preventiva **pisa la caché de la Z6** en cada reintento. Si diverge antes del último checkpoint, cada uno cuesta ~1 s de prefill (sección 5.2).
- *Never Stop Thinking* advierte que actuar sobre la entrada parcial empeora la exactitud cuando la intención llega al final. Se mitiga con compuerta: solo generación preventiva cuando Smart Turn ya da probabilidad alta.
- Más piezas en vuelo (WebSocket, servidor Rust de Kyutai) y licencias distintas: CC-BY con atribución, o NVIDIA Open Model.

**Primeros pasos**
1. Levantar el servidor de Kyutai STT en Geografo, medir VRAM y retraso real con `small.en` como referencia, y comparar WER en frases propias.
2. WebSocket de audio navegador → VPS2 → Geografo.
3. Smart Turn v3 en VPS2.
4. Generación preventiva detrás de un flag.

### Opción C: hablante rápido + pensador 27B (esfuerzo alto, impacto alto en "integrar con naturalidad")

Inspirada en KAME, en el front-end/back-end de NVIDIA, en el "dual-process" de *Never Stop Thinking* y en Talker-Reasoner.

**Qué cambia**
- **Hablante** (Geografo): `qwen3:8b`, con `think:false` y salida corta, o frases fijas de Kokoro para los casos frecuentes. Responde **siempre en <1 s**: acuses ("Good point, let me fold B in."), rellenos mientras piensa el pensador y la reformulación oral de las notas del pensador.
- **Pensador** (Z6): `qwen3.6:27b` con el historial completo. Recibe cada entrada nueva **anexada** al final (regla de la sección 5.2) y emite la respuesta o "notas" en streaming. Opcionalmente, `think` en modo bajo para preguntas complejas, aprovechando que el hablante cubre el silencio. Es el patrón STITCH, pero entre dos modelos.
- **API**: un orquestador por conversación (máquina de estados) que decide quién habla, encola las frases del pensador detrás del acuse del hablante, aplica la clasificación de la opción A y lleva un "ledger" de lo dicho para que ninguno repita.
- **Navegador**: igual que en A o B, y además muestra "pensando sobre B…" mientras el hablante rellena.

**GPU y VRAM:** como en B, con `qwen3:8b` cargado de forma permanente en Geografo (`keep_alive` largo). La Z6 no cambia.

**Latencia esperada [Inferencia]:** acuse audible ~0,5-1 s después de la adición (8B + Kokoro de 0,12 s); el contenido del 27B llega a ~1,5-3 s, ya disimulado.

**Riesgos**
- Inconsistencia entre las dos voces (el 8B promete algo que el 27B no hace). Mitigación: el hablante solo hace acuses y transiciones, nunca afirmaciones de contenido.
- Complejidad del orquestador.
- *Are LRMs Interruptible?* muestra que el razonamiento largo se degrada con actualizaciones tardías. Conviene reiniciar el pensador con el contexto ampliado en vez de "inyectar" a mitad del `<think>`.

**Primeros pasos**
1. Hacer primero A, porque C la reutiliza entera.
2. Prototipar solo el acuse del hablante con frases fijas y medir si basta.
3. Si no basta, `qwen3:8b` como hablante con un prompt de una línea y un presupuesto de 12 tokens.

### Opción D (no recomendada salvo como experimento): modelo full-duplex de punta a punta en Geografo

MiniCPM-o 4.5 int4 (11 GB; llama.cpp-omni en full-duplex con NVIDIA ≥12 GB) en la A4000, descargando `qwen3:8b`. Moshi no cabe (24 GB) junto al 27B y razona mal. **Contras [Fuente + Inferencia]:** razonamiento de nivel 8B, frente al 27B que hoy justifica usar la Z6; ninguno documenta la integración de entrada superpuesta; un idioma o una voz fijos; Kokoro y faster-whisper actuales quedan sin uso. Sirve para **sentir** el turn-taking natural y comparar, no para producción.

---

## Preguntas abiertas y lo que no pude verificar

- **AEC con Web Audio**: la especificación solo garantiza cancelar el audio remoto de WebRTC; Chrome 141 añade `"all"` (estimado). No encontré documentación oficial de Chrome o Firefox que confirme que el audio de un `AudioBufferSourceNode` se cancela. **Hay que medirlo.**
- **Caché híbrida de la Z6**: mis medidas (sección 5.2) son empíricas, con un prompt de ~600 tokens y Ollama 0.34.4. Con historiales de 2-4 mil tokens el coste de equivocarse sube aproximadamente en proporción (inferencia). No investigué si llama-server permite más *checkpoints* (`--ctx-checkpoints` o similar) ni si Ollama lo expone.
- **Latencias no medidas**: faster-whisper en la GPU de Geografo, `qwen3:8b` como clasificador, VRAM real de Nemotron Streaming y de Kyutai STT fuera de Unmute.
- **Comportamiento del 27B** ante `[interrupted]` y la instrucción de integrar: hay que probarlo con un conjunto de casos (adición, corrección, pregunta nueva, "back to A").
- **Licencias no confirmadas**: Freeze-Omni y VITA (`License.txt` sin nombre), los términos completos de la LiveKit Model License, la licencia de `@ricky0123/vad` (la página no la mostraba) y el repo de *Never Stop Thinking* (404 al consultarlo).
- **Interrupciones en modelos omni**: ni Qwen2.5-Omni, ni Qwen3-Omni, ni MiniCPM-o 4.5, ni VITA documentan qué hacen cuando el usuario habla encima.
- **Gemini `NO_INTERRUPTION`**: la referencia dice que la respuesta no se interrumpe, pero no explica qué pasa con el audio del usuario que llega mientras tanto (si se encola como turno siguiente).
- **Full-Duplex-Bench-v2**: solo leí el abstract; no tengo las cifras de cómo fallan las correcciones.
- **UserIdleProcessor de Pipecat**: no encontré la página actual; documento su equivalente (`UserTurnProcessor(user_idle_timeout)`).
