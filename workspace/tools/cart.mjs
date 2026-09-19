// Открывает ссылку share_basket в сохранённой сессии владелицы и печатает JSON.
// Использование: node tools/cart.mjs https://vkusvill.ru/?share_basket=123
//                node tools/cart.mjs --read      — только прочитать текущую корзину, ничего не добавляя
//                node tools/cart.mjs --clear     — очистить корзину аккаунта (кнопка «Очистить корзину» + подтверждение)
//                node tools/cart.mjs --remove 606,611  — удалить из корзины позиции с указанными xml_id
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCart } from './cart-parse.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const link = process.argv[2]
const readOnly = link === '--read'
const clearMode = link === '--clear'
const removeMode = link === '--remove'
const removeIds = removeMode ? String(process.argv[3] ?? '').split(',').map(x => x.trim()).filter(Boolean) : []
const browserDir = process.env.GROCERY_BROWSER_DIR ?? join(here, '..', '..', 'browser')
const out = obj => { console.log(JSON.stringify(obj)); }

if (removeMode && !removeIds.length) { out({ status: 'error', message: 'для --remove нужны xml_id через запятую', screenshot: null }); process.exit(0) }
if (!readOnly && !clearMode && !removeMode && (!link || !/^https:\/\/vkusvill\.ru\/\?share_basket=\d+$/.test(link))) {
  out({ status: 'error', message: 'ожидается ссылка вида https://vkusvill.ru/?share_basket=<число>', screenshot: null })
  process.exit(0)
}

let ctx
let accepted = false // товары уже уехали в корзину аккаунта — повторять ссылку не нужно
try {
  // Чтение selectors.json и создание папки профиля — внутри try, чтобы при ошибке
  // модель всё равно получила JSON-строку на stdout, а не голый стектрейс в stderr.
  const selectors = JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf8'))
  mkdirSync(browserDir, { recursive: true, mode: 0o700 })
  ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), {
    headless: true, locale: 'ru-RU',
    // Локальная отладка: PROXY=socks5://127.0.0.1:1081 (домашний VPN ВкусВилл не пускает). На сервере не нужен.
    ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
  })
  const page = await ctx.newPage()
  if (readOnly || clearMode || removeMode) {
    await page.goto('https://vkusvill.ru/cart/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector(selectors.cartItem, { timeout: 15_000 }).catch(() => {})
    if (!(await page.$(selectors.loggedIn))) { out({ status: 'auth_required' }); }
    else {
      let cleared = false
      const removed = []
      if (clearMode) {
        // Кнопка «Очистить корзину» есть на странице дважды, первая скрыта: кликаем только видимую.
        const clearBtn = page.locator(`${selectors.cartClear}:visible`).first()
        if (await clearBtn.count()) {
          await clearBtn.click({ timeout: 10_000 })
          // Сайт спрашивает подтверждение в модалке; если её нет — корзина очищена сразу.
          const confirm = await page.waitForSelector(selectors.confirmAccept, { state: 'visible', timeout: 5_000 }).catch(() => null)
          if (confirm) await confirm.click()
          await page.waitForFunction(sel => document.querySelectorAll(sel).length === 0, selectors.cartItem, { timeout: 15_000 }).catch(() => {})
          cleared = (await page.$$(selectors.cartItem)).length === 0
          if (!cleared) throw new Error('корзина не очистилась после нажатия «Очистить корзину»')
        } else cleared = (await page.$$(selectors.cartItem)).length === 0
      }
      if (removeMode) {
        for (const id of removeIds) {
          const del = page.locator(`${selectors.cartItem}[data-xmlid="${id}"] ${selectors.itemDelete}:visible`).first()
          if (!(await del.count())) continue
          await del.click({ timeout: 10_000 })
          await page.waitForFunction(([sel, id]) => !document.querySelector(`${sel}[data-xmlid="${id}"]`), [selectors.cartItem, id], { timeout: 10_000 }).catch(() => {})
          removed.push(id)
        }
      }
      const cart = await parseCart(page, selectors)
      out({ status: 'ok', cleared, removed, items: cart.items, total: cart.total, unavailable: cart.items.filter(i => !i.available).map(i => i.name) })
    }
  } else {
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // Под входом сайт показывает модалку «С вами поделились товарами» с кнопкой «В корзину».
  // Без входа модалка другая (кнопка «Проверить наличие»), и товары в аккаунт не попадают,
  // поэтому ждать кнопку до конца незачем: сначала смотрим на признак входа.
  const accept = await page.waitForSelector(selectors.shareAccept, { timeout: 20_000 }).catch(() => null)
  if (!(await page.$(selectors.loggedIn))) { out({ status: 'auth_required' }); }
  else {
    if (!accept) throw new Error('не найдена кнопка «В корзину» в окне share_basket')
    // Окно ссылки уже знает остаток на складе доставки по каждому товару (data-log-stock).
    const stock = await page.$$eval(`${selectors.shareModal} [data-log-stock]`, els => Object.fromEntries(els.map(e => [e.getAttribute('data-id'), Number(e.getAttribute('data-log-stock'))])))
    await accept.click()
    accepted = true
    await page.waitForTimeout(1500) // сервер применяет содержимое ссылки к корзине
    await page.goto('https://vkusvill.ru/cart/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector(selectors.cartItem, { timeout: 20_000 }).catch(() => {})
    const cart = await parseCart(page, selectors)
    const outOfStock = Object.entries(stock).filter(([, n]) => !(n > 0)).map(([id]) => id)
    out({ status: 'ok', items: cart.items, total: cart.total, stock, unavailable: [...new Set([...cart.items.filter(i => !i.available).map(i => i.xmlId ?? i.name), ...outOfStock])] })
  }
  }
} catch (e) {
  const screenshot = join(browserDir, 'last-error.png')
  try { const p = ctx?.pages()[0]; if (p) await p.screenshot({ path: screenshot }) } catch {}
  out({ status: 'error', message: e.message, accepted, screenshot: ctx ? screenshot : null })
} finally {
  await ctx?.close()
}
