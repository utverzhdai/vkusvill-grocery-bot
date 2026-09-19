// Вход во ВкусВилл по СМС. Код ждём в файле sms-code.txt, его пишет бот.
// Использование: node tools/login.mjs +79990000000
import { chromium } from 'playwright'
import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const phone = process.argv[2]
const browserDir = process.env.GROCERY_BROWSER_DIR ?? join(here, '..', '..', 'browser')
const codeFile = join(browserDir, 'sms-code.txt')
const s = JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf8'))
const out = (obj, code) => { console.log(JSON.stringify(obj)); process.exitCode = code }

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitForCode(maxMs = 180_000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (existsSync(codeFile)) {
      const code = readFileSync(codeFile, 'utf8').trim()
      unlinkSync(codeFile)
      if (/^\d{4,6}$/.test(code)) return code
    }
    await sleep(1000)
  }
  throw new Error('код из СМС не пришёл за 3 минуты')
}

if (!phone) { out({ status: 'error', message: 'нужен номер телефона' }, 1); process.exit() }
mkdirSync(browserDir, { recursive: true })
if (existsSync(codeFile)) unlinkSync(codeFile)

let ctx
try {
  ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), {
    headless: true, locale: 'ru-RU',
    // Локальная отладка: PROXY=socks5://127.0.0.1:1081 (домашний VPN ВкусВилл не пускает). На сервере не нужен.
    ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
  })
  const page = await ctx.newPage()
  await page.goto('https://vkusvill.ru/', { waitUntil: 'networkidle', timeout: 60_000 })
  if (await page.$(s.loggedIn)) { out({ status: 'ok', note: 'уже в аккаунте' }, 0) }
  else {
    // Форма входа подгружается динамически по клику на элемент с классом
    // js-user-load-login-api (кнопка «Войти» в шапке).
    if (s.loginOpen) await page.locator(s.loginOpen).first().click({ timeout: 15_000 })
    await page.fill(s.phoneInput, phone)
    if (s.phoneSubmit) await page.click(s.phoneSubmit)
    else await page.press(s.phoneInput, 'Enter')
    await page.waitForSelector(s.codeInput, { timeout: 30_000 })
    const code = await waitForCode()
    await page.fill(s.codeInput, code)
    if (s.codeSubmit) await page.click(s.codeSubmit).catch(() => {})
    else await page.press(s.codeInput, 'Enter').catch(() => {})
    await page.waitForSelector(s.loggedIn, { timeout: 30_000 })
    out({ status: 'ok' }, 0)
  }
} catch (e) {
  try { const p = ctx?.pages()[0]; if (p) await p.screenshot({ path: join(browserDir, 'last-error.png') }) } catch {}
  out({ status: 'error', message: e.message }, 1)
} finally {
  await ctx?.close()
}
