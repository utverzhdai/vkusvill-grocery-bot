// Разведка без участия в терминале: открывает ссылку корзины в видимом браузере
// с постоянным профилем и каждые 3 секунды сохраняет HTML и скриншот, если
// страница изменилась. Владелица в этом окне входит в аккаунт, указывает адрес,
// открывает корзину. Снимки ложатся в spike/captures/, потом из них берутся селекторы.
// Использование: node spike/record.mjs <share_link> [минут=60]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [link, minutesArg] = process.argv.slice(2)
const minutes = Number(minutesArg ?? 60)
if (!link) { console.error('нужна ссылка share_basket'); process.exit(1) }

mkdirSync('spike/captures', { recursive: true })
const log = line => { const s = `${new Date().toISOString()} ${line}`; console.log(s); appendFileSync('spike/captures/log.txt', s + '\n') }

// PROXY=socks5://127.0.0.1:1081 пускает браузер через SSH-туннель на сервер:
// домашний интернет идёт через VPN, и ВкусВилл отдаёт страницу vpn-detected.
const ctx = await chromium.launchPersistentContext('browser/profile', {
  headless: false,
  locale: 'ru-RU',
  viewport: { width: 1280, height: 900 },
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto(link, { waitUntil: 'domcontentloaded' }).catch(e => log('goto: ' + e.message))
log('открыто: ' + link)

let n = 0, lastHash = '', lastUrl = ''
const deadline = Date.now() + minutes * 60_000
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 3000))
  const pages = ctx.pages()
  if (!pages.length) { log('окно закрыто, завершаю'); break }
  const p = pages.at(-1)
  try {
    const html = await p.content()
    const url = p.url()
    const hash = createHash('md5').update(html).digest('hex')
    if (hash !== lastHash || url !== lastUrl) {
      n++
      const stamp = String(n).padStart(3, '0')
      writeFileSync(`spike/captures/${stamp}.html`, `<!-- ${url} -->\n` + html)
      await p.screenshot({ path: `spike/captures/${stamp}.png` }).catch(() => {})
      log(`снимок ${stamp}: ${url}`)
      lastHash = hash; lastUrl = url
    }
  } catch (e) {
    log('снимок не удался: ' + e.message)
  }
}
const cookies = await ctx.cookies().catch(() => [])
writeFileSync('spike/captures/cookies-names.json', JSON.stringify(cookies.map(c => c.name), null, 2))
await ctx.close().catch(() => {})
log('готово')
