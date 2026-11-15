import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { useLocation } from "react-router"
import { EVENTO_EVA, type AvisoEva, type EstadoEva } from "@/shared/eva"
import { decir, turnoDeVoz, usarAsistente, usarPantalla, type Mensaje } from "@/prueba-ia/cliente"
import { crearColaDeVoz } from "@/prueba-ia/colaDeVoz"
import { olvidar, recordar } from "@/prueba-ia/memoria"
import { useVoz } from "@/prueba-ia/useVoz"
import { EVENTOS, guionDe, hayPeligro, type Comentario } from "./guion"
import "./eva.css"

const EvaLienzo = lazy(() => import("@/shared/eva/EvaLienzo"))

const COMENTARIO_MS = 90_000 // como mucho un comentario propio cada 90 s
const PRIMERO_MS = 2500 // espera al llegar a una pantalla antes del primero
const PASEO_MS = [9000, 15000] // cada cuánto cambia de lugar si nadie la ocupa
const ANCLA_MS = 30_000 // si la arrastras, se queda ahí este tiempo
const GLOBO_MS = 6000 // el globo queda a la vista tras terminar de hablar
const DICHAS = "horizon-signai.eva.dichas.v1"
const SILENCIO = "horizon-signai.eva.silencio.v1"
const MARGEN = 16

const leer = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const escribir = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: se sigue igual */
  }
}
const dichas = () => new Set<string>(JSON.parse(leer(DICHAS) ?? "[]") as string[])
const anotarDicha = (id: string) => escribir(DICHAS, JSON.stringify([...dichas(), id]))
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const aLaVista = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.bottom > 60 && r.top < innerHeight - 60 && r.right > 0 && r.left < innerWidth
}

/**
 * EVA, la robot guía, encima de toda la app (montada en el layout raíz). Vuela por la pantalla, va a la parte
 * de la que habla y la marca, te habla con su voz (Kokoro «af_bella» + entonación y timbre de personajes.ts) y
 * al tocarla abre un panel para escribirle o conversar por voz. Recuerda lo que le cuentas (memoria.ts).
 * Reglas de comportamiento: guion.ts. Sin voz hasta el primer toque en la página (los navegadores no dejan
 * sonar audio antes): mientras tanto, solo el globo.
 */
export default function EvaCompanera() {
  const { pathname } = useLocation()
  const oculta = pathname.startsWith("/prueba-ia") // tiene su propia pantalla de voz

  const chica = typeof window !== "undefined" && innerWidth < 640
  const ANCHO = chica ? 120 : 168
  const ALTO = chica ? 150 : 210

  const caja = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: innerWidth - ANCHO - MARGEN, y: innerHeight - ALTO - MARGEN })
  const meta = useRef({ ...pos.current })
  const vel = useRef({ x: 0, y: 0 })
  const nivel = useRef(0)
  const arrastre = useRef<{ dx: number; dy: number; x0: number; y0: number; movio: boolean } | null>(null)
  const anclada = useRef(0)
  const ocupada = useRef(false)
  const habla = useRef<AbortController | null>(null)
  const ultimo = useRef(0)
  const foco = useRef<Element | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const hilo = useRef<Mensaje[]>([])
  const ocultarGlobo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [estado, setEstado] = useState<EstadoEva>("reposo")
  const [globo, setGlobo] = useState("")
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState("")
  const [silencio, setSilencio] = useState(() => leer(SILENCIO) === "1")
  const abiertaRef = useRef(abierta)
  abiertaRef.current = abierta
  const silencioRef = useRef(silencio)
  silencioRef.current = silencio

  // Conversación por voz con micrófono abierto (la misma de /prueba-ia), como EVA.
  const voz = useVoz({
    asistente: "educational",
    historial: () => hilo.current,
    alMensaje: (m) => {
      hilo.current = [...hilo.current, m]
      if (m.role === "user") recordar(m.content)
    },
  })
  const conversando = voz.estado !== "reposo"
  const conversandoRef = useRef(conversando)
  conversandoRef.current = conversando
  useEffect(() => {
    if (!conversando) return
    usarAsistente("educational")
    setEstado(voz.estado === "hablando" ? "hablando" : voz.estado === "pensando" ? "pensando" : "escuchando")
    nivel.current = voz.nivel
    if (voz.hablado) mostrar(voz.hablado)
  }, [conversando, voz.estado, voz.nivel, voz.hablado])
  useEffect(() => {
    if (!conversando) setEstado("reposo")
  }, [conversando])

  // Audio: el primer toque en cualquier parte de la página habilita su voz.
  useEffect(() => {
    const habilitar = () => {
      if (!audioCtx.current || audioCtx.current.state === "closed") audioCtx.current = new AudioContext()
      void audioCtx.current.resume()
    }
    window.addEventListener("pointerdown", habilitar, { once: true })
    return () => window.removeEventListener("pointerdown", habilitar)
  }, [])

  // Vuelo: un resorte hacia `meta`; la velocidad la inclina en 3D.
  useEffect(() => {
    let raf = 0
    const paso = () => {
      const p = pos.current
      const v = vel.current
      if (!arrastre.current) {
        v.x = (v.x + (meta.current.x - p.x) * 0.035) * 0.84
        v.y = (v.y + (meta.current.y - p.y) * 0.035) * 0.84
        p.x += v.x
        p.y += v.y
      }
      if (caja.current) caja.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    const alCambiar = () => {
      meta.current.x = Math.min(meta.current.x, innerWidth - ANCHO - MARGEN)
      meta.current.y = Math.min(meta.current.y, innerHeight - ALTO - MARGEN)
    }
    window.addEventListener("resize", alCambiar)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", alCambiar)
    }
  }, [ANCHO, ALTO])

  const volarA = useCallback(
    (x: number, y: number) => {
      meta.current = {
        x: Math.max(MARGEN, Math.min(innerWidth - ANCHO - MARGEN, x)),
        y: Math.max(MARGEN, Math.min(innerHeight - ALTO - MARGEN, y)),
      }
    },
    [ANCHO, ALTO],
  )

  // Paseo: si nadie la ocupa, cambia de lugar por los bordes (no tapa el centro).
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let t: ReturnType<typeof setTimeout>
    const pasear = () => {
      const libre = !ocupada.current && !abiertaRef.current && !conversandoRef.current && Date.now() > anclada.current
      if (libre) {
        const zonas = [
          [innerWidth - ANCHO - MARGEN, innerHeight * (0.3 + Math.random() * 0.4)],
          [innerWidth * (0.55 + Math.random() * 0.3), innerHeight - ALTO - MARGEN],
          [MARGEN, innerHeight * (0.45 + Math.random() * 0.3)],
          [innerWidth * (0.1 + Math.random() * 0.3), innerHeight - ALTO - MARGEN],
        ]
        const [x, y] = zonas[Math.random() < 0.6 ? Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2)]
        volarA(x, y)
      }
      t = setTimeout(pasear, PASEO_MS[0] + Math.random() * (PASEO_MS[1] - PASEO_MS[0]))
    }
    t = setTimeout(pasear, PASEO_MS[0])
    return () => clearTimeout(t)
  }, [volarA])

  const mostrar = (t: string) => {
    clearTimeout(ocultarGlobo.current)
    setGlobo(t)
  }
  const soltarGlobo = () => {
    clearTimeout(ocultarGlobo.current)
    ocultarGlobo.current = setTimeout(() => !abiertaRef.current && setGlobo(""), GLOBO_MS)
  }
  const quitarFoco = () => {
    foco.current?.classList.remove("eva-foco")
    foco.current = null
  }

  /** Dice una frase hecha: con voz si ya puede sonar, si no solo el globo. */
  const hablar = useCallback(async (frase: string, chiste: boolean) => {
    ocupada.current = true
    usarAsistente("educational")
    setEstado("hablando")
    const ctx = audioCtx.current
    if (silencioRef.current || !ctx || ctx.state !== "running") {
      mostrar(frase)
      await esperar(Math.min(9000, 1800 + frase.length * 55))
    } else {
      mostrar("")
      const corte = new AbortController()
      habla.current = corte
      const cola = crearColaDeVoz({ ctx, asistente: "educational", alHablar: mostrar, alNivel: (v) => (nivel.current = v), alEmpezar: () => {} })
      try {
        await decir(frase, (e) => e.t === "frase" && cola.agregar(e), corte.signal)
        await cola.terminada()
      } catch {
        if (!corte.signal.aborted) mostrar(frase)
      } finally {
        cola.cerrar()
        nivel.current = 0
      }
      if (!corte.signal.aborted) mostrar(frase)
    }
    // Remate: un guiño de luz si fue un chiste.
    if (chiste) {
      setEstado("bromeando")
      await esperar(1200)
    }
    setEstado("reposo")
    ocupada.current = false
    soltarGlobo()
  }, [])

  /** Un comentario propio: vuela a su parte, la marca y lo dice. */
  const comentar = useCallback(
    async (c: Comentario, peligro: boolean) => {
      ultimo.current = Date.now()
      if (!c.repetible) anotarDicha(c.id)
      const el = c.selector ? [...document.querySelectorAll(c.selector)].find(aLaVista) : undefined
      if (el) {
        const r = el.getBoundingClientRect()
        const derecha = r.right + ANCHO + 12 < innerWidth
        const izquierda = r.left - ANCHO - 12 > 0
        const x = derecha ? r.right + 8 : izquierda ? r.left - ANCHO - 8 : r.right - ANCHO
        volarA(x, r.top + Math.min(r.height, 260) / 2 - ALTO / 2)
        quitarFoco()
        el.classList.add("eva-foco")
        foco.current = el
        await esperar(700)
      }
      await hablar(peligro && c.serio ? c.serio : c.texto, !peligro)
      quitarFoco()
    },
    [hablar, volarA, ANCHO, ALTO],
  )

  // Al llegar a una pantalla: le dice a la IA dónde estás y, respetando los 90 s, comenta algo de ahí.
  useEffect(() => {
    if (oculta) return
    const g = guionDe(pathname)
    usarPantalla(g.pantalla)
    const intentar = () => {
      if (ocupada.current || abiertaRef.current || conversandoRef.current || document.hidden) return
      if (Date.now() - ultimo.current < COMENTARIO_MS) return
      const peligro = hayPeligro()
      const ya = dichas()
      const elegibles = g.comentarios.filter(
        (c) =>
          (c.repetible || !ya.has(c.id)) &&
          (!peligro || c.serio) &&
          (!c.selector || [...document.querySelectorAll(c.selector)].some(aLaVista)),
      )
      if (!elegibles.length) return
      // El dado: entre los dos primeros que quedan (el orden del guion va de lo general a lo particular).
      void comentar(elegibles[Math.floor(Math.random() * Math.min(2, elegibles.length))], peligro)
    }
    const t0 = setTimeout(intentar, PRIMERO_MS)
    const t = setInterval(intentar, 5000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [pathname, oculta, comentar])

  // Avisos de otras pantallas (simulador, alunizaje): ver EVENTOS en guion.ts.
  useEffect(() => {
    const alAviso = (ev: Event) => {
      const { tipo, texto: propio } = (ev as CustomEvent<AvisoEva>).detail
      const e = EVENTOS[tipo]
      if (!e || conversandoRef.current) return
      const peligro = e.critico || hayPeligro()
      const frase = propio ?? (peligro ? e.serio : e.texto) ?? ""
      if (!frase) return
      if (!e.repetible && dichas().has(tipo)) return
      if (!e.critico && (ocupada.current || Date.now() - ultimo.current < COMENTARIO_MS)) return
      if (e.critico && ocupada.current) habla.current?.abort() // lo crítico pasa adelante
      ultimo.current = Date.now()
      if (!e.repetible) anotarDicha(tipo)
      void hablar(frase, !peligro)
    }
    window.addEventListener(EVENTO_EVA, alAviso)
    return () => window.removeEventListener(EVENTO_EVA, alAviso)
  }, [hablar])

  // Escribirle: responde con la voz en streaming (mismo turno que la voz, desde texto).
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const q = texto.trim()
    if (!q || ocupada.current) return
    setTexto("")
    recordar(q)
    hilo.current = [...hilo.current, { role: "user", content: q }]
    habla.current?.abort()
    ocupada.current = true
    usarAsistente("educational")
    setEstado("pensando")
    mostrar("…")
    const ctx = audioCtx.current
    const conVoz = !silencioRef.current && !!ctx && ctx.state === "running"
    const corte = new AbortController()
    habla.current = corte
    const cola = conVoz
      ? crearColaDeVoz({ ctx, asistente: "educational", alHablar: mostrar, alNivel: (v) => (nivel.current = v), alEmpezar: () => setEstado("hablando") })
      : null
    let escrito = ""
    try {
      await turnoDeVoz(
        hilo.current,
        (e) => {
          if (e.t === "texto") {
            escrito += e.d
            if (!conVoz) {
              setEstado("hablando")
              mostrar(escrito)
            }
          } else if (e.t === "frase") cola?.agregar(e)
          else if (e.t === "fin") escrito = e.respuesta
          else if (e.t === "error") throw new Error(e.msg)
        },
        corte.signal,
      )
      await cola?.terminada()
      hilo.current = [...hilo.current, { role: "assistant", content: escrito }]
      mostrar(escrito)
      setEstado("reposo")
    } catch {
      if (!corte.signal.aborted) {
        mostrar("My antenna lost the signal. Try again in a moment.")
        setEstado("cansada")
        await esperar(2500)
      }
      setEstado("reposo")
    } finally {
      cola?.cerrar()
      nivel.current = 0
      ocupada.current = false
    }
  }

  // Arrastrarla; un toque sin arrastre abre o cierra el panel.
  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { dx: e.clientX - pos.current.x, dy: e.clientY - pos.current.y, x0: e.clientX, y0: e.clientY, movio: false }
  }
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current
    if (!a) return
    if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 6) a.movio = true
    if (!a.movio) return
    const x = Math.max(0, Math.min(innerWidth - ANCHO, e.clientX - a.dx))
    const y = Math.max(0, Math.min(innerHeight - ALTO, e.clientY - a.dy))
    vel.current = { x: x - pos.current.x, y: y - pos.current.y }
    pos.current = { x, y }
    meta.current = { x, y }
  }
  const alSoltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a) return
    if (a.movio) anclada.current = Date.now() + ANCLA_MS
    else {
      setAbierta((v) => !v)
      if (globo) clearTimeout(ocultarGlobo.current)
    }
  }

  if (oculta) return null

  const aLaDerecha = pos.current.x < innerWidth / 2 // el globo y el panel van hacia el lado con más espacio
  return (
    <div
      ref={caja}
      className={`eva-caja${aLaDerecha ? " eva-caja--derecha" : ""}`}
      style={{ width: ANCHO, height: ALTO }}
      data-estado={estado}
    >
      <div
        className="eva-cuerpo"
        role="button"
        tabIndex={0}
        aria-label={abierta ? "Close EVA" : "EVA, your guide. Tap to talk"}
        aria-expanded={abierta}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAbierta((v) => !v)}
      >
        <Suspense fallback={null}>
          <EvaLienzo estado={estado} nivel={nivel} velocidad={vel} />
        </Suspense>
      </div>

      {globo && !abierta && (
        <p className="eva-globo" aria-live="polite">
          {globo}
        </p>
      )}

      {abierta && (
        <div className="eva-panel" role="dialog" aria-label="Talk to EVA">
          <header className="eva-panel__cabeza">
            <span className="eva-panel__nombre">EVA · your guide</span>
            <button
              type="button"
              className="eva-panel__icono"
              aria-pressed={silencio}
              title={silencio ? "Turn my voice on" : "Mute my voice"}
              onClick={() => {
                escribir(SILENCIO, silencio ? "0" : "1")
                setSilencio(!silencio)
                if (!silencio) habla.current?.abort()
              }}
            >
              {silencio ? "Voice off" : "Voice on"}
            </button>
            <button type="button" className="eva-panel__icono" onClick={() => setAbierta(false)} aria-label="Close">
              ×
            </button>
          </header>
          {globo && <p className="eva-panel__respuesta" aria-live="polite">{globo}</p>}
          {voz.error && <p className="eva-panel__error">{voz.error}</p>}
          <form className="eva-panel__form" onSubmit={enviar}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ask me anything…"
              aria-label="Your question for EVA"
              autoFocus
            />
            <button type="submit" disabled={!texto.trim()}>
              Ask
            </button>
          </form>
          <div className="eva-panel__acciones">
            <button
              type="button"
              className={conversando ? "eva-boton eva-boton--activo" : "eva-boton"}
              onClick={() => (conversando ? voz.terminar() : voz.tocar())}
            >
              {conversando ? "Stop talking" : "Talk by voice"}
            </button>
            <button
              type="button"
              className="eva-boton eva-boton--suave"
              onClick={() => {
                escribir(DICHAS, "[]")
                ultimo.current = 0
                setAbierta(false)
              }}
            >
              Replay tips
            </button>
            <button
              type="button"
              className="eva-boton eva-boton--suave"
              title="I keep your name and recent questions in this browser only"
              onClick={() => {
                olvidar()
                hilo.current = []
                mostrar("Done. I forgot everything. Who are you again?")
              }}
            >
              Forget me
            </button>
          </div>
          <p className="eva-panel__nota">Synthetic voice. EVA can be wrong; figures come from the planner.</p>
        </div>
      )}
    </div>
  )
}
