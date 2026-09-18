import * as nodeFs from 'node:fs'

const DAY_HALF = 12 * 60 * 60 * 1000

export function createSessions({ file, ttlMs = DAY_HALF, now = Date.now, fs = nodeFs }) {
  let state = { chats: {} }
  if (fs.existsSync(file)) {
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { state = { chats: {} } }
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state, null, 2))
    } catch (e) {
      console.error('sessions: не удалось сохранить состояние:', e.message)
    }
  }
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
