// Bitácoras de misiones reales: lo que pasó, día por día, con la fuente de cada hecho. Las leen el simulador (para
// reproducir la misión) y EVA (para narrarla y explicar el porqué). Nada sin fuente: lo que no se sabe no se pone.
// Texto en los dos idiomas como datos ({ en, es }) y no con tr(), para que EVA elija el idioma de su voz.

export type Texto = { en: string; es: string }

export type Fuente = { id: string; titulo: string; url: string }

/** De qué trata el hecho: enlaza con lo que calcula el motor del Planificador o con lo que muestra el simulador. */
export type Tema = "sitio" | "descenso" | "terreno" | "tierra" | "sol" | "energia" | "ciencia" | "datos"

export type Hecho = {
  id: string
  /** Instante UTC (ISO). Con `precision: "dia"` solo vale la fecha. `null`: antes de la misión, sin fecha en la fuente. */
  utc: string | null
  precision: "minuto" | "dia"
  /** Si el hecho ocupa varios días (ISO, misma precisión). */
  hastaUtc?: string
  fase: "antes" | "descenso" | "superficie" | "noche"
  temas: Tema[]
  titulo: Texto
  texto: Texto
  /** Por qué importa: lo que EVA puede explicar si preguntan. Es explicación nuestra, no un dato de la misión. */
  porQue?: Texto
  /** Ids de `Bitacora.fuentes`. Al menos una. */
  fuentes: string[]
}

export type Bitacora = {
  id: string
  nombre: string
  nave: string
  operador: string
  programa: string
  tipo: "fija" | "rover" | "tripulada"
  sitio: { nombre: string; lat: number; lon: number; elevacionM?: number; pendienteDeg?: number; fuentes: string[] }
  contactoUtc: string
  finUtc: string
  /** Duración prevista y real de la operación en superficie, como la dan las fuentes. */
  prevista: Texto
  real: Texto
  resumen: Texto
  hechos: Hecho[]
  fuentes: Fuente[]
}
