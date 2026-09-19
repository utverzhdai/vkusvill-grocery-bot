import { describe, it, expect } from 'vitest'
import { createTelegram } from '../src/telegram.js'

function fakeFetch(result = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), init })
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
  it('не шлёт пустой текст', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await tg.sendMessage(7, '')
    expect(calls.length).toBe(0)
  })
  it('ставит запросу таймаут через AbortSignal', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await tg.sendMessage(7, 'привет')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
    await tg.getUpdates(0, 30)
    expect(calls[1].init.signal).toBeInstanceOf(AbortSignal)
  })
  it('бросает ошибку при ok:false', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: false, description: 'плохо' }) })
    const tg = createTelegram({ token: 'T', apiBase: 'https://api', fetchImpl })
    await expect(tg.sendMessage(7, 'x')).rejects.toThrow('плохо')
  })
})
