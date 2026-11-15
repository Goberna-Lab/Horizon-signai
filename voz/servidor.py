"""horizon-voz: oído y boca en inglés para el chat de voz de Horizon, en Geografo.

- Boca (HVOZ_MOTOR):
  - `kokoro` (por defecto): Kokoro-82M, voz «am_michael». ~0,03× tiempo real en GPU: la
    primera frase suena en menos de un segundo. Es la que usa el chat de voz.
  - `qwen`: Qwen3-TTS 0.6B CustomVoice, voz «Ryan». Más natural pero ~2× más lento que el
    audio (esperas de ~10 s por frase en producción); queda como alternativa.
- Oído: faster-whisper en CPU (int8), para no competir por la GPU con Ollama.

Contrato (todo con `Authorization: Bearer <token>`, comprobado ANTES de leer el cuerpo):
  POST /v1/hablar       {"texto": "...", "voz"?, "formato"?: "wav"|"opus"|"mp3", "palabras"?: bool}
                        → audio (wav por defecto; opus = Ogg/Opus, ~15 veces más liviano).
                        Con "palabras": cabecera X-Palabras = JSON [[texto, espacio, inicio_s, fin_s], …]
                        para mostrar cada palabra cuando se pronuncia.
  POST /v1/transcribir  audio crudo (webm/opus, ogg, wav; ≤ 5 MB)        → {"texto", "ms"}
  GET  /v1/salud                                                       → {"listo", ...}
Una petición a la vez por tipo: la GPU y la CPU no se reparten entre pedidos.
"""

import asyncio
import hmac
import io
import json
import os
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

IP = os.environ.get("HVOZ_IP", "127.0.0.1")
PUERTO = int(os.environ.get("HVOZ_PUERTO", "8796"))
TOKEN = Path(os.environ.get("HVOZ_TOKEN_ARCHIVO", "/etc/horizon-voz/token")).read_text().strip()
MOTOR = os.environ.get("HVOZ_MOTOR", "kokoro")
MODELO_TTS = os.environ.get(
    "HVOZ_MODELO_TTS", "hexgrad/Kokoro-82M" if MOTOR == "kokoro" else "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
)
VOZ = os.environ.get("HVOZ_VOZ", "am_michael" if MOTOR == "kokoro" else "Ryan")
IDIOMA = os.environ.get("HVOZ_IDIOMA", "English")
MODELO_STT = os.environ.get("HVOZ_MODELO_STT", "small.en")
HILOS_STT = int(os.environ.get("HVOZ_HILOS_STT", "6"))
DTYPE = {"float32": torch.float32, "bfloat16": torch.bfloat16}[os.environ.get("HVOZ_DTYPE", "float32")]
MAX_TEXTO = 600
MAX_AUDIO = 5 * 1024 * 1024

estado = {"tts": None, "stt": None, "cola_tts": 0, "cola_stt": 0}
candado_tts = asyncio.Lock()
candado_stt = asyncio.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def portero(request: Request, siguiente):
    # Un solo 401 idéntico, en tiempo constante y antes de tocar el cuerpo.
    dado = request.headers.get("authorization", "").removeprefix("Bearer ")
    if not hmac.compare_digest(dado.encode(), TOKEN.encode()):
        return JSONResponse({"error": "No autorizada"}, status_code=401)
    return await siguiente(request)


def cargar():
    from faster_whisper import WhisperModel

    t = time.perf_counter()
    if MOTOR == "kokoro":
        from kokoro import KPipeline

        # lang_code "a" = inglés americano ("b" = británico). La voz se baja del mismo repo.
        tts = KPipeline(lang_code="a", repo_id=MODELO_TTS, device="cuda")
        list(tts("Hi.", voice=VOZ))  # calentar
    else:
        from qwen_tts import Qwen3TTSModel

        tts = Qwen3TTSModel.from_pretrained(
            MODELO_TTS, device_map="cuda:0", dtype=DTYPE, attn_implementation="sdpa"
        )
        tts.generate_custom_voice(text="Hi.", language=IDIOMA, speaker=VOZ)  # calentar
    stt = WhisperModel(MODELO_STT, device="cpu", compute_type="int8", cpu_threads=HILOS_STT)
    estado.update(tts=tts, stt=stt)
    print(f"modelos cargados en {time.perf_counter() - t:.1f} s", flush=True)


FORMATOS = {  # formato → (contenedor de libsndfile, códec, media type)
    "wav": ("WAV", "PCM_16", "audio/wav"),
    "opus": ("OGG", "OPUS", "audio/ogg"),
    "mp3": ("MP3", "MPEG_LAYER_III", "audio/mpeg"),
}


def sintetizar(texto: str, idioma: str, voz: str, formato: str):
    """Devuelve (audio codificado, palabras con tiempos, duración en s)."""
    palabras: list[list] = []
    with torch.inference_mode():
        if MOTOR == "kokoro":
            partes, desfase = [], 0.0
            # Kokoro parte textos largos en segmentos; los tiempos de cada uno empiezan en 0.
            for r in estado["tts"](texto, voice=voz):
                a = np.asarray(r.audio, dtype=np.float32)
                for t in r.tokens or []:
                    if t.start_ts is None:
                        continue
                    palabras.append([t.text, t.whitespace or "", round(desfase + t.start_ts, 3), round(desfase + (t.end_ts or t.start_ts), 3)])
                partes.append(a)
                desfase += len(a) / 24000
            audio, sr = (np.concatenate(partes) if partes else np.zeros(1, np.float32)), 24000
        else:
            wavs, sr = estado["tts"].generate_custom_voice(text=texto, language=idioma, speaker=voz)
            audio = wavs[0]
    audio = np.clip(np.asarray(audio, dtype=np.float32).squeeze(), -1, 1)
    dur = len(audio) / sr
    if not palabras:  # sin tiempos por palabra: la frase entera dura todo el audio
        palabras = [[texto, "", 0.0, round(dur, 3)]]
    contenedor, codec, _ = FORMATOS[formato]
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format=contenedor, subtype=codec)
    return buf.getvalue(), palabras, dur


def oir(crudo: bytes) -> str:
    # faster-whisper decodifica con PyAV (webm/opus incluido) desde un archivo.
    with tempfile.NamedTemporaryFile(suffix=".audio") as f:
        f.write(crudo)
        f.flush()
        segmentos, _ = estado["stt"].transcribe(f.name, language="en", vad_filter=True, beam_size=1)
        return " ".join(s.text.strip() for s in segmentos).strip()


@app.get("/v1/salud")
async def salud():
    listo = estado["tts"] is not None and estado["stt"] is not None
    return {
        "listo": listo,
        "motor": MOTOR,
        "voz": VOZ,
        "idioma": IDIOMA,
        "tts": MODELO_TTS,
        "stt": MODELO_STT,
        "vram_gb": round(torch.cuda.memory_allocated() / 1e9, 2) if torch.cuda.is_available() else 0,
        "cola": {"tts": estado["cola_tts"], "stt": estado["cola_stt"]},
    }


@app.post("/v1/hablar")
async def hablar(request: Request):
    if estado["tts"] is None:
        return JSONResponse({"error": "Cargando modelos"}, status_code=503)
    cuerpo = await request.json()
    texto = str(cuerpo.get("texto", "")).strip()
    if not texto or len(texto) > MAX_TEXTO:
        return JSONResponse({"error": f"texto vacío o mayor a {MAX_TEXTO}"}, status_code=400)
    idioma = str(cuerpo.get("idioma") or IDIOMA)
    voz = str(cuerpo.get("voz") or VOZ)
    formato = str(cuerpo.get("formato") or "wav")
    if formato not in FORMATOS:
        return JSONResponse({"error": f"formato debe ser uno de {list(FORMATOS)}"}, status_code=400)
    estado["cola_tts"] += 1
    try:
        async with candado_tts:
            t = time.perf_counter()
            audio, palabras, dur = await asyncio.to_thread(sintetizar, texto, idioma, voz, formato)
            ms = round((time.perf_counter() - t) * 1000)
    finally:
        estado["cola_tts"] -= 1
    cabeceras = {"X-Ms": str(ms), "X-Duracion": f"{dur:.3f}"}
    if cuerpo.get("palabras"):
        cabeceras["X-Palabras"] = json.dumps(palabras, ensure_ascii=True, separators=(",", ":"))
    return Response(audio, media_type=FORMATOS[formato][2], headers=cabeceras)


@app.post("/v1/transcribir")
async def transcribir(request: Request):
    if estado["stt"] is None:
        return JSONResponse({"error": "Cargando modelos"}, status_code=503)
    crudo = await request.body()
    if not crudo or len(crudo) > MAX_AUDIO:
        return JSONResponse({"error": "Audio vacío o mayor a 5 MB"}, status_code=413)
    estado["cola_stt"] += 1
    try:
        async with candado_stt:
            t = time.perf_counter()
            texto = await asyncio.to_thread(oir, crudo)
            ms = round((time.perf_counter() - t) * 1000)
    finally:
        estado["cola_stt"] -= 1
    return {"texto": texto, "ms": ms}


if __name__ == "__main__":
    import uvicorn

    cargar()
    uvicorn.run(app, host=IP, port=PUERTO, log_level="warning")
