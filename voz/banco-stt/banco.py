"""Banco del oído: error (WER) y latencia de cada modelo de faster-whisper, con audio limpio y con ruido
(SNR 12 dB), con y sin pistas de vocabulario (hotwords).

1. Audio: las frases de frases.txt dichas por 4 voces de Kokoro (las voces extra se bajan una vez a la
   caché del servicio con huggingface_hub):
     for v in am_michael af_heart bm_george af_bella; do ... POST /v1/hablar {"texto", "voz": v, "formato": "opus"}
       → audio/NN_<voz>.ogg (NN = número de frase, desde 01)
2. Correr con el Python del servicio, que ya tiene faster-whisper y cuBLAS 12:
     ~/.local/share/horizon-voz/venv/bin/python -I voz/banco-stt/banco.py <carpeta del modelo>...
Ojo: las voces son sintéticas; una voz humana real puede dar otros errores.
"""
import ctypes, re, sys, time, statistics
from pathlib import Path
import numpy as np
import nvidia.cublas
lib = Path(list(nvidia.cublas.__path__)[0]) / "lib"
for n in ("libcublasLt.so.12", "libcublas.so.12"): ctypes.CDLL(str(lib / n), mode=ctypes.RTLD_GLOBAL)
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

B = Path(__file__).parent
FRASES = (B / "frases.txt").read_text().strip().splitlines()
VOCAB = "Moon, lunar south pole, Shackleton crater, Malapert Massif, Connecting Ridge, Artemis, regolith, permanently shadowed region."
CONTEXTO = "Tell me about the lunar south pole. The lunar south pole has craters that never see sunlight, so water ice can survive there."
NUM = {"15": "fifteen"}
def norm(t):
    t = t.lower().replace("-", " ").replace("’", "'")
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    return [NUM.get(w, "okay" if w == "ok" else w) for w in t.split()]
def wer(ref, hip):
    r, h = norm(ref), norm(hip)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
    return d[len(h)], len(r)

rng = np.random.default_rng(1)
clips = []
for p in sorted((B / "audio").glob("*.ogg")):
    i = int(p.name[:2]) - 1
    a = decode_audio(str(p))
    ruido = rng.standard_normal(len(a)).astype(np.float32)
    snr = 12  # dB: ventilador / habitación
    ruido *= np.sqrt(np.mean(a ** 2) / (10 ** (snr / 10))) / np.sqrt(np.mean(ruido ** 2))
    clips.append((FRASES[i], p.stem, a, (a + ruido).astype(np.float32)))

for ruta in sys.argv[1:]:
    m = WhisperModel(ruta, device="cuda", compute_type="float16")
    list(m.transcribe(clips[0][2], language="en", beam_size=1)[0])  # calentar
    nombre = Path(ruta).name.replace("faster-", "").replace("whisper-", "")
    for ctx in (None, "vocab"):
        for cual in ("limpio", "ruido"):
            errs = tot = 0; ms = []; fallos = []
            for ref, id_, limpio, sucio in clips:
                t = time.perf_counter()
                seg, _ = m.transcribe(limpio if cual == "limpio" else sucio, language="en", vad_filter=True, beam_size=1, hotwords=VOCAB if ctx else None)
                hip = " ".join(s.text.strip() for s in seg)
                ms.append((time.perf_counter() - t) * 1000)
                e, n = wer(ref, hip); errs += e; tot += n
                if e: fallos.append(f"{id_}: «{hip}»")
            print(f"{nombre:24} {'vocab' if ctx else 'sin':8} {cual:6}  WER {100*errs/tot:5.1f} %  · {statistics.median(ms):4.0f} ms  · frases con error {len(fallos)}/80", flush=True)
            if cual == "limpio": print("    " + "\n    ".join(f for f in fallos if f[:2] in ("02", "05", "09", "13", "16")))
    del m
