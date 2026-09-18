// Открывает ссылку share_basket в сохранённой сессии владелицы и печатает JSON.
// Использование: node tools/cart.mjs https://vkusvill.ru/?share_basket=123
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCart } from './cart-parse.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const link = process.argv[2]
const browserDir = process.env.GROCERY_BROWSER_DIR ?? join(here, '..', '..', 'browser')
const out = obj => { console.log(JSON.stringify(obj)); }

if (!link || !/^https:\/\/vkusvill\.ru\/\?share_basket=\d+$/.test(link)) {
  out({ status: 'error', message: 'ожидается ссылка вида https://vkusvill.ru/?share_basket=<число>', screenshot: null })
  process.exit(0)
}

let ctx
try {
  // Чтение selectors.json и создание папки профиля — внутри try, чтобы при ошибке
  // модель всё равно получила JSON-строку на stdout, а не голый стектрейс в stderr.
  const selectors = JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf8'))
  mkdirSync(browserDir, { recursive: true })
  ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), {
    headless: true, locale: 'ru-RU',
    // Локальная отладка: PROXY=socks5://127.0.0.1:1081 (домашний VPN ВкусВилл не пускает). На сервере не нужен.
    ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(4000)
  // Под входом сайт показывает модалку «С вами поделились товарами» с кнопкой «В корзину».
  // Без входа модалка другая (кнопка «Проверить наличие»), и товары в аккаунт не попадают.
  if (!(await page.$(selectors.loggedIn))) { out({ status: 'auth_required' }); }
  else {
    const accept = await page.$(selectors.shareAccept)
    if (!accept) throw new Error('не найдена кнопка «В корзину» в окне share_basket')
    await accept.click()
    await page.waitForTimeout(4000)
    await page.goto('https://vkusvill.ru/cart/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000)
    const cart = await parseCart(page, selectors)
    out({ status: 'ok', items: cart.items, total: cart.total, unavailable: cart.items.filter(i => !i.available).map(i => i.name) })
  }
} catch (e) {
  const screenshot = join(browserDir, 'last-error.png')
  try { const p = ctx?.pages()[0]; if (p) await p.screenshot({ path: screenshot }) } catch {}
  out({ status: 'error', message: e.message, screenshot })
} finally {
  await ctx?.close()
}
