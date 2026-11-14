// E23: planificador de sitio y fecha (reto "Lunar Landing Site Navigator", NASA Space Apps 2026). Vista 2D, sin escena 3D:
// para un lugar y un período de 2026–2030, cuándo se ve el Sol (energía) y la Tierra (comunicación directa), sobre el
// horizonte real. El cálculo es del motor (src/engine/planificador.ts); aquí solo se dibuja.
import { useEffect, useMemo, useRef, useState } from 'react'
import metaTabla from '../data/efemerides-luna.json'
import urlTabla from '../data/efemerides-luna.f32?url'
import { crearTablaLuna, prepararSitio, type TablaLuna } from '../engine/efemeridesLuna'
import { horizonteEn, perfilDesde, type Mascara, type PerfilHorizonte } from '../engine/mascara'
import { barrer, cieloDelPunto, margenSol, margenTierra, proximoCambio, resumir, ventanas, type Barrido, type PuntoPlan } from '../engine/planificador'
import { ALTURAS_OBSERVADOR_M } from '../engine/evaluacion'
import { lugarPropio, MARCAS_CATALOGO, obtenerMascara, type Lugar } from './lugares'
import { MapaPolar } from './MapaPolar'
import { SITIOS, type IdSitio } from '../engine/sitio'
import { Comparacion, MesAMes, type Escenario } from './Comparacion'
import { dentroDelDominio } from '../engine/demPolar'

const DIA_MS = 86_400_000
const PASO_MS = 600_000
const INICIO_TABLA = Date.parse(metaTabla.inicioUTC)
const FIN_TABLA = Date.parse(metaTabla.finUTC)
/** Duración de los períodos: una semana, un día lunar (29,53 d, LSB p. 58) y tres meses. */
const PERIODOS = [
  { dias: 7, nombre: '7 días' },
  { dias: 29.53, nombre: '1 día lunar' },
  { dias: 90, nombre: '90 días' },
] as const

// ---------- Datos ----------

let promesaTabla: Promise<TablaLuna> | null = null
/** La tabla global (E22, 457 KB) se baja una vez, al abrir el planificador. */
function useTablaLuna(): TablaLuna | null {
  const [tabla, setTabla] = useState<TablaLuna | null>(null)
  useEffect(() => {
    let vivo = true
    promesaTabla ??= fetch(urlTabla)
      .then((r) => r.arrayBuffer())
      .then((b) => crearTablaLuna(b, metaTabla))
    promesaTabla.then((t) => vivo && setTabla(t))
    return () => {
      vivo = false
    }
  }, [])
  return tabla
}

function useMascara(lugar: Lugar): Mascara | null {
  const [m, setM] = useState<{ id: string; mascara: Mascara } | null>(null)
  useEffect(() => {
    let vivo = true
    obtenerMascara(lugar).then((mascara) => vivo && setM({ id: lugar.id, mascara }))
    return () => {
      vivo = false
    }
  }, [lugar])
  return m && m.id === lugar.id ? m.mascara : null
}

// ---------- Formato ----------

const fechaUTC = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
function duracion(ms: number): string {
  const min = Math.round(ms / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  return d > 0 ? `${d} d ${String(h).padStart(2, '0')} h` : h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
const pct = (x: number) => `${(100 * x).toFixed(1)} %`
const grados = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}°`
const coordenadas = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${(((lon % 360) + 360) % 360).toFixed(4)}° E`
/** Para el selector datetime-local (en UTC). */
const aCampo = (ms: number) => new Date(ms).toISOString().slice(0, 16)
const deCampo = (v: string) => Date.parse(`${v}:00Z`)

// ---------- Componente ----------

export function Planificador(props: { lugares: Lugar[]; lugarInicial?: string; alSimular?: (sitio: IdSitio, contactoMs: number) => void }) {
  const tabla = useTablaLuna()
  const [lugarId, setLugarId] = useState(props.lugarInicial ?? props.lugares[0].id)
  // E24: punto propio dentro del dominio polar (mapa o coordenadas).
  const [propio, setPropio] = useState<Lugar | null>(null)
  const [verMapa, setVerMapa] = useState(false)
  const lista = propio ? [...props.lugares, propio] : props.lugares
  const lugar = lista.find((l) => l.id === lugarId) ?? props.lugares[0]
  const elegirPropio = (lat: number, lon: number) => {
    const l = lugarPropio(lat, lon)
    setPropio(l)
    setLugarId(l.id)
  }
  const [inicio, setInicio] = useState(() => Date.parse('2026-12-01T00:00:00Z'))
  const [dias, setDias] = useState<number>(PERIODOS[1].dias)
  const [altura, setAltura] = useState<number>(0)
  const [cursor, setCursor] = useState(inicio)
  // E25: escenarios guardados para comparar.
  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const mascara = useMascara(lugar)
  const fin = Math.min(inicio + dias * DIA_MS, FIN_TABLA)
  const cursorLimitado = Math.min(Math.max(cursor, inicio), fin)

  const punto: PuntoPlan | null = useMemo(
    () => (mascara ? { sitio: prepararSitio(lugar.latitudGrados, lugar.longitudEsteGrados), perfil: perfilDesde(mascara, altura) } : null),
    [mascara, lugar, altura],
  )
  const barrido = useMemo(() => (tabla && punto ? barrer(tabla, punto, inicio, fin, PASO_MS) : null), [tabla, punto, inicio, fin])
  const resumen = useMemo(() => (barrido ? resumir(barrido) : null), [barrido])
  const vSol = useMemo(() => (barrido ? ventanas(barrido, 'sol') : []), [barrido])
  const vTierra = useMemo(() => (barrido ? ventanas(barrido, 'tierra') : []), [barrido])

  return (
    <div className="planificador">
      <header className="plan__encabezado">
        <h1>Planificador de sitio y fecha</h1>
        <p className="nota">
          ¿Cuándo hay Sol para generar energía y Tierra para comunicarse directamente? Posiciones reales (JPL Horizons, DE441) sobre el
          horizonte real del lugar, de 2026 a 2030. Horas en UTC.
        </p>
      </header>

      <section className="plan__controles" aria-label="Escenario">
        <label>
          <span className="campo-etiqueta">Lugar</span>
          <select value={lugar.id} onChange={(e) => setLugarId(e.target.value)}>
            {[...new Set(lista.map((l) => l.grupo))].map((grupo) => (
              <optgroup key={grupo} label={grupo}>
                {lista
                  .filter((l) => l.grupo === grupo)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre.replace(' (centro del mosaico)', '')}
                      {l.detalle === 'aproximado' ? ' · horizonte aproximado' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span className="campo-etiqueta">Inicio (UTC)</span>
          <input
            type="datetime-local"
            value={aCampo(inicio)}
            min={aCampo(INICIO_TABLA)}
            max={aCampo(FIN_TABLA - DIA_MS)}
            onChange={(e) => {
              const ms = deCampo(e.target.value)
              if (!Number.isNaN(ms)) {
                const limitado = Math.min(Math.max(ms, INICIO_TABLA), FIN_TABLA - DIA_MS)
                setInicio(limitado)
                setCursor(limitado)
              }
            }}
          />
        </label>
        <div>
          <span className="campo-etiqueta">Período</span>
          <div className="velocidades plan__grupo" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.dias} className={dias === p.dias ? 'activo' : ''} onClick={() => setDias(p.dias)}>
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="campo-etiqueta">Altura del observador</span>
          <div className="velocidades plan__grupo" role="group" aria-label="Altura del observador">
            {ALTURAS_OBSERVADOR_M.map((h) => (
              <button key={h} className={altura === h ? 'activo' : ''} onClick={() => setAltura(h)}>
                {h === 0 ? 'Suelo' : h === 1.7 ? '1,7 m' : '10 m (mástil)'}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="plan__acciones">
        <button
          className="boton-texto"
          disabled={escenarios.length >= 6}
          onClick={() => setEscenarios((l) => [...l, { id: `${lugar.id}|${inicio}|${dias}|${altura}|${Date.now()}`, lugar, inicio, dias, altura }])}
        >
          + Agregar a la comparación ({escenarios.length}/6)
        </button>
        {props.alSimular && lugar.id in SITIOS && (
          <button className="boton-texto" onClick={() => props.alSimular!(lugar.id as IdSitio, cursorLimitado)} title="Abre el asistente con este sitio y el instante elegido">
            Simular aterrizaje en 3D aquí ({fechaUTC(cursorLimitado)})
          </button>
        )}
        <button
          className="boton-texto"
          onClick={() => {
            const siguiente = Math.min(inicio + 29.530589 * DIA_MS, FIN_TABLA - DIA_MS)
            setInicio(siguiente)
            setCursor(siguiente)
          }}
        >
          Mismo lugar, mes siguiente →
        </button>
      </div>
      <CoordenadasPropias alUsar={elegirPropio} verMapa={verMapa} alAlternarMapa={() => setVerMapa((v) => !v)} />
      {verMapa && <MapaPolar marcas={MARCAS_CATALOGO} elegido={lugar.latitudGrados < -80 ? lugar : null} alElegir={elegirPropio} />}
      <p className="nota">
        {lugar.nombre}: {coordenadas(lugar.latitudGrados, lugar.longitudEsteGrados)}. Horizonte: {lugar.fuente}.
      </p>
      {lugar.detalle === 'aproximado' && (
        <p className="aviso-fuerte">
          ⚠ Horizonte aproximado (LOLA 240 m, sin el relieve de menos de ~500 m). A ras del suelo o a 1 m puede diferir hasta ~40 puntos de Sol del
          que da el DTM de 5 m en crestas y bordes de cráter (validación E24); desde 10 m el horizonte difiere ~0,2°. Para decidir, usa un sitio del
          catálogo.
        </p>
      )}

      {!tabla || !punto || !barrido || !resumen ? (
        <p className="nota">Cargando efemérides y horizonte…</p>
      ) : (
        <>
          <Ahora tabla={tabla} punto={punto} ms={cursorLimitado} hastaMs={Math.min(fin + 60 * DIA_MS, FIN_TABLA)} />
          <LineaDeTiempo barrido={barrido} vSol={vSol} vTierra={vTierra} cursor={cursorLimitado} alElegir={setCursor} />
          <Cielo barrido={barrido} perfil={punto.perfil} cursorIndice={Math.round((cursorLimitado - inicio) / PASO_MS)} sur={lugar.latitudGrados < 0} />
          <section className="plan__bloque" aria-label="Resumen del período">
            <h2>Resumen del período ({fechaUTC(inicio)} → {fechaUTC(fin)})</h2>
            <dl className="plan__cifras">
              <Cifra nombre="Sol visible" valor={pct(resumen.fraccionSol)} detalle={`${resumen.horasSol.toFixed(0)} h · ${vSol.length} ventana(s)`} />
              <Cifra nombre="Tierra visible" valor={pct(resumen.fraccionTierra)} detalle={`${vTierra.length} ventana(s)`} />
              <Cifra nombre="Sol y Tierra a la vez" valor={pct(resumen.fraccionAmbos)} detalle="energía y comunicación directa" />
              <Cifra nombre="Noche más larga" valor={duracion(resumen.nocheMasLargaH * 3_600_000)} detalle="lo que debe aguantar la batería" />
              <Cifra nombre="Silencio más largo" valor={duracion(resumen.silencioMasLargoH * 3_600_000)} detalle="sin Tierra visible" />
              <Cifra nombre="Panel vertical, media" valor={`${resumen.panelMedioWm2.toFixed(0)} W/m²`} detalle="a 1 UA; supuesto de panel" />
            </dl>
          </section>
          <Comparacion
            tabla={tabla}
            escenarios={escenarios}
            alSimular={props.alSimular}
            alQuitar={(id) => setEscenarios((l) => l.filter((e) => e.id !== id))}
            alVer={(e) => {
              if (e.lugar.id.startsWith('propio:')) setPropio(e.lugar)
              setLugarId(e.lugar.id)
              setInicio(e.inicio)
              setCursor(e.inicio)
              setDias(e.dias)
              setAltura(e.altura)
            }}
          />
          <MesAMes
            tabla={tabla}
            punto={punto}
            nombre={`${lugar.nombre}, ${altura === 0 ? 'a ras del suelo' : `a ${String(altura).replace('.', ',')} m`}`}
            alElegir={(ms) => {
              setInicio(ms)
              setCursor(ms)
              setDias(PERIODOS[1].dias)
            }}
          />
          <section className="plan__bloque">
            <h2>Cómo se calcula</h2>
            <ul className="plan__lista">
              <li>
                <b>Sol visible:</b> alguna parte del disco sobre el horizonte real (la definición de los mapas de Mazarico et al. 2011). La energía se
                pondera por la parte del disco que asoma.
              </li>
              <li>
                <b>Tierra visible:</b> el centro del disco sobre el horizonte real: comunicación directa posible, sin satélites de relevo.
              </li>
              <li>
                <b>Panel vertical</b> que gira para mirar al Sol: 1361 W/m² (FA p. 542) × parte del disco × cos(elevación). Supuesto: cerca del polo el Sol
                va casi rasante y los paneles suelen ser verticales, pero cada misión tiene el suyo.
              </li>
              <li>
                <b>Efemérides:</b> una tabla de JPL Horizons cada 3 h, comprobada contra Horizons por sitio a ≤ 0,0065° (E22). <b>Horizonte:</b> por
                azimut cada 0,5°, desde la altura elegida (E21, E23).
              </li>
              <li>
                <b>Sin atmósfera:</b> no hay refracción; el horizonte lo ponen el relieve y la curvatura de la Luna. Cerca del polo el Sol no pasa de unos
                pocos grados: unos metros de altura o unos cientos de metros de distancia cambian mucho las horas de luz.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

/** E24: coordenadas propias (dentro de 190 km del polo sur). */
function CoordenadasPropias(props: { alUsar: (lat: number, lon: number) => void; verMapa: boolean; alAlternarMapa: () => void }) {
  const [lat, setLat] = useState('-85.5')
  const [lon, setLon] = useState('0')
  const la = Number(lat.replace(',', '.'))
  const lo = Number(lon.replace(',', '.'))
  const valido = Number.isFinite(la) && Number.isFinite(lo) && la < 0 && dentroDelDominio(la, lo)
  return (
    <div className="plan__propio">
      <span className="campo-etiqueta">Punto propio en el polo sur</span>
      <label>
        Latitud (°){' '}
        <input className="valor__campo" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitud en grados (negativa al sur)" />
      </label>
      <label>
        Longitud este (°){' '}
        <input className="valor__campo" value={lon} onChange={(e) => setLon(e.target.value)} aria-label="Longitud este en grados" />
      </label>
      <button className="boton-texto" disabled={!valido} onClick={() => props.alUsar(la, ((lo % 360) + 360) % 360)}>
        Usar este punto
      </button>
      <button className="boton-texto" onClick={props.alAlternarMapa}>
        {props.verMapa ? 'Ocultar mapa' : 'Elegir en el mapa'}
      </button>
      {!valido && <span className="plan__detalle">Solo dentro de 190 km del polo sur (~83,7° S o más al sur).</span>}
    </div>
  )
}

function Cifra({ nombre, valor, detalle }: { nombre: string; valor: string; detalle: string }) {
  return (
    <div className="plan__cifra">
      <dt>{nombre}</dt>
      <dd>
        <span className="plan__valor">{valor}</span>
        <span className="plan__detalle">{detalle}</span>
      </dd>
    </div>
  )
}

/** Tarjetas del instante elegido: qué se ve y cuánto falta para que cambie. */
function Ahora({ tabla, punto, ms, hastaMs }: { tabla: TablaLuna; punto: PuntoPlan; ms: number; hastaMs: number }) {
  const c = useMemo(() => cieloDelPunto(tabla, punto, ms), [tabla, punto, ms])
  const sol = useMemo(() => proximoCambio(tabla, punto, ms, 'sol', hastaMs), [tabla, punto, ms, hastaMs])
  const tierra = useMemo(() => proximoCambio(tabla, punto, ms, 'tierra', hastaMs), [tabla, punto, ms, hastaMs])
  const cuenta = (x: typeof sol, oculta: string, sale: string) =>
    x.cambioMs === null ? 'sin cambios en los próximos 60 días' : `${x.visible ? oculta : sale} en ${duracion(x.cambioMs - ms)} (${fechaUTC(x.cambioMs)})`
  return (
    <section className="plan__bloque" aria-label="Instante elegido">
      <h2>{fechaUTC(ms)} UTC</h2>
      <div className="plan__tarjetas">
        <div className={`plan__tarjeta ${sol.visible ? 'plan__tarjeta--sol' : ''}`}>
          <div className="plan__tarjeta-titulo">Sol {sol.visible ? 'visible' : 'oculto'}</div>
          <div className="plan__valor">{grados(c.sol.elevacionGrados)}</div>
          <div className="plan__detalle">
            elevación; {grados(c.solSobreHorizonte)} sobre el horizonte; azimut {c.sol.azimutGrados.toFixed(1)}°
          </div>
          <div className="plan__cuenta">{cuenta(sol, 'Se oculta', 'Sale')}</div>
        </div>
        <div className={`plan__tarjeta ${tierra.visible ? 'plan__tarjeta--tierra' : ''}`}>
          <div className="plan__tarjeta-titulo">Tierra {tierra.visible ? 'visible' : 'oculta'}</div>
          <div className="plan__valor">{grados(c.tierra.elevacionGrados)}</div>
          <div className="plan__detalle">
            elevación; {grados(c.tierraSobreHorizonte)} sobre el horizonte; azimut {c.tierra.azimutGrados.toFixed(1)}°; fase {pct(c.tierra.fase)}
          </div>
          <div className="plan__cuenta">{cuenta(tierra, 'Se oculta', 'Sale')}</div>
        </div>
        <div className="plan__tarjeta">
          <div className="plan__tarjeta-titulo">Energía</div>
          <div className="plan__valor">{c.panelWm2.toFixed(0)} W/m²</div>
          <div className="plan__detalle">
            panel vertical; {pct(c.solFraccion)} del disco solar visible; Sol a {c.sol.distanciaAu.toFixed(4)} UA
          </div>
        </div>
      </div>
    </section>
  )
}

const ANCHO = 1000

/** Línea de tiempo: ventanas de Sol (con la energía del panel), de Tierra y de ambos; clic para elegir el instante. */
function LineaDeTiempo(props: { barrido: Barrido; vSol: { inicioMs: number; finMs: number }[]; vTierra: { inicioMs: number; finMs: number }[]; cursor: number; alElegir: (ms: number) => void }) {
  const { barrido: b, vSol, vTierra, cursor, alElegir } = props
  const ref = useRef<SVGSVGElement>(null)
  const desde = b.desdeMs
  const hasta = b.desdeMs + (b.n - 1) * b.pasoMs
  const x = (ms: number) => ((ms - desde) / (hasta - desde)) * ANCHO
  const FILA = 26
  const filas = [
    { nombre: 'Sol', y: 18, v: vSol, clase: 'plan__barra--sol' },
    { nombre: 'Tierra', y: 18 + FILA + 8, v: vTierra, clase: 'plan__barra--tierra' },
  ]
  const ambos = useMemo(() => {
    const r: { inicioMs: number; finMs: number }[] = []
    for (const s of vSol) for (const t of vTierra) {
      const a = Math.max(s.inicioMs, t.inicioMs)
      const c = Math.min(s.finMs, t.finMs)
      if (c > a) r.push({ inicioMs: a, finMs: c })
    }
    return r
  }, [vSol, vTierra])
  // Energía del panel como área dentro de la fila del Sol.
  const area = useMemo(() => {
    let d = `M0 ${18 + FILA}`
    const salto = Math.max(1, Math.floor(b.n / 1000))
    for (let k = 0; k < b.n; k += salto) d += ` L${((k / (b.n - 1)) * ANCHO).toFixed(1)} ${(18 + FILA - (b.panelWm2[k] / 1361) * FILA).toFixed(1)}`
    return `${d} L${ANCHO} ${18 + FILA} Z`
  }, [b])
  const marcas = useMemo(() => {
    const total = (hasta - desde) / DIA_MS
    const cada = total <= 8 ? 1 : total <= 31 ? 5 : 15
    const r: number[] = []
    const primero = Math.ceil(desde / DIA_MS) * DIA_MS
    for (let ms = primero; ms <= hasta; ms += cada * DIA_MS) r.push(ms)
    return r
  }, [desde, hasta])
  const ALTO = 18 + 3 * (FILA + 8) + 18
  const elegir = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    alElegir(desde + ((clientX - r.left) / r.width) * (hasta - desde))
  }
  return (
    <section className="plan__bloque" aria-label="Línea de tiempo">
      <h2>Ventanas en el período</h2>
      <svg
        ref={ref}
        className="plan__svg plan__svg--tiempo"
        viewBox={`-60 0 ${ANCHO + 70} ${ALTO}`}
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          elegir(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && elegir(e.clientX)}
        role="img"
        aria-label="Ventanas de Sol y Tierra visibles"
      >
        {[...filas, { nombre: 'Ambos', y: 18 + 2 * (FILA + 8), v: ambos, clase: 'plan__barra--ambos' }].map((f) => (
          <g key={f.nombre}>
            <text x={-8} y={f.y + FILA / 2 + 4} className="plan__eje" textAnchor="end">
              {f.nombre}
            </text>
            <rect x={0} y={f.y} width={ANCHO} height={FILA} className="plan__fondo-fila" />
            {f.v.map((w, i) => (
              <rect key={i} x={x(w.inicioMs)} y={f.y} width={Math.max(0.8, x(w.finMs) - x(w.inicioMs))} height={FILA} className={f.clase} />
            ))}
          </g>
        ))}
        <path d={area} className="plan__area-panel" />
        {marcas.map((ms) => (
          <g key={ms}>
            <line x1={x(ms)} x2={x(ms)} y1={14} y2={ALTO - 16} className="plan__rejilla" />
            <text x={x(ms)} y={ALTO - 4} className="plan__eje" textAnchor="middle">
              {new Date(ms).toISOString().slice(5, 10)}
            </text>
          </g>
        ))}
        <line x1={x(cursor)} x2={x(cursor)} y1={6} y2={ALTO - 16} className="plan__cursor" />
      </svg>
      <p className="nota">Clic o arrastre para elegir el instante. Dentro de la fila del Sol, la curva es la energía del panel vertical (0–1361 W/m²).</p>
    </section>
  )
}

/** Cielo en panorámica: el horizonte real y las trayectorias del Sol y la Tierra en el período. */
function Cielo({ barrido: b, perfil, cursorIndice, sur }: { barrido: Barrido; perfil: PerfilHorizonte; cursorIndice: number; sur: boolean }) {
  // Centro de la panorámica: el meridiano hacia el ecuador (norte en el hemisferio sur), donde el Sol culmina.
  const centro = sur ? 0 : 180
  const rel = (az: number) => ((((az - centro + 540) % 360) + 360) % 360) - 180
  const { min, max } = useMemo(() => {
    let mn = -2
    let mx = 2
    for (const e of perfil.elevacionGrados) {
      mn = Math.min(mn, e)
      mx = Math.max(mx, e)
    }
    // Las trayectorias bajo el horizonte se muestran hasta 6° por debajo del punto más bajo del relieve.
    let trayectoria = mn
    for (let k = 0; k < b.n; k++) {
      mx = Math.max(mx, b.solElevacion[k], b.tierraElevacion[k])
      trayectoria = Math.min(trayectoria, b.solElevacion[k], b.tierraElevacion[k])
    }
    return { min: Math.floor(Math.max(trayectoria, mn - 6) - 1), max: Math.ceil(mx + 1) }
  }, [b, perfil])
  const ALTO = 300
  const X = (az: number) => ((rel(az) + 180) / 360) * ANCHO
  const Y = (el: number) => ALTO - ((el - min) / (max - min)) * ALTO
  let terreno = `M0 ${ALTO}`
  for (let a = -180; a <= 180; a += 0.5) terreno += ` L${(((a + 180) / 360) * ANCHO).toFixed(1)} ${Y(horizonteEn(perfil, a + centro)).toFixed(1)}`
  terreno += ` L${ANCHO} ${ALTO} Z`
  const trazo = (azs: Float32Array, els: Float32Array, visible: (k: number) => boolean) => {
    const salto = Math.max(1, Math.floor(b.n / 1500))
    const puntos: string[] = []
    for (let k = 0; k < b.n; k += salto) if (visible(k)) puntos.push(`M${X(azs[k]).toFixed(1)} ${Y(els[k]).toFixed(1)}h0.01`)
    return puntos.join('')
  }
  const k = Math.min(Math.max(cursorIndice, 0), b.n - 1)
  const pasoY = max - min > 40 ? 10 : max - min > 12 ? 5 : 1
  const lineasY: number[] = []
  for (let e = Math.ceil(min / pasoY) * pasoY; e <= max; e += pasoY) lineasY.push(e)
  const cardinales = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['O', 270],
  ] as const
  return (
    <section className="plan__bloque" aria-label="Cielo">
      <h2>Cielo y horizonte</h2>
      <svg className="plan__svg" viewBox={`-40 -10 ${ANCHO + 50} ${ALTO + 34}`} role="img" aria-label="Horizonte y trayectorias del Sol y la Tierra">
        {lineasY.map((e) => (
          <g key={e}>
            <line x1={0} x2={ANCHO} y1={Y(e)} y2={Y(e)} className={e === 0 ? 'plan__rejilla plan__rejilla--cero' : 'plan__rejilla'} />
            <text x={-6} y={Y(e) + 4} className="plan__eje" textAnchor="end">
              {e}°
            </text>
          </g>
        ))}
        {cardinales.map(([n, az]) => (
          <text key={n} x={X(az)} y={ALTO + 22} className="plan__eje" textAnchor="middle">
            {n}
          </text>
        ))}
        <path d={trazo(b.solAzimut, b.solElevacion, (i) => margenSol(b.solSobreHorizonte[i]) <= 0)} className="plan__traza plan__traza--sol-oculto" />
        <path d={trazo(b.solAzimut, b.solElevacion, (i) => margenSol(b.solSobreHorizonte[i]) > 0)} className="plan__traza plan__traza--sol" />
        <path d={trazo(b.tierraAzimut, b.tierraElevacion, (i) => margenTierra(b.tierraSobreHorizonte[i]) <= 0)} className="plan__traza plan__traza--tierra-oculta" />
        <path d={trazo(b.tierraAzimut, b.tierraElevacion, (i) => margenTierra(b.tierraSobreHorizonte[i]) > 0)} className="plan__traza plan__traza--tierra" />
        <path d={terreno} className="plan__terreno" />
        <circle cx={X(b.solAzimut[k])} cy={Y(b.solElevacion[k])} r={7} className={`plan__disco plan__disco--sol ${margenSol(b.solSobreHorizonte[k]) > 0 ? '' : 'plan__disco--oculto'}`} />
        <circle cx={X(b.tierraAzimut[k])} cy={Y(b.tierraElevacion[k])} r={7} className={`plan__disco plan__disco--tierra ${margenTierra(b.tierraSobreHorizonte[k]) > 0 ? '' : 'plan__disco--oculto'}`} />
      </svg>
      <p className="nota">
        Panorámica de 360° centrada en el {sur ? 'norte' : 'sur'} (donde culmina el Sol); escala vertical exagerada. Amarillo: Sol; azul: Tierra;
        tenue: bajo el horizonte (un disco hueco está oculto tras el relieve). El relieve gris es el horizonte real desde la altura elegida. Los discos marcan el instante elegido (tamaño no a
        escala: el Sol mide 0,53° y la Tierra ~1,9°).
      </p>
    </section>
  )
}
