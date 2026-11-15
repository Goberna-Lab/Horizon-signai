# horizon-voz: el chat de voz de Horizon, en Geografo

Oído y boca **en inglés** para `/prueba-ia`. La conversación por voz pasó de español a inglés
porque el proyecto prioriza el inglés (decisión del 2026-11-14). La respuesta de texto de la
voz sigue saliendo del `qwen3.6:27b` de la Z6; solo oír y hablar viven aquí.

| Pieza | Modelo | Dónde | Por qué |
|---|---|---|---|
| Boca | **Kokoro-82M, voz `am_michael`** (Apache 2.0), inglés americano nativo | GPU de Geografo (RTX A4000), 0,9 GB | ~0,12 s por frase: la voz suena casi a la vez que llega la respuesta |
| Boca alternativa | Qwen3-TTS 12Hz 0.6B CustomVoice, voz Ryan (Apache 2.0) | misma GPU, float32 (4,4 GB) | Más natural, pero en producción tardaba 9-11 s la primera frase y dejaba silencios de ~5 s entre frases (~2× más lento que el audio). Se cambió a Kokoro el 2026-11-14. Volver: `HVOZ_MOTOR=qwen` (ver la unidad) |
| Oído | faster-whisper `small.en`, int8 (MIT) | CPU de Geografo | `argus-voz` (Z6) solo transcribe español |

## Por qué Geografo y no la Z6

Se instaló primero en la Z6 y la segunda frase falló con `CUDA out of memory`: la Quadro RTX 6000
tiene 23,5 GB útiles, el `qwen3.6:27b` de Ollama ocupa ~18,6 GB y Ryan 4,4 GB más sus picos al
decodificar el audio. No caben juntos. En la Z6 quedó instalado pero **desactivado**
(`/opt/horizon-voz`, `systemctl disable horizon-voz`); se puede borrar.

## Medido (2026-11-14)

- Kokoro `am_michael`: **0,12-0,13 s** por frase (2,8-5,7 s de audio). VRAM 0,9 GB.
- Ryan (alternativa): ~1,7-2,7× tiempo real, 4,4 GB. La página pide la voz **frase por frase**
  y reproduce una mientras se genera la siguiente, lo que con Ryan disimulaba parte de la espera.
- Oído: ~1,7-2 s.
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
