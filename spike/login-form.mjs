// Снимает форму входа из чистого профиля (без ввода номера): нужны селекторы
// кнопки «Войти», поля телефона и кнопки отправки.
// Использование: PROXY=socks5://127.0.0.1:1081 node spike/login-form.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('spike/auto', { recursive: true })
const ctx = await chromium.launchPersistentContext('browser/profile-spike-login', {
  headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 900 },
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('https://vkusvill.ru/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
// Закрыть баннеры крестиком, если мешают
for (const closer of await page.$$('.VV_ModalCloser, [data-dismiss="modal"]')) { await closer.click().catch(() => {}) }
const login = page.getByText('Войти', { exact: true }).first()
console.log('кнопок «Войти»:', await login.count())
await login.click()
await page.waitForTimeout(3000)
writeFileSync('spike/auto/10-login-form.html', `<!-- ${page.url()} -->\n` + await page.content())
await page.screenshot({ path: 'spike/auto/10-login-form.png' })
console.log('снимок формы входа сохранён:', page.url())
await ctx.close()
