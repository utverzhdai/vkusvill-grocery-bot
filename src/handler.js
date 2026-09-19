import { parseReply } from './photos.js'

const CODE_RE = /^\d{4,6}$/
const RESET_RE = /^новый заказ$/i
const WORKING_FRAMES = ['Работаю.', 'Работаю..', 'Работаю...']

export function createHandler({ ownerId, telegram, engine, sessions, loginRunner, dotsMs = 1500, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval }) {
  const queues = new Map() // chatId → promise-цепочка, чтобы сообщения одного чата шли по порядку

  async function deliver(chatId, reply) {
    const { text, photos, authRequired } = parseReply(reply)
    for (const url of photos) {
      try { await telegram.sendPhoto(chatId, url) } catch { /* одна битая картинка не должна ронять ответ */ }
    }
    if (text) await telegram.sendMessage(chatId, text)
    return authRequired
  }

  // Пока модель думает, в чате висит «Работаю» с бегущими точками; после ответа сообщение удаляется.
  async function startWorking(chatId) {
    telegram.sendChatAction(chatId).catch(() => {})
    const status = await telegram.sendMessage(chatId, WORKING_FRAMES[0]).catch(() => null)
    if (!status?.message_id) return () => {}
    let frame = 0
    const timer = setIntervalImpl(() => {
      frame = (frame + 1) % WORKING_FRAMES.length
      telegram.editMessageText(chatId, status.message_id, WORKING_FRAMES[frame]).catch(() => {})
    }, dotsMs)
    let stopped = false
    return async () => {
      if (stopped) return
      stopped = true
      clearIntervalImpl(timer)
      await telegram.deleteMessage(chatId, status.message_id).catch(() => {})
    }
  }

  async function ask(chatId, text) {
    const stopWorking = await startWorking(chatId)
    try {
      const r = await engine.run(text, sessions.get(chatId))
      if (r.sessionId) sessions.set(chatId, r.sessionId)
      await stopWorking()
      if (r.isError) {
        console.error('engine:', r.reply.slice(0, 200))
        await telegram.sendMessage(chatId, r.reply)
        return false
      }
      return deliver(chatId, r.reply)
    } finally {
      await stopWorking()
    }
  }

  async function relogin(chatId) {
    sessions.setAwaitingCode(chatId, true)
    await telegram.sendMessage(chatId, 'Сессия ВкусВилла закончилась. Сейчас придёт СМС, пришли код сюда.')
    const res = await loginRunner.start()
    sessions.setAwaitingCode(chatId, false)
    if (!res.ok) { await telegram.sendMessage(chatId, `Войти не удалось: ${res.message ?? 'причина неизвестна'}`); return }
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
      sessions.setAwaitingCode(chatId, false)
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
      // Бот отвечает только владелице и только в её личном чате: в группе
      // её сообщение пришло бы с чужим chat.id.
      if (!msg?.from || msg.from.id !== ownerId || msg.chat?.id !== ownerId) return Promise.resolve()
      const chatId = msg.chat.id
      const text = (msg.text ?? '').trim()
      const guard = p => p.catch(async e => { await telegram.sendMessage(chatId, `Не получилось: ${e.message}`).catch(() => {}) })
      // Код СМС не должен стоять в очереди за размещением, которое его и ждёт.
      if (sessions.isAwaitingCode(chatId) && CODE_RE.test(text)) return guard(process(msg))
      const prev = queues.get(chatId) ?? Promise.resolve()
      const next = guard(prev.then(() => process(msg)))
      queues.set(chatId, next)
      return next
    },
  }
}
