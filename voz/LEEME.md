# horizon-voz: el chat de voz de Horizon, en Geografo

Oído y boca **en inglés** para `/prueba-ia`. La conversación por voz pasó de español a inglés
porque el proyecto prioriza el inglés (decisión del 2026-11-14). La respuesta de texto de la
voz sigue saliendo del `qwen3.6:27b` de la Z6; solo oír y hablar viven aquí.

| Pieza | Modelo | Dónde | Por qué |
|---|---|---|---|
| Boca | Qwen3-TTS 12Hz 0.6B CustomVoice, voz **Ryan** (Apache 2.0) | GPU de Geografo (RTX A4000), **float32** | Elegida a oído en el comparador de voces. float32 midió más rápido que bfloat16; en float16 el muestreo se rompe |
| Oído | faster-whisper `small.en`, int8 (MIT) | CPU de Geografo | `argus-voz` (Z6) solo transcribe español |

## Por qué Geografo y no la Z6

Se instaló primero en la Z6 y la segunda frase falló con `CUDA out of memory`: la Quadro RTX 6000
tiene 23,5 GB útiles, el `qwen3.6:27b` de Ollama ocupa ~18,6 GB y Ryan 4,4 GB más sus picos al
decodificar el audio. No caben juntos. En la Z6 quedó instalado pero **desactivado**
(`/opt/horizon-voz`, `systemctl disable horizon-voz`); se puede borrar.

## Medido (2026-11-14, desde VPS2)

- Ryan: **~1,7× tiempo real** (3,9 s de audio en 7,1 s). Por eso la página pide la voz **frase
  por frase** y reproduce una mientras se genera la siguiente.
- VRAM: 4,3-4,5 GB. Convive con `qwen3:8b` del chat de texto (5,3 GB) en los 16 GB de la A4000.
- Oído: ~1,7-2 s.

## Cómo está instalado

Servicio **de usuario** de `manolito` (no hay sudo sin contraseña en Geografo), con
`loginctl enable-linger manolito` para que arranque sin sesión abierta.

| Qué | Dónde |
|---|---|
| Código | `~/.local/share/horizon-voz/src/` (copia de `voz/servidor.py`) |
| Python y venv | `~/.local/share/horizon-voz/{python,venv}` |
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
