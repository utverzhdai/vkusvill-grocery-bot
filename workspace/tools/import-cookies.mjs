// Загружает cookies из JSON (см. export-cookies.mjs) в профиль браузера и проверяет вход.
// Использование: GROCERY_BROWSER_DIR=/opt/grocery-bot/browser node tools/import-cookies.mjs [in.json]
import { chromium } from 'playwright'
import { readFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = process.env.GROCERY_BROWSER_DIR ?? join(here, '..', '..', 'browser')
const file = process.argv[2] ?? join(browserDir, 'cookies.json')
const selectors = JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf8'))

mkdirSync(join(browserDir, 'profile'), { recursive: true, mode: 0o700 })
const cookies = JSON.parse(readFileSync(file, 'utf8'))
const ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), {
  headless: true, locale: 'ru-RU',
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto('https://vkusvill.ru/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForTimeout(3000)
const loggedIn = (await page.$(selectors.loggedIn)) !== null
await ctx.close()
// Файл с cookies после импорта не нужен: это те же секреты, что и сессия.
try { unlinkSync(file) } catch {}
console.log(JSON.stringify({ status: loggedIn ? 'ok' : 'not_logged_in', imported: cookies.length }))
process.exitCode = loggedIn ? 0 : 1
