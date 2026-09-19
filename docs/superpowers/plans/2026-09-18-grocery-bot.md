# Продуктовый бот: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram-бот, который по фразе «собери корзину на карбонару, спагетти есть» находит рецепт с источником, собирает корзину во ВкусВилле и кладёт её в аккаунт владелицы через браузер на сервере.

**Architecture:** Бот на Node.js принимает сообщения Telegram по long polling и передаёт их движку. Движок v1: `claude -p` (Claude Code headless, подписка) с MCP ВкусВилла, веб-поиском, файловой памятью и одним разрешённым Bash-скриптом `tools/cart.mjs`, который через Playwright открывает ссылку корзины в сохранённой сессии владелицы и возвращает JSON с наличием. Вход во ВкусВилл по СМС: бот запускает `tools/login.mjs`, код владелица присылает в чат.

**Tech Stack:** Node.js 22+, native `fetch`, Playwright (Chromium), Claude Code CLI, Vitest. Сервер 109.94.211.125 (Астана), systemd.

**Spec:** `docs/superpowers/specs/2026-09-13-grocery-bot-design.md`

## Global Constraints

- Node.js >= 22.5 (как у калорийного бота на том же сервере).
- Бот отвечает только владелице: `OWNER_ID` из `.env`, чужие сообщения игнорируются без ответа.
- Рецепт без источника запрещён; товары в корзине только с `xml_id` из поиска MCP; фото только из источника.
- Ссылка на корзину: до 20 позиций (ограничение MCP `vkusvill_cart_link_create`).
- Секреты только в `.env`: `TELEGRAM_TOKEN`, `OWNER_ID`, `CLAUDE_CODE_OAUTH_TOKEN`, `VKUSVILL_PHONE`. В git не попадают.
- Модель: `--model sonnet`. Сессия чата живёт 12 часов тишины или до фразы «новый заказ».
- Таймаут одного вызова движка: 180 секунд.
- Язык кода: комментарии и тексты для владелицы по-русски, идентификаторы по-английски.
- Код проекта: `C:\Users\Олюша\Desktop\Проект-ИИ-агенты\Продуктовый-бот\`. Все пути ниже относительно этой папки.

## Структура файлов

```
package.json, vitest.config.js, .gitignore, .env.example, README.md, DEPLOY.md
src/
  config.js            чтение .env в объект конфигурации
  telegram.js          обёртка Telegram Bot API (getUpdates, sendMessage, sendPhoto, sendChatAction)
  sessions.js          session_id Claude Code по чату, TTL 12 ч, сброс, state.json
  photos.js            вырезание строк PHOTO: и маркера AUTH_REQUIRED из ответа модели
  engine/claude-code.js запуск claude -p, разбор JSON, таймаут
  login-runner.js      запуск tools/login.mjs, запись кода СМС в файл
  handler.js           маршрутизация сообщения: фильтр владелицы, очередь, вход, ответ
  main.js              цикл long polling, сборка зависимостей
workspace/             рабочая директория claude -p (модель видит только её)
  prompts/system.md    правила поведения
  mcp.json             MCP ВкусВилла
  memory/pantry.md, memory/preferences.md, memory/history/.gitkeep
  tools/selectors.json селекторы страниц ВкусВилла (заполняет спайк)
  tools/cart-parse.mjs parseCart(page, selectors) → позиции и наличие
  tools/cart.mjs       CLI: открыть ссылку, вернуть JSON
  tools/login.mjs      CLI: вход по СМС через файл кода
browser/               профиль Chromium (в .gitignore), sms-code.txt, last-error.png
spike/make-link.mjs    создать ссылку корзины через MCP без Claude
spike/open-cart.mjs    ручная разведка: снять HTML корзины и входа
test/*.test.js, test/fixtures/
deploy/grocery-bot.service
docs/superpowers/notes/browser-spike.md
```

---

### Task 1: Каркас проекта и спайк браузера

Спайк отвечает на три вопроса спеки: как страница корзины помечает недоступные товары, попадает ли корзина сайта в приложение, есть ли капча на входе по СМС. Результат: HTML-снимки в `test/fixtures/`, заполненный `workspace/tools/selectors.json`, заметка `browser-spike.md`.

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `.env.example`
- Create: `spike/make-link.mjs`, `spike/open-cart.mjs`
- Create: `workspace/tools/selectors.json`
- Create: `docs/superpowers/notes/browser-spike.md`
- Create: `test/fixtures/cart-real.html`, `test/fixtures/login-real.html` (снимки)

**Interfaces:**
- Produces: `workspace/tools/selectors.json` с ключами `loggedIn`, `cartItem`, `itemName`, `itemQty`, `itemPrice`, `itemUnavailable`, `cartTotal`, `phoneInput`, `phoneSubmit`, `codeInput`, `codeSubmit`. Значения: CSS-селекторы. Их используют Task 6 и Task 7.

- [ ] **Step 1: Каркас**

`package.json`:

```json
{
  "name": "grocery-bot",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node src/main.js",
    "dev": "node --env-file=.env src/main.js",
    "test": "vitest run",
    "spike:link": "node spike/make-link.mjs",
    "spike:cart": "node spike/open-cart.mjs"
  },
  "dependencies": {
    "playwright": "^1.50.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', testTimeout: 20000 } })
```

`.gitignore`:

```
node_modules/
.env
browser/
state.json
workspace/memory/history/*.md
!workspace/memory/history/.gitkeep
```

`.env.example`:

```
TELEGRAM_TOKEN=
OWNER_ID=
CLAUDE_CODE_OAUTH_TOKEN=
VKUSVILL_PHONE=+79990000000
```

Установка и первый коммит:

```bash
cd "C:/Users/Олюша/Desktop/Проект-ИИ-агенты/Продуктовый-бот"
git init
npm install
npx playwright install chromium
mkdir -p workspace/memory/history browser test/fixtures spike src/engine deploy docs/superpowers/notes
touch workspace/memory/history/.gitkeep
git add -A && git commit -m "chore: каркас проекта продуктового бота"
```

- [ ] **Step 2: Скрипт создания ссылки корзины без Claude**

`spike/make-link.mjs`: обращается к MCP напрямую, чтобы для спайка не тратить подписку.

```js
// Создаёт ссылку share_basket через MCP ВкусВилла.
// Использование: node spike/make-link.mjs 107311:1 115018:2
const MCP = 'https://mcp.vkusvill.ru/mcp'

async function call(name, args, id = 1) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      // Без UA сервер отдавал 403 на urllib; curl проходил.
      'user-agent': 'curl/8.0',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  })
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`)
  const data = await res.json()
  return JSON.parse(data.result.content[0].text)
}

const products = process.argv.slice(2).map(s => {
  const [xml_id, q] = s.split(':')
  return { xml_id: Number(xml_id), q: Number(q ?? 1) }
})
if (!products.length) {
  console.error('нужны пары xml_id:количество, например 107311:1')
  process.exit(1)
}
const out = await call('vkusvill_cart_link_create', { products })
console.log(out.data.link)
```

Проверка: `node spike/make-link.mjs 107311:1 115018:2` печатает `https://vkusvill.ru/?share_basket=<число>`.

- [ ] **Step 3: Скрипт разведки**

`spike/open-cart.mjs`: открывает видимый браузер с постоянным профилем, даёт владелице войти руками, затем открывает ссылку корзины и сохраняет HTML и скриншот. Второй режим снимает страницу входа из чистого профиля.

```js
// Режимы:
//   node spike/open-cart.mjs cart <share_link>   — вход руками, снимок корзины
//   node spike/open-cart.mjs login               — чистый профиль, снимок страницы входа
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const [mode, link] = process.argv.slice(2)
const rl = createInterface({ input: stdin, output: stdout })
mkdirSync('test/fixtures', { recursive: true })
mkdirSync('docs/superpowers/notes', { recursive: true })

if (mode === 'cart') {
  const ctx = await chromium.launchPersistentContext('browser/profile', { headless: false, viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('https://vkusvill.ru/')
  await rl.question('Войдите в аккаунт в открытом окне, укажите адрес доставки, затем нажмите Enter здесь... ')
  await page.goto(link, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  writeFileSync('test/fixtures/cart-real.html', await page.content())
  await page.screenshot({ path: 'docs/superpowers/notes/cart.png', fullPage: true })
  console.log('Снимок корзины сохранён. Текущий URL:', page.url())
  await rl.question('Проверьте приложение ВкусВилла на телефоне: появилась ли корзина? Enter для выхода... ')
  await ctx.close()
} else if (mode === 'login') {
  const ctx = await chromium.launchPersistentContext('browser/profile-spike-login', { headless: false })
  const page = await ctx.newPage()
  await page.goto('https://vkusvill.ru/')
  await rl.question('Откройте форму входа (не вводите номер), затем нажмите Enter здесь... ')
  writeFileSync('test/fixtures/login-real.html', await page.content())
  await page.screenshot({ path: 'docs/superpowers/notes/login-phone.png' })
  await rl.question('Введите номер и запросите код, дождитесь поля для кода, затем Enter... ')
  writeFileSync('test/fixtures/login-code-real.html', await page.content())
  await page.screenshot({ path: 'docs/superpowers/notes/login-code.png' })
  console.log('Снимки входа сохранены. Код вводить не обязательно.')
  await ctx.close()
} else {
  console.error('режим: cart <link> | login')
  process.exit(1)
}
rl.close()
```

- [ ] **Step 4: Провести спайк вместе с владелицей**

```bash
node spike/make-link.mjs 107311:1 115018:2      # получить ссылку
node spike/open-cart.mjs cart <ссылка>          # вход руками, снимок корзины
node spike/open-cart.mjs login                  # снимки формы входа
```

Во время шага `cart` владелица смотрит в приложение ВкусВилла на телефоне и говорит, появилась ли корзина. Инженер записывает ответ в заметку.

- [ ] **Step 5: Заполнить селекторы по снимкам**

Открыть `test/fixtures/cart-real.html`, найти карточку позиции корзины, название, количество, цену, признак «нет в наличии» (текст, класс или атрибут), итог и признак входа (имя пользователя в шапке или ссылка на профиль). В `test/fixtures/login-real.html` и `login-code-real.html` найти поле телефона, кнопку отправки, поле кода, кнопку подтверждения.

Записать в `workspace/tools/selectors.json` в таком виде (значения заменить на реальные из снимков):

```json
{
  "loggedIn": ".header__profile-name",
  "cartItem": ".cart-item",
  "itemName": ".cart-item__title",
  "itemQty": ".cart-item__qty",
  "itemPrice": ".cart-item__price",
  "itemUnavailable": ".cart-item--unavailable, .cart-item__unavailable",
  "cartTotal": ".cart-total__sum",
  "phoneInput": "input[name=phone]",
  "phoneSubmit": "button[type=submit]",
  "codeInput": "input[name=code]",
  "codeSubmit": "button[type=submit]"
}
```

Если на странице корзины отсутствующие товары не помечены никак, записать в заметку и в `itemUnavailable` оставить пустую строку: тогда Task 6 считает все позиции доступными и наличие проверяет по карточкам товаров (см. там).

- [ ] **Step 6: Заметка спайка**

`docs/superpowers/notes/browser-spike.md`:

```markdown
# Спайк браузерного слоя (дата)

- Корзина сайта → приложение: да / нет (что видела владелица).
- Разметка недоступных товаров: как помечены (селектор/текст), скриншот cart.png.
- Вход по СМС: капча есть / нет; шаги формы; скриншоты login-*.png.
- Признак входа на странице: селектор.
- Решение: размещение через Playwright / только ссылка владелице.
```

Заполнить фактами. Если корзина в приложение не попадает, в спеке размещение заменяется на отправку ссылки: Task 6 всё равно нужен для проверки наличия, а бот в Task 8 добавляет ссылку в ответ (уже предусмотрено запасным путём).

- [ ] **Step 7: Коммит**

```bash
git add -A && git commit -m "spike: снимки корзины и входа ВкусВилла, селекторы"
```

---

### Task 2: Конфигурация и обёртка Telegram

**Files:**
- Create: `src/config.js`, `src/telegram.js`
- Test: `test/config.test.js`, `test/telegram.test.js`

**Interfaces:**
- Produces: `loadConfig(env) → { telegramToken, ownerId:number, oauthToken, phone, apiBase, workspaceDir, browserDir, stateFile }`.
- Produces: `createTelegram({ token, apiBase, fetchImpl }) → { getUpdates(offset, timeout), sendMessage(chatId, text, options), sendPhoto(chatId, photoUrl, caption), sendChatAction(chatId, action) }`. `sendMessage` режет текст на куски по 4000 символов.

- [ ] **Step 1: Тесты конфигурации**

`test/config.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

const base = { TELEGRAM_TOKEN: 't', OWNER_ID: '42', CLAUDE_CODE_OAUTH_TOKEN: 'o', VKUSVILL_PHONE: '+79990000000' }

describe('loadConfig', () => {
  it('читает обязательные переменные и приводит OWNER_ID к числу', () => {
    const c = loadConfig(base)
    expect(c.ownerId).toBe(42)
    expect(c.telegramToken).toBe('t')
    expect(c.apiBase).toBe('https://api.telegram.org')
    expect(c.workspaceDir.endsWith('workspace')).toBe(true)
  })
  it('падает без TELEGRAM_TOKEN', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_TOKEN: '' })).toThrow(/TELEGRAM_TOKEN/)
  })
  it('падает, если OWNER_ID не число', () => {
    expect(() => loadConfig({ ...base, OWNER_ID: 'abc' })).toThrow(/OWNER_ID/)
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/config.test.js`
Expected: FAIL, модуль `../src/config.js` не найден.

- [ ] **Step 3: Реализация**

`src/config.js`:

```js
import { resolve } from 'node:path'

function required(env, name) {
  const v = env[name]
  if (!v) throw new Error(`Не задана переменная ${name}`)
  return v
}

export function loadConfig(env = process.env, root = resolve(import.meta.dirname, '..')) {
  const ownerId = Number(required(env, 'OWNER_ID'))
  if (!Number.isInteger(ownerId)) throw new Error('OWNER_ID должен быть числом')
  return {
    telegramToken: required(env, 'TELEGRAM_TOKEN'),
    ownerId,
    oauthToken: required(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    phone: required(env, 'VKUSVILL_PHONE'),
    apiBase: env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',
    workspaceDir: resolve(root, 'workspace'),
    browserDir: resolve(root, 'browser'),
    stateFile: resolve(root, 'state.json'),
  }
}
```

- [ ] **Step 4: Тесты Telegram**

`test/telegram.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createTelegram } from '../src/telegram.js'

function fakeFetch(result = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { json: async () => ({ ok: true, result }) }
  }
  return { fetchImpl, calls }
}

describe('createTelegram', () => {
  it('sendMessage шлёт chat_id и text на нужный метод', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await tg.sendMessage(7, 'привет')
    expect(calls[0].url).toBe('https://api/botT/sendMessage')
    expect(calls[0].body).toEqual({ chat_id: 7, text: 'привет' })
  })
  it('sendMessage режет длинный текст на куски до 4000 символов', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await tg.sendMessage(7, 'a'.repeat(9000))
    expect(calls.length).toBe(3)
    expect(calls[0].body.text.length).toBe(4000)
  })
  it('sendPhoto передаёт url и подпись', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await tg.sendPhoto(7, 'https://x/y.webp', 'Шарлотка')
    expect(calls[0].url).toBe('https://api/botT/sendPhoto')
    expect(calls[0].body).toEqual({ chat_id: 7, photo: 'https://x/y.webp', caption: 'Шарлотка' })
  })
  it('бросает ошибку при ok:false', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: false, description: 'плохо' }) })
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await expect(tg.sendMessage(7, 'x')).rejects.toThrow('плохо')
  })
})
```

- [ ] **Step 5: Прогнать, убедиться в падении**

Run: `npx vitest run test/telegram.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 6: Реализация**

`src/telegram.js`:

```js
// Тонкая обёртка над Telegram Bot API. fetchImpl внедряется, чтобы тесты не ходили в сеть.
const CHUNK = 4000

export function createTelegram({ token, apiBase, fetchImpl = fetch }) {
  const method = name => `${apiBase}/bot${token}/${name}`

  async function call(name, payload) {
    const res = await fetchImpl(method(name), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.description ?? 'ошибка Telegram API')
    return data.result
  }

  return {
    getUpdates: (offset, timeout = 30) =>
      call('getUpdates', { offset, timeout, allowed_updates: ['message'] }),

    async sendMessage(chatId, text, options = {}) {
      const chunks = text.length ? text.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) : ['']
      let last
      for (const chunk of chunks) last = await call('sendMessage', { chat_id: chatId, text: chunk, ...options })
      return last
    },

    sendPhoto: (chatId, photo, caption) =>
      call('sendPhoto', { chat_id: chatId, photo, ...(caption ? { caption } : {}) }),

    sendChatAction: (chatId, action = 'typing') =>
      call('sendChatAction', { chat_id: chatId, action }),
  }
}
```

- [ ] **Step 7: Прогнать тесты**

Run: `npx vitest run test/config.test.js test/telegram.test.js`
Expected: PASS, 7 тестов.

- [ ] **Step 8: Коммит**

```bash
git add src/config.js src/telegram.js test/config.test.js test/telegram.test.js
git commit -m "feat: конфигурация и обёртка Telegram"
```

---

### Task 3: Разбор ответа модели: фото и маркер входа

**Files:**
- Create: `src/photos.js`
- Test: `test/photos.test.js`

**Interfaces:**
- Produces: `parseReply(text) → { text:string, photos:string[], authRequired:boolean }`. Строки вида `PHOTO: <url>` вырезаются в `photos`; отдельная строка `AUTH_REQUIRED` вырезается и ставит флаг. Используется в Task 8.

- [ ] **Step 1: Тест**

`test/photos.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseReply } from '../src/photos.js'

describe('parseReply', () => {
  it('вырезает строки PHOTO: и отдаёт список url', () => {
    const r = parseReply('Шарлотка\nPHOTO: https://a/1.webp\nШаги...\nPHOTO: https://a/2.webp')
    expect(r.photos).toEqual(['https://a/1.webp', 'https://a/2.webp'])
    expect(r.text).toBe('Шарлотка\nШаги...')
    expect(r.authRequired).toBe(false)
  })
  it('распознаёт маркер AUTH_REQUIRED отдельной строкой', () => {
    const r = parseReply('Сессия закончилась.\nAUTH_REQUIRED\n')
    expect(r.authRequired).toBe(true)
    expect(r.text).toBe('Сессия закончилась.')
  })
  it('не трогает обычный текст', () => {
    const r = parseReply('Всё готово, корзина на 1 840 ₽.')
    expect(r).toEqual({ text: 'Всё готово, корзина на 1 840 ₽.', photos: [], authRequired: false })
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/photos.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализация**

`src/photos.js`:

```js
// Модель помечает картинки строкой "PHOTO: <url>", а протухшую сессию ВкусВилла
// отдельной строкой "AUTH_REQUIRED". Бот вырезает их из текста.
const PHOTO_RE = /^PHOTO:\s*(\S+)\s*$/
const AUTH_MARK = 'AUTH_REQUIRED'

export function parseReply(raw) {
  const photos = []
  let authRequired = false
  const lines = []
  for (const line of raw.split('\n')) {
    const m = line.match(PHOTO_RE)
    if (m) { photos.push(m[1]); continue }
    if (line.trim() === AUTH_MARK) { authRequired = true; continue }
    lines.push(line)
  }
  return { text: lines.join('\n').trim(), photos, authRequired }
}
```

- [ ] **Step 4: Прогнать**

Run: `npx vitest run test/photos.test.js`
Expected: PASS, 3 теста.

- [ ] **Step 5: Коммит**

```bash
git add src/photos.js test/photos.test.js
git commit -m "feat: разбор ответа модели: фото и маркер входа"
```

---

### Task 4: Хранилище сессий Claude Code

**Files:**
- Create: `src/sessions.js`
- Test: `test/sessions.test.js`

**Interfaces:**
- Produces: `createSessions({ file, ttlMs = 12*60*60*1000, now = Date.now, fs }) → { get(chatId) → string|null, set(chatId, sessionId), reset(chatId), setAwaitingCode(chatId, bool), isAwaitingCode(chatId) }`. Состояние пишется в JSON-файл после каждого изменения. Используется в Task 8.

- [ ] **Step 1: Тест**

`test/sessions.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createSessions } from '../src/sessions.js'

function memFs(initial) {
  let content = initial
  return {
    existsSync: () => content !== undefined,
    readFileSync: () => content,
    writeFileSync: (_p, data) => { content = data },
    dump: () => content,
  }
}

describe('sessions', () => {
  it('отдаёт null для нового чата и хранит session_id', () => {
    const s = createSessions({ file: 'x.json', fs: memFs() })
    expect(s.get(1)).toBeNull()
    s.set(1, 'abc')
    expect(s.get(1)).toBe('abc')
  })
  it('забывает сессию через 12 часов тишины', () => {
    let t = 1_000_000
    const s = createSessions({ file: 'x.json', fs: memFs(), now: () => t })
    s.set(1, 'abc')
    t += 12 * 60 * 60 * 1000 + 1
    expect(s.get(1)).toBeNull()
  })
  it('reset удаляет сессию', () => {
    const s = createSessions({ file: 'x.json', fs: memFs() })
    s.set(1, 'abc'); s.reset(1)
    expect(s.get(1)).toBeNull()
  })
  it('сохраняет и восстанавливает состояние из файла', () => {
    const fs = memFs()
    const s1 = createSessions({ file: 'x.json', fs })
    s1.set(1, 'abc'); s1.setAwaitingCode(1, true)
    const s2 = createSessions({ file: 'x.json', fs })
    expect(s2.get(1)).toBe('abc')
    expect(s2.isAwaitingCode(1)).toBe(true)
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/sessions.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализация**

`src/sessions.js`:

```js
import * as nodeFs from 'node:fs'

const DAY_HALF = 12 * 60 * 60 * 1000

export function createSessions({ file, ttlMs = DAY_HALF, now = Date.now, fs = nodeFs }) {
  let state = { chats: {} }
  if (fs.existsSync(file)) {
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { state = { chats: {} } }
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2))
  const chat = id => (state.chats[id] ??= { sessionId: null, lastUsed: 0, awaitingCode: false })

  return {
    get(chatId) {
      const c = chat(chatId)
      if (!c.sessionId) return null
      if (now() - c.lastUsed > ttlMs) { c.sessionId = null; save(); return null }
      return c.sessionId
    },
    set(chatId, sessionId) {
      const c = chat(chatId); c.sessionId = sessionId; c.lastUsed = now(); save()
    },
    reset(chatId) { const c = chat(chatId); c.sessionId = null; save() },
    setAwaitingCode(chatId, flag) { chat(chatId).awaitingCode = Boolean(flag); save() },
    isAwaitingCode(chatId) { return chat(chatId).awaitingCode },
  }
}
```

- [ ] **Step 4: Прогнать**

Run: `npx vitest run test/sessions.test.js`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add src/sessions.js test/sessions.test.js
git commit -m "feat: хранилище сессий Claude Code с TTL"
```

---

### Task 5: Движок Claude Code, системный промпт, память

**Files:**
- Create: `src/engine/claude-code.js`
- Create: `workspace/prompts/system.md`, `workspace/mcp.json`, `workspace/memory/pantry.md`, `workspace/memory/preferences.md`
- Test: `test/engine.test.js`

**Interfaces:**
- Produces: `buildArgs({ text, sessionId, model = 'sonnet' }) → string[]` (чистая функция).
- Produces: `createEngine({ workspaceDir, browserDir, oauthToken, spawnImpl, timeoutMs = 180000 }) → { run(text, sessionId) → Promise<{ reply, sessionId, isError }> }`. Используется в Task 8.

- [ ] **Step 1: Тест**

`test/engine.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { buildArgs, createEngine } from '../src/engine/claude-code.js'

function fakeSpawn(stdoutText, code = 0) {
  const calls = []
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.kill = () => child.emit('close', 137)
    setTimeout(() => { child.stdout.emit('data', Buffer.from(stdoutText)); child.emit('close', code) }, 5)
    return child
  }
  return { spawnImpl, calls }
}

describe('buildArgs', () => {
  it('собирает флаги без resume для новой сессии', () => {
    const a = buildArgs({ text: 'шарлотка', sessionId: null })
    expect(a.slice(0, 2)).toEqual(['-p', 'шарлотка'])
    expect(a).toContain('--model'); expect(a).toContain('sonnet')
    expect(a).toContain('--output-format'); expect(a).toContain('json')
    expect(a).toContain('--strict-mcp-config')
    expect(a).not.toContain('--resume')
    const tools = a[a.indexOf('--allowedTools') + 1]
    expect(tools).toContain('mcp__vkusvill__*')
    expect(tools).toContain('Bash(node tools/cart.mjs *)')
  })
  it('добавляет --resume при известной сессии', () => {
    const a = buildArgs({ text: 'да', sessionId: 'sid-1' })
    expect(a[a.indexOf('--resume') + 1]).toBe('sid-1')
  })
})

describe('createEngine.run', () => {
  const okJson = JSON.stringify({ type: 'result', is_error: false, result: 'Готово', session_id: 'sid-9' })

  it('возвращает текст и session_id из JSON', async () => {
    const { spawnImpl, calls } = fakeSpawn(okJson)
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl })
    const r = await e.run('шарлотка', null)
    expect(r).toEqual({ reply: 'Готово', sessionId: 'sid-9', isError: false })
    expect(calls[0].opts.cwd).toBe('/ws')
    expect(calls[0].opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok')
    expect(calls[0].opts.env.GROCERY_BROWSER_DIR).toBe('/br')
  })
  it('isError при ненулевом коде или битом JSON', async () => {
    const { spawnImpl } = fakeSpawn('не json', 1)
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl })
    const r = await e.run('x', null)
    expect(r.isError).toBe(true)
  })
  it('убивает процесс по таймауту', async () => {
    const spawnImpl = () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      child.kill = () => setTimeout(() => child.emit('close', 137), 1)
      return child
    }
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl, timeoutMs: 20 })
    const r = await e.run('x', null)
    expect(r.isError).toBe(true)
    expect(r.reply).toMatch(/таймаут/i)
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/engine.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализация движка**

`src/engine/claude-code.js`:

```js
// Движок v1: Claude Code в headless-режиме (claude -p) по подписке.
// Интерфейс run(text, sessionId) не зависит от способа вызова модели:
// при переходе на API меняется только этот файл.
import { spawn as nodeSpawn } from 'node:child_process'

const ALLOWED_TOOLS = [
  'mcp__vkusvill__*',
  'WebSearch',
  'WebFetch',
  'Read',
  'Write',
  'Edit',
  'Bash(node tools/cart.mjs *)',
].join(',')

export function buildArgs({ text, sessionId, model = 'sonnet' }) {
  const args = [
    '-p', text,
    '--model', model,
    '--output-format', 'json',
    '--append-system-prompt-file', 'prompts/system.md',
    '--mcp-config', 'mcp.json',
    '--strict-mcp-config',
    '--allowedTools', ALLOWED_TOOLS,
  ]
  if (sessionId) args.push('--resume', sessionId)
  return args
}

export function createEngine({ workspaceDir, browserDir, oauthToken, spawnImpl = nodeSpawn, timeoutMs = 180_000, model = 'sonnet' }) {
  return {
    run(text, sessionId) {
      return new Promise(resolve => {
        const args = buildArgs({ text, sessionId, model })
        const child = spawnImpl('claude', args, {
          cwd: workspaceDir,
          env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken, GROCERY_BROWSER_DIR: browserDir },
          // На Windows claude — .cmd-шим, без shell spawn его не запустит. На сервере Linux не нужно.
          shell: process.platform === 'win32',
        })
        let out = '', err = '', done = false
        const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }
        const timer = setTimeout(() => {
          child.kill()
          finish({ reply: 'Таймаут ответа модели (3 минуты). Повтори, пожалуйста.', sessionId, isError: true })
        }, timeoutMs)
        child.stdout.on('data', d => { out += d })
        child.stderr.on('data', d => { err += d })
        child.on('error', e => finish({ reply: `Не удалось запустить claude: ${e.message}`, sessionId, isError: true }))
        child.on('close', code => {
          try {
            const data = JSON.parse(out)
            finish({ reply: String(data.result ?? ''), sessionId: data.session_id ?? sessionId, isError: Boolean(data.is_error) || code !== 0 })
          } catch {
            finish({ reply: `Модель не ответила (код ${code}). ${err.slice(0, 300)}`.trim(), sessionId, isError: true })
          }
        })
      })
    },
  }
}
```

- [ ] **Step 4: Прогнать**

Run: `npx vitest run test/engine.test.js`
Expected: PASS, 5 тестов.

- [ ] **Step 5: MCP-конфиг и файлы памяти**

`workspace/mcp.json`:

```json
{
  "mcpServers": {
    "vkusvill": { "type": "http", "url": "https://mcp.vkusvill.ru/mcp" }
  }
}
```

`workspace/memory/pantry.md`:

```markdown
# Что есть дома

## Всегда есть (не покупать, если не сказано иначе)
- соль, сахар, чёрный перец
- растительное масло
- чай

## Временно есть (дата, сгорает через 7 дней)
<!-- пример: - спагетти 500 г (2026-09-18) -->
```

`workspace/memory/preferences.md`:

```markdown
# Предпочтения

- Порции по умолчанию: на 2 человек.
- Цена: не гнаться за самым дешёвым, но не брать самое дорогое без причины.
- Бренд: товары ВкусВилл предпочтительны, если разница в цене небольшая.

## Нелюбимое / не покупать
<!-- дописывает бот после правок владелицы -->

## Замены, которые понравились
<!-- дописывает бот после подтверждённых заказов -->
```

- [ ] **Step 6: Системный промпт**

`workspace/prompts/system.md`:

```markdown
Ты продуктовый помощник Ольги. Ты работаешь в Telegram, поэтому отвечаешь коротко, без markdown-таблиц (Telegram их не рисует), списки простым текстом. Обращение на «ты».

## Что ты делаешь
1. По запросу блюда находишь рецепт с источником и присылаешь его.
2. Разбираешь рецепт на покупки, вычитаешь то, что есть дома, подбираешь товары ВкусВилла, показываешь список с ценами и ждёшь подтверждения.
3. После «да» создаёшь ссылку на корзину и размещаешь её в аккаунт через tools/cart.mjs, проверяешь наличие, предлагаешь замены.

## Рецепты: только с источником
- Порядок поиска: (1) vkusvill_recipes через MCP, там уже привязаны товары; (2) если не нашлось, WebSearch по кулинарным сайтам, возьми 2–3 рецепта с высоким рейтингом, сверь ключевые моменты (тип теста, температура, время) и выбери один, дай на него ссылку; (3) если Ольга прислала свой рецепт или ссылку, работай по нему.
- Никогда не пиши рецепт по памяти. Нет источника: скажи об этом и попроси ссылку.
- Если источники расходятся в ключевом моменте, скажи об этом одной строкой.
- Если блюдо противоречиво или не существует (например, «свиные крылышки»), скажи прямо и предложи реальное.
- Фото блюда бери из источника. Каждую картинку выводи отдельной строкой ровно так: `PHOTO: <url>`. Не выдумывай url, не генерируй картинки.

## Корзина: только реальные товары
- Перед подбором прочитай memory/pantry.md и memory/preferences.md.
- Каждая позиция это конкретный xml_id из vkusvill_products_search. Ищи с vvonly=0, сортировка popularity, режим custom с полями xml_id, name, price, weight, unit.
- Не нашёл подходящего: спроси Ольгу, не клади похожее молча.
- Сначала покажи список: строка на позицию «название товара, вес, цена», внизу итог. Потом вопрос «Собираю?». Правки словами до подтверждения.
- После подтверждения: vkusvill_cart_link_create (до 20 позиций на ссылку; больше, значит несколько ссылок подряд), затем запусти `node tools/cart.mjs <ссылка>` и прочитай JSON из stdout.
- Если cart.mjs вернул status "ok": позиции с available=false покажи Ольге, найди аналоги через vkusvill_product_analogs, предложи замену, после согласия сделай новую ссылку только с заменами и снова запусти cart.mjs.
- Если cart.mjs вернул status "auth_required": ответь коротко и добавь отдельной строкой ровно `AUTH_REQUIRED`. Бот сам проведёт вход и попросит тебя повторить.
- Если cart.mjs вернул status "error": отправь Ольге саму ссылку на корзину и напиши, что положить автоматически не вышло, по ссылке корзина откроется одним тапом.

## Память
- «Дома всегда есть X» пиши в раздел «Всегда есть» файла memory/pantry.md.
- «X есть» в запросе на заказ пиши в «Временно есть» с сегодняшней датой.
- После подтверждённого заказа дописывай в memory/history/ГГГГ-ММ-ДД.md, что заказано и какие замены сделаны, и добавляй понравившиеся замены и нелюбимые товары в memory/preferences.md.

## Стиль ответа
- Коротко. В конце одна строка: что делать дальше («открой приложение, корзина на 1 840 ₽ лежит»).
- Не объясняй, как ты работаешь, не извиняйся, не повторяй запрос.
```

- [ ] **Step 7: Ручная проверка движка (тратит немного подписки)**

Из корня проекта, с заполненным `.env`:

```bash
cd workspace
CLAUDE_CODE_OAUTH_TOKEN=... claude -p "хочу шарлотку, только рецепт" --model sonnet --output-format json \
  --append-system-prompt-file prompts/system.md --mcp-config mcp.json --strict-mcp-config \
  --allowedTools "mcp__vkusvill__*,WebSearch,WebFetch,Read,Write,Edit,Bash(node tools/cart.mjs *)"
```

Ожидание: в `result` есть рецепт, ссылка на источник и хотя бы одна строка `PHOTO: https://vkusvill.ru/...`. На Windows команда запускается из Git Bash; если `claude` не находится, вызывать `claude.cmd`.

- [ ] **Step 8: Коммит**

```bash
git add src/engine/claude-code.js test/engine.test.js workspace/prompts/system.md workspace/mcp.json workspace/memory/pantry.md workspace/memory/preferences.md
git commit -m "feat: движок Claude Code, системный промпт, файлы памяти"
```

---

### Task 6: Размещение корзины через Playwright (cart.mjs)

**Files:**
- Create: `workspace/tools/cart-parse.mjs`, `workspace/tools/cart.mjs`
- Create: `test/fixtures/cart-synthetic.html`
- Test: `test/cart-parse.test.js`
- Uses: `workspace/tools/selectors.json` из Task 1, `test/fixtures/cart-real.html` из Task 1

**Interfaces:**
- Produces: `parseCart(page, selectors) → Promise<{ loggedIn:boolean, items:[{ name, qty, price, available }], total:string|null }>`.
- Produces: CLI `node tools/cart.mjs <link>` печатает одну JSON-строку: `{ status:'ok', items, total, unavailable:string[] }` | `{ status:'auth_required' }` | `{ status:'error', message, screenshot }`. Профиль браузера берётся из `process.env.GROCERY_BROWSER_DIR + '/profile'`.

- [ ] **Step 1: Синтетический снимок для теста**

`test/fixtures/cart-synthetic.html`:

```html
<!doctype html><html><body>
<header><span class="profile-name">Ольга</span></header>
<ul>
  <li class="item"><span class="name">Сыр «Пармезан» 100 г</span><span class="qty">1</span><span class="price">286 ₽</span></li>
  <li class="item unavailable"><span class="name">Бекон 200 г</span><span class="qty">2</span><span class="price">350 ₽</span></li>
</ul>
<div class="total">986 ₽</div>
</body></html>
```

- [ ] **Step 2: Тест парсера**

`test/cart-parse.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { parseCart } from '../workspace/tools/cart-parse.mjs'

const synthetic = {
  loggedIn: '.profile-name', cartItem: '.item', itemName: '.name', itemQty: '.qty',
  itemPrice: '.price', itemUnavailable: '.unavailable', cartTotal: '.total',
}

let browser, page
beforeAll(async () => { browser = await chromium.launch(); page = await browser.newPage() })
afterAll(async () => { await browser.close() })

describe('parseCart', () => {
  it('читает позиции, наличие и итог из синтетической страницы', async () => {
    await page.setContent(readFileSync('test/fixtures/cart-synthetic.html', 'utf8'))
    const r = await parseCart(page, synthetic)
    expect(r.loggedIn).toBe(true)
    expect(r.items).toEqual([
      { name: 'Сыр «Пармезан» 100 г', qty: '1', price: '286 ₽', available: true },
      { name: 'Бекон 200 г', qty: '2', price: '350 ₽', available: false },
    ])
    expect(r.total).toBe('986 ₽')
  })
  it('loggedIn=false без признака входа', async () => {
    await page.setContent('<html><body><ul></ul></body></html>')
    const r = await parseCart(page, synthetic)
    expect(r.loggedIn).toBe(false)
    expect(r.items).toEqual([])
    expect(r.total).toBeNull()
  })
  it('реальный снимок разбирается реальными селекторами', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    await page.setContent(readFileSync('test/fixtures/cart-real.html', 'utf8'))
    const r = await parseCart(page, selectors)
    expect(r.loggedIn).toBe(true)
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items[0].name.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Прогнать, убедиться в падении**

Run: `npx vitest run test/cart-parse.test.js`
Expected: FAIL, модуль `cart-parse.mjs` не найден.

- [ ] **Step 4: Парсер**

`workspace/tools/cart-parse.mjs`:

```js
// Читает страницу корзины ВкусВилла по селекторам из selectors.json.
// Селекторы вынесены в файл, потому что вёрстка сайта меняется чаще кода.
export async function parseCart(page, s) {
  const loggedIn = s.loggedIn ? (await page.$(s.loggedIn)) !== null : false
  const items = await page.$$eval(s.cartItem, (nodes, s) => nodes.map(n => {
    const text = sel => (sel && n.querySelector(sel)?.textContent.trim()) || ''
    const unavailable = s.itemUnavailable
      ? n.matches(s.itemUnavailable) || n.querySelector(s.itemUnavailable) !== null
      : false
    return { name: text(s.itemName), qty: text(s.itemQty), price: text(s.itemPrice), available: !unavailable }
  }), s)
  const totalEl = s.cartTotal ? await page.$(s.cartTotal) : null
  const total = totalEl ? (await totalEl.textContent()).trim() : null
  return { loggedIn, items, total }
}
```

- [ ] **Step 5: Прогнать**

Run: `npx vitest run test/cart-parse.test.js`
Expected: PASS, 3 теста. Если третий падает, селекторы в `selectors.json` не соответствуют снимку: поправить селекторы, не тест.

- [ ] **Step 6: CLI cart.mjs**

`workspace/tools/cart.mjs`:

```js
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
  out({ status: 'error', message: 'ожидается ссылка вида https://vkusvill.ru/?share_basket=<число>' })
  process.exit(0)
}

const selectors = JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf8'))
mkdirSync(browserDir, { recursive: true })
let ctx
try {
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
```

- [ ] **Step 7: Ручная проверка на компьютере**

Профиль после спайка (Task 1) лежит в `browser/profile` и уже залогинен.

```bash
node spike/make-link.mjs 107311:1
cd workspace && GROCERY_BROWSER_DIR=../browser node tools/cart.mjs <ссылка>
```

Ожидание: одна строка JSON со `status: "ok"`, позициями и итогом. Если `auth_required`, значит признак входа в `selectors.json` неверный: сверить со снимком.

- [ ] **Step 8: Коммит**

```bash
git add workspace/tools/cart-parse.mjs workspace/tools/cart.mjs test/cart-parse.test.js test/fixtures/cart-synthetic.html
git commit -m "feat: размещение корзины через Playwright и разбор наличия"
```

---

### Task 7: Вход по СМС (login.mjs и login-runner)

**Files:**
- Create: `workspace/tools/login.mjs`, `src/login-runner.js`
- Test: `test/login-runner.test.js`
- Uses: `workspace/tools/selectors.json` (ключи `phoneInput`, `phoneSubmit`, `codeInput`, `codeSubmit`, `loggedIn`)

**Interfaces:**
- Produces: CLI `node tools/login.mjs <phone>`: вводит номер, ждёт файл `<GROCERY_BROWSER_DIR>/sms-code.txt` до 180 секунд, вводит код, печатает `{ status:'ok' }` или `{ status:'error', message }`. Код выхода 0 при ok, 1 при ошибке.
- Produces: `createLoginRunner({ workspaceDir, browserDir, phone, spawnImpl, fs }) → { start() → Promise<{ ok:boolean, message?:string }>, submitCode(code) }`. `start` запускает login.mjs и резолвится по его завершению; `submitCode` пишет код в файл. Используется в Task 8.

- [ ] **Step 1: Тест раннера**

`test/login-runner.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createLoginRunner } from '../src/login-runner.js'

function fakeSpawn(stdoutText, code) {
  const calls = []
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    setTimeout(() => { child.stdout.emit('data', Buffer.from(stdoutText)); child.emit('close', code) }, 5)
    return child
  }
  return { spawnImpl, calls }
}
const memFs = () => { const files = {}; return { writeFileSync: (p, d) => { files[p] = d }, files } }

describe('login-runner', () => {
  it('запускает login.mjs с номером и резолвится ok', async () => {
    const { spawnImpl, calls } = fakeSpawn('{"status":"ok"}', 0)
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs() })
    const res = await r.start()
    expect(res.ok).toBe(true)
    expect(calls[0].args).toEqual(['tools/login.mjs', '+7999'])
    expect(calls[0].opts.cwd).toBe('/ws')
    expect(calls[0].opts.env.GROCERY_BROWSER_DIR).toBe('/br')
  })
  it('возвращает ошибку при ненулевом коде', async () => {
    const { spawnImpl } = fakeSpawn('{"status":"error","message":"капча"}', 1)
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs() })
    const res = await r.start()
    expect(res).toEqual({ ok: false, message: 'капча' })
  })
  it('submitCode пишет код в sms-code.txt в папке браузера', () => {
    const fs = memFs()
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl: () => new EventEmitter(), fs })
    r.submitCode('1234')
    expect(fs.files['/br/sms-code.txt']).toBe('1234')
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/login-runner.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Раннер**

`src/login-runner.js`:

```js
// Запускает вход во ВкусВилл (tools/login.mjs) и передаёт ему код из СМС через файл.
import { spawn as nodeSpawn } from 'node:child_process'
import * as nodeFs from 'node:fs'
import { join } from 'node:path/posix'

export function createLoginRunner({ workspaceDir, browserDir, phone, spawnImpl = nodeSpawn, fs = nodeFs }) {
  const codeFile = join(browserDir, 'sms-code.txt')
  return {
    start() {
      return new Promise(resolve => {
        const child = spawnImpl('node', ['tools/login.mjs', phone], {
          cwd: workspaceDir,
          env: { ...process.env, GROCERY_BROWSER_DIR: browserDir },
        })
        let out = ''
        child.stdout.on('data', d => { out += d })
        child.on('error', e => resolve({ ok: false, message: e.message }))
        child.on('close', code => {
          let data = {}
          try { data = JSON.parse(out.trim().split('\n').pop()) } catch {}
          if (code === 0 && data.status === 'ok') resolve({ ok: true })
          else resolve({ ok: false, message: data.message ?? `login.mjs завершился с кодом ${code}` })
        })
      })
    },
    submitCode(code) { fs.writeFileSync(codeFile, String(code).trim()) },
  }
}
```

Примечание: `node:path/posix` выбран намеренно, чтобы тест с `/br` давал `/br/sms-code.txt` на Windows. На сервере пути POSIX и так.

- [ ] **Step 4: Прогнать**

Run: `npx vitest run test/login-runner.test.js`
Expected: PASS, 3 теста.

- [ ] **Step 5: login.mjs**

`workspace/tools/login.mjs`:

```js
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
  ctx = await chromium.launchPersistentContext(join(browserDir, 'profile'), { headless: true, locale: 'ru-RU' })
  const page = await ctx.newPage()
  await page.goto('https://vkusvill.ru/', { waitUntil: 'networkidle', timeout: 60_000 })
  if (await page.$(s.loggedIn)) { out({ status: 'ok', note: 'уже в аккаунте' }, 0) }
  else {
    // Открыть форму входа: на сайте это кнопка/ссылка в шапке. Точный селектор
    // записан в selectors.json как loginOpen (добавить в Task 1, если форма не на отдельной странице).
    if (s.loginOpen) await page.click(s.loginOpen)
    await page.fill(s.phoneInput, phone)
    await page.click(s.phoneSubmit)
    await page.waitForSelector(s.codeInput, { timeout: 30_000 })
    const code = await waitForCode()
    await page.fill(s.codeInput, code)
    if (s.codeSubmit) await page.click(s.codeSubmit).catch(() => {})
    await page.waitForSelector(s.loggedIn, { timeout: 30_000 })
    out({ status: 'ok' }, 0)
  }
} catch (e) {
  try { const p = ctx?.pages()[0]; if (p) await p.screenshot({ path: join(browserDir, 'last-error.png') }) } catch {}
  out({ status: 'error', message: e.message }, 1)
} finally {
  await ctx?.close()
}
```

Если в спайке выяснилось, что форма входа открывается кнопкой в шапке, добавить в `selectors.json` ключ `loginOpen` с её селектором. Если на входе капча, записать в `browser-spike.md`, а в `login.mjs` после `phoneSubmit` добавить скриншот `login-captcha.png` и завершение с `status: 'error', message: 'капча'`: бот отправит скриншот владелице (Task 8 обрабатывает любой `error` текстом).

- [ ] **Step 6: Ручная проверка входа на компьютере**

Использовать отдельный чистый профиль, чтобы не сломать залогиненный:

```bash
cd workspace
GROCERY_BROWSER_DIR=../browser-login-test node tools/login.mjs +7XXXXXXXXXX
# в другом терминале, когда придёт СМС:
echo 1234 > ../browser-login-test/sms-code.txt
```

Ожидание: `{"status":"ok"}`. После проверки папку `browser-login-test` удалить.

- [ ] **Step 7: Коммит**

```bash
git add workspace/tools/login.mjs src/login-runner.js test/login-runner.test.js workspace/tools/selectors.json
git commit -m "feat: вход во ВкусВилл по СМС через файл кода"
```

---

### Task 8: Обработчик сообщений

**Files:**
- Create: `src/handler.js`
- Test: `test/handler.test.js`

**Interfaces:**
- Consumes: `engine.run(text, sessionId)`, `sessions.*`, `telegram.*`, `loginRunner.start()/submitCode()`, `parseReply(text)`.
- Produces: `createHandler({ ownerId, telegram, engine, sessions, loginRunner, statusDelayMs = 5000, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) → { handleMessage(msg) → Promise<void> }`. Сообщения одного чата обрабатываются строго по очереди.

Поведение:
1. `msg.from.id !== ownerId` → ничего.
2. Текст «новый заказ» (без учёта регистра) → `sessions.reset`, ответ «Начинаем с чистого листа. Что готовим?».
3. Если `sessions.isAwaitingCode(chat)` и текст из 4–6 цифр → `loginRunner.submitCode`, ответ «Ввожу код…». Завершение входа обрабатывается в месте, где вход стартовал (см. 6).
4. Иначе: через `statusDelayMs` отправить «⏳ Работаю…», если ответ ещё не пришёл. Вызвать `engine.run(text, sessions.get(chat))`. Сохранить `sessionId`.
5. Ответ пропустить через `parseReply`: сначала фото (`sendPhoto` по url, ошибки одной картинки глотать), затем текст. При `isError` текст отправить как есть.
6. Если `authRequired`: `sessions.setAwaitingCode(chat, true)`, ответ «Сессия ВкусВилла закончилась. Сейчас придёт СМС, пришли код сюда.», запустить `loginRunner.start()`. По завершении: `setAwaitingCode(false)`; при `ok` отправить «Вошла. Повторяю размещение…» и вызвать `engine.run('Сессия ВкусВилла восстановлена, повтори размещение корзины.', sessionId)` с той же обработкой ответа; при ошибке отправить «Войти не удалось: <message>».

- [ ] **Step 1: Тест**

`test/handler.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createHandler } from '../src/handler.js'
import { createSessions } from '../src/sessions.js'

const memFs = () => { let c; return { existsSync: () => c !== undefined, readFileSync: () => c, writeFileSync: (_p, d) => { c = d } } }
function fakeTelegram() {
  const sent = []
  return {
    sent,
    sendMessage: async (chatId, text) => { sent.push({ type: 'text', chatId, text }) },
    sendPhoto: async (chatId, photo) => { sent.push({ type: 'photo', chatId, photo }) },
    sendChatAction: async () => {},
  }
}
function fakeEngine(replies) {
  const calls = []
  return { calls, run: async (text, sessionId) => { calls.push({ text, sessionId }); return replies.shift() } }
}
const msg = (text, from = 42, chat = 42) => ({ text, from: { id: from }, chat: { id: chat } })
const noTimers = { setTimeoutImpl: () => 0, clearTimeoutImpl: () => {} }

describe('handler', () => {
  it('игнорирует чужие сообщения', async () => {
    const tg = fakeTelegram(); const eng = fakeEngine([])
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('привет', 999, 999))
    expect(tg.sent).toEqual([]); expect(eng.calls).toEqual([])
  })

  it('передаёт текст движку, шлёт фото и текст, запоминает сессию', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'Шарлотка\nPHOTO: https://a/1.webp\nИсточник: vkusvill.ru', sessionId: 's1', isError: false }])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('хочу шарлотку'))
    expect(eng.calls[0]).toEqual({ text: 'хочу шарлотку', sessionId: null })
    expect(tg.sent).toEqual([
      { type: 'photo', chatId: 42, photo: 'https://a/1.webp' },
      { type: 'text', chatId: 42, text: 'Шарлотка\nИсточник: vkusvill.ru' },
    ])
    expect(sessions.get(42)).toBe('s1')
  })

  it('продолжает сессию и сбрасывает её по «новый заказ»', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'ок', sessionId: 's1', isError: false }, { reply: 'ок2', sessionId: 's2', isError: false }])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('а'))
    await h.handleMessage(msg('Новый заказ'))
    await h.handleMessage(msg('б'))
    expect(eng.calls.map(c => c.sessionId)).toEqual([null, null])
    expect(tg.sent[1].text).toMatch(/чистого листа/)
  })

  it('при AUTH_REQUIRED запускает вход, принимает код и повторяет размещение', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([
      { reply: 'Сессия протухла.\nAUTH_REQUIRED', sessionId: 's1', isError: false },
      { reply: 'Корзина лежит.', sessionId: 's1', isError: false },
    ])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    let resolveLogin; const codes = []
    const loginRunner = { start: () => new Promise(r => { resolveLogin = r }), submitCode: c => codes.push(c) }
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner, ...noTimers })
    const first = h.handleMessage(msg('да, собирай'))
    await new Promise(r => setTimeout(r, 10))
    expect(sessions.isAwaitingCode(42)).toBe(true)
    expect(tg.sent.at(-1).text).toMatch(/пришли код/)
    await h.handleMessage(msg('1234'))
    expect(codes).toEqual(['1234'])
    resolveLogin({ ok: true })
    await first
    expect(sessions.isAwaitingCode(42)).toBe(false)
    expect(eng.calls[1].text).toMatch(/восстановлена/)
    expect(tg.sent.at(-1).text).toBe('Корзина лежит.')
  })

  it('ошибка движка уходит текстом', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'Таймаут ответа модели (3 минуты). Повтори, пожалуйста.', sessionId: null, isError: true }])
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('x'))
    expect(tg.sent[0].text).toMatch(/Таймаут/)
  })
})
```

- [ ] **Step 2: Прогнать, убедиться в падении**

Run: `npx vitest run test/handler.test.js`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализация**

`src/handler.js`:

```js
import { parseReply } from './photos.js'

const CODE_RE = /^\d{4,6}$/
const RESET_RE = /^новый заказ$/i

export function createHandler({ ownerId, telegram, engine, sessions, loginRunner, statusDelayMs = 5000, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) {
  const queues = new Map() // chatId → promise-цепочка, чтобы сообщения одного чата шли по порядку

  async function deliver(chatId, reply) {
    const { text, photos, authRequired } = parseReply(reply)
    for (const url of photos) {
      try { await telegram.sendPhoto(chatId, url) } catch { /* одна битая картинка не должна ронять ответ */ }
    }
    if (text) await telegram.sendMessage(chatId, text)
    return authRequired
  }

  async function ask(chatId, text) {
    const timer = setTimeoutImpl(() => { telegram.sendMessage(chatId, '⏳ Работаю…').catch(() => {}) }, statusDelayMs)
    try {
      const r = await engine.run(text, sessions.get(chatId))
      if (r.sessionId) sessions.set(chatId, r.sessionId)
      if (r.isError) { await telegram.sendMessage(chatId, r.reply); return false }
      return deliver(chatId, r.reply)
    } finally {
      clearTimeoutImpl(timer)
    }
  }

  async function relogin(chatId) {
    sessions.setAwaitingCode(chatId, true)
    await telegram.sendMessage(chatId, 'Сессия ВкусВилла закончилась. Сейчас придёт СМС, пришли код сюда.')
    const res = await loginRunner.start()
    sessions.setAwaitingCode(chatId, false)
    if (!res.ok) { await telegram.sendMessage(chatId, `Войти не удалось: ${res.message}`); return }
    await telegram.sendMessage(chatId, 'Вошла. Повторяю размещение…')
    const again = await ask(chatId, 'Сессия ВкусВилла восстановлена, повтори размещение корзины.')
    if (again) await telegram.sendMessage(chatId, 'Сессия снова не принята. Попробуй позже командой «новый заказ».')
  }

  async function process(msg) {
    const chatId = msg.chat.id
    const text = (msg.text ?? '').trim()
    if (!text) return
    if (RESET_RE.test(text)) {
      sessions.reset(chatId)
      await telegram.sendMessage(chatId, 'Начинаем с чистого листа. Что готовим?')
      return
    }
    if (sessions.isAwaitingCode(chatId) && CODE_RE.test(text)) {
      loginRunner.submitCode(text)
      await telegram.sendMessage(chatId, 'Ввожу код…')
      return
    }
    const authRequired = await ask(chatId, text)
    if (authRequired) await relogin(chatId)
  }

  return {
    handleMessage(msg) {
      if (!msg?.from || msg.from.id !== ownerId) return Promise.resolve()
      const chatId = msg.chat.id
      const text = (msg.text ?? '').trim()
      // Код СМС не должен стоять в очереди за размещением, которое его и ждёт.
      if (sessions.isAwaitingCode(chatId) && CODE_RE.test(text)) return process(msg)
      const prev = queues.get(chatId) ?? Promise.resolve()
      const next = prev.then(() => process(msg)).catch(e => telegram.sendMessage(chatId, `Не получилось: ${e.message}`).catch(() => {}))
      queues.set(chatId, next)
      return next
    },
  }
}
```

- [ ] **Step 4: Прогнать**

Run: `npx vitest run test/handler.test.js`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/handler.js test/handler.test.js
git commit -m "feat: обработчик сообщений: очередь, фото, вход по СМС"
```

---

### Task 9: Точка входа и long polling

**Files:**
- Create: `src/main.js`, `README.md`

**Interfaces:**
- Consumes: всё из Task 2, 4, 5, 7, 8.

- [ ] **Step 1: main.js**

`src/main.js`:

```js
import { loadConfig } from './config.js'
import { createTelegram } from './telegram.js'
import { createSessions } from './sessions.js'
import { createEngine } from './engine/claude-code.js'
import { createLoginRunner } from './login-runner.js'
import { createHandler } from './handler.js'

const cfg = loadConfig()
const telegram = createTelegram({ token: cfg.telegramToken, apiBase: cfg.apiBase })
const sessions = createSessions({ file: cfg.stateFile })
const engine = createEngine({ workspaceDir: cfg.workspaceDir, browserDir: cfg.browserDir, oauthToken: cfg.oauthToken })
const loginRunner = createLoginRunner({ workspaceDir: cfg.workspaceDir, browserDir: cfg.browserDir, phone: cfg.phone })
const handler = createHandler({ ownerId: cfg.ownerId, telegram, engine, sessions, loginRunner })

let offset = 0
console.log('grocery-bot: запущен, long polling')
for (;;) {
  try {
    const updates = await telegram.getUpdates(offset, 30)
    for (const u of updates) {
      offset = u.update_id + 1
      if (u.message) handler.handleMessage(u.message) // не ждём: очередь внутри handler
    }
  } catch (e) {
    console.error('getUpdates:', e.message)
    await new Promise(r => setTimeout(r, 5000))
  }
}
```

- [ ] **Step 2: README**

`README.md`:

```markdown
# Продуктовый бот

Telegram-бот: «собери корзину на карбонару, спагетти есть» → рецепт с источником → корзина во ВкусВилле в аккаунте владелицы → оплата в приложении.

- Мозг: Claude Code headless (`claude -p`, Sonnet, подписка), MCP ВкусВилла, веб-поиск, память в `workspace/memory/`.
- Корзина: `workspace/tools/cart.mjs` открывает ссылку корзины в сессии владелицы (Playwright) и проверяет наличие.
- Вход: `workspace/tools/login.mjs`, код из СМС присылается боту.

Спека: `docs/superpowers/specs/2026-09-13-grocery-bot-design.md`. Развёртывание: `DEPLOY.md`.

Тесты: `npm test`. Локальный запуск: `npm run dev` (нужен `.env`).
```

- [ ] **Step 3: Локальный дымовой прогон**

Создать бота у @BotFather, заполнить `.env` (токен, свой Telegram ID, токен `claude setup-token`, телефон). Запустить `npm run dev`, написать боту «хочу шарлотку, только рецепт». Ожидание: фото и рецепт с источником. Написать «новый заказ»: ответ «Начинаем с чистого листа». Затем «карбонара на двоих, спагетти есть»: список товаров без спагетти и вопрос «Собираю?».

- [ ] **Step 4: Коммит**

```bash
git add src/main.js README.md
git commit -m "feat: точка входа и long polling"
```

---

### Task 10: Развёртывание на 109.94 и приёмка

**Files:**
- Create: `deploy/grocery-bot.service`, `DEPLOY.md`

- [ ] **Step 1: systemd-юнит**

`deploy/grocery-bot.service`:

```ini
[Unit]
Description=Telegram grocery bot (VkusVill)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=grocery
WorkingDirectory=/opt/grocery-bot
EnvironmentFile=/opt/grocery-bot/.env
Environment=HOME=/home/grocery
ExecStart=/usr/bin/node src/main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: DEPLOY.md**

```markdown
# Развёртывание

Сервер: 109.94.211.125 (Астана). Telegram и Anthropic доступны оттуда напрямую.

## Один раз

```bash
sudo useradd -m -s /bin/bash grocery
sudo mkdir -p /opt/grocery-bot && sudo chown grocery:grocery /opt/grocery-bot
sudo npm install -g @anthropic-ai/claude-code
sudo -u grocery bash -c 'cd /opt/grocery-bot && npx playwright install --with-deps chromium'
```

## Выкладка кода

С компьютера (Git Bash), из корня проекта:

```bash
tar --exclude=node_modules --exclude=browser --exclude=.env --exclude=state.json -czf /tmp/grocery.tgz .
scp /tmp/grocery.tgz root@109.94.211.125:/tmp/
ssh root@109.94.211.125 'cd /opt/grocery-bot && tar xzf /tmp/grocery.tgz && chown -R grocery:grocery . && sudo -u grocery npm ci --omit=dev'
```

## Секреты

`/opt/grocery-bot/.env` (права 600, владелец grocery): TELEGRAM_TOKEN, OWNER_ID, CLAUDE_CODE_OAUTH_TOKEN (из `claude setup-token` на компьютере владелицы), VKUSVILL_PHONE.

Проверка модели от имени сервиса:

```bash
sudo -u grocery bash -c 'cd /opt/grocery-bot/workspace && CLAUDE_CODE_OAUTH_TOKEN=$(grep CLAUDE_CODE_OAUTH_TOKEN ../.env | cut -d= -f2) claude -p "ответь одним словом: ок" --model haiku --output-format json --strict-mcp-config --mcp-config mcp.json'
```

## Служба

```bash
sudo cp deploy/grocery-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now grocery-bot
journalctl -u grocery-bot -f
```

## Первый вход во ВкусВилл

Написать боту «собери корзину на карбонару». При первом размещении cart.mjs вернёт auth_required, бот попросит код из СМС. Прислать код. Сессия сохранится в /opt/grocery-bot/browser/profile.

## Обновление

Повторить «Выкладка кода», затем `sudo systemctl restart grocery-bot`.
```

- [ ] **Step 3: Выложить и запустить**

Выполнить команды из DEPLOY.md по порядку. Проверить `journalctl -u grocery-bot -f`: строка «grocery-bot: запущен, long polling».

- [ ] **Step 4: Приёмка с телефона**

Владелица с телефона:
1. «хочу шарлотку»: фото и рецепт с источником.
2. «собери корзину на карбонару, спагетти есть»: список без спагетти, цены, итог, «Собираю?».
3. «сыр подешевле»: список меняется.
4. «да»: сначала запрос кода СМС (первый раз), затем размещение, ответ про наличие.
5. Открыть приложение ВкусВилла: корзина на месте, оплатить.

Результат записать в `docs/superpowers/notes/acceptance.md`: что сработало, что нет, сколько минут от фразы до оплаты.

- [ ] **Step 5: Замер расхода подписки**

Через неделю ежедневных заказов посмотреть `/usage` в Claude Code на компьютере владелицы и записать в `acceptance.md` долю окна, которую съедает один заказ. Если больше трети окна на Pro, снизить: `sort: popularity` уже стоит, добавить в промпт «не больше 5 результатов на ингредиент» и `mode: custom`.

- [ ] **Step 6: Коммит**

```bash
git add deploy/grocery-bot.service DEPLOY.md docs/superpowers/notes/acceptance.md
git commit -m "deploy: systemd-юнит, инструкция, приёмка"
```

---

## Самопроверка плана

**Покрытие спеки.** Рецепты с источником и фото: Task 5 (промпт) + Task 3 + Task 8. Корзина и таблица: Task 5 промпт. Размещение и наличие: Task 6. Вход по СМС: Task 7 + Task 8. Память: Task 5 файлы + промпт. Фильтр владелицы, очередь, статус, ошибки: Task 8. Сессии 12 ч и «новый заказ»: Task 4 + Task 8. Таймаут 3 мин: Task 5. Деплой, приёмка, замер: Task 10. Открытые вопросы браузера: Task 1 спайк. Запасной путь «ссылка владелице» при ошибке cart.mjs: промпт Task 5.

**Согласованность имён.** `parseReply` (Task 3) используется в Task 8. `createSessions` с `get/set/reset/setAwaitingCode/isAwaitingCode` (Task 4) используется в Task 8 и 9. `createEngine.run(text, sessionId) → {reply, sessionId, isError}` (Task 5) в Task 8. `createLoginRunner.start()/submitCode()` (Task 7) в Task 8. `GROCERY_BROWSER_DIR` задаётся в Task 5 и 7, читается в Task 6 и 7. `selectors.json` ключи: Task 1 задаёт, Task 6 и 7 читают; `loginOpen` необязательный, добавляется в Task 7 при необходимости.
