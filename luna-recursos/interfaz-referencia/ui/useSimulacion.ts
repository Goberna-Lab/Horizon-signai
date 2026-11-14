// E26.2–E26.3: estado de la simulación de aterrizaje en la página: el plan (del asistente o de la URL, para sobrevivir al
// cambio de sitio, que recarga la página: E20), la tabla global y la máscara del sitio, el reloj del descenso y lo que la
// escena necesita (estado del cielo y posición del LM).
import { useEffect, useMemo, useState } from 'react'
import type { TablaLuna } from '../engine/efemeridesLuna'
import { prepararSitio } from '../engine/efemeridesLuna'
import { perfilDesde } from '../engine/mascara'
import { estadoGlobal, simularAterrizaje, REQUISITOS_EJEMPLO, type Requisitos } from '../engine/simulacion'
import { posicionEnEscena, PARAMETROS_APOLLO11 } from '../engine/descenso'
import { apoyoLM } from '../engine/evaluacion'
import { alturaSuelo } from '../engine/terreno'
import { SITIO_ACTIVO, type IdSitio } from '../engine/sitio'
import { barrer, ventanas, type PuntoPlan } from '../engine/planificador'
import type { Vuelo } from '../scene/Vuelo'
import { cargarTablaLuna, muestraEn, type PlanSimulacion } from './simulacionComun'
import { LUGARES, obtenerMascara } from './lugares'

const CLAVE_VISTO = 'luna-asistente-visto'

/** Plan leído de la URL (?sim=ms&req=json&mision=texto), si viene y es del sitio activo. */
function planDeUrl(): PlanSimulacion | null {
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search)
  const sim = Number(q.get('sim'))
  if (!q.get('sim') || !Number.isFinite(sim)) return null
  let requisitos: Requisitos = REQUISITOS_EJEMPLO
  try {
    requisitos = { ...REQUISITOS_EJEMPLO, ...JSON.parse(q.get('req') ?? '{}') }
  } catch {
    // URL alterada: requisitos de ejemplo.
  }
  return { mision: q.get('mision') ?? 'Misión', sitio: SITIO_ACTIVO.id, contactoMs: sim, requisitos }
}

/** Abre el plan: si es de otro sitio, recarga la página con ese sitio y el plan en la URL. */
export function abrirPlan(p: PlanSimulacion, alMismoSitio: (p: PlanSimulacion) => void) {
  if (p.sitio === SITIO_ACTIVO.id) {
    alMismoSitio(p)
    const q = new URLSearchParams(location.search)
    q.set('sim', String(p.contactoMs))
    q.set('req', JSON.stringify(p.requisitos))
    q.set('mision', p.mision)
    history.replaceState(null, '', `?${q}`)
    return
  }
  const q = new URLSearchParams({ sitio: p.sitio as IdSitio, sim: String(p.contactoMs), req: JSON.stringify(p.requisitos), mision: p.mision })
  location.search = `?${q}`
}

function primeraVisita(): boolean {
  try {
    return localStorage.getItem(CLAVE_VISTO) === null
  } catch {
    return false
  }
}
export function marcarAsistenteVisto() {
  try {
    localStorage.setItem(CLAVE_VISTO, '1')
  } catch {
    // Sin almacenamiento: el asistente volverá a aparecer; no es grave.
  }
}

export function useSimulacion() {
  const [plan, setPlan] = useState<PlanSimulacion | null>(planDeUrl)
  // Asistente al abrir (E26.2): la primera vez, salvo que la URL ya traiga un plan. Puede abrirse con un plan y un paso.
  const [asistente, setAsistente] = useState<{ plan: PlanSimulacion | null; paso: number } | null>(() => (!plan && primeraVisita() ? { plan: null, paso: 0 } : null))
  // E26.4 (Dynamic Queries, DI p. 455): horas después del contacto que muestra la escena (0 = el descenso manda).
  const [estadiaH, setEstadiaH] = useState(0)
  const [datos, setDatos] = useState<{ tabla: TablaLuna; punto: PuntoPlan } | null>(null)
  const [tau, setTau] = useState(0)
  const [corriendo, setCorriendo] = useState(false)
  const [velocidad, setVelocidad] = useState(10)
  const [persecucion, setPersecucion] = useState(true)

  useEffect(() => {
    if (!plan || datos) return
    let vivo = true
    const lugar = LUGARES.find((l) => l.id === SITIO_ACTIVO.id)!
    Promise.all([cargarTablaLuna(), obtenerMascara(lugar)]).then(([tabla, m]) => {
      if (vivo) setDatos({ tabla, punto: { sitio: prepararSitio(SITIO_ACTIVO.latitudGrados, SITIO_ACTIVO.longitudEsteGrados), perfil: perfilDesde(m, 0) } })
    })
    return () => {
      vivo = false
    }
  }, [plan, datos])

  const sim = useMemo(
    () => (plan && datos ? simularAterrizaje(datos.tabla, datos.punto, plan.contactoMs, plan.requisitos, apoyoLM(0, 0).inclinacionGrados) : null),
    [plan, datos],
  )

  // Reloj del descenso (no del día lunar): τ en segundos desde el encendido.
  useEffect(() => {
    if (!corriendo || !sim) return
    let anterior = performance.now()
    let id = requestAnimationFrame(function paso(ahora) {
      const dt = Math.max(0, ahora - anterior) / 1000
      anterior = ahora
      setTau((x) => {
        const s = x + dt * velocidad
        if (s >= sim.descenso.eventos.contacto) {
          setCorriendo(false)
          return sim.descenso.eventos.contacto
        }
        return s
      })
      id = requestAnimationFrame(paso)
    })
    return () => cancelAnimationFrame(id)
  }, [corriendo, velocidad, sim])

  // E26.4 (Data Brushing): ventanas reales de Sol y Tierra en la estadía, para pintar la pista de su deslizador con la
  // misma paleta que el planificador.
  const ventanasEstadia = useMemo(() => {
    if (!sim || !datos || !plan) return null
    const fin = Math.min(sim.contactoMs + plan.requisitos.diasSuperficie * 86_400_000, datos.tabla.finMs)
    const b = barrer(datos.tabla, datos.punto, sim.contactoMs, fin, 600_000)
    return { inicioMs: sim.contactoMs, finMs: fin, sol: ventanas(b, 'sol'), tierra: ventanas(b, 'tierra') }
  }, [sim, datos, plan])
  const [enfocado, setEnfocado] = useState<string | null>(null)

  const msEscena = sim ? (estadiaH > 0 ? sim.contactoMs + estadiaH * 3_600_000 : sim.encendidoMs + tau * 1000) : 0
  const estado = sim && datos ? estadoGlobal(datos.tabla, datos.punto, msEscena) : null

  // Trayectoria dentro del valle (±30 km): fuera no hay escena; el perfil del panel muestra todo el descenso.
  const trayectoria = useMemo(() => {
    if (!sim) return []
    const base = alturaSuelo(0, 0) - PARAMETROS_APOLLO11.alturaContactoM
    return sim.descenso.muestras
      .filter((s) => Math.abs(s.alcanceM) < 30_000)
      .map((s) => {
        const p = posicionEnEscena(s, sim.rumboGrados)
        return { p: [p[0], p[1] + base, p[2]] as [number, number, number], fase: s.fase }
      })
  }, [sim])

  const vuelo: Vuelo | null = useMemo(() => {
    if (!sim) return null
    const m = muestraEn(sim.descenso.muestras, estadiaH > 0 ? sim.descenso.eventos.contacto : tau)
    const p = posicionEnEscena(m, sim.rumboGrados)
    // La base de las patas toca el suelo en el contacto (sonda a 12 pies, TN tabla I; el LM baja esa altura al apoyarse).
    const y = p[1] + alturaSuelo(0, 0) - PARAMETROS_APOLLO11.alturaContactoM
    return { posicion: [p[0], Math.max(y, alturaSuelo(0, 0)), p[2]], inclinacionGrados: m.inclinacionGrados, rumboGrados: sim.rumboGrados, trayectoria, persecucion }
  }, [sim, tau, trayectoria, persecucion, estadiaH])

  const contacto = sim?.descenso.eventos.contacto ?? 0
  return {
    plan,
    sim,
    estado,
    msEscena,
    vuelo,
    tau,
    setTau: (x: number) => {
      setEnfocado(null)
      setEstadiaH(0)
      setTau(Math.min(Math.max(x, 0), contacto))
    },
    estadiaH,
    setEstadiaH: (h: number) => {
      setEnfocado(null)
      setCorriendo(false)
      setTau(contacto)
      setEstadiaH(Math.max(0, h))
    },
    corriendo,
    setCorriendo,
    velocidad,
    setVelocidad,
    persecucion,
    setPersecucion,
    /** E26.4: cambiar un requisito en línea; el veredicto se recalcula al instante (Dynamic Queries). */
    setRequisitos: (r: Partial<Requisitos>) => {
      if (!plan) return
      const q = { ...plan, requisitos: { ...plan.requisitos, ...r } }
      setPlan(q)
      const u = new URLSearchParams(location.search)
      u.set('req', JSON.stringify(q.requisitos))
      history.replaceState(null, '', `?${u}`)
    },
    /** E26.4 (Data Brushing): llevar la escena al momento que decide un criterio del veredicto. */
    enfocar: (id: string) => {
      if (!sim) return
      setEnfocado(id)
      setCorriendo(false)
      if (id === 'luz-aproximacion') {
        setEstadiaH(0)
        setTau(sim.descenso.eventos.puertaAlta)
      } else if (id === 'noche' || id === 'tierra-estadia') {
        setTau(contacto)
        setEstadiaH(Math.max(sim.inicioNocheMasLargaH ?? 0, 1 / 60))
      } else {
        setEstadiaH(0)
        setTau(contacto)
      }
    },
    enfocado,
    ventanasEstadia,
    asistente,
    abrirAsistente: (p?: PlanSimulacion, paso = 0) => setAsistente({ plan: p ?? null, paso }),
    cerrarAsistente: () => {
      marcarAsistenteVisto()
      setAsistente(null)
    },
    simular: (p: PlanSimulacion) => {
      marcarAsistenteVisto()
      setAsistente(null)
      setEnfocado(null)
      abrirPlan(p, (q) => {
        setPlan(q)
        setEstadiaH(0)
        setTau(0)
        setCorriendo(true)
      })
    },
    salir: () => {
      setEnfocado(null)
      setPlan(null)
      setCorriendo(false)
      setEstadiaH(0)
      const q = new URLSearchParams(location.search)
      ;['sim', 'req', 'mision'].forEach((k) => q.delete(k))
      history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname)
    },
  }
}
