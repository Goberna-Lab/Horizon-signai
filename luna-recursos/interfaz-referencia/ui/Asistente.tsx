// E26.2: asistente para simular un aterrizaje (Wizard, DI cap. 2, pp. 86–88). Seis pasos en orden sugerido, con un mapa
// de todos los pasos que se puede recorrer en cualquier sentido, Atrás y Siguiente, buenos valores por defecto (Good
// Defaults, p. 88) y la opción de saltarlo: DI advierte que a los expertos un asistente les resulta rígido (p. 86).
import { useEffect, useMemo, useState } from 'react'
import metaTabla from '../data/efemerides-luna.json'
import { prepararSitio, type TablaLuna } from '../engine/efemeridesLuna'
import { cargarTablaLuna, type PlanSimulacion } from './simulacionComun'
import { perfilDesde } from '../engine/mascara'
import { cieloDelPunto } from '../engine/planificador'
import { candidatosContacto, simularAterrizaje, type Requisitos } from '../engine/simulacion'
import { LM_APOLLO11, PERFIL_APOLLO11 } from '../engine/descenso'
import { SITIOS, type IdSitio } from '../engine/sitio'
import { LUGARES, obtenerMascara } from './lugares'

// Orden (DI p. 87, "split up the task at decision points"): los requisitos van antes de la fecha porque la sugerencia de
// hora los usa; "Comparar" pone lado a lado las mejores fechas del mes antes de elegir (región, fecha, comparar, evaluar).
const PASOS = ['Misión y nave', 'Sitio', 'Requisitos', 'Fecha y hora', 'Comparar', 'Resumen'] as const
const DIA_MS = 86_400_000
const INICIO = Date.parse(metaTabla.inicioUTC)
const FIN = Date.parse(metaTabla.finUTC)
const aCampo = (ms: number) => new Date(ms).toISOString().slice(0, 16)
const deCampo = (v: string) => Date.parse(`${v}:00Z`)
const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export function Asistente(props: { inicial: PlanSimulacion; pasoInicial?: number; alSimular: (p: PlanSimulacion) => void; alCerrar: () => void }) {
  const [paso, setPaso] = useState(props.pasoInicial ?? 0)
  const [plan, setPlan] = useState<PlanSimulacion>(props.inicial)
  const cambiar = (p: Partial<PlanSimulacion>) => setPlan((x) => ({ ...x, ...p }))

  // Escape cierra (como Saltar).
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && props.alCerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [props])

  return (
    <div className="asistente__fondo" role="dialog" aria-modal="true" aria-labelledby="asistente-titulo">
      <div className="asistente">
        <header className="asistente__cabecera">
          <h1 id="asistente-titulo">Simular un aterrizaje</h1>
          <button className="boton-texto" onClick={props.alCerrar}>
            Saltar y explorar
          </button>
        </header>
        <div className="asistente__cuerpo">
          {/* Mapa de los pasos: se puede ir a cualquiera (DI p. 87). */}
          <ol className="asistente__mapa" aria-label="Pasos">
            {PASOS.map((nombre, i) => (
              <li key={nombre}>
                <button className={i === paso ? 'activo' : i < paso ? 'hecho' : ''} onClick={() => setPaso(i)} aria-current={i === paso ? 'step' : undefined}>
                  <span className="asistente__numero">{i + 1}</span> {nombre}
                </button>
              </li>
            ))}
          </ol>
          <section className="asistente__paso" aria-label={PASOS[paso]}>
            <p className="asistente__contador">
              Paso {paso + 1} de {PASOS.length}
            </p>
            <h2>{PASOS[paso]}</h2>
            {paso === 0 && <PasoMision plan={plan} cambiar={cambiar} />}
            {paso === 1 && <PasoSitio plan={plan} cambiar={cambiar} />}
            {paso === 2 && <PasoRequisitos plan={plan} cambiar={cambiar} />}
            {paso === 3 && <PasoFecha plan={plan} cambiar={cambiar} irAComparar={() => setPaso(4)} />}
            {paso === 4 && <PasoComparar plan={plan} cambiar={cambiar} />}
            {paso === 5 && <PasoResumen plan={plan} irA={setPaso} />}
          </section>
        </div>
        <footer className="asistente__pie">
          <button className="boton-texto" disabled={paso === 0} onClick={() => setPaso((p) => p - 1)}>
            ← Atrás
          </button>
          {paso < PASOS.length - 1 ? (
            <button className="asistente__principal" onClick={() => setPaso((p) => p + 1)}>
              Siguiente →
            </button>
          ) : (
            <button className="asistente__principal" onClick={() => props.alSimular(plan)}>
              Simular aterrizaje
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

type PropsPaso = { plan: PlanSimulacion; cambiar: (p: Partial<PlanSimulacion>) => void }

function PasoMision({ plan, cambiar }: PropsPaso) {
  return (
    <>
      <label className="asistente__campo">
        <span className="campo-etiqueta">Nombre de la misión</span>
        <input value={plan.mision} onChange={(e) => cambiar({ mision: e.target.value })} maxLength={60} />
      </label>
      <Numero
        etiqueta="Días en superficie (estadía después del contacto)"
        valor={plan.requisitos.diasSuperficie}
        unidad="d"
        min={1}
        max={30}
        alCambiar={(v) => cambiar({ requisitos: { ...plan.requisitos, diasSuperficie: Math.min(30, Math.max(1, v)) } })}
      />
      <div className="asistente__tarjeta asistente__tarjeta--activa">
        <h3>Módulo lunar del Apollo (etapa de descenso)</h3>
        <dl className="datos datos--ancho">
          <dt>Masa al iniciar el descenso</dt>
          <dd>{Math.round(LM_APOLLO11.masaInicialKg).toLocaleString('es-PE')} kg</dd>
          <dt>Combustible disponible</dt>
          <dd>{Math.round(LM_APOLLO11.combustibleKg).toLocaleString('es-PE')} kg</dd>
          <dt>Empuje máximo</dt>
          <dd>{((LM_APOLLO11.empujeNominalN * LM_APOLLO11.fraccionMaxima) / 1000).toFixed(1)} kN (92,5 %)</dd>
          <dt>Impulso específico</dt>
          <dd>{LM_APOLLO11.impulsoEspecificoS} s</dd>
        </dl>
        <p className="nota">
          Guiado del Apollo (Klumpp, R-695, 1971): frenado (P63), aproximación (P64) y descenso vertical (P66). Perfil y masas del Apollo 11 (NASA TN
          D-6846); motor: TN D-7143. El descenso dura ~{Math.round(PERFIL_APOLLO11.contacto.tS / 60)} min desde ~260 millas náuticas.
        </p>
      </div>
    </>
  )
}

function PasoSitio({ plan, cambiar }: PropsPaso) {
  return (
    <>
      <p className="nota">La simulación 3D existe en los sitios con relieve detallado. Para comparar otros sitios del polo sur usa el planificador (2D).</p>
      <div className="asistente__opciones">
        {(Object.keys(SITIOS) as IdSitio[]).map((id) => (
          <button key={id} className={`asistente__tarjeta ${plan.sitio === id ? 'asistente__tarjeta--activa' : ''}`} onClick={() => cambiar({ sitio: id })} aria-pressed={plan.sitio === id}>
            <h3>{SITIOS[id].nombre}</h3>
            <p className="nota">
              {Math.abs(SITIOS[id].latitudGrados).toFixed(3)}° {SITIOS[id].latitudGrados >= 0 ? 'N' : 'S'}, {SITIOS[id].longitudEsteGrados.toFixed(3)}° E.{' '}
              {id === 'apollo17' ? 'Valle de Taurus-Littrow; el Sol sube alto y la Tierra está siempre arriba.' : 'Cresta junto al polo sur; Sol rasante y Tierra a ratos.'}
            </p>
          </button>
        ))}
      </div>
    </>
  )
}

/** Sitio, máscara y tabla del plan, para las vistas previas del paso de fecha. */
function usePunto(sitio: IdSitio) {
  const [datos, setDatos] = useState<{ tabla: TablaLuna; sitio: IdSitio; punto: ReturnType<typeof crearPunto> } | null>(null)
  useEffect(() => {
    let vivo = true
    const lugar = LUGARES.find((l) => l.id === sitio)!
    Promise.all([cargarTablaLuna(), obtenerMascara(lugar)]).then(([tabla, m]) => vivo && setDatos({ tabla, sitio, punto: crearPunto(sitio, m) }))
    return () => {
      vivo = false
    }
  }, [sitio])
  return datos && datos.sitio === sitio ? datos : null
}
const crearPunto = (sitio: IdSitio, m: Parameters<typeof perfilDesde>[0]) => ({
  sitio: prepararSitio(SITIOS[sitio].latitudGrados, SITIOS[sitio].longitudEsteGrados),
  perfil: perfilDesde(m, 0),
})

function PasoFecha({ plan, cambiar, irAComparar }: PropsPaso & { irAComparar: () => void }) {
  const datos = usePunto(plan.sitio)
  const vista = useMemo(() => (datos ? cieloDelPunto(datos.tabla, datos.punto, plan.contactoMs) : null), [datos, plan.contactoMs])
  return (
    <>
      <label className="asistente__campo">
        <span className="campo-etiqueta">Contacto con el suelo (UTC, 2026–2030)</span>
        <input
          type="datetime-local"
          value={aCampo(plan.contactoMs)}
          min={aCampo(INICIO + DIA_MS)}
          max={aCampo(FIN - 30 * DIA_MS)}
          onChange={(e) => {
            const ms = deCampo(e.target.value)
            if (!Number.isNaN(ms)) cambiar({ contactoMs: Math.min(Math.max(ms, INICIO + DIA_MS), FIN - 30 * DIA_MS) })
          }}
        />
      </label>
      <button className="boton-texto" onClick={irAComparar}>
        Ver las mejores horas del mes →
      </button>
      {vista && (
        <dl className="datos datos--ancho asistente__vista">
          <dt>Sol en el contacto</dt>
          <dd>
            {vista.solFraccion > 0 ? 'visible' : 'oculto'}, {vista.sol.elevacionGrados.toFixed(1)}° de elevación (azimut {vista.sol.azimutGrados.toFixed(0)}°)
          </dd>
          <dt>Tierra en el contacto</dt>
          <dd>
            {vista.tierraSobreHorizonte > 0 ? 'visible' : 'oculta'}, {vista.tierra.elevacionGrados.toFixed(1)}° (fase {(100 * vista.tierra.fase).toFixed(0)} %)
          </dd>
          <dt>Rumbo de llegada (Sol a la espalda)</dt>
          <dd>{((vista.sol.azimutGrados + 180) % 360).toFixed(0)}°</dd>
        </dl>
      )}
    </>
  )
}

function Numero(props: { etiqueta: string; valor: number; unidad: string; paso?: number; min?: number; max?: number; alCambiar: (v: number) => void }) {
  return (
    <label className="asistente__numero-campo">
      <span>{props.etiqueta}</span>
      <span>
        <input type="number" value={props.valor} step={props.paso ?? 1} min={props.min} max={props.max} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && props.alCambiar(e.target.valueAsNumber)} />{' '}
        {props.unidad}
      </span>
    </label>
  )
}

function PasoRequisitos({ plan, cambiar }: PropsPaso) {
  const r = plan.requisitos
  const set = (p: Partial<Requisitos>) => cambiar({ requisitos: { ...r, ...p } })
  return (
    <>
      <p className="nota">
        Los pone tu misión: nuestras fuentes no traen umbrales para aterrizar, así que el veredicto dirá si se cumplen <b>tus</b> requisitos. Los valores
        iniciales son un ejemplo, no una recomendación.
      </p>
      <div className="asistente__requisitos">
        <Numero etiqueta="Batería: horas seguidas sin Sol" valor={r.bateriaHoras} unidad="h" min={0} alCambiar={(v) => set({ bateriaHoras: v })} />
        <Numero etiqueta="Inclinación máxima sobre las patas" valor={r.inclinacionMaximaGrados} unidad="°" min={0} max={45} alCambiar={(v) => set({ inclinacionMaximaGrados: v })} />
        <Numero etiqueta="Combustible que debe sobrar" valor={r.margenCombustibleKg} unidad="kg" min={0} paso={10} alCambiar={(v) => set({ margenCombustibleKg: v })} />
        <Numero etiqueta="Tierra visible en la estadía, mínimo" valor={Math.round(r.tierraMinimaEstadia * 100)} unidad="%" min={0} max={100} alCambiar={(v) => set({ tierraMinimaEstadia: v / 100 })} />
        <label className="casilla">
          <input type="checkbox" checked={r.solEnContacto} onChange={(e) => set({ solEnContacto: e.target.checked })} /> Sol visible en el contacto
        </label>
        <label className="casilla">
          <input type="checkbox" checked={r.tierraEnContacto} onChange={(e) => set({ tierraEnContacto: e.target.checked })} /> Tierra visible en el contacto
          (comunicación directa)
        </label>
      </div>
    </>
  )
}

function PasoResumen({ plan, irA }: { plan: PlanSimulacion; irA: (p: number) => void }) {
  const r = plan.requisitos
  const fila = (nombre: string, valor: string, paso: number) => (
    <>
      <dt>{nombre}</dt>
      <dd>
        {valor}{' '}
        <button className="boton-texto asistente__cambiar" onClick={() => irA(paso)}>
          cambiar
        </button>
      </dd>
    </>
  )
  return (
    <dl className="datos datos--ancho">
      {fila('Misión', plan.mision || 'sin nombre', 0)}
      {fila('Nave', 'LM del Apollo (perfil del Apollo 11)', 0)}
      {fila('Sitio', SITIOS[plan.sitio].nombre, 1)}
      {fila('Contacto', `${fecha(plan.contactoMs)} UTC`, 3)}
      {fila(
        'Requisitos',
        `${r.diasSuperficie} d; batería ${r.bateriaHoras} h; ≤ ${r.inclinacionMaximaGrados}°; sobran ≥ ${r.margenCombustibleKg} kg; Tierra ≥ ${Math.round(100 * r.tierraMinimaEstadia)} %${r.solEnContacto ? '; Sol en el contacto' : ''}${r.tierraEnContacto ? '; Tierra en el contacto' : ''}`,
        2,
      )}
    </dl>
  )
}

/** Paso "Comparar": las mejores horas del mes (y la elegida) lado a lado, frente a los requisitos; se elige una. */
function PasoComparar({ plan, cambiar }: PropsPaso) {
  const datos = usePunto(plan.sitio)
  // La ventana se ancla a la fecha con la que se entró al paso: elegir otra fila no mueve la lista (DI p. 87: poder cambiar
  // de opinión y volver a la anterior).
  const [base] = useState(plan.contactoMs)
  const filas = useMemo(() => {
    if (!datos) return null
    const desde = Math.max(base - 15 * DIA_MS, INICIO + DIA_MS)
    const candidatos = candidatosContacto(datos.tabla, datos.punto, desde, desde + 29.5 * DIA_MS, plan.requisitos, 3)
    const todos = [...new Set([base, ...candidatos])].sort((a, b) => a - b)
    return todos.map((ms) => ({ ms, sim: simularAterrizaje(datos.tabla, datos.punto, ms, plan.requisitos, null) }))
  }, [datos, base, plan.requisitos])
  if (!filas) return <p className="nota">Calculando…</p>
  const mejorNoche = Math.min(...filas.map((f) => f.sim.estadia.nocheMasLargaH))
  return (
    <>
      <p className="nota">
        Las mejores horas de contacto del mes alrededor de tu fecha (noche más corta en tu estadía y, a igualdad, más Tierra), junto a la que elegiste.
        La inclinación del LM se mide en la escena.
      </p>
      <div className="plan__tabla-marco">
        <table className="plan__tabla">
          <thead>
            <tr>
              <th>Contacto (UTC)</th>
              <th title="En el contacto">Sol · Tierra</th>
              <th>Noche más larga</th>
              <th title="Fracción de la estadía con la Tierra visible">Tierra</th>
              <th>Cumple</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ ms, sim }) => {
              const c = (id: string) => sim.veredicto.find((v) => v.id === id)!
              const elegida = ms === plan.contactoMs
              return (
                <tr key={ms} className={elegida ? 'asistente__fila--elegida' : ''}>
                  <td>{fecha(ms)}</td>
                  <td>
                    {c('sol-contacto').cumple ? 'sí' : 'no'} · {c('tierra-contacto').cumple ? 'sí' : 'no'}
                  </td>
                  <td className={sim.estadia.nocheMasLargaH === mejorNoche ? 'plan__mejor' : ''}>{sim.estadia.nocheMasLargaH.toFixed(1)} h</td>
                  <td>{(100 * sim.estadia.fraccionTierra).toFixed(0)} %</td>
                  <td title="La inclinación del LM sobre sus patas se mide en la escena 3D">
                    {sim.veredicto.filter((v) => v.cumple).length} de {sim.veredicto.length} (+ inclinación)
                  </td>
                  <td>
                    {elegida ? (
                      <span className="plan__detalle">elegida</span>
                    ) : (
                      <button className="boton-texto" onClick={() => cambiar({ contactoMs: ms })}>
                        Elegir
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
