import { chromium } from "playwright-core"
const out = process.argv[2]
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
for (const [w, h, times] of [[1440, 900, [9000, 16000]], [2546, 957, [16000]]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600 })).newPage()
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)))
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("console:", m.text().slice(0, 200)))
  await page.goto("http://localhost:5173/", { waitUntil: "commit" })
  await page.waitForFunction(() => document.querySelector(".fl")?.dataset.intro === "run", null, { timeout: 20000 })
  const start = Date.now()
  for (const t of times) {
    await page.waitForTimeout(Math.max(t - (Date.now() - start), 0))
    await page.screenshot({ path: `${out}/v4-${w}-${t}.jpg`, type: "jpeg", quality: 72 })
  }
  console.log(w, "overflow", await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), await page.evaluate(() => document.querySelector(".fl-limb__walker").dataset.ready))
  await page.close()
}
await browser.close()
