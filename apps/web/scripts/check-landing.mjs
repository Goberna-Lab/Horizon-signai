/**
 * Comprobación de la landing con Playwright: rutas, el vuelo del inicio, "Tu primera misión" y la sección de
 * beneficios (cada pestaña con la foto de su pantalla).
 *
 * Usa el Chrome instalado en el equipo (no descarga navegadores). Con el servidor de desarrollo levantado:
 *
 *   npm run dev:web
 *   npm run check:landing -w @horizon-signai/web -- http://localhost:5173/
 *
 * Opciones: `--mobile` prueba a 390 x 844 con pantalla táctil; `--shots <carpeta>` guarda una captura por beneficio.
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

try {
  // --- Rutas -------------------------------------------------------------------------------------------------
  for (const [path, selector] of [
    ["/prueba-ia", ".prueba h1"],
    ["/planificador", "section.screen"],
    ["/simulador", "section.screen"],
    ["/3d-map", "section.screen"],
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

  // La barra fija se oculta solo para las capturas: si no, sale montada sobre la sección.
  if (shots) await page.addStyleTag({ content: ".ln-bar{visibility:hidden!important}" })

  // --- Tu primera misión: seis pasos, con sus fotos y vídeos ----------------------------------------------------------
  check("first mission: six steps", (await page.locator("#first-mission .ln-tour__step").count()) === 6)
  check("first mission: EVA's guide starts off", (await page.locator(".ln-tour__toggle").getAttribute("aria-pressed")) === "false")

  // --- Beneficios: cada pestaña enseña la foto de su pantalla y su frase ---------------------------------------------
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#software").getBoundingClientRect().top + scrollY - 80))
  await page.waitForTimeout(1500)
  for (const id of ["compare", "organize", "planb", "anticipate", "locate"]) {
    await page.locator(`#sw-tab-${id}`).click()
    await page.waitForTimeout(400)
    const img = page.locator("#sw-panel img")
    const loaded = await img.evaluate((el) => (el.complete ? el.naturalWidth : new Promise((ok) => el.addEventListener("load", () => ok(el.naturalWidth), { once: true }))))
    check(`benefit ${id}: photo and sentence`, loaded > 0 && (await img.getAttribute("src")).includes(`benefit-${id}-`) && (await page.locator(".sw-benefit").innerText()).length > 20)
    if (shots) await page.locator(".sw-photo").screenshot({ path: join(shots, `${mobile ? "mobile" : "desktop"}-${id}.png`) })
  }

  check("no console errors or failed requests", problems.length === 0, [...new Set(problems)].slice(0, 4).join("; "))
} finally {
  await browser.close()
}
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.")
process.exit(failed ? 1 : 0)
