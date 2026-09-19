// Выгружает cookies из профиля браузера в JSON. Нужно для переноса входа на другой
// компьютер/ОС: Chromium шифрует cookies ключом операционной системы, поэтому
// копирование папки профиля с Windows на Linux вход не сохраняет, а JSON — сохраняет.
// Использование: GROCERY_BROWSER_DIR=../browser [PROXY=socks5://127.0.0.1:1081] node tools/export-cookies.mjs [out.json]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = process.env.GROCERY_BROWSER_DIR ?? join(here, '..', '..', 'browser')
const out = process.argv[2] ?? join(browserDir, 'cookies.json')

const ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), {
  headless: true, locale: 'ru-RU',
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
const cookies = (await ctx.cookies()).filter(c => c.domain.includes('vkusvill'))
writeFileSync(out, JSON.stringify(cookies, null, 2), { mode: 0o600 })
await ctx.close()
console.log(JSON.stringify({ status: 'ok', count: cookies.length, file: out }))
