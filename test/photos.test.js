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
