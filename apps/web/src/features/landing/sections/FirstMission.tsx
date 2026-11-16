import { useEffect, useRef } from "react"
import { Link } from "react-router"
import { enfocarEva } from "@/shared/eva"
import { lang } from "@/shared/i18n"
import { actions, firstMission } from "../content"
import { Reveal } from "./Reveal"

/** Dónde están las capturas y los vídeos del recorrido: un archivo por idioma (`public/landing-tour/`). */
const file = (media: string, extension: string) => `/landing-tour/${media}-${lang}.${extension}`

/**
 * "Tu primera misión, paso a paso": el recorrido que EVA guía dentro de la app, en seis pasos con su captura o su
 * vídeo grabado de la aplicación y la frase que dice EVA en ese momento. EVA misma lo va enseñando al bajar. El orden es una secuencia real (por eso van
 * numerados): es el del flujo guiado de la app.
 */
export function FirstMission() {
  const list = useRef<HTMLOListElement>(null)

  // EVA enseña el recorrido: cuando un paso lleva un momento en pantalla, vuela hasta su imagen, la apunta con su rayo
  // y dice su frase (una vez por paso). Son frases de su guion, así que suenan con su voz grabada. Si EVA está
  // apagada, ocupada o conversando, no pasa nada (`enfocarEva` de `@/shared/eva`).
  useEffect(() => {
    const root = list.current
    if (!root || typeof IntersectionObserver === "undefined") return
    const said = new Set<Element>()
    const timers = new Map<Element, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = entry.target
          window.clearTimeout(timers.get(step))
          if (!entry.isIntersecting || said.has(step)) continue
          timers.set(
            step,
            window.setTimeout(() => {
              said.add(step)
              const n = Number((step as HTMLElement).dataset.step)
              enfocarEva(`#first-mission [data-step="${n}"] .ln-tour__media`, firstMission.steps[n].quote)
            }, 900),
          )
        }
      },
      { threshold: 0.6 },
    )
    for (const step of root.children) observer.observe(step)
    return () => {
      observer.disconnect()
      for (const timer of timers.values()) window.clearTimeout(timer)
    }
  }, [])

  return (
    <section className="ln-sec ln-tour" id="first-mission">
      <div className="ln-wrap">
        <p className="ln-kicker ln-mono">{firstMission.label}</p>
        <Reveal as="h2" className="ln-title" wipe>
          {firstMission.title} <span className="ln-accent">{firstMission.titleAccent}</span>
        </Reveal>
        <Reveal as="p" className="ln-lede" delay={80}>
          {firstMission.body}
        </Reveal>
        <ol className="ln-tour__steps" ref={list}>
          {firstMission.steps.map((step, n) => (
            <li key={step.media} className="ln-tour__step" data-step={n}>
              <Reveal as="figure" className="ln-tour__media">
                {step.kind === "video" ? (
                  <Clip media={step.media} label={step.alt} />
                ) : (
                  <img src={file(step.media, "jpg")} alt={step.alt} loading="lazy" decoding="async" width={1120} height={700} />
                )}
              </Reveal>
              <Reveal className="ln-tour__text" delay={80}>
                <span className="ln-tour__n" aria-hidden="true">
                  {String(n + 1).padStart(2, "0")}
                </span>
                <h3 className="ln-tour__title">{step.title}</h3>
                <p>{step.text}</p>
                <blockquote className="ln-tour__quote">
                  <span className="ln-mono">{firstMission.evaSays}</span>
                  {step.quote}
                </blockquote>
              </Reveal>
            </li>
          ))}
        </ol>
        <div className="ln-tour__end">
          <Link className="ln-tour__cta" to={actions.planner.to}>
            {firstMission.cta} <span aria-hidden="true">→</span>
          </Link>
          <p className="ln-note ln-mono">{firstMission.note}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * Un vídeo corto grabado de la app: sin sonido, en bucle, y solo se descarga y reproduce cuando entra en pantalla.
 * Con "reducir movimiento" no arranca solo: queda la imagen fija con los controles del navegador.
 */
function Clip({ media, label }: { media: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.controls = true
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {})
        else video.pause()
      },
      { threshold: 0.35 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])
  return (
    <video ref={ref} src={file(media, "mp4")} poster={file(media, "jpg")} muted loop playsInline preload="none" aria-label={label} width={1120} height={700} />
  )
}
