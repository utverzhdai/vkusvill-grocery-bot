import { describe, it, expect, vi } from 'vitest'
import { createHandler } from '../src/handler.js'
import { createSessions } from '../src/sessions.js'

const memFs = () => { let c; return { existsSync: () => c !== undefined, readFileSync: () => c, writeFileSync: (_p, d) => { c = d } } }
function fakeTelegram() {
  const sent = []; const edits = []; const deleted = []
  let nextId = 1
  return {
    sent, edits, deleted,
    // visible() — что осталось в чате после удаления служебных сообщений «Работаю»
    visible: () => sent.filter(m => !deleted.includes(m.message_id)).map(({ message_id, ...m }) => m),
    sendMessage: async (chatId, text) => { const m = { type: 'text', chatId, text, message_id: nextId++ }; sent.push(m); return { message_id: m.message_id } },
    sendPhoto: async (chatId, photo) => { sent.push({ type: 'photo', chatId, photo, message_id: nextId++ }) },
    sendChatAction: async () => {},
    editMessageText: async (chatId, messageId, text) => { edits.push({ messageId, text }) },
    deleteMessage: async (chatId, messageId) => { deleted.push(messageId) },
  }
}
function fakeEngine(replies) {
  const calls = []
  return { calls, run: async (text, sessionId) => { calls.push({ text, sessionId }); return replies.shift() } }
}
const msg = (text, from = 42, chat = 42) => ({ text, from: { id: from }, chat: { id: chat } })
const noTimers = { setIntervalImpl: () => 0, clearIntervalImpl: () => {} }

describe('handler', () => {
  it('игнорирует чужие сообщения', async () => {
    const tg = fakeTelegram(); const eng = fakeEngine([])
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('привет', 999, 999))
    expect(tg.visible()).toEqual([]); expect(eng.calls).toEqual([])
  })

  it('игнорирует сообщение владелицы из чужого чата', async () => {
    const tg = fakeTelegram(); const eng = fakeEngine([])
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('привет', 42, 777))
    expect(tg.visible()).toEqual([]); expect(eng.calls).toEqual([])
  })

  it('передаёт текст движку, шлёт фото и текст, запоминает сессию', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'Шарлотка\nPHOTO: https://a/1.webp\nИсточник: vkusvill.ru', sessionId: 's1', isError: false }])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('хочу шарлотку'))
    expect(eng.calls[0]).toEqual({ text: 'хочу шарлотку', sessionId: null })
    expect(tg.visible()).toEqual([
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
    expect(tg.visible()[1].text).toMatch(/чистого листа/)
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
    expect(tg.visible().at(-1).text).toMatch(/пришли код/)
    await h.handleMessage(msg('1234'))
    expect(codes).toEqual(['1234'])
    resolveLogin({ ok: true })
    await first
    expect(sessions.isAwaitingCode(42)).toBe(false)
    expect(eng.calls[1].text).toMatch(/восстановлена/)
    expect(tg.visible().at(-1).text).toBe('Корзина лежит.')
  })

  it('ошибка движка уходит текстом и в журнал', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'Таймаут ответа модели (8 минут). Корзина могла собраться частично — проверь приложение или повтори запрос.', sessionId: null, isError: true }])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('x'))
    expect(tg.visible()[0].text).toMatch(/Таймаут/)
    expect(errorSpy).toHaveBeenCalledWith('engine:', expect.stringMatching(/Таймаут/))
    errorSpy.mockRestore()
  })

  it('пишет «причина неизвестна», если вход не объяснил отказ', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([{ reply: 'Сессия протухла.\nAUTH_REQUIRED', sessionId: 's1', isError: false }])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    const loginRunner = { start: async () => ({ ok: false }), submitCode: () => {} }
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner, ...noTimers })
    await h.handleMessage(msg('да, собирай'))
    expect(tg.visible().at(-1).text).toBe('Войти не удалось: причина неизвестна')
  })

  it('«новый заказ» сбрасывает ожидание кода, чтобы старый флаг не съел следующее сообщение', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    sessions.setAwaitingCode(42, true)
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner: {}, ...noTimers })
    await h.handleMessage(msg('новый заказ'))
    expect(sessions.isAwaitingCode(42)).toBe(false)
  })

  it('ошибка в обходе очереди для кода не роняет handleMessage необработанным отказом', async () => {
    const tg = fakeTelegram()
    const eng = fakeEngine([])
    const sessions = createSessions({ file: 'x', fs: memFs() })
    sessions.setAwaitingCode(42, true)
    const loginRunner = { start: async () => ({ ok: true }), submitCode: () => { throw new Error('boom') } }
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions, loginRunner, ...noTimers })
    await expect(h.handleMessage(msg('1234'))).resolves.toBeUndefined()
    expect(tg.visible().at(-1).text).toMatch(/^Не получилось/)
  })

  it('показывает «Работаю» с бегущими точками и удаляет его после ответа', async () => {
    const tg = fakeTelegram()
    let tick
    const timers = { setIntervalImpl: fn => { tick = fn; return 7 }, clearIntervalImpl: vi.fn() }
    const eng = { run: async () => { tick(); tick(); return { reply: 'Корзина собрана, можно оплачивать', sessionId: 's1', isError: false } } }
    const h = createHandler({ ownerId: 42, telegram: tg, engine: eng, sessions: createSessions({ file: 'x', fs: memFs() }), loginRunner: {}, ...timers })
    await h.handleMessage(msg('нужны молоко и хлеб'))
    expect(tg.sent[0].text).toBe('Работаю.')
    expect(tg.edits.map(e => e.text)).toEqual(['Работаю..', 'Работаю...'])
    expect(tg.deleted).toEqual([tg.sent[0].message_id])
    expect(timers.clearIntervalImpl).toHaveBeenCalledWith(7)
    expect(tg.visible()).toEqual([{ type: 'text', chatId: 42, text: 'Корзина собрана, можно оплачивать' }])
  })
})
