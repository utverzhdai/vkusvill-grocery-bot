// Автоматический прогон под уже сохранённым входом: открыть ссылку share_basket,
// нажать «Проверить наличие товаров», снять окно результата и страницу корзины.
// Использование: PROXY=socks5://127.0.0.1:1081 node spike/cart-auto.mjs <share_link>
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const link = process.argv[2]
if (!link) { console.error('нужна ссылка share_basket'); process.exit(1) }
mkdirSync('spike/captures/auto', { recursive: true })
const save = async (page, name) => {
  writeFileSync(`spike/captures/auto/${name}.html`, `<!-- ${page.url()} -->\n` + await page.content())
  await page.screenshot({ path: `spike/captures/auto/${name}.png`, fullPage: true }).catch(() => {})
  console.log('снимок', name, page.url())
}

const ctx = await chromium.launchPersistentContext('browser/profile', {
  headless: false, locale: 'ru-RU', viewport: { width: 1280, height: 900 },
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto(link, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await save(page, '01-share-popup')

const btn = page.locator('#accept_share_basket, button:has-text("Проверить наличие товаров")').first()
if (await btn.count()) {
  await btn.click()
  await page.waitForTimeout(5000)
  await save(page, '02-after-check')
} else {
  console.log('кнопка добавления не найдена')
}

await page.goto('https://vkusvill.ru/cart/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await save(page, '03-cart')
await ctx.close()
console.log('готово')
