import { chromium } from "playwright-core"
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto("http://localhost:5173/", { waitUntil: "commit" })
await page.waitForFunction(() => !!window.__astronaut, null, { timeout: 30000 })
for (let i = 0; i < 6; i++) { console.log(JSON.stringify(await page.evaluate(() => window.__astronaut.state()))); await page.waitForTimeout(3000) }
await browser.close()
