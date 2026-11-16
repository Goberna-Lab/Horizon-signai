// La misión PLANIFICADA como recorrido guiado (`/simulador?…&guia=<nombre>`): los pasos que EVA cuenta salen de la
// evaluación del motor del Planificador (`evaluate` de @/shared/planning) para ese lugar, esa fecha y ese equipo. No son
// hechos que pasaron: es lo que el motor calcula que pasará. Mismo formato que una bitácora real (@/shared/bitacoras)
// para que guiada.ts las cuente igual. Función pura (sin `tr` ni DOM): texto en los dos idiomas, con prueba.
import type { Bitacora, Fuente, Hecho, Texto } from "../../../shared/bitacoras/tipos.ts"

type Ventana = { inicioMs: number; finMs: number }
type Check = { id: string; ok: boolean; value: number; limit: number }
/** Lo que se usa de `Evaluation` (shared/planning/model/evaluate.ts). */
export type EvaluacionPlan = {
  fromMs: number
  toMs: number
  sweep: { solSobreHorizonte: ArrayLike<number>; tierraSobreHorizonte: ArrayLike<number> }
  figures: { sunPct: number; earthPct: number; bothPct: number; longestNightH: number; longestSilenceH: number }
  windows: { sun: Ventana[]; earth: Ventana[] }
  checks: Check[]
  ok: boolean
}
export type DatosPlan = {
  nombre: string
  sitio: { id: string; nombre: string; lat: number; lon: number }
  stayDays: number
  panelM: number
  antenaM: number
  batteryH: number
  minEarthPct: number
  /** Horas tras el contacto a las que sale la caminata (misión tripulada), si la hay. */
  evaH?: number
  ev: EvaluacionPlan
  fuente: Fuente
}

const n1 = (x: number, es: boolean) => (es ? x.toFixed(1).replace(".", ",") : x.toFixed(1))
const grados = (x: number, es: boolean) => `${x >= 0 ? "+" : "−"}${n1(Math.abs(x), es)}°`
const horas = (h: number, es: boolean) => (h >= 48 ? `${n1(h / 24, es)} d` : `${h < 10 ? n1(h, es) : Math.round(h)} h`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z"
const dentro = (w: Ventana[], ms: number) => w.some((v) => ms >= v.inicioMs && ms < v.finMs)

export function bitacoraDelPlan(d: DatosPlan): Bitacora {
  const { ev } = d
  const sol0 = ev.sweep.solSobreHorizonte[0], tierra0 = ev.sweep.tierraSobreHorizonte[0]
  const f = ev.figures, fuentes = [d.fuente.id]
  const hecho = (id: string, ms: number, fase: Hecho["fase"], temas: Hecho["temas"], titulo: Texto, texto: Texto, porQue?: Texto): Hecho & { ms: number } =>
    ({ id, utc: iso(ms), precision: "minuto", fase, temas, titulo, texto, porQue, fuentes, ms })

  const hechos: (Hecho & { ms: number })[] = []
  // Durante el descenso: con qué luz se llega
  hechos.push(hecho("luz", ev.fromMs, "descenso", ["sol", "descenso"],
    sol0 > 0 ? { en: "Landing in daylight", es: "Alunizaje con luz" } : { en: "Landing in the dark", es: "Alunizaje a oscuras" },
    sol0 > 0
      ? { en: `At contact the Sun will be ${grados(sol0, false)} over the terrain: the landing zone is lit.`, es: `Al contacto el Sol estará ${grados(sol0, true)} sobre el relieve: la zona de alunizaje está iluminada.` }
      : { en: `At contact the Sun will be ${grados(sol0, false)}: hidden behind the terrain. The lander comes down in shadow.`, es: `Al contacto el Sol estará en ${grados(sol0, true)}: oculto tras el relieve. La nave baja en sombra.` },
    { en: "Near the pole the Sun skims the horizon: a ridge is enough to hide it. With light, cameras see the ground; without it, only the altimeter does.", es: "Cerca del polo el Sol roza el horizonte: basta una loma para taparlo. Con luz, las cámaras ven el suelo; sin ella, solo el altímetro." }))
  hechos.push(hecho("contacto", ev.fromMs, "superficie", ["sol", "tierra"],
    { en: "Contact", es: "Contacto" },
    { en: `Sun ${grados(sol0, false)} and Earth ${grados(tierra0, false)} over the terrain. ${tierra0 > 0 ? "There is a direct link with mission control." : "Earth is hidden: no direct link at landing."}`, es: `Sol ${grados(sol0, true)} y Tierra ${grados(tierra0, true)} sobre el relieve. ${tierra0 > 0 ? "Hay enlace directo con el control de misión." : "La Tierra está oculta: sin enlace directo al alunizar."}` },
    { en: "The first minutes decide the mission: the lander needs power to start up and a link to report how it landed.", es: "Los primeros minutos deciden la misión: la nave necesita energía para arrancar y enlace para avisar cómo quedó." }))

  const cruces = (w: Ventana[], sale: () => [Texto, Texto, Texto], pone: () => [Texto, Texto, Texto], id: string, tema: "sol" | "tierra") => {
    for (const v of w) {
      if (v.inicioMs > ev.fromMs) { const [t, x, p] = sale(); hechos.push(hecho(`${id}-sale-${v.inicioMs}`, v.inicioMs, "superficie", [tema], t, x, p)) }
      if (v.finMs < ev.toMs) { const [t, x, p] = pone(); hechos.push(hecho(`${id}-pone-${v.finMs}`, v.finMs, "superficie", [tema], t, x, p)) }
    }
  }
  cruces(ev.windows.sun,
    () => [{ en: "The Sun rises", es: "Sale el Sol" }, { en: "The Sun rises over the terrain: the panel has power again and the battery recharges.", es: "El Sol sale sobre el relieve: el panel vuelve a dar energía y la batería se recarga." }, { en: `The panel is ${d.panelM} m above the ground: higher up, it sees the Sun over more of the terrain.`, es: `El panel está a ${d.panelM} m del suelo: más alto, ve el Sol por encima de más relieve.` }],
    () => [{ en: "The Sun sets", es: "Se oculta el Sol" }, { en: "The Sun goes behind the terrain: from here the lander lives on its battery.", es: "El Sol se oculta tras el relieve: desde aquí la nave vive de su batería." }, { en: `The battery lasts ${d.batteryH} h without Sun. A longer night ends the mission.`, es: `La batería aguanta ${d.batteryH} h sin Sol. Una noche más larga acaba con la misión.` }],
    "sol", "sol")
  cruces(ev.windows.earth,
    () => [{ en: "Earth rises", es: "Sale la Tierra" }, { en: "Earth rises over the terrain: direct link with mission control again.", es: "La Tierra sale sobre el relieve: vuelve el enlace directo con el control de misión." }, { en: `The antenna is ${d.antenaM} m above the ground. Without a relay satellite, it must see Earth to talk.`, es: `La antena está a ${d.antenaM} m del suelo. Sin satélite de relevo, tiene que ver la Tierra para hablar.` }],
    () => [{ en: "Earth sets", es: "Se oculta la Tierra" }, { en: "Earth goes behind the terrain: no direct link. The lander keeps working, but nobody hears it.", es: "La Tierra se oculta tras el relieve: sin enlace directo. La nave sigue trabajando, pero nadie la oye." }, { en: "Data waits on board until Earth is back in view. A rover driven from Earth stops.", es: "Los datos esperan a bordo hasta que la Tierra vuelva a verse. Un rover manejado desde la Tierra se detiene." }],
    "tierra", "tierra")

  if (d.evaH && d.evaH > 0 && ev.fromMs + d.evaH * 3600e3 < ev.toMs) {
    const t = ev.fromMs + d.evaH * 3600e3, s = dentro(ev.windows.sun, t), e = dentro(ev.windows.earth, t)
    hechos.push(hecho("caminata", t, "superficie", ["sol", "tierra"],
      { en: "The walk leaves the lander", es: "La caminata sale del módulo" },
      { en: `${d.evaH} h after contact. The Sun is ${s ? "up" : "hidden"} and Earth is ${e ? "in view" : "hidden"} when the crew steps out.`, es: `${d.evaH} h después del contacto. El Sol está ${s ? "a la vista" : "oculto"} y la Tierra ${e ? "a la vista" : "oculta"} cuando la tripulación sale.` },
      { en: "A walk is planned for when there is light to see the ground and a link so mission control can follow it.", es: "Una caminata se planifica para cuando hay luz para ver el suelo y enlace para que el control de misión la siga." }))
  }

  const bat = ev.checks.find((c) => c.id === "battery")
  const noche = f.longestNightH > 0
  hechos.push(hecho("fin", ev.toMs, "superficie", ["energia", "sol", "tierra"],
    { en: "End of the stay", es: "Fin de la estadía" },
    {
      en: `${noche ? `Longest night: ${horas(f.longestNightH, false)}, against a ${d.batteryH} h battery${bat && !bat.ok ? ": it does not last" : ""}.` : "No night during the stay."} Sun ${Math.round(f.sunPct)}% and Earth ${Math.round(f.earthPct)}% of the time (minimum ${d.minEarthPct}%).`,
      es: `${noche ? `Noche más larga: ${horas(f.longestNightH, true)}, contra una batería de ${d.batteryH} h${bat && !bat.ok ? ": no alcanza" : ""}.` : "Sin noche durante la estadía."} Sol el ${Math.round(f.sunPct)} % y Tierra el ${Math.round(f.earthPct)} % del tiempo (mínimo ${d.minEarthPct} %).`,
    },
    { en: "These are the figures that decide GO or NO GO in the Planner: the same engine computed both.", es: "Estas son las cifras que deciden GO o NO GO en el Planificador: las calculó el mismo motor." }))

  hechos.sort((a, b) => a.ms - b.ms || (a.id === "luz" ? -1 : b.id === "luz" ? 1 : 0))
  const fallan = ev.checks.filter((c) => !c.ok).length
  const veredicto: Texto = ev.ok
    ? { en: "The plan meets every requirement", es: "El plan cumple todos los requisitos" }
    : { en: `The plan fails ${fallan} of ${ev.checks.length} requirements`, es: `El plan no cumple ${fallan} de ${ev.checks.length} requisitos` }
  const equipo: Texto = {
    en: `${d.stayDays}-day stay · panel at ${d.panelM} m and antenna at ${d.antenaM} m · battery ${d.batteryH} h · Earth at least ${d.minEarthPct}% of the stay`,
    es: `Estadía de ${d.stayDays} días · panel a ${d.panelM} m y antena a ${d.antenaM} m · batería de ${d.batteryH} h · Tierra al menos el ${d.minEarthPct} % de la estadía`,
  }
  return {
    id: `plan-${d.nombre.toLowerCase()}`,
    nombre: d.nombre,
    nave: d.sitio.nombre,
    operador: "Horizon Signai",
    programa: "Planner",
    tipo: "fija",
    sitio: { nombre: d.sitio.nombre, lat: d.sitio.lat, lon: d.sitio.lon, fuentes },
    simulador: { sitio: d.sitio.id },
    contactoUtc: iso(ev.fromMs),
    finUtc: iso(ev.toMs),
    prevista: equipo,
    real: veredicto,
    resumen: {
      en: `This mission has not flown: it is your plan. Every step you will see is what the planner engine computes for this place and date. ${equipo.en}.`,
      es: `Esta misión no ha volado: es tu plan. Cada paso que vas a ver es lo que el motor del Planificador calcula para este lugar y esta fecha. ${equipo.es}.`,
    },
    plan: { cumple: ev.ok },
    hechos: hechos.map(({ ms: _ms, ...h }) => h),
    fuentes: [d.fuente],
  }
}
