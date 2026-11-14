import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CONSTANTE_SOLAR_W_M2,
  EXPOSICION,
  OBSTACULO,
  SOL,
  SUPERFICIE,
  TIERRA,
  iluminacion,
  limitarExposicion,
  limitesSombra,
  medicionInversa,
} from '../engine/environment'
import {
  CANTIDAD_DIAS,
  DURACION_S,
  PASO_BOTON_S,
  PROCEDENCIA,
  SITIO,
  VELOCIDADES,
  dia,
  diaDe,
  estado as estadoEn,
  type EstadoEscena,
} from '../engine/simulation'
import type { Ayudas, CurvaTono, ModeloRegolito, ModoCamara, PuntoMedido } from '../scene/LunarScene'
import { GraficaDelDia, PerfilSombra, TablaComprobaciones } from './Verificacion'
import { momentosDePrueba } from '../engine/verificacion'
import { geometriaGlobal } from '../engine/lunaGlobal'
import { AUMENTO_LUPA } from '../scene/Cielo'
import { alturaSuelo, limitesSombraSobreTerreno, pendienteGrados } from '../engine/terreno'
import { elevacionHorizonte } from '../engine/horizonte'
import { ALTURAS_OBSERVADOR_M, apoyoLM, cieloEnPunto, fraccionVisible, huellaDentro, resumenDia } from '../engine/evaluacion'
import { SITIOS, SITIO_ACTIVO, type IdSitio } from '../engine/sitio'
import { DEFINICION_DIA } from '../engine/simulation'

/** Titled Sections (Designing Interfaces, cap. 4): secciones con título dentro del mismo panel. */
/**
 * Sección con título que se pliega (Titled Sections, DI p. 238; Collapsible Panels, pp. 249–250). E26.4 (Center Stage,
 * pp. 231–232): el mapa 3D es lo principal. Sol, Medición, Verificación y Luz empiezan plegadas; en la simulación también
 * Vista y Evaluación (App.tsx). "No físico" y "Cámara" quedan abiertas: lo que no es físico se tiene que ver (regla 4).
 */
export function Seccion({ titulo, children, abierta = true }: { titulo: string; children: ReactNode; abierta?: boolean }) {
  return (
    <details className="seccion" open={abierta}>
      <summary className="seccion__titulo">{titulo}</summary>
      {children}
    </details>
  )
}

/**
 * Dynamic Queries (DI, cap. 9, pp. 455–458): el slider cambia la vista al instante; su rango enseña los valores posibles.
 * Slider con campo que repite el valor (DI, cap. 10, p. 512; precisión: cap. 9, p. 457): slider para explorar, campo para precisión.
 */
function SliderConCampo(props: {
  id: string
  etiqueta: string
  unidad: string
  min: number
  max: number
  paso: number
  decimales: number
  valor: number
  limitar: (v: number) => number
  alCambiar: (v: number) => void
}) {
  const { id, etiqueta, unidad, min, max, paso, decimales, valor, limitar, alCambiar } = props
  // Borrador mientras se escribe; si no hay borrador, el campo repite el valor del slider.
  const [borrador, setBorrador] = useState<string | null>(null)
  const texto = borrador ?? valor.toFixed(decimales)

  // F7: solo se confirma si hubo edición (antes, salir del campo redondeaba el valor a 1 decimal).
  // Acepta coma o punto como separador decimal.
  function confirmar() {
    if (borrador === null) return
    alCambiar(limitar(Number.parseFloat(borrador.replace(',', '.'))))
    setBorrador(null)
  }

  return (
    <>
      <label className="campo-etiqueta" htmlFor={id}>{etiqueta}</label>
      <div className="slider">
        <span className="slider__extremo">{min}{unidad}</span>
        <input id={id} type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => alCambiar(Number(e.target.value))} />
        <span className="slider__extremo">{max}{unidad}</span>
      </div>
      <div className="valor">
        <input
          className="valor__campo"
          inputMode="decimal"
          aria-label={etiqueta}
          value={texto}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => e.key === 'Enter' && confirmar()}
        />
        <span>{unidad}</span>
      </div>
    </>
  )
}

const PUNTOS_CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
function cardinal(azimut: number): string {
  return PUNTOS_CARDINALES[Math.round(azimut / 45) % 8]
}

/** Momento del día lunar: noche, Sol tras los macizos (E10), mañana o tarde (antes o después del tránsito, E7). */
function momento(e: EstadoEscena): string {
  if (e.elevacionSolGrados <= 0) return 'noche'
  if (iluminacion(e).solVisible <= 0) return SITIO_ACTIVO.id === 'apollo17' ? 'Sol tras los macizos' : 'Sol tras el horizonte real'
  return e.t < diaDe(e.t).mediodia ? 'mañana' : 'tarde'
}

/** "2026-10-16T05:12:30.000Z" → "2026-10-16 05:12 UTC". */
function formatoFecha(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** t en días y horas terrestres ("3 d 04:12:00"; "d" para no confundirlo con el día lunar). */
function formatoT(t: number): string {
  const dias = Math.floor(t / 86400)
  const resto = t - dias * 86400
  const h = Math.floor(resto / 3600)
  const m = Math.floor((resto % 3600) / 60)
  const s = Math.floor(resto % 60)
  const dd = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  return `${dias} d ${dd}`
}

/**
 * ENV-005: el reloj. Safe Exploration (DI, cap. 1, pp. 12–13): retroceder es seguro porque
 * el estado es función de t; volver a un t da exactamente el mismo estado.
 */
export function SeccionTiempo(props: {
  estado: EstadoEscena
  corriendo: boolean
  velocidad: number
  alCambiarT: (t: number) => void
  alAlternar: () => void
  alCambiarVelocidad: (v: number) => void
}) {
  const { estado, corriendo, velocidad, alCambiarT, alAlternar, alCambiarVelocidad } = props
  // E18: el slider, los momentos de prueba y la gráfica son del día lunar en curso.
  const d = diaDe(estado.t)
  const ultimo = d.indice === CANTIDAD_DIAS - 1
  // El final exacto de un día es el inicio del siguiente: el slider se queda 1 s antes, salvo en el último día.
  const hastaS = ultimo ? d.duracion : d.duracion - 1
  // Cambiar de día conserva el tiempo desde la salida del Sol (limitado a la duración del otro día).
  const irADia = (k: number) => {
    const otro = dia(k)
    alCambiarT(otro.inicio + Math.min(estado.t - d.inicio, otro.indice === CANTIDAD_DIAS - 1 ? otro.duracion : otro.duracion - 1))
  }
  return (
    <Seccion titulo="Tiempo">
      <div className="botones">
        <button onClick={() => alCambiarT(d.inicio)} title={`Inicio de este día lunar (${INICIO_DIA})`}>⏮</button>
        <button onClick={() => alCambiarT(estado.t - PASO_BOTON_S)} title="Retroceder 12 h">◀</button>
        <button className="botones__principal" onClick={alAlternar} title={corriendo ? 'Pausar (espacio)' : 'Correr (espacio)'}>
          {corriendo ? '⏸' : '▶︎'}
        </button>
        <button onClick={() => alCambiarT(estado.t + PASO_BOTON_S)} title="Avanzar 12 h">▶</button>
      </div>
      <p className="reloj">{formatoFecha(estado.fechaUTC)}</p>
      <p className="reloj reloj--secundario">t = {formatoT(estado.t - d.inicio)} desde {INICIO_DIA}</p>
      <div className="botones botones--dia" role="group" aria-label="Día lunar">
        <button onClick={() => irADia(d.indice - 1)} disabled={d.indice === 0} title="Mismo momento del día lunar anterior">«</button>
        <span className="reloj reloj--secundario">
          Día lunar {d.indice + 1} de {CANTIDAD_DIAS}
        </span>
        <button onClick={() => irADia(d.indice + 1)} disabled={ultimo} title="Mismo momento del día lunar siguiente">»</button>
      </div>
      <SliderConCampo
        id="tiempo"
        etiqueta={`Horas desde ${INICIO_DIA} (este día lunar)`}
        unidad=" h"
        min={0}
        max={Math.floor((hastaS / 3600) * 10) / 10}
        paso={0.5}
        decimales={1}
        valor={(estado.t - d.inicio) / 3600}
        limitar={(h) => (Number.isNaN(h) ? 0 : Math.min(hastaS / 3600, Math.max(0, h)))}
        alCambiar={(h) => alCambiarT(d.inicio + Math.min(h * 3600, hastaS))}
      />
      <div className="momentos" role="group" aria-label="Momentos de prueba">
        {momentosDePrueba(d).map((m) => (
          <button key={m.nombre} onClick={() => alCambiarT(m.t)} title={formatoFecha(estadoEn(m.t).fechaUTC)}>
            {m.nombre}
          </button>
        ))}
      </div>
      <div className="velocidades" role="group" aria-label="Velocidad del reloj">
        {VELOCIDADES.map((v) => (
          <button key={v} className={v === velocidad ? 'activo' : ''} onClick={() => alCambiarVelocidad(v)}>
            ×{v.toLocaleString('es-PE')}
          </button>
        ))}
      </div>
      <p className="nota">
        {velocidad === 1 ? 'Tiempo real.' : `Acelerado ×${velocidad.toLocaleString('es-PE')}: no es tiempo real.`} Este día lunar en el
        sitio dura {(d.duracion / 86400).toFixed(2)} días terrestres, {DEFINICION_DIA === 'salida' ? 'de salida a salida del Sol' : 'de medianoche a medianoche local (en el polo el Sol puede no salir ni ponerse)'} (promedio 29,531, LSB p. 58); a ×100 000
        dura ~26 s. La tabla trae {CANTIDAD_DIAS} días lunares seguidos ({formatoFecha(estadoEn(0).fechaUTC).slice(0, 10)} a{' '}
        {formatoFecha(estadoEn(DURACION_S).fechaUTC).slice(0, 10)}), con la libración y la fase de la Tierra reales de cada mes: el reloj
        pasa de un día al siguiente sin cortes y se detiene al final de la tabla.
      </p>
    </Seccion>
  )
}

/** E20: con qué empieza cada día lunar en este sitio. */
const INICIO_DIA = DEFINICION_DIA === 'salida' ? 'la salida del Sol' : 'la medianoche local'

// E21: datos de validación de la iluminación (Mazarico et al. 2011), solo para los sitios que los tienen.
const VALIDACIONES = import.meta.glob('../data/validacion-iluminacion-*.json', { import: 'default', eager: true }) as Record<
  string,
  { mazaricoSol: { valor: number }; mazaricoTierra: { valor: number }; filas: number; pasoH: number }
>
const SERIES = import.meta.glob('../data/serie-*.f32', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const VALIDACION = VALIDACIONES[`../data/validacion-iluminacion-${SITIO_ACTIVO.id}.json`]

/** E21: series de 18,6 años del Sol y la Tierra (se bajan solo si el sitio tiene validación). */
function useSeries(): { sol: Float32Array; tierra: Float32Array } | null {
  const [series, setSeries] = useState<{ sol: Float32Array; tierra: Float32Array } | null>(null)
  useEffect(() => {
    if (!VALIDACION) return
    let vivo = true
    const url = (c: string) => SERIES[`../data/serie-${c}-${SITIO_ACTIVO.id}.f32`]
    Promise.all([fetch(url('sol')).then((r) => r.arrayBuffer()), fetch(url('tierra')).then((r) => r.arrayBuffer())]).then(([a, b]) => {
      if (vivo) setSeries({ sol: new Float32Array(a), tierra: new Float32Array(b) })
    })
    return () => {
      vivo = false
    }
  }, [])
  return series
}

/** E19: qué hace el clic en el suelo. */
export type ModoClic = 'medir' | 'evaluar'

const grados = (x: number) => `${x.toFixed(1)}°`
const signo = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}°`

/**
 * E19: evaluación del punto de aterrizaje. Mide las condiciones (apoyo del LM sobre el relieve real, Sol y Tierra sobre el
 * horizonte real y el relieve cercano) sin dar veredicto: nuestras fuentes no traen umbrales para aterrizar (Abiertas).
 * Fuente de cada valor al pasar el puntero (Datatips, DI cap. 9, p. 446).
 */
export function SeccionEvaluacion(props: {
  estado: EstadoEscena
  punto: { x: number; z: number }
  modoClic: ModoClic
  alCambiarModoClic: (m: ModoClic) => void
  alVolverAlLM: () => void
  /** E21: altura del observador (a ras, astronauta, mástil). E26.4: compartida con el datatip del terreno (Data Brushing). */
  altura: number
  alCambiarAltura: (h: number) => void
  abierta?: boolean
}) {
  const { estado, punto, modoClic, alCambiarModoClic, alVolverAlLM, altura, alCambiarAltura: setAltura } = props
  const { x, z } = punto
  const dentro = huellaDentro(x, z)
  const apoyo = apoyoLM(x, z)
  const cielo = cieloEnPunto(estado, x, z, altura)
  const d = diaDe(estado.t)
  const resumen = resumenDia(d, x, z, altura)
  const series = useSeries()
  const validacion = useMemo(
    () =>
      series && {
        sol: fraccionVisible(series.sol, SOL.diametroAngularGrados / 2, x, z, altura),
        tierra: fraccionVisible(series.tierra, TIERRA.diametroAngularGrados / 2, x, z, altura),
      },
    [series, x, z, altura],
  )
  const enLM = x === 0 && z === 0
  return (
    <Seccion titulo="Evaluación del aterrizaje" abierta={props.abierta ?? true}>
      <div className="velocidades velocidades--dos" role="group" aria-label="Qué hace el clic en el suelo">
        <button className={modoClic === 'medir' ? 'activo' : ''} onClick={() => alCambiarModoClic('medir')}>Clic: medir sombra</button>
        <button className={modoClic === 'evaluar' ? 'activo' : ''} onClick={() => alCambiarModoClic('evaluar')}>Clic: evaluar punto</button>
      </div>
      <p className="nota">
        {enLM ? `Punto: ${SITIO_ACTIVO.textos.centro}.` : `Punto: ${Math.abs(x).toFixed(1)} m al ${x >= 0 ? 'este' : 'oeste'} y ${Math.abs(z).toFixed(1)} m al ${z >= 0 ? 'sur' : 'norte'} del centro.`}{' '}
        {!enLM && (
          <button className="boton-texto" onClick={alVolverAlLM}>
            Volver al centro
          </button>
        )}
      </p>
      {!dentro ? (
        <p className="nota">La huella de 9,4 m sale del DTM de 400 m: el apoyo no se puede medir aquí.</p>
      ) : (
        <>
          <p className="subtitulo" title={`Cuatro pies a 9,4 m entre opuestos (NSSDCA), sobre el ${SITIO_ACTIVO.textos.relieve}`}>Apoyo del LM</p>
          <dl className="datos datos--ancho">
            <dt title={`Plano de mínimos cuadrados por los cuatro pies, sobre el ${SITIO_ACTIVO.textos.relieve}`}>Inclinación del LM</dt>
            <dd>
              {grados(apoyo.inclinacionGrados)} hacia {apoyo.bajaHaciaGrados.toFixed(0)}° {cardinal(apoyo.bajaHaciaGrados)}
            </dd>
            <dt title="Mayor diferencia de altura del suelo entre dos pies">Desnivel entre pies</dt>
            <dd>{apoyo.desnivelM.toFixed(2)} m</dd>
            <dt title="Con tres pies apoyados, separación del cuarto: |h₁ + h₃ − h₂ − h₄|">Alabeo (4.º pie)</dt>
            <dd>{apoyo.alabeoM.toFixed(2)} m</dd>
            <dt title="Diferencias centradas a 2 m en el DTM (E6)">Pendiente local</dt>
            <dd>{grados(apoyo.pendienteCentroGrados)}</dd>
          </dl>
        </>
      )}
      <p className="subtitulo" title="Se aplica al horizonte lejano y al relieve cercano, y al datatip del terreno">Altura del observador</p>
      <div className="velocidades" role="group" aria-label="Altura del observador" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {ALTURAS_OBSERVADOR_M.map((h) => (
          <button key={h} className={h === altura ? 'activo' : ''} onClick={() => setAltura(h)}>
            {h === 0 ? 'Suelo' : h === 1.7 ? '1,7 m (persona)' : '10 m (mástil)'}
          </button>
        ))}
      </div>
      <p className="subtitulo" title={`Horizonte real: ${SITIO_ACTIVO.textos.horizonte}; relieve cercano del DTM`}>Cielo ahora</p>
      <dl className="datos datos--ancho">
        <dt title="Elevación del centro del Sol menos el horizonte real en su azimut (E10); visible si además no lo tapa el relieve cercano">Sol</dt>
        <dd>
          {signo(cielo.solSobreHorizonteGrados)} · {cielo.solVisible ? 'visible' : 'oculto'}
        </dd>
        <dt title="Elevación del centro de la Tierra menos el horizonte real en su azimut; visible = comunicación directa posible">Tierra</dt>
        <dd>
          {signo(cielo.tierraSobreHorizonteGrados)} · {cielo.tierraVisible ? 'visible' : 'oculta'}
        </dd>
      </dl>
      <p className="subtitulo">
        Día lunar {d.indice + 1} de {CANTIDAD_DIAS} (cada 10 min)
      </p>
      <dl className="datos datos--ancho">
        <dt title="Tiempo con el centro del Sol visible desde este punto">Horas de Sol</dt>
        <dd>
          {resumen.horasSol.toFixed(0)} h ({(resumen.fraccionSol * 100).toFixed(1)} %)
        </dd>
        <dt title="Primer y último instante con el Sol visible en este día lunar">Sol visible</dt>
        <dd>
          {Number.isNaN(resumen.primerSol) ? '—' : `${formatoFecha(estadoEn(resumen.primerSol).fechaUTC).slice(5, 16)} → ${formatoFecha(estadoEn(resumen.ultimoSol).fechaUTC).slice(5, 16)}`}
        </dd>
        <dt title="Fracción del día lunar con la Tierra visible (comunicación directa)">Tierra visible</dt>
        <dd>{(resumen.fraccionTierra * 100).toFixed(1)} %</dd>
      </dl>
      {VALIDACION && (
        <>
          <p className="subtitulo" title="Alguna parte del disco visible (definición de Mazarico et al. 2011)">Promedio de 18,6 años</p>
          <dl className="datos datos--ancho">
            <dt title="Mazarico et al. (2011), Icarus 211: mapa de visibilidad media de 60 m, píxel del sitio; altura del observador no publicada">Mazarico 2011 (Sol · Tierra)</dt>
            <dd>
              {(VALIDACION.mazaricoSol.valor * 100).toFixed(1)} % · {(VALIDACION.mazaricoTierra.valor * 100).toFixed(1)} %
            </dd>
            <dt title="El motor con la misma definición sobre la serie de Horizons cada 3 h (E21), en este punto y a esta altura">Motor (Sol · Tierra)</dt>
            <dd>{validacion ? `${(validacion.sol * 100).toFixed(1)} % · ${(validacion.tierra * 100).toFixed(1)} %` : 'cargando…'}</dd>
          </dl>
          <p className="nota">
            A ras del suelo y en el centro, el motor coincide con la referencia a ±5 puntos (prueba E21); la referencia usa un
            DEM de 60 m y sus píxeles vecinos van de 22 % a 54 %. Subir el observador cambia mucho la luz en el polo.
          </p>
        </>
      )}
      <p className="nota">
        Son medidas, sin veredicto: nuestras fuentes no dan umbrales para aterrizar (pendiente máxima, elevación del Sol al
        descender); conseguirlos está en Abiertas. Con el Sol a la espalda no se ven sombras; solo se ven mirando de costado al
        Sol (LSB cap. 3, pp. 28–29). El horizonte lejano es el medido desde el centro del sitio.
      </p>
    </Seccion>
  )
}

/** La posición del Sol ya no se controla: se lee del estado (ENV-005). */
export function SeccionSol({ estado }: { estado: EstadoEscena }) {
  const visible = iluminacion(estado).solVisible
  const d = diaDe(estado.t)
  return (
    <Seccion titulo="Sol" abierta={false}>
      <dl className="datos datos--ancho">
        <dt>Elevación α</dt><dd>{estado.elevacionSolGrados.toFixed(1)}°</dd>
        <dt>Azimut</dt><dd>{(Number(estado.azimutSolGrados.toFixed(1)) % 360).toFixed(1)}° {cardinal(estado.azimutSolGrados)}</dd>
        <dt>Momento</dt><dd>{momento(estado)}</dd>
        <dt>Horizonte en su azimut</dt><dd>{elevacionHorizonte(estado.azimutSolGrados).toFixed(1)}°</dd>
        {DEFINICION_DIA === 'salida' && (
          <>
            <dt>Salida local</dt><dd>{Number.isNaN(d.salidaLocal) ? '—' : formatoFecha(estadoEn(d.salidaLocal).fechaUTC)}</dd>
            <dt>Puesta local</dt><dd>{Number.isNaN(d.puestaLocal) ? '—' : formatoFecha(estadoEn(d.puestaLocal).fechaUTC)}</dd>
          </>
        )}
        <dt>Diámetro del disco</dt><dd>{estado.diametroSolGrados.toFixed(3)}°</dd>
        <dt>Disco sobre el horizonte</dt><dd>{visible > 0 && visible < 1 ? `${(visible * 100).toFixed(1)} %` : visible >= 1 ? 'entero' : 'no'}</dd>
      </dl>
      <p className="nota">
        Sitio: {SITIO.nombre} ({Math.abs(SITIO.latitudGrados)}° {SITIO.latitudGrados >= 0 ? 'N' : 'S'}, {SITIO.longitudEsteGrados}° E). Posiciones reales: JPL
        Horizons (DE441, consultado el {PROCEDENCIA.consultadoUTC.slice(0, 10)}), tabla horaria interpolada. Disco de {estado.diametroSolGrados.toFixed(3)}°.{' '}
        {DEFINICION_DIA === 'salida'
          ? 'El horizonte real son los macizos del valle (SLDEM2015; LSB pp. 33–34): el Sol sale ~9 h después y se pone ~7 h antes que sobre el horizonte astronómico (medido en el primer día).'
          : 'Polo sur: el Sol da la vuelta al horizonte a ±2° (latitud subsolar ≤ 1,5424°, FA p. 412) y cruza el horizonte real (LOLA 5 m y 120 m) varias veces por día; las horas de Sol están en Evaluación.'}
      </p>
    </Seccion>
  )
}

/** Distancia para el panel: '—' si no aplica, '∞' si la penumbra no termina. */
function metros(x: number): string {
  if (Number.isNaN(x)) return '—'
  return Number.isFinite(x) ? `${x.toFixed(2)} m` : '∞'
}

/** ENV-003 y ENV-007: largo de la sombra y su penumbra, medidos desde el borde del poste. */
/** Si el clic quedó más lejos que esto del eje de la sombra, se avisa que no cayó sobre ella. */
const DESVIO_AVISO_M = 1

export function SeccionMedicion(props: { estado: EstadoEscena; medidas: PuntoMedido[]; alBorrarMedida: () => void }) {
  const { estado, medidas, alBorrarMedida } = props
  const elevacion = estado.elevacionSolGrados
  const h = OBSTACULO.alturaM
  const D = 2 * OBSTACULO.radioM
  const plano = limitesSombra(h, D, elevacion, estado.diametroSolGrados)
  const sol = estado.direccionSol
  const horizontal = Math.hypot(sol[0], sol[2]) || 1
  const real = limitesSombraSobreTerreno(h, D, elevacion, estado.diametroSolGrados, -sol[0] / horizontal, -sol[2] / horizontal)
  // E10: sin Sol sobre los macizos no hay sombra solar, aunque esté sobre el horizonte astronómico.
  const haySombra = elevacion > 1e-6 && iluminacion(estado).solVisible > 0
  const resultado = elevacion < -1e-6 ? 'sin sombra solar' : haySombra ? `${plano.centroM.toFixed(1)} m` : '∞ (Sol en el horizonte)'
  const hFielder = Number.isFinite(real.centroM) ? real.centroM * Math.tan((elevacion * Math.PI) / 180) : NaN
  return (
    <Seccion titulo="Medición" abierta={false}>
      <p className="formula">L = h / tan(α) (suelo plano)</p>
      <dl className="datos">
        <dt>h</dt><dd>{h.toFixed(1)} m</dd>
        <dt>α</dt><dd>{elevacion.toFixed(1)}°</dd>
        <dt>L</dt><dd className="datos__resultado">{resultado}</dd>
      </dl>
      {haySombra && (
        <>
          <p className="subtitulo" title="ENV-008">Sobre el relieve real</p>
          <dl className="datos datos--ancho datos--penumbra">
            <dt>Punta de la sombra</dt><dd>{metros(real.centroM)}</dd>
            <dt>Desnivel en la punta</dt><dd>{Number.isFinite(real.desnivelPuntaM) ? `${real.desnivelPuntaM >= 0 ? '+' : ''}${real.desnivelPuntaM.toFixed(2)} m` : '—'}</dd>
            <dt>Núcleo negro hasta</dt><dd>{metros(real.finNucleoM)}</dd>
            <dt>Penumbra hasta</dt><dd>{metros(real.finPenumbraM)}</dd>
            <dt>Ancho de la penumbra</dt><dd>{metros(real.anchoPenumbraM)}</dd>
            <dt>h que daría L·tan α</dt><dd>{Number.isFinite(hFielder) ? `${hFielder.toFixed(2)} m (${(((hFielder - h) / h) * 100).toFixed(1)} %)` : '—'}</dd>
          </dl>
          <p className="nota">
            En suelo plano la penumbra iría de {metros(plano.finNucleoM)} a {metros(plano.finPenumbraM)}. Con relieve, la fórmula falla: la
            altura deducida depende de la pendiente y del largo de la sombra (Fielder, cap. 4: 300 m con sombras cortas y 380 m con
            largas en el Straight Wall).
          </p>
        </>
      )}
      {haySombra && plano.nucleoCortadoPorAncho && (
        <p className="nota">
          Con α &lt; {plano.umbralNucleoEnPuntaGrados.toFixed(1)}° el poste ({D} m) tapa menos que el disco solar: la punta de la sombra
          ya no llega a negro.
        </p>
      )}
      <p className="nota">
        Distancias horizontales desde el borde del poste. Marca roja: L con suelo plano. Marca blanca: punta real sobre el relieve.
        Marcas celestes: fin del núcleo y fin de la penumbra sobre el relieve (ENV-007).
      </p>
      <MedicionInversaPanel medidas={medidas} alBorrar={alBorrarMedida} />
    </Seccion>
  )
}

/**
 * E4: el método de sombras al revés (Fielder, *Secrets of the Moon*, caps. 2 y 4): se marca la punta de la
 * sombra en el suelo y se deduce h = L · tan(α), con el Sol del instante en que se marcó.
 */
function MedicionInversaPanel({ medidas, alBorrar }: { medidas: PuntoMedido[]; alBorrar: () => void }) {
  const medida = medidas.length ? medidas[medidas.length - 1] : null
  if (!medida) {
    return (
      <p className="nota">
        <strong>Medición inversa:</strong> haz clic en el suelo donde veas la punta de la sombra; se calcula h = L · tan(α) como
        hacía Fielder desde la Tierra.
      </p>
    )
  }
  const e = estadoEn(medida.t)
  const m = medicionInversa(medida.x, medida.z, e.direccionSol, OBSTACULO.radioM)
  const real = OBSTACULO.alturaM
  return (
    <div className="inversa">
      <p className="formula">h = L · tan(α)</p>
      {m ? (
        <dl className="datos datos--ancho">
          <dt>L medida</dt><dd>{m.largoM.toFixed(2)} m</dd>
          <dt>α al medir</dt><dd>{e.elevacionSolGrados.toFixed(1)}°</dd>
          <dt>h deducida</dt><dd className="datos__resultado">{m.alturaM.toFixed(2)} m</dd>
          <dt>Error frente a {real} m</dt><dd>{(((m.alturaM - real) / real) * 100).toFixed(1)} %</dd>
        </dl>
      ) : (
        <p className="nota">El Sol estaba bajo el horizonte al medir: no hay sombra solar.</p>
      )}
      {m && m.desvioLateralM > DESVIO_AVISO_M && (
        <p className="aviso-fuerte">El punto quedó a {m.desvioLateralM.toFixed(1)} m del eje de la sombra: puede no ser su punta.</p>
      )}
      {m && (
        <p className="nota">
          La fórmula supone suelo plano (ENV-008): el punto marcado está a{' '}
          {(alturaSuelo(medida.x, medida.z) - alturaSuelo(0, 0)).toFixed(2)} m de la base del poste en altura, con una pendiente local de{' '}
          {pendienteGrados(medida.x, medida.z).toFixed(1)}°. Con penumbra, además, la punta no es un borde nítido (Fielder, cap. 4).
        </p>
      )}
      <button className="boton-texto" onClick={alBorrar}>Borrar la última</button>
      <RegistroMediciones medidas={medidas} />
    </div>
  )
}

/** E13: registro de mediciones, como el cuaderno de Fielder (Command History, DI cap. 8, pp. 422–423). */
function RegistroMediciones({ medidas }: { medidas: PuntoMedido[] }) {
  const filas = medidas.map((p) => {
    const e = estadoEn(p.t)
    const m = medicionInversa(p.x, p.z, e.direccionSol, OBSTACULO.radioM)
    return { fecha: e.fechaUTC.slice(0, 16).replace('T', ' '), alfa: e.elevacionSolGrados, m, pendiente: pendienteGrados(p.x, p.z) }
  })
  const csv = [
    'fecha_utc,alfa_grados,L_m,h_deducida_m,error_porciento,pendiente_grados',
    ...filas.map((f) =>
      [f.fecha, f.alfa.toFixed(3), f.m?.largoM.toFixed(3) ?? '', f.m?.alturaM.toFixed(3) ?? '', f.m ? (((f.m.alturaM - OBSTACULO.alturaM) / OBSTACULO.alturaM) * 100).toFixed(2) : '', f.pendiente.toFixed(2)].join(','),
    ),
  ].join('\n')
  return (
    <>
      <p className="subtitulo">Registro ({filas.length})</p>
      <table className="comprobaciones">
        <thead>
          <tr><th>UTC</th><th>α</th><th>L</th><th>h</th></tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{f.fecha.slice(5)}</td>
              <td>{f.alfa.toFixed(1)}°</td>
              <td>{f.m ? f.m.largoM.toFixed(1) : '—'}</td>
              <td>{f.m ? f.m.alturaM.toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="boton-texto" onClick={() => void navigator.clipboard?.writeText(csv)}>Copiar CSV</button>
    </>
  )
}

/** E13: la evidencia en pantalla: comprobaciones, gráfica del día y perfil de la sombra. */
export function SeccionVerificacion({ estado, alCambiarT }: { estado: EstadoEscena; alCambiarT: (t: number) => void }) {
  return (
    <Seccion titulo="Verificación" abierta={false}>
      <TablaComprobaciones estado={estado} />
      <p className="nota">✓ dentro de la tolerancia · ✗ fuera · Δ diferencia esperada (no es un error). Pasa el puntero por una fila para ver la fuente.</p>
      <p className="subtitulo">Día lunar (clic = ir a ese momento)</p>
      <GraficaDelDia t={estado.t} alCambiarT={alCambiarT} />
      <p className="nota">
        <span className="leyenda curva-alfa-l">α</span> · <span className="leyenda curva-plano-l">L con suelo plano</span> ·{' '}
        <span className="leyenda curva-relieve-l">L sobre el relieve</span> · <span className="leyenda curva-error-l">error de h = L·tan α</span>
      </p>
      <p className="subtitulo">Perfil de la sombra</p>
      <PerfilSombra estado={estado} />
      <p className="nota">Gris: relieve real. Líneas: rayos desde la tapa con α y α ± θ/2. Rojo: L con suelo plano; blanco: punta real.</p>
    </Seccion>
  )
}

/** Irradiancia en W/m² a partir de unidades de "Sol = 1 a 1 UA" (E9: 1361 W/m², FA p. 542). */
function vatios(x: number): string {
  const w = x * CONSTANTE_SOLAR_W_M2
  if (w === 0) return '0'
  if (w >= 10) return `${w.toFixed(1)} W/m²`
  if (w >= 0.01) return `${w.toFixed(3)} W/m²`
  return `${w.toExponential(1)} W/m²`
}

/** ENV-002, ENV-009 y ENV-010: de dónde viene la luz, en unidades de "Sol directo = 1". */
export function SeccionLuz({ estado }: { estado: EstadoEscena }) {
  const luz = iluminacion(estado)
  return (
    <Seccion titulo="Luz (W/m²)" abierta={false}>
      <dl className="datos datos--ancho">
        <dt>Sol, perpendicular</dt><dd>{vatios(luz.solNormal)}</dd>
        <dt>Sol sobre el suelo horizontal</dt><dd>{vatios(luz.solSobreSuelo)}</dd>
        <dt>Tierra ({(luz.faseTierra * 100).toFixed(0)} % iluminada), perpendicular</dt><dd>{vatios(luz.tierraNormal)}</dd>
        <dt>Devuelta por el suelo (radiosidad ρ·E)</dt><dd>{vatios(luz.reflejadaTerreno)}</dd>
      </dl>
      <p className="nota">
        Reflectancia {SUPERFICIE.albedo} ({SITIO_ACTIVO.fuenteAlbedo}). La luz reflejada ilumina caras verticales a la mitad;
        el suelo plano no se ilumina a sí mismo. Tierra (JPL Horizons): azimut {estado.azimutTierraGrados.toFixed(1)}°, elevación{' '}
        {estado.elevacionTierraGrados.toFixed(1)}°, diámetro {estado.diametroTierraGrados.toFixed(2)}°; se mueve por la libración.
        Luz terrestre derivada (E9): esfera lambertiana de albedo 0,32 (FA p. 542; lambertiana: supuesto) con su fase real.
      </p>
    </Seccion>
  )
}

export function SeccionCamara(props: {
  ev: number
  alCambiar: (ev: number) => void
  curva: CurvaTono
  alCambiarCurva: (c: CurvaTono) => void
  lupa: boolean
  alCambiarLupa: (l: boolean) => void
  acumular: boolean
  alCambiarAcumular: (a: boolean) => void
}) {
  const { ev, alCambiar, curva, alCambiarCurva, lupa, alCambiarLupa, acumular, alCambiarAcumular } = props
  return (
    <Seccion titulo="Cámara">
      <SliderConCampo
        id="exposicion"
        etiqueta="Exposición (EV, ×2 por paso)"
        unidad=" EV"
        min={EXPOSICION.minEV}
        max={EXPOSICION.maxEV}
        paso={0.5}
        decimales={1}
        valor={ev}
        limitar={limitarExposicion}
        alCambiar={alCambiar}
      />
      <p className={ev > 0 ? 'aviso-fuerte' : 'nota'} role="status">
        {ev > 0 ? `⚠ Exposición aumentada: sí (×${Math.round(2 ** ev).toLocaleString('es-PE')}). No es físico.` : 'Exposición aumentada: no.'}
      </p>
      <div className="velocidades velocidades--dos" role="group" aria-label="Curva de tono">
        <button className={curva === 'aces' ? 'activo' : ''} onClick={() => alCambiarCurva('aces')}>ACES (vista)</button>
        <button className={curva === 'lineal' ? 'activo' : ''} onClick={() => alCambiarCurva('lineal')}>Lineal (medición)</button>
      </div>
      <label className="casilla">
        <input type="checkbox" checked={lupa} onChange={(e) => alCambiarLupa(e.target.checked)} /> Lupa del cielo ×{AUMENTO_LUPA}
        {lupa && <span className="aviso-fuerte"> ⚠ Sol y Tierra agrandados: no es su tamaño real.</span>}
      </label>
      <label className="casilla">
        <input type="checkbox" checked={acumular} onChange={(e) => alCambiarAcumular(e.target.checked)} /> Sin grano en pausa
        (promedia hasta 64 cuadros; RTR p. 523)
      </label>
      <p className="nota">
        +0 EV = fotómetro de luz incidente: una superficie de reflectancia ρ de cara al Sol da ρ (RTR p. 289). La curva ACES
        comprime los tonos y no es física; en modo lineal el valor en pantalla es proporcional a la radiancia (RTR p. 286).
      </p>
    </Seccion>
  )
}

/** ENV-006: todo lo que no es físico se nombra en la interfaz; E13: las ayudas se pueden ocultar (DI pp. 443–444). */
export function SeccionAvisos({ ayudas, alCambiarAyudas }: { ayudas: Ayudas; alCambiarAyudas: (a: Ayudas) => void }) {
  return (
    <Seccion titulo="No físico">
      <label className="casilla">
        <input type="checkbox" checked={ayudas.cuadricula} onChange={(e) => alCambiarAyudas({ ...ayudas, cuadricula: e.target.checked })} />{' '}
        Cuadrícula
      </label>
      <label className="casilla">
        <input type="checkbox" checked={ayudas.marcas} onChange={(e) => alCambiarAyudas({ ...ayudas, marcas: e.target.checked })} /> Marcas de
        medición
      </label>
      <ul className="avisos">
        <li>Sol y Tierra en el cielo: dibujados a distancia fija en la dirección real; la Tierra sin la luz que la Luna le devuelve.</li>
        <li>Valle y montañas (E16, E20): relieve real {SITIO_ACTIVO.textos.valle}, con sombra propia por horizonte de vértice (8 azimuts).</li>
        <li>Exposición: de la cámara, anclada a un fotómetro de luz incidente (RTR p. 289); no es irradiancia real en W/m².</li>
        <li>Curva de tono ACES: comprime los tonos para la pantalla; para medir, modo lineal.</li>
        <li>Cuadrícula y marcas roja y celestes: ayudas de medición; no reciben luz.</li>
        <li>Sol y Tierra como discos de brillo uniforme: sin oscurecimiento del limbo; la Tierra cuenta como disco lleno aunque esté en fase.</li>
        <li>Penumbra en pantalla: un bloqueador promedio por píxel (PCSS), radio mínimo de medio píxel del mapa de sombras y grano por muestreo.</li>
        <li>Con el reloj corriendo o la cámara en movimiento (D4): 8 muestras de penumbra en vez de 32 (más grano), densidad de píxeles 1 y luz devuelta por el relieve recalculada cada 0,1° de Sol o Tierra. En pausa vuelven la calidad completa y el cálculo exacto.</li>
        <li>La sombra del poste empieza un poco detrás de su base por los márgenes contra el acné: ~0,9 m con el Sol a 6°, ~0,4 m a 13°, &lt; 0,1 m a 45°.</li>
        <li>Luz terrestre = 1/10 000 del Sol con la Tierra llena: supuesto sin cita.</li>
        <li>Luz devuelta por el suelo: un rebote sobre parches de 8 m, sin oclusión entre parches (terreno); suelo plano infinito (poste). Regolito: Hapke para la luz directa (P = 1, sin rugosidad; supuestos) y lambertiano para el rebote; gris.</li>
        <li>Relieve: muestras cada 2 m ({SITIO_ACTIVO.textos.relieve}); lo más pequeño no aparece. Sin curvatura lunar. El relieve no sombrea al poste.</li>
        <li>Cuadrícula y distancias: horizontales, en planta; las marcas se dibujan encima del relieve.</li>
        {SITIO_ACTIVO.tieneOrtofoto && <li>Albedo real: variaciones de la ortofoto LROC NAC (2010) sin la luz de la toma (Hapke + DTM, LRO al nadir: supuesto), escaladas a media 0,085; queda sombreado residual de lo menor a 2 m. El rebote usa la media.</li>}
        <li>Rocas sintéticas (casilla en Vista, apagada por defecto): posiciones y tamaños inventados (5–40 cm, distribución supuesta). No entran en las mediciones.</li>
        <li>Velocidad del reloj distinta de ×1: tiempo acelerado.</li>
        <li>La Tierra no eclipsa al Sol aunque pasen por el mismo punto del cielo.</li>
      </ul>
    </Seccion>
  )
}

/** E14: vista del sitio o de la Luna completa; E20: selector de sitio. */
/** E23: 'planificador' es la vista 2D de sitio y fecha (sin escena 3D). */
export type Vista = 'sitio' | 'luna' | 'planificador'

export function SeccionVista(props: {
  abierta?: boolean
  modelo: ModeloRegolito
  alCambiarModelo: (m: ModeloRegolito) => void
  albedoReal: boolean
  alCambiarAlbedoReal: (a: boolean) => void
  detalle: boolean
  alCambiarDetalle: (d: boolean) => void
  equipos: boolean
  alCambiarEquipos: (e: boolean) => void
  camara: ModoCamara
  alCambiarCamara: (c: ModoCamara) => void
  vista: Vista
  alCambiarVista: (v: Vista) => void
  exageracion: number
  alCambiarExageracion: (x: number) => void
  estado: EstadoEscena
}) {
  const { modelo, alCambiarModelo, albedoReal, alCambiarAlbedoReal, detalle, alCambiarDetalle, equipos, alCambiarEquipos, camara, alCambiarCamara, vista, alCambiarVista, exageracion, alCambiarExageracion, estado } = props
  const g = geometriaGlobal(estado, estado.distanciaTierraAu)
  const punto = ([lat, lon]: [number, number]) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}° E`
  return (
    <Seccion titulo="Vista" abierta={props.abierta ?? true}>
      {/* E20: cambiar de sitio recarga la página con ?sitio= (el motor carga los datos de ese sitio al arrancar). */}
      <div className="velocidades velocidades--dos" role="group" aria-label="Sitio">
        {(Object.keys(SITIOS) as IdSitio[]).map((id) => (
          <button
            key={id}
            className={id === SITIO_ACTIVO.id ? 'activo' : ''}
            onClick={() => {
              if (id !== SITIO_ACTIVO.id) location.search = `?sitio=${id}`
            }}
          >
            {id === 'apollo17' ? 'Apollo 17' : 'Polo sur'}
          </button>
        ))}
      </div>
      <p className="nota">
        {SITIO_ACTIVO.nombre}: {Math.abs(SITIO_ACTIVO.latitudGrados).toFixed(4)}° {SITIO_ACTIVO.latitudGrados >= 0 ? 'N' : 'S'},{' '}
        {SITIO_ACTIVO.longitudEsteGrados.toFixed(4)}° E ({SITIO_ACTIVO.fuenteCoordenadas}). Albedo {SITIO_ACTIVO.albedo} ({SITIO_ACTIVO.fuenteAlbedo}).
      </p>
      <div className="velocidades velocidades--dos" role="group" aria-label="Vista">
        <button className={vista === 'sitio' ? 'activo' : ''} onClick={() => alCambiarVista('sitio')}>Sitio</button>
        <button className={vista === 'luna' ? 'activo' : ''} onClick={() => alCambiarVista('luna')}>Luna completa</button>
      </div>
      <button className={`plan__boton-vista ${vista === 'planificador' ? 'activo' : ''}`} onClick={() => alCambiarVista('planificador')}>
        Planificador de sitio y fecha (2D)
      </button>
      {vista === 'planificador' && (
        <p className="nota">
          Compara sitios y fechas de 2026 a 2030: Sol (energía) y Tierra (comunicación directa) sobre el horizonte real. Sin escena 3D: los
          controles están en la vista.
        </p>
      )}
      {vista === 'sitio' && (
        <>
          <div className="velocidades velocidades--dos" role="group" aria-label="Cámara" style={{ marginTop: 6 }}>
            <button className={camara === 'aerea' ? 'activo' : ''} onClick={() => alCambiarCamara('aerea')}>Aérea</button>
            <button className={camara === 'astronauta' ? 'activo' : ''} onClick={() => alCambiarCamara('astronauta')}>Astronauta (1,7 m)</button>
          </div>
          <p className="subtitulo">Regolito (luz directa)</p>
          {SITIO_ACTIVO.tieneHapkeWac && (
            <div className="velocidades velocidades--dos" role="group" aria-label="Modelo del regolito">
              <button className={modelo === 'calibrado' ? 'activo' : ''} onClick={() => alCambiarModelo('calibrado')}>Hapke calibrado</button>
              <button className={modelo === 'wac' ? 'activo' : ''} onClick={() => alCambiarModelo('wac')}>Hapke medido (WAC)</button>
            </div>
          )}
          <p className="nota">
            {modelo === 'calibrado'
              ? `Hapke 1981 del LSB (p. 559), con w calibrado para albedo normal 0,085${SITIO_ACTIVO.albedo !== 0.085 ? ` y escalado por el albedo del sitio (${SITIO_ACTIVO.albedo}, supuesto)` : ''}.`
              : 'Parámetros medidos por LROC WAC (Sato et al. 2014) en la celda de 1° del sitio, sin rugosidad (ecuaciones no disponibles en nuestras fuentes): albedo normal 0,115, más alto que el 7–10 % del LSB.'}
            {!SITIO_ACTIVO.tieneHapkeWac && ' Sin mapa de Hapke de LROC WAC para este sitio.'}
          </p>
          {SITIO_ACTIVO.tieneOrtofoto && (
            <label className="casilla">
              <input type="checkbox" checked={albedoReal} onChange={(e) => alCambiarAlbedoReal(e.target.checked)} /> Albedo real (foto
              LROC normalizada)
            </label>
          )}
          <label className="casilla">
            <input type="checkbox" checked={detalle} onChange={(e) => alCambiarDetalle(e.target.checked)} /> Rocas sintéticas (posiciones
            inventadas; solo visual)
          </label>
          {SITIO_ACTIVO.tieneEquipos && (
            <label className="casilla">
              <input type="checkbox" checked={equipos} onChange={(e) => alCambiarEquipos(e.target.checked)} /> Equipos del Apollo 17
            </label>
          )}
          {equipos && (
            <p className="nota">
              Módulo lunar (etapa de descenso), LRV, ALSEP y SEP en su posición medida por LROC (±3–4 m). LM: cuerpo del modelo de
              NASA 3D Resources y tren de aterrizaje reconstruido con las medidas de NSSDCA (9,4 m entre pies); lámina metálica que
              refleja el suelo iluminado y el cielo negro. LRV: LSB p. 527. Supuestos: orientación (LM hacia el oeste), pies,
              puntales secundarios y escalera, reflectancias de la lámina, ALSEP y SEP como cajas. El poste se oculta: estaba donde está el
              LM.
            </p>
          )}
          {camara === 'astronauta' && (
            <p className="nota">Arrastra para mirar alrededor; W A S D o las flechas para caminar (1,5 m/s). Ojos a 1,7 m sobre el relieve (supuesto).</p>
          )}
        </>
      )}
      {vista === 'luna' && (
        <>
          <dl className="datos datos--ancho">
            <dt>Punto subsolar</dt><dd>{punto(g.subsolar)}</dd>
            <dt>Punto subterrestre (libración)</dt><dd>{punto(g.subterrestre)}</dd>
            <dt>Distancia a la Tierra</dt><dd>{Math.round(g.distanciaTierraKm).toLocaleString('es-PE')} km</dd>
          </dl>
          <label className="casilla">
            <input type="checkbox" checked={exageracion > 1} onChange={(e) => alCambiarExageracion(e.target.checked ? 10 : 1)} /> Relieve ×10
            {exageracion > 1 && <span className="aviso-fuerte"> ⚠ exagerado: no es la escala real.</span>}
          </label>
          <p className="nota">
            Relieve y albedo: LOLA LDEM_4 y LDAM_4 (1064 nm; brillo visible escalado en el sitio, supuesto). Sol y Tierra reales
            (Horizons). Sin sombras del relieve a esta escala. Marca amarilla: {SITIO_ACTIVO.nombre}.
          </p>
        </>
      )}
    </Seccion>
  )
}
