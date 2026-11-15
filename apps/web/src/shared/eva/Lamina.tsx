// Lámina del modelo 3D de EVA para iterar su diseño. Solo desarrollo: `npm run dev` y abrir /eva.html
// (no entra al build). Parámetros:
//   ?hoja=estados   (por defecto) todos los estados sobre papel y sobre noche
//        =visores   las formas de visor y la luz alternativa
//        =tira      transiciones cuadro a cuadro (de un estado a otro, y el encendido)
//        =chica     al tamaño real de la app: 168×210 y 120×150
//        =retrato   una sola, grande, para ver materiales (&estado=reposo)
//        =vivo      una sola, viva, con botones para cambiar de estado y de visor
//   &giro=0.55      gira el modelo (radianes) para verla de tres cuartos
//   &foto=1         poses fijas (sin parpadeos ni miradas): capturas repetibles
//   &dpr=1          densidad de píxeles del lienzo (por defecto 2): para ver cómo queda en pantallas comunes
//   &estados=a,b    solo esos estados (hoja estados)
//   &filas=0,3      solo esas filas (hoja tira)
import { PerspectiveCamera, View } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { StrictMode, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { NeutralToneMapping } from "three"
import { crearAnimacion, ESTADOS, type AnimacionEva, type EntradaEva, type EstadoEva } from "./animacion"
import EvaLienzo from "./EvaLienzo"
import { CAMARA_EVA, EvaModelo, type VisorEva } from "./EvaModelo"

const PAPEL = "#F4EFE6"
const NOCHE = "#04050A"
const q = new URLSearchParams(location.search)
const hoja = q.get("hoja") ?? "estados"
const giro = Number(q.get("giro") ?? 0)
const foto = q.get("foto") === "1"
const dpr = Number(q.get("dpr") ?? 2)
const DT = 1 / 60
const entrada = (estado: EstadoEva, nivel = 0.7): EntradaEva => ({ estado, nivel, vx: 0, vy: 0 })

/** Una animación llevada hasta una pose y congelada ahí. */
function congelada(pasos: (a: AnimacionEva) => void, encendido = false) {
  const a = crearAnimacion({ semilla: 5, vida: false, encendido })
  pasos(a)
  a.pausa = true
  return a
}
const correr = (a: AnimacionEva, e: EntradaEva, segundos: number) => {
  for (let i = 0; i < Math.round(segundos / DT); i++) a.paso(DT, e)
}

type DatosCelda = {
  estado: EstadoEva
  fondo: string
  rotulo?: string
  visor?: VisorEva
  luz?: string
  alto?: number
  ancho?: number
  /** Prepara la pose (si no, la del estado tras unos segundos, o viva sin &foto=1). */
  pose?: () => AnimacionEva
}

function Celda({ estado, fondo, rotulo, visor, luz, alto = 250, ancho, pose }: DatosCelda) {
  const nivel = useRef(0.7)
  const anim = useMemo(
    () => (pose ? pose() : foto ? congelada((a) => correr(a, entrada(estado), 4)) : crearAnimacion({ semilla: 5 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    if (foto || pose) return
    const id = setInterval(() => (nivel.current = estado === "hablando" || estado === "alerta" ? 0.3 + 0.7 * Math.random() : 0), 110)
    return () => clearInterval(id)
  }, [estado, pose])
  const rotuloCss: CSSProperties = {
    font: "500 12px/1 'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: ".08em",
    textTransform: "uppercase",
    textAlign: "center",
    padding: "0 0 12px",
    color: fondo === NOCHE ? "#C9C1B6" : "#111",
  }
  return (
    <figure style={{ margin: 0, background: fondo, width: ancho }}>
      <View style={{ height: alto }}>
        <PerspectiveCamera makeDefault fov={CAMARA_EVA.fov} position={[...CAMARA_EVA.position]} rotation={[...CAMARA_EVA.rotation]} />
        <group rotation={[0, giro, 0]}>
          <EvaModelo estado={estado} nivel={nivel} visor={visor} luz={luz} animacion={anim} />
        </group>
      </View>
      <figcaption style={rotuloCss}>{rotulo ?? estado}</figcaption>
    </figure>
  )
}

/** Todas las celdas comparten un solo lienzo (un solo contexto WebGL), repartido con View de drei. */
function Hoja({ columnas, ancho = 1800, children }: { columnas: number | string; ancho?: number; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null!)
  return (
    <div ref={caja} style={{ position: "relative", display: "grid", gridTemplateColumns: typeof columnas === "number" ? `repeat(${columnas}, 1fr)` : columnas, width: ancho }}>
      {children}
      <Canvas
        eventSource={caja}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
        dpr={dpr}
      >
        <View.Port />
      </Canvas>
    </div>
  )
}

function HojaEstados() {
  const pedidos = q.get("estados")?.split(",") as EstadoEva[] | undefined
  const estados = pedidos?.filter((e) => ESTADOS.includes(e)) ?? ESTADOS
  const alto = Math.min(330, Math.round((1800 / estados.length) * 1.2))
  return (
    <Hoja columnas={estados.length}>
      {[PAPEL, NOCHE].flatMap((fondo) => estados.map((e) => <Celda key={fondo + e} estado={e} fondo={fondo} alto={alto} />))}
    </Hoja>
  )
}

function HojaVisores() {
  const visores: { visor: VisorEva; luz?: string; rotulo: string }[] = [
    { visor: "domo", rotulo: "domo (referencia)" },
    { visor: "ovalo", rotulo: "óvalo (el de antes)" },
    { visor: "ventana", rotulo: "ventana" },
    { visor: "banda", rotulo: "banda" },
    { visor: "domo", luz: "#6FE6DC", rotulo: "domo · luz turquesa" },
  ]
  const estado = (q.get("estado") as EstadoEva) ?? "reposo"
  return (
    <Hoja columnas={visores.length}>
      {[PAPEL, NOCHE].flatMap((fondo) => visores.map((v) => <Celda key={fondo + v.rotulo} estado={estado} fondo={fondo} alto={330} {...v} />))}
    </Hoja>
  )
}

function HojaTira() {
  const cambio = (de: EstadoEva, a: EstadoEva, tiempos: number[]) => ({
    titulo: `${de} → ${a}`,
    cuadros: tiempos.map((t) => ({
      estado: a,
      rotulo: `${Math.round(t * 1000)} ms`,
      pose: () =>
        congelada((an) => {
          correr(an, entrada(de), 3)
          correr(an, entrada(a), t)
        }),
    })),
  })
  const T = [0, 0.05, 0.1, 0.17, 0.25, 0.4, 0.65, 1.1]
  const filas = [
    cambio("reposo", "hablando", T),
    cambio("hablando", "reposo", T),
    cambio("reposo", "bromeando", T),
    cambio("reposo", "pensando", T),
    cambio("reposo", "sorpresa", T),
    cambio("reposo", "cansada", [0, 0.15, 0.3, 0.6, 1, 1.6, 2.4, 3.6]),
    cambio("cansada", "reposo", [0, 0.1, 0.2, 0.35, 0.55, 0.8, 1.2, 2]),
    {
      titulo: "encendido",
      cuadros: [0.05, 0.2, 0.32, 0.45, 0.6, 0.8, 1.05, 1.6].map((t) => ({
        estado: "reposo" as EstadoEva,
        rotulo: `${Math.round(t * 1000)} ms`,
        pose: () => congelada((an) => correr(an, entrada("reposo"), t), true),
      })),
    },
  ]
  const pedidas = q.get("filas")?.split(",").map(Number)
  const elegidas = pedidas ? filas.filter((_, i) => pedidas.includes(i)) : filas
  return (
    <Hoja columnas="110px repeat(8, 1fr)">
      {elegidas.flatMap((f, i) => {
        const fondo = i % 2 ? NOCHE : PAPEL
        return [
          <div key={f.titulo} style={{ background: fondo, color: fondo === NOCHE ? "#C9C1B6" : "#111", font: "600 12px/1.4 ui-monospace, monospace", padding: 12, display: "flex", alignItems: "center" }}>
            {f.titulo}
          </div>,
          ...f.cuadros.map((c) => <Celda key={f.titulo + c.rotulo} fondo={fondo} alto={210} {...c} />),
        ]
      })}
    </Hoja>
  )
}

function HojaChica() {
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {[
        [168, 210],
        [120, 150],
      ].map(([ancho, alto]) => (
        <Hoja key={ancho} columnas={`repeat(${ESTADOS.length}, ${ancho}px)`} ancho={ancho * ESTADOS.length}>
          {[PAPEL, NOCHE].flatMap((fondo) => ESTADOS.map((e) => <Celda key={fondo + e} estado={e} fondo={fondo} alto={alto} ancho={ancho} />))}
        </Hoja>
      ))}
    </div>
  )
}

function HojaRetrato() {
  const estado = (q.get("estado") as EstadoEva) ?? "reposo"
  const visor = (q.get("visor") as VisorEva) ?? undefined
  return (
    <Hoja columnas={2}>
      {[PAPEL, NOCHE].map((fondo) => (
        <Celda key={fondo} estado={estado} fondo={fondo} visor={visor} alto={700} />
      ))}
    </Hoja>
  )
}

function Vivo() {
  const [estado, setEstado] = useState<EstadoEva>("reposo")
  const [visor, setVisor] = useState<VisorEva>("domo")
  const [noche, setNoche] = useState(false)
  const nivel = useRef(0)
  useEffect(() => {
    const id = setInterval(() => (nivel.current = estado === "hablando" || estado === "alerta" ? 0.25 + 0.75 * Math.random() : estado === "escuchando" ? Math.random() * 0.6 : 0), 110)
    return () => clearInterval(id)
  }, [estado])
  const boton = (activo: boolean): CSSProperties => ({
    font: "500 13px/1 ui-monospace, monospace",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #111",
    background: activo ? "#111" : "#F4EFE6",
    color: activo ? "#F4EFE6" : "#111",
    cursor: "pointer",
  })
  return (
    <div style={{ minHeight: "100vh", background: noche ? NOCHE : PAPEL, display: "grid", justifyItems: "center", alignContent: "center", gap: 18, padding: 24 }}>
      <div style={{ display: "flex", gap: 40, alignItems: "end" }}>
        <div style={{ width: 420, height: 525 }}>
          <EvaLienzo estado={estado} nivel={nivel} visor={visor} />
        </div>
        <div style={{ width: 168, height: 210 }}>
          <EvaLienzo estado={estado} nivel={nivel} visor={visor} />
        </div>
        <div style={{ width: 120, height: 150 }}>
          <EvaLienzo estado={estado} nivel={nivel} visor={visor} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 760 }}>
        {ESTADOS.map((e) => (
          <button key={e} type="button" style={boton(e === estado)} onClick={() => setEstado(e)}>
            {e}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {(["domo", "ovalo", "ventana", "banda"] as VisorEva[]).map((v) => (
          <button key={v} type="button" style={boton(v === visor)} onClick={() => setVisor(v)}>
            visor {v}
          </button>
        ))}
        <button type="button" style={boton(noche)} onClick={() => setNoche((n) => !n)}>
          fondo noche
        </button>
      </div>
      <p style={{ margin: 0, font: "12px/1.5 ui-monospace, monospace", color: noche ? "#C9C1B6" : "#111", textAlign: "center" }}>
        Mueve el puntero: lo sigue con la mirada. Mantén apretado sobre ella y arrastra: se sobresalta.
      </p>
    </div>
  )
}

const HOJAS: Record<string, () => ReactNode> = { estados: HojaEstados, visores: HojaVisores, tira: HojaTira, chica: HojaChica, retrato: HojaRetrato, vivo: Vivo }
const Elegida = HOJAS[hoja] ?? HojaEstados

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Elegida />
  </StrictMode>,
)
