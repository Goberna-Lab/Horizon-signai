import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { useLocation, useNavigate } from "react-router"
import { routes } from "@/app/routes"
import { EVENTO_EVA, type AvisoEva, type EstadoEva } from "@/shared/eva"
import { decir, turnoDeVoz, usarAsistente, usarIdioma, usarPantalla, type Mensaje } from "@/prueba-ia/cliente"
import { crearColaDeVoz } from "@/prueba-ia/colaDeVoz"
import { olvidar, recordar, recordarNombre, recuerdos } from "@/prueba-ia/memoria"
import { useVoz } from "@/prueba-ia/useVoz"
import { EVENTOS, fraseDe, guionDe, hayPeligro, marco, paginaDelMarco, TEXTOS, type Comentario } from "./guion"
import { detectarIdioma, nombreDe, type Idioma } from "./idioma"
import "./eva.css"

const EvaLienzo = lazy(() => import("@/shared/eva/EvaLienzo"))

const COMENTARIO_MS = 90_000 // como mucho un comentario propio cada 90 s
const LECCION_MS = 3500 // en la lección, la pausa entre una parte y la siguiente
const PRIMERO_MS = 2500 // espera al llegar a una pantalla antes del primero
const PASEO_MS = [9000, 15000] // cada cuánto cambia de lugar si nadie la ocupa
const ANCLA_MS = 30_000 // si la arrastras, se queda ahí este tiempo
const GLOBO_MS = 6000 // el globo queda a la vista tras terminar de hablar
const CARGA_MS = 2600 // lo que tarda en encenderse y cargarse antes de saludar
const PREGUNTA_MS = 45_000 // si nadie contesta su pregunta, la retira
const DICHAS = "horizon-signai.eva.dichas.v1"
const SILENCIO = "horizon-signai.eva.silencio.v1"
const IDIOMA = "horizon-signai.eva.idioma.v1"
const SALUDO = "horizon-signai.eva.saludo.v1" // en sessionStorage: saluda una vez por visita
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
const yaSaludo = () => {
  try {
    return sessionStorage.getItem(SALUDO) === "1"
  } catch {
    return false
  }
}
const anotarSaludo = () => {
  try {
    sessionStorage.setItem(SALUDO, "1")
  } catch {
    /* sin almacenamiento: saludará de nuevo */
  }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Dónde está un elemento en la ventana, aunque viva dentro de la pantalla incrustada (el iframe del Planificador). */
const rectDe = (el: Element) => {
  const r = el.getBoundingClientRect()
  const m = el.ownerDocument.defaultView?.frameElement?.getBoundingClientRect()
  return m ? new DOMRect(r.left + m.left, r.top + m.top, r.width, r.height) : r
}
const aLaVista = (el: Element) => {
  const r = rectDe(el)
  return r.width > 0 && r.bottom > 60 && r.top < innerHeight - 60 && r.right > 0 && r.left < innerWidth
}
/** Las cuatro esquinas que encierran lo que EVA apunta (el trazo del cerco). */
const esquinas = (r: DOMRect) => {
  const x0 = r.left - 6
  const y0 = r.top - 6
  const x1 = r.right + 6
  const y1 = r.bottom + 6
  const l = Math.max(8, Math.min(20, r.width / 3, r.height / 3))
  return `M${x0},${y0 + l}V${y0}H${x0 + l}M${x1 - l},${y0}H${x1}V${y0 + l}M${x1},${y1 - l}V${y1}H${x1 - l}M${x0 + l},${y1}H${x0}V${y1 - l}`
}

/**
 * EVA, la robot guía, encima de toda la app (montada en el layout raíz).
 *
 * - Empieza apagada (plomo oscuro, difuminada). Cuando sale el Sol en la landing se enciende y se carga; luego
 *   saluda, pregunta el nombre y ofrece enseñar a planificar una misión. Si aceptan, lleva al Planificador y
 *   lo recorre parte por parte (la lección).
 * - Vuela por la pantalla, va a la parte de la que habla y la apunta con su rayo; te habla con su voz
 *   (Kokoro «af_bella» + entonación y timbre de personajes.ts) y al tocarla abre un panel para escribirle o
 *   conversar por voz. Recuerda lo que le cuentas (memoria.ts).
 * - Si le escriben en español hace como que se reconfigura y sigue en español (idioma.ts).
 *
 * Reglas de comportamiento y todo lo que dice: guion.ts. Sin voz hasta el primer toque en la página (los
 * navegadores no dejan sonar audio antes): mientras tanto, solo el globo.
 */
export default function EvaCompanera() {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const oculta = pathname.startsWith("/prueba-ia") // tiene su propia pantalla de voz
  const ruta = useRef(pathname)
  ruta.current = pathname

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
  const dormida = useRef(true) // apagada hasta que sale el Sol (o la tocan)
  const ocupada = useRef(true) // apagada no pasea ni comenta
  const habla = useRef<AbortController | null>(null)
  const ultimo = useRef(0)
  const finHabla = useRef(0)
  const leccion = useRef(false) // está dando la lección del Planificador
  const dichasLeccion = useRef(new Set<string>())
  const audioCtx = useRef<AudioContext | null>(null)
  const hilo = useRef<Mensaje[]>([])
  const ocultarGlobo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const esperaPregunta = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // El rayo: a qué apunta, hacia dónde mira el modelo y los trazos que se mueven en cada cuadro.
  const foco = useRef<Element | null>(null)
  const mirar = useRef<{ x: number; y: number } | null>(null)
  const punteria = useRef({ x: 0, y: 0 })
  const haz = useRef<SVGLineElement>(null)
  const halo = useRef<SVGLineElement>(null)
  const punta = useRef<SVGCircleElement>(null)
  const cerco = useRef<SVGPathElement>(null)

  const [estado, setEstado] = useState<EstadoEva>("apagada")
  const [globo, setGlobo] = useState("")
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState("")
  const [silencio, setSilencio] = useState(() => leer(SILENCIO) === "1")
  const [idioma, setIdioma] = useState<Idioma>(() => (leer(IDIOMA) === "es" ? "es" : "en"))
  const [pregunta, setPregunta] = useState<"nombre" | "oferta" | null>(null)
  const [nombre, setNombre] = useState("")
  const [apuntando, setApuntando] = useState(false)
  const abiertaRef = useRef(abierta)
  abiertaRef.current = abierta
  const silencioRef = useRef(silencio)
  silencioRef.current = silencio
  const idiomaRef = useRef(idioma)
  const T = TEXTOS[idioma]

  const fijarIdioma = (i: Idioma) => {
    idiomaRef.current = i
    setIdioma(i)
    usarIdioma(i)
    escribir(IDIOMA, i)
  }
  useEffect(() => usarIdioma(idiomaRef.current), [])

  // Conversación por voz con micrófono abierto (la misma de /prueba-ia), como EVA.
  const voz = useVoz({
    asistente: "educational",
    historial: () => hilo.current,
    alMensaje: (m) => {
      hilo.current = [...hilo.current, m]
      if (m.role !== "user") return
      recordar(m.content)
      // Por voz cambia de idioma sin ceremonia: el turno ya está en marcha.
      const i = detectarIdioma(m.content)
      if (i && i !== idiomaRef.current) fijarIdioma(i)
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
    if (!conversando && !dormida.current) setEstado("reposo")
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

  // Vuelo: un resorte hacia `meta`; la velocidad la inclina en 3D. En el mismo cuadro se mueve el rayo.
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
      // El rayo sale de su visor y llega al punto más cercano de lo que apunta; el modelo mira hacia allá.
      const el = foco.current
      if (el && haz.current && halo.current && punta.current && cerco.current) {
        const r = rectDe(el)
        const ex = p.x + ANCHO * 0.5
        const ey = p.y + ALTO * 0.4
        const tx = Math.max(r.left, Math.min(r.right, ex))
        const ty = Math.max(r.top, Math.min(r.bottom, ey))
        for (const linea of [haz.current, halo.current]) {
          linea.setAttribute("x1", ex.toFixed(1))
          linea.setAttribute("y1", ey.toFixed(1))
          linea.setAttribute("x2", tx.toFixed(1))
          linea.setAttribute("y2", ty.toFixed(1))
        }
        punta.current.setAttribute("cx", tx.toFixed(1))
        punta.current.setAttribute("cy", ty.toFixed(1))
        cerco.current.setAttribute("d", esquinas(r))
        const d = Math.hypot(tx - ex, ty - ey)
        const k = Math.min(1, d / 260) / Math.max(d, 1)
        punteria.current.x = (tx - ex) * k
        punteria.current.y = -(ty - ey) * k
        mirar.current = punteria.current
      } else mirar.current = null
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
    foco.current = null
    setApuntando(false)
  }

  /**
   * Dice una frase hecha: con voz si ya puede sonar, si no solo el globo. `grave`: es un aviso, lo dice con
   * cara de alerta (ojos estrechos y marcas rojas). `remate`: la cara con la que cierra, un guiño tras un
   * chiste o los ojos contentos tras algo que salió bien.
   */
  const hablar = useCallback(async (frase: string, remate: "bromeando" | "alegre" | null, grave = false) => {
    ocupada.current = true
    usarAsistente("educational")
    setEstado(grave ? "alerta" : "hablando")
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
    if (remate) {
      setEstado(remate)
      await esperar(1200)
    }
    setEstado("reposo")
    ocupada.current = false
    finHabla.current = Date.now()
    soltarGlobo()
  }, [])

  /** Va hasta una parte de la pantalla y le dispara el rayo: queda al lado, con sitio para que el rayo se vea. */
  const irA = useCallback(
    async (el: Element) => {
      const r = rectDe(el)
      const derecha = r.right + ANCHO + 60 < innerWidth
      const izquierda = r.left - ANCHO - 60 > 0
      const x = derecha ? r.right + 48 : izquierda ? r.left - ANCHO - 48 : r.right - ANCHO
      volarA(x, r.top + Math.min(r.height, 260) / 2 - ALTO / 2)
      await esperar(650)
      foco.current = el
      setApuntando(true)
      await esperar(350)
    },
    [volarA, ANCHO, ALTO],
  )

  /** Un comentario propio: vuela a su parte, la apunta y lo dice. `raiz`: dónde buscar esa parte (la página o la pantalla incrustada). */
  const comentar = useCallback(
    async (c: Comentario, peligro: boolean, raiz: Document | null) => {
      const frase = fraseDe(c, peligro, idiomaRef.current)
      if (!frase) return
      ultimo.current = Date.now()
      ocupada.current = true
      if (!c.repetible) anotarDicha(c.id)
      const el = c.selector ? [...(raiz?.querySelectorAll(c.selector) ?? [])].find(aLaVista) : undefined
      if (el) await irA(el)
      await hablar(frase, peligro ? null : "bromeando", peligro)
      quitarFoco()
    },
    [hablar, irA],
  )

  // En cada pantalla: le dice a la IA dónde estás y comenta algo de ahí. Fuera de la lección respeta los 90 s
  // y un dado; en la lección va parte por parte, en orden, con una pausa corta.
  useEffect(() => {
    if (oculta) return
    usarPantalla(guionDe(pathname, paginaDelMarco()).pantalla)
    const intentar = () => {
      // El guion se elige en cada intento: dentro de /planner la página del prototipo cambia sin que cambie la ruta.
      const g = guionDe(pathname, paginaDelMarco())
      usarPantalla(g.pantalla)
      if (ocupada.current || abiertaRef.current || conversandoRef.current || document.hidden) return
      const enLeccion = leccion.current && !!g.enMarco
      if (enLeccion ? Date.now() - finHabla.current < LECCION_MS : Date.now() - ultimo.current < COMENTARIO_MS) return
      const peligro = hayPeligro()
      const ya = dichas()
      const raiz = g.enMarco ? marco() : document
      const elegibles = g.comentarios.filter(
        (c) =>
          (enLeccion ? !dichasLeccion.current.has(c.id) : c.repetible || !ya.has(c.id)) &&
          (!peligro || c.serio) &&
          (!c.selector || [...(raiz?.querySelectorAll(c.selector) ?? [])].some(aLaVista)),
      )
      if (!elegibles.length) return
      // El dado: entre los dos primeros que quedan (el orden del guion va de lo general a lo particular).
      const elegido = elegibles[enLeccion ? 0 : Math.floor(Math.random() * Math.min(2, elegibles.length))]
      if (enLeccion) dichasLeccion.current.add(elegido.id)
      void comentar(elegido, peligro, raiz)
    }
    const t0 = setTimeout(intentar, PRIMERO_MS)
    const t = setInterval(intentar, 5000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [pathname, oculta, comentar])

  // Avisos de otras pantallas (simulador, alunizaje): ver EVENTOS en guion.ts. Y `enfocarEva`: resaltar algo.
  useEffect(() => {
    const alAviso = (ev: Event) => {
      const { tipo, texto: propio, selector } = (ev as CustomEvent<AvisoEva>).detail
      if (dormida.current || conversandoRef.current) return
      if (tipo === "enfocar") {
        if (!selector || ocupada.current) return
        const el = [...document.querySelectorAll(selector), ...(marco()?.querySelectorAll(selector) ?? [])].find(aLaVista)
        if (!el) return
        ultimo.current = Date.now()
        ocupada.current = true
        void (async () => {
          await irA(el)
          if (propio) await hablar(propio, null)
          else {
            await esperar(4000)
            ocupada.current = false
          }
          quitarFoco()
        })()
        return
      }
      const e = EVENTOS[tipo]
      if (!e) return
      const peligro = e.critico || hayPeligro()
      const frase = propio ?? fraseDe(e, peligro, idiomaRef.current) ?? ""
      if (!frase) return
      if (!e.repetible && dichas().has(tipo)) return
      if (!e.critico && (ocupada.current || Date.now() - ultimo.current < COMENTARIO_MS)) return
      if (e.critico && ocupada.current) habla.current?.abort() // lo crítico pasa adelante
      ultimo.current = Date.now()
      if (!e.repetible) anotarDicha(tipo)
      void hablar(frase, peligro ? null : e.festejo ? "alegre" : "bromeando", peligro)
    }
    window.addEventListener(EVENTO_EVA, alAviso)
    return () => window.removeEventListener(EVENTO_EVA, alAviso)
  }, [hablar, irA])

  /** Le hablaron en otro idioma: hace como que se reconfigura (el visor repasa, los corchetes buscan) y sigue en ese idioma. */
  const reconfigurar = useCallback(
    async (nuevo: Idioma) => {
      const antes = idiomaRef.current
      if (nuevo === antes) return
      habla.current?.abort()
      ocupada.current = true
      setEstado("pensando")
      mostrar(TEXTOS[antes].detectado)
      await esperar(1700)
      fijarIdioma(nuevo)
      await hablar(TEXTOS[nuevo].listo, null)
    },
    [hablar],
  )

  /** Hace una pregunta y deja el globo abierto con su respuesta (un campo o dos botones). */
  const preguntar = useCallback(
    async (frase: string, tipo: "nombre" | "oferta") => {
      await hablar(frase, null)
      ocupada.current = true // la pregunta sigue abierta: ni pasea ni comenta
      clearTimeout(ocultarGlobo.current)
      setGlobo(frase)
      setPregunta(tipo)
      clearTimeout(esperaPregunta.current)
      esperaPregunta.current = setTimeout(() => {
        setPregunta(null)
        ocupada.current = false
        soltarGlobo()
      }, PREGUNTA_MS)
    },
    [hablar],
  )

  /** Se enciende y se carga (lo hace el modelo al salir de «apagada») y, en la landing, saluda. */
  const despertar = useCallback(async () => {
    if (!dormida.current) return
    dormida.current = false
    setEstado("reposo")
    await esperar(CARGA_MS)
    if (ruta.current !== routes.landing || yaSaludo() || abiertaRef.current || conversandoRef.current) {
      ocupada.current = false
      return
    }
    anotarSaludo()
    const t = TEXTOS[idiomaRef.current]
    const conocido = recuerdos().nombre
    await preguntar(conocido ? t.deNuevo(conocido) : t.hola, conocido ? "oferta" : "nombre")
  }, [preguntar])

  // Apagada hasta que sale el Sol. En la landing, el Sol es el disco que sube por detrás de la cresta
  // (features/landing/flight: `.fl-limb__sun`, animación `fl-sun-up`, que arranca con retraso): se mira cuándo
  // empieza de verdad. En las demás pantallas, o si no hay animación, se enciende sola al poco rato.
  useEffect(() => {
    if (oculta || !dormida.current) return
    const t0 = performance.now()
    const id = setInterval(() => {
      const ms = performance.now() - t0
      const sol = document.querySelector(".fl-limb__sun")
      let salio: boolean
      if (sol) {
        const animaciones = sol.getAnimations?.() ?? []
        salio = animaciones.length
          ? animaciones.some((a) => a.playState === "finished" || Number(a.currentTime ?? 0) >= Number(a.effect?.getTiming().delay ?? 0))
          : ms > 1500
      } else salio = ms > (ruta.current === routes.landing ? 5000 : 900)
      if (salio || ms > 14_000) {
        clearInterval(id)
        void despertar()
      }
    }, 200)
    return () => clearInterval(id)
  }, [oculta, despertar])

  const cerrarPregunta = () => {
    setPregunta(null)
    clearTimeout(esperaPregunta.current)
  }
  /** Contestaron el nombre (o lo saltaron). Si se presentaron en español, primero se reconfigura. */
  const alNombre = async (ev?: FormEvent) => {
    ev?.preventDefault()
    const crudo = nombre.trim()
    setNombre("")
    cerrarPregunta()
    const n = nombreDe(crudo)
    if (n) recordarNombre(n)
    const i = detectarIdioma(crudo)
    if (i && i !== idiomaRef.current) await reconfigurar(i)
    await preguntar(TEXTOS[idiomaRef.current].oferta(n), "oferta")
  }
  /** ¿Quieres aprender a planificar una misión? Sí: va al Planificador y empieza la lección. */
  const alOferta = async (si: boolean) => {
    cerrarPregunta()
    const t = TEXTOS[idiomaRef.current]
    if (!si) {
      await hablar(t.luego, null)
      return
    }
    leccion.current = true
    dichasLeccion.current.clear()
    void navegar(routes.lunarMap)
    await hablar(t.leccion, null)
  }

  // Escribirle: responde con la voz en streaming (mismo turno que la voz, desde texto).
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const q = texto.trim()
    if (!q || ocupada.current) return
    setTexto("")
    const i = detectarIdioma(q)
    if (i && i !== idiomaRef.current) await reconfigurar(i)
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
        mostrar(TEXTOS[idiomaRef.current].sinSenal)
        setEstado("cansada")
        await esperar(2500)
      }
      setEstado("reposo")
    } finally {
      cola?.cerrar()
      nivel.current = 0
      ocupada.current = false
      finHabla.current = Date.now()
    }
  }

  // Arrastrarla; un toque sin arrastre abre o cierra el panel (o la enciende, si está apagada).
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
  const tocar = () => {
    if (dormida.current) void despertar()
    else {
      setAbierta((v) => !v)
      if (globo) clearTimeout(ocultarGlobo.current)
    }
  }
  const alSoltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a) return
    if (a.movio) anclada.current = Date.now() + ANCLA_MS
    else tocar()
  }

  if (oculta) return null

  const aLaDerecha = pos.current.x < innerWidth / 2 // el globo y el panel van hacia el lado con más espacio
  return (
    <>
      {/* El rayo con el que apunta: sale de su visor, llega a lo que señala y lo encierra con cuatro esquinas. */}
      {apuntando && (
        <svg className="eva-rayo" aria-hidden="true">
          <line ref={halo} className="eva-rayo__halo" />
          <line ref={haz} className="eva-rayo__haz" />
          <circle ref={punta} className="eva-rayo__punta" r="3.5" />
          <path ref={cerco} className="eva-rayo__cerco" />
        </svg>
      )}
      <div ref={caja} className={`eva-caja${aLaDerecha ? " eva-caja--derecha" : ""}`} style={{ width: ANCHO, height: ALTO }} data-estado={estado}>
        <div
          className="eva-cuerpo"
          role="button"
          tabIndex={0}
          aria-label={estado === "apagada" ? T.apagada : abierta ? T.cerrar : T.abrir}
          aria-expanded={abierta}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tocar()}
        >
          <Suspense fallback={null}>
            <EvaLienzo estado={estado} nivel={nivel} velocidad={vel} mirar={mirar} />
          </Suspense>
        </div>

        {globo && !abierta && !pregunta && (
          <p className="eva-globo" aria-live="polite">
            {globo}
          </p>
        )}

        {/* Una pregunta suya: el globo se queda abierto con el campo o los botones para contestar. */}
        {pregunta && !abierta && (
          <div className="eva-globo eva-globo--pregunta">
            <p aria-live="polite">{globo}</p>
            {pregunta === "nombre" ? (
              <form className="eva-pregunta" onSubmit={(e) => void alNombre(e)}>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={T.tuNombre} aria-label={T.tuNombre} maxLength={40} autoComplete="given-name" />
                <button type="submit">{T.ok}</button>
                <button type="button" className="eva-pregunta__suave" onClick={() => void alNombre()}>
                  {T.saltar}
                </button>
              </form>
            ) : (
              <div className="eva-pregunta">
                <button type="button" onClick={() => void alOferta(true)}>
                  {T.si}
                </button>
                <button type="button" className="eva-pregunta__suave" onClick={() => void alOferta(false)}>
                  {T.no}
                </button>
              </div>
            )}
          </div>
        )}

        {abierta && (
          <div className="eva-panel" role="dialog" aria-label={T.panel}>
            <header className="eva-panel__cabeza">
              <span className="eva-panel__nombre">{T.titulo}</span>
              <button type="button" className="eva-panel__icono" onClick={() => void reconfigurar(idioma === "es" ? "en" : "es")}>
                {T.otroIdioma}
              </button>
              <button
                type="button"
                className="eva-panel__icono"
                aria-pressed={silencio}
                title={silencio ? T.vozNoTitulo : T.vozSiTitulo}
                onClick={() => {
                  escribir(SILENCIO, silencio ? "0" : "1")
                  setSilencio(!silencio)
                  if (!silencio) habla.current?.abort()
                }}
              >
                {silencio ? T.vozNo : T.vozSi}
              </button>
              <button type="button" className="eva-panel__icono" onClick={() => setAbierta(false)} aria-label={T.cerrar}>
                ×
              </button>
            </header>
            {globo && <p className="eva-panel__respuesta" aria-live="polite">{globo}</p>}
            {voz.error && <p className="eva-panel__error">{voz.error}</p>}
            <form className="eva-panel__form" onSubmit={(e) => void enviar(e)}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={T.pregunta} aria-label={T.preguntaRotulo} autoFocus />
              <button type="submit" disabled={!texto.trim()}>
                {T.preguntar}
              </button>
            </form>
            <div className="eva-panel__acciones">
              <button type="button" className={conversando ? "eva-boton eva-boton--activo" : "eva-boton"} onClick={() => (conversando ? voz.terminar() : voz.tocar())}>
                {conversando ? T.callar : T.hablar}
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
                {T.repetir}
              </button>
              <button
                type="button"
                className="eva-boton eva-boton--suave"
                title={T.olvidarTitulo}
                onClick={() => {
                  olvidar()
                  hilo.current = []
                  mostrar(T.olvide)
                }}
              >
                {T.olvidar}
              </button>
            </div>
            <p className="eva-panel__nota">{T.nota}</p>
          </div>
        )}
      </div>
    </>
  )
}
