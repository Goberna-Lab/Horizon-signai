/**
 * Comprobación de la landing con Playwright: rutas, enlaces y la ventana del producto con interacciones reales
 * (reproducir, pausar, mover el tiempo con ratón y teclado, cambiar altura, pestañas, mapa y tema).
 *
 * Usa el Chrome instalado en el equipo (no descarga navegadores). Con el servidor de desarrollo levantado:
 *
 *   npm run dev:web
 *   npm run check:landing -w @horizon-signai/web -- http://localhost:5173/
 *
 * Opciones: `--mobile` prueba a 390 x 844 con pantalla táctil; `--shots <carpeta>` guarda una captura por pestaña.
 * Sale con código 1 si algo falla. Script escrito con asistencia de IA (Claude Code).
 */
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { chromium } from "playwright-core"

const args = process.argv.slice(2)
const base = (args.find((a) => a.startsWith("http")) ?? "http://localhost:5173/").replace(/\/+$/, "")
const mobile = args.includes("--mobile")
const shots = args.includes("--shots") ? resolve(args[args.indexOf("--shots") + 1] ?? "landing-shots") : null
if (shots) mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile })
const page = await context.newPage()

const problems = []
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`))
page.on("pageerror", (e) => problems.push(`error: ${String(e).slice(0, 200)}`))
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url().replace(base, "")}`))

let failed = 0
const check = (name, ok, detail = "") => {
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`)
}
const shot = async (name) => shots && page.locator(".sw").screenshot({ path: join(shots, `${mobile ? "mobile" : "desktop"}-${name}.png`) })

try {
  // --- Rutas -------------------------------------------------------------------------------------------------
  for (const [path, selector] of [
    ["/prueba-ia", ".prueba h1"],
    ["/planificador", "section.screen"],
    ["/simulador", "section.screen"],
  ]) {
    await page.goto(base + path, { waitUntil: "domcontentloaded" })
    // Las pantallas se cargan de forma diferida: se espera a que aparezcan.
    const shown = await page.locator(selector).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)
    check(`route ${path}`, shown)
  }

  // --- Landing -----------------------------------------------------------------------------------------------
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => document.querySelector(".fl")?.dataset.ready === "true", null, { timeout: 60_000 })
  check("flight scene ready", true)
  check("hero headline", (await page.locator("h1").innerText()).length > 0)

  // La barra fija se oculta solo para las capturas: si no, sale montada sobre la ventana.
  if (shots) await page.addStyleTag({ content: ".ln-bar{visibility:hidden!important}" })
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#software .sw").getBoundingClientRect().top + scrollY - 80))
  await page.waitForTimeout(1800)

  // --- Ventana del producto: Lander --------------------------------------------------------------------------
  const date = page.locator(".sw-lander__date")
  const counts = () => page.locator(".sw-count").allInnerTexts().then((v) => v.join(" | ").replace(/\n/g, " "))
  const started = await date.textContent()
  await page.waitForTimeout(3000)
  check("time advances on its own", started !== (await date.textContent()))

  await page.locator(".sw-play").click()
  const paused = await date.textContent()
  await page.waitForTimeout(700)
  check("pause stops the clock", paused === (await date.textContent()))

  const plot = page.locator(".sw-time__plot")
  /** Pulsa la línea de tiempo en una fracción del día lunar. Antes la trae a pantalla: un clic fuera no llega. */
  const clickTimeline = async (fraction) => {
    await plot.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await page.waitForTimeout(1200)
    const box = await plot.boundingBox()
    await page.mouse.click(box.x + box.width * fraction, box.y + 10)
  }
  await clickTimeline(0.05)
  const early = await counts()
  await clickTimeline(0.62)
  const late = await counts()
  check("clicking the timeline moves the clock and the countdowns", early !== late, `${early} -> ${late}`)

  await plot.focus()
  const beforeKey = await date.textContent()
  await page.keyboard.press("PageUp")
  check("keyboard moves the clock", beforeKey !== (await date.textContent()))

  const ground = await counts()
  await page.getByRole("button", { name: "10 m mast" }).click()
  check("observer height changes the countdowns", ground !== (await counts()))
  await page.getByRole("button", { name: "Ground level" }).click()
  await shot("lander")

  // --- Pestañas ----------------------------------------------------------------------------------------------
  for (const [tab, selector] of [
    ["Compare", ".sw-compare"],
    ["Calendar", ".sw-calendar"],
    ["Map", ".sw-map"],
    ["Plan B", ".sw-planb"],
    ["Learn", ".sw-learn"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click()
    await page.waitForTimeout(300)
    check(`tab ${tab}`, await page.locator(selector).isVisible())
    if (tab === "Map") {
      const before = await page.locator(".sw-map__name").textContent()
      await page.locator('.sw-pin[aria-label="Shackleton rim"]').click({ force: true })
      check("map: picking a site updates the panel", before !== (await page.locator(".sw-map__name").textContent()))
    }
    await shot(tab.toLowerCase().replace(" ", ""))
  }

  // --- Día y noche: el fondo de la ventana sigue al Sol del sitio ------------------------------------------------
  await page.getByRole("tab", { name: "Lander", exact: true }).click()
  await page.waitForTimeout(400)
  /** Mueve el tiempo a una fracción del día lunar y devuelve la oscuridad de la ventana (0 día, 1 noche) y su fondo. */
  const shadeAt = async (fraction) => {
    await clickTimeline(fraction)
    await page.waitForTimeout(1600)
    return page.locator(".ln").evaluate((el) => ({
      night: Number(el.style.getPropertyValue("--night")),
      background: getComputedStyle(el).backgroundColor,
      bar: getComputedStyle(document.querySelector(".ln-bar")).backgroundColor,
      label: document.querySelector(".sw-count span")?.textContent ?? "",
    }))
  }
  const luminance = (color) => {
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number)
    return color.startsWith("color(") ? (r + g + b) / 3 : (r + g + b) / 765
  }
  const day = await shadeAt(0.4)
  check("day: the whole page is paper while the Sun is far from setting", day.night === 0 && luminance(day.background) > 0.85 && luminance(day.bar) > 0.85 && /sunset/i.test(day.label), JSON.stringify(day))
  const dusk = await shadeAt(0.665)
  check("dusk: the page darkens as sunset approaches", dusk.night > 0.2 && dusk.night < 0.95 && luminance(dusk.background) < luminance(day.background) - 0.1 && /sunset/i.test(dusk.label), JSON.stringify(dusk))
  const dark = await shadeAt(0.85)
  check("night: the whole page is black once the Sun has set", dark.night === 1 && luminance(dark.background) < 0.12 && luminance(dark.bar) < 0.12 && /sunrise/i.test(dark.label), JSON.stringify(dark))
  /** Lo que hay dibujado en el horizonte de fondo: relieve, el rojo del Sol y estrellas. */
  const sceneNow = () =>
    page.locator(".sw-sky canvas").evaluate((canvas) => {
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data
      let drawn = 0
      let sun = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 40) continue
        drawn++
        if (pixels[i] > 235 && pixels[i + 1] > 70 && pixels[i + 1] < 235 && pixels[i + 2] < 160 && pixels[i + 3] > 240) sun++
      }
      return { drawn, sun, shown: Number(getComputedStyle(canvas.parentElement).opacity) }
    })
  const nightScene = await sceneNow()
  check("night: the Sun is hidden behind the horizon", nightScene.shown > 0.9 && nightScene.drawn > 5000 && nightScene.sun < 200, JSON.stringify(nightScene))
  await shot("lander-night")
  await shadeAt(0.672)
  const duskScene = await sceneNow()
  check("dusk: the setting Sun is on the horizon", duskScene.shown > 0.9 && duskScene.sun > 800, JSON.stringify(duskScene))
  await shadeAt(0.4)
  const dayScene = await sceneNow()
  check("day: no Sun far from sunrise and sunset", dayScene.sun < 200, JSON.stringify(dayScene))
  await page.getByRole("tab", { name: "Compare", exact: true }).click()
  await page.waitForTimeout(1500)
  const other = await page.locator(".ln").evaluate((el) => Number(el.style.getPropertyValue("--night")))
  check("other views stay on paper", other === 0, String(other))

  check("no console errors or failed requests", problems.length === 0, [...new Set(problems)].slice(0, 4).join("; "))
} finally {
  await browser.close()
}
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.")
process.exit(failed ? 1 : 0)
