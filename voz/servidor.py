"""horizon-voz: oído y boca en inglés para el chat de voz de Horizon, en Geografo.

- Boca: Qwen3-TTS 0.6B CustomVoice, voz «Ryan», en la GPU. float32 por defecto: en la
  A4000 midió más rápido que bfloat16, y en float16 el muestreo se rompe.
- Oído: faster-whisper en CPU (int8), para no competir por la GPU con Ollama.

Contrato (todo con `Authorization: Bearer <token>`, comprobado ANTES de leer el cuerpo):
  POST /v1/hablar       {"texto": "...", "idioma"?: "English", "voz"?: "Ryan"} → audio/wav (PCM 16 bits)
  POST /v1/transcribir  audio crudo (webm/opus, ogg, wav; ≤ 5 MB)        → {"texto", "ms"}
  GET  /v1/salud                                                       → {"listo", ...}
Una petición a la vez por tipo: la GPU y la CPU no se reparten entre pedidos.
"""

import asyncio
import hmac
import io
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
MODELO_TTS = os.environ.get("HVOZ_MODELO_TTS", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
VOZ = os.environ.get("HVOZ_VOZ", "Ryan")
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
    from qwen_tts import Qwen3TTSModel

    t = time.perf_counter()
    tts = Qwen3TTSModel.from_pretrained(
        MODELO_TTS, device_map="cuda:0", dtype=DTYPE, attn_implementation="sdpa"
    )
    tts.generate_custom_voice(text="Hi.", language=IDIOMA, speaker=VOZ)  # calentar
    stt = WhisperModel(MODELO_STT, device="cpu", compute_type="int8", cpu_threads=HILOS_STT)
    estado.update(tts=tts, stt=stt)
    print(f"modelos cargados en {time.perf_counter() - t:.1f} s", flush=True)


def sintetizar(texto: str, idioma: str, voz: str) -> bytes:
    with torch.inference_mode():
        wavs, sr = estado["tts"].generate_custom_voice(text=texto, language=idioma, speaker=voz)
    audio = np.clip(np.asarray(wavs[0], dtype=np.float32).squeeze(), -1, 1)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


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
    estado["cola_tts"] += 1
    try:
        async with candado_tts:
            t = time.perf_counter()
            wav = await asyncio.to_thread(sintetizar, texto, idioma, voz)
            ms = round((time.perf_counter() - t) * 1000)
    finally:
        estado["cola_tts"] -= 1
    return Response(wav, media_type="audio/wav", headers={"X-Ms": str(ms)})


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
