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
