// Снимает форму входа из чистого профиля (без ввода номера): нужны селекторы
// кнопки «Войти», поля телефона и кнопки отправки.
// Использование: PROXY=socks5://127.0.0.1:1081 node spike/login-form.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('spike/auto', { recursive: true })
const ctx = await chromium.launchPersistentContext('browser/profile-spike-login2', {
  headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 900 },
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('https://vkusvill.ru/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
// Закрыть баннеры крестиком, если мешают
for (const closer of await page.$$('.VV_ModalCloser, [data-dismiss="modal"]')) { await closer.click().catch(() => {}) }
// Форма входа подгружается по клику на любую кнопку .js-user-load-login-api
const login = page.locator('.js-user-load-login-api:visible').first()
console.log('кнопок входа:', await page.locator('.js-user-load-login-api').count())
await login.click({ timeout: 15000 })
await page.waitForSelector('input[type=tel]', { timeout: 20000 }).catch(e => console.log('поле телефона не появилось:', e.message))
await page.waitForTimeout(1500)
writeFileSync('spike/auto/10-login-form.html', `<!-- ${page.url()} -->\n` + await page.content())
await page.screenshot({ path: 'spike/auto/10-login-form.png' })
console.log('снимок формы входа сохранён:', page.url())
await ctx.close()
