import { useEffect, useRef, useState } from 'react'
import { DURACION_S, dia, estado as calcularEstado, limitarT, tParaElevacionManana, VELOCIDADES } from './engine/simulation'
import { LunarScene, type CurvaTono, type ModeloRegolito, type ModoCamara, type PuntoMedido } from './scene/LunarScene'
import { Panel } from './ui/Panel'
import { SeccionAvisos, SeccionCamara, SeccionEvaluacion, SeccionLuz, SeccionMedicion, SeccionSol, SeccionTiempo, SeccionVerificacion, type ModoClic } from './ui/Secciones'
import type { Ayudas } from './scene/LunarScene'
import { LunaCompleta } from './scene/LunaCompleta'
import { SeccionVista, type Vista } from './ui/Secciones'
import { Diagnostico } from './ui/Diagnostico'
import { SITIO_ACTIVO } from './engine/sitio'
import { Planificador } from './ui/Planificador'
import { LUGARES } from './ui/lugares'
import { Seccion } from './ui/Secciones'
import { Asistente } from './ui/Asistente'
import { planPorDefecto } from './ui/simulacionComun'
import { PanelSimulacion } from './ui/PanelSimulacion'
import { SeccionRequisitos } from './ui/SeccionRequisitos'
import { useSimulacion } from './ui/useSimulacion'
import { LM_APOLLO11 } from './engine/descenso'

/** Inicio: mañana del primer día lunar con el Sol a 12°, para repetir la prueba de E2. */
const T_INICIAL = tParaElevacionManana(dia(0), 12)

// Center Stage (Designing Interfaces, cap. 4, pp. 231–232): el mapa ocupa toda la ventana;
// los controles van en un panel secundario superpuesto.
export default function App() {
  // E26: simulación de aterrizaje (asistente, descenso en 3D, veredicto).
  const S = useSimulacion()
  const setCorriendoSim = S.setCorriendo
  // La tecla espacio (registrada una vez) consulta si hay simulación sin volver a registrarse.
  const simRef = useRef(false)
  useEffect(() => {
    simRef.current = S.plan !== null
  }, [S.plan])
  const [t, setT] = useState(T_INICIAL)
  const [corriendo, setCorriendo] = useState(false)
  const [velocidad, setVelocidad] = useState<number>(VELOCIDADES[3])
  const [exposicionEV, setExposicionEV] = useState(0)
  // ENV-006 (E8): curva de tono de la cámara; 'lineal' para medir.
  const [curva, setCurva] = useState<CurvaTono>('aces')
  // E9.1 / ENV-006: lupa del cielo, no física.
  const [lupa, setLupa] = useState(false)
  // E4 / E13: mediciones inversas, cada una con el instante en que se marcó (registro: Command History, DI pp. 422–423).
  const [medidas, setMedidas] = useState<PuntoMedido[]>([])
  const medida = medidas.length ? medidas[medidas.length - 1] : null
  // E13 / ENV-006: ayudas no físicas que se pueden ocultar (filtros simples, DI pp. 443–444).
  const [ayudas, setAyudas] = useState<Ayudas>({ cuadricula: true, marcas: true })
  // E14: vista del sitio o de la Luna completa; exageración del relieve del globo (ENV-006).
  const [vista, setVista] = useState<Vista>('sitio')
  const [exageracion, setExageracion] = useState(1)
  // E15.5: acumulación temporal en pausa (quita el grano de la penumbra sin cambiar la física).
  const [acumular, setAcumular] = useState(true)
  // E15.4: cámara aérea o de astronauta (1,7 m).
  const [camara, setCamara] = useState<ModoCamara>('aerea')
  // E15.3: equipos del Apollo 17 en su posición real (ocultan el poste).
  const [equipos, setEquipos] = useState(false)
  // E15.2 / D2: rocas sintéticas (posiciones inventadas): apagadas por defecto.
  const [detalle, setDetalle] = useState(false)
  // E15.1: albedo real del sitio (ortofoto LROC normalizada).
  // E20: solo el Apollo 17 tiene ortofoto.
  const [albedoReal, setAlbedoReal] = useState(SITIO_ACTIVO.tieneOrtofoto)
  // E17: Hapke calibrado (LSB, por defecto) o medido (LROC WAC, sin rugosidad).
  const [modelo, setModelo] = useState<ModeloRegolito>('calibrado')
  // E19: el clic en el suelo mide la sombra (E4) o elige el punto a evaluar; por defecto se evalúa el sitio del LM.
  const [modoClic, setModoClic] = useState<ModoClic>('medir')
  const [evaluado, setEvaluado] = useState({ x: 0, z: 0 })
  // E21/E26.4: altura del observador de Evaluación, compartida con el datatip del terreno.
  const [alturaObservador, setAlturaObservador] = useState(0)

  // ENV-005: el reloj solo cambia t; el estado se deriva de t con una función pura.
  useEffect(() => {
    if (!corriendo) return
    let anterior = performance.now()
    let id = requestAnimationFrame(function paso(ahora) {
      // F5: el primer paso de rAF puede traer una marca de tiempo anterior a performance.now().
      const dt = Math.max(0, ahora - anterior) / 1000
      anterior = ahora
      // E7 / E18: ningún día se repite; el reloj pasa de un día lunar al siguiente y se detiene al final de la tabla.
      setT((x) => {
        const siguiente = limitarT(x + dt * velocidad)
        if (siguiente >= DURACION_S) setCorriendo(false)
        return siguiente
      })
      id = requestAnimationFrame(paso)
    })
    return () => cancelAnimationFrame(id)
  }, [corriendo, velocidad])

  // Espacio: correr / pausar. F6: funciona aunque un botón o un slider tenga el foco; solo se ignora en
  // campos de texto. preventDefault evita que el botón enfocado también se active con el espacio.
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const objetivo = e.target as HTMLElement | null
      const tag = objetivo?.tagName
      const escribiendo = tag === 'TEXTAREA' || (tag === 'INPUT' && (objetivo as HTMLInputElement).type !== 'range')
      if (escribiendo) return
      e.preventDefault()
      if (simRef.current) setCorriendoSim((c) => !c)
      else setCorriendo((c) => !c)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [setCorriendoSim])

  // E26.3: en la simulación manda el reloj del descenso y el cielo sale de la tabla global (E22), en cualquier fecha.
  const estado = S.estado ?? calcularEstado(t)
  const vistaEfectiva: Vista = S.plan ? 'sitio' : vista

  return (
    <main className="app">
      {vistaEfectiva === 'planificador' ? (
        <Planificador
          lugares={LUGARES}
          lugarInicial={SITIO_ACTIVO.id}
          alSimular={(sitio, contactoMs) => S.abrirAsistente({ ...planPorDefecto(sitio), contactoMs }, 4)}
        />
      ) : vistaEfectiva === 'sitio' ? (
        <LunarScene
          vuelo={S.vuelo}
          alturaObservadorM={alturaObservador}
          textoClic={modoClic === 'evaluar' ? 'Clic: evaluar este punto' : 'Clic: medir la sombra aquí'}
          estado={estado} exposicionEV={exposicionEV} curva={curva} lupa={lupa} ayudas={ayudas} acumular={acumular} camara={camara} equipos={equipos} detalle={detalle} albedoReal={albedoReal} modelo={modelo} medida={medida} evaluado={evaluado} alMedir={(x, z) => (modoClic === 'evaluar' ? setEvaluado({ x, z }) : setMedidas((m) => [...m, { x, z, t }]))} />
      ) : (
        <LunaCompleta estado={estado} exposicionEV={exposicionEV} curva={curva} exageracion={exageracion} />
      )}
      <Diagnostico />
      {S.plan && !S.sim && <p className="simulacion__cargando">Preparando la simulación…</p>}
      {S.plan && S.sim && (
        <PanelSimulacion
          plan={S.plan}
          sim={S.sim}
          tau={S.tau}
          alCambiarTau={(x) => {
            S.setCorriendo(false)
            S.setTau(x)
          }}
          corriendo={S.corriendo}
          alAlternar={() => S.setCorriendo((c) => !c)}
          velocidad={S.velocidad}
          alCambiarVelocidad={S.setVelocidad}
          persecucion={S.persecucion}
          alCambiarPersecucion={S.setPersecucion}
          combustibleInicialKg={LM_APOLLO11.combustibleKg}
          estadiaH={S.estadiaH}
          alCambiarEstadiaH={S.setEstadiaH}
          diasSuperficie={S.plan.requisitos.diasSuperficie}
          msEscena={S.msEscena}
          ventanasEstadia={S.ventanasEstadia}
          alNueva={() => S.abrirAsistente(S.plan ?? undefined)}
          alSalir={S.salir}
        />
      )}
      {S.asistente && (
        <Asistente
          inicial={S.asistente.plan ?? S.plan ?? planPorDefecto(SITIO_ACTIVO.id)}
          pasoInicial={S.asistente.paso}
          alSimular={S.simular}
          alCerrar={S.cerrarAsistente}
        />
      )}
      <Panel>
        {/* E26.2: la simulación de aterrizaje, arriba del panel (el asistente también se abre solo la primera vez). */}
        <Seccion titulo="Simulación de aterrizaje">
          <button className="boton-principal" onClick={() => S.abrirAsistente(S.plan ?? undefined)}>
            {S.plan ? 'Nueva simulación…' : 'Simular un aterrizaje…'}
          </button>
          <p className="nota">Asistente de 6 pasos: misión y nave, sitio, requisitos, fecha y hora, comparar y resumen. Descenso del LM con el guiado del Apollo.</p>
        </Seccion>
        {S.plan && S.sim && <SeccionRequisitos sim={S.sim} requisitos={S.plan.requisitos} alCambiar={S.setRequisitos} alEnfocar={S.enfocar} enfocado={S.enfocado} />}
        <SeccionVista abierta={!S.plan} modelo={modelo} alCambiarModelo={setModelo} albedoReal={albedoReal} alCambiarAlbedoReal={setAlbedoReal} detalle={detalle} alCambiarDetalle={setDetalle} equipos={equipos} alCambiarEquipos={setEquipos} camara={camara} alCambiarCamara={setCamara} vista={vista} alCambiarVista={setVista} exageracion={exageracion} alCambiarExageracion={setExageracion} estado={estado} />
        {vistaEfectiva !== 'planificador' && (
          <>
        {!S.plan && <SeccionTiempo
          estado={estado}
          corriendo={corriendo}
          velocidad={velocidad}
          alCambiarT={(x) => setT(limitarT(x))}
          alAlternar={() => setCorriendo((c) => !c)}
          alCambiarVelocidad={setVelocidad}
        />}
        <SeccionEvaluacion abierta={!S.plan} altura={alturaObservador} alCambiarAltura={setAlturaObservador} estado={estado} punto={evaluado} modoClic={modoClic} alCambiarModoClic={setModoClic} alVolverAlLM={() => setEvaluado({ x: 0, z: 0 })} />
        <SeccionSol estado={estado} />
        <SeccionMedicion estado={estado} medidas={medidas} alBorrarMedida={() => setMedidas((m) => m.slice(0, -1))} />
        <SeccionVerificacion estado={estado} alCambiarT={(x) => setT(limitarT(x))} />
        <SeccionLuz estado={estado} />
        <SeccionCamara ev={exposicionEV} alCambiar={setExposicionEV} curva={curva} alCambiarCurva={setCurva} lupa={lupa} alCambiarLupa={setLupa} acumular={acumular} alCambiarAcumular={setAcumular} />
        <SeccionAvisos ayudas={ayudas} alCambiarAyudas={setAyudas} />
          </>
        )}
      </Panel>
    </main>
  )
}
