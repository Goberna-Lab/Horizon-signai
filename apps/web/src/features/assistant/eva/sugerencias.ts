// Sugerencias: botones en el panel de EVA para usarla sin escribir ni dar permiso de micrófono (un juez o una clase
// pueden no tenerlo). Hay dos clases:
// - Con `accion`: EVA la ejecuta ella misma, sin IA (las mismas órdenes de ./acciones.ts), y dice `dicho`. Funciona
//   aunque los servidores de IA no contesten y no depende de que el modelo escriba bien la orden (medido: con la
//   conversación larga, el modelo a veces contestaba «guardado» sin escribirla).
// - Sin `accion`: es una pregunta, y se manda a la IA tal cual, como si la persona la hubiera escrito.
import type { AccionIA } from "@/prueba-ia/cliente"

type Bi = { en: string; es: string }
export type Sugerencia = { texto: Bi; accion?: AccionIA; dicho?: Bi }

const ABRIR: Sugerencia = {
  texto: { en: "Open the planner", es: "Abre el planificador" },
  accion: { tipo: "open", screen: "planner" },
  dicho: { en: "Here is the planner.", es: "Aquí está el planificador." },
}
const POLO: Sugerencia = { texto: { en: "Why is the south pole so hard?", es: "¿Por qué es tan difícil el polo sur?" } }

const PLANIFICADOR: Sugerencia[] = [
  // Como pregunta, no como orden: con «Explain this verdict.» el modelo aplicaba un arreglo sin que se lo pidieran.
  { texto: { en: "Why this verdict?", es: "¿Por qué este veredicto?" } },
  {
    texto: { en: "+1 week", es: "+1 semana" },
    accion: { tipo: "shift", days: 7 },
    dicho: { en: "One week later. Look at the verdicts now.", es: "Una semana después. Mira ahora los veredictos." },
  },
  {
    texto: { en: "Back to plan", es: "Volver al plan" },
    accion: { tipo: "plan" },
    dicho: { en: "Back on the planned date.", es: "De vuelta a la fecha del plan." },
  },
  {
    texto: { en: "Compare", es: "Comparar" },
    accion: { tipo: "compare" },
    dicho: { en: "Saved. Here is the comparison table.", es: "Guardado. Aquí está la tabla de comparación." },
  },
  {
    texto: { en: "Descent", es: "Descenso" },
    accion: { tipo: "simulate" },
    dicho: { en: "Starting the descent, with the Apollo eleven profile as an example.", es: "Empieza el descenso, con el perfil del Apollo once como ejemplo." },
  },
  {
    texto: { en: "Timeline", es: "Línea de tiempo" },
    accion: { tipo: "play" },
    dicho: { en: "Ninety days around the landing. Watch the Sun slide along the horizon.", es: "Noventa días alrededor del alunizaje. Mira cómo el Sol se desliza por el horizonte." },
  },
]
const MISIONES: Sugerencia[] = [{ texto: { en: "What am I looking at?", es: "¿Qué estoy viendo?" } }, ABRIR, POLO]
const MAPA: Sugerencia[] = [
  { texto: { en: "What can I do on this map?", es: "¿Qué puedo hacer en este mapa?" } },
  { texto: { en: "Where does the data come from?", es: "¿De dónde salen los datos?" } },
  ABRIR,
]
const GENERAL: Sugerencia[] = [
  POLO,
  { texto: { en: "What NASA data do you use?", es: "¿Qué datos de la NASA usas?" } },
  { texto: { en: "How do you know where the Sun is?", es: "¿Cómo sabes dónde está el Sol?" } },
  ABRIR,
  {
    texto: { en: "Open the 3D map", es: "Abre el mapa 3D" },
    accion: { tipo: "open", screen: "map" },
    dicho: { en: "Here is the Moon in 3D.", es: "Aquí está la Luna en 3D." },
  },
]

/** Las sugerencias de una pantalla. `pagina`: la página que muestra el planificador incrustado, si lo hay. */
export function sugerenciasDe(ruta: string, pagina: string): Sugerencia[] {
  if (ruta.startsWith("/planner")) return pagina.endsWith("/index.html") ? PLANIFICADOR : MISIONES
  return ruta.startsWith("/3d-map") ? MAPA : GENERAL
}
