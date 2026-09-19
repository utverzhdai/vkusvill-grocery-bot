import { describe, it, expect, vi } from 'vitest'
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
  })
  it('сбрасывает ожидание кода при загрузке: флаг живёт только внутри процесса', () => {
    const fs = memFs(JSON.stringify({
      chats: { 1: { sessionId: 'abc', lastUsed: 0, awaitingCode: true } }
    }))
    const s = createSessions({ file: 'x.json', fs })
    expect(s.isAwaitingCode(1)).toBe(false)
  })
  it('восстанавливает пустое состояние при повреждённом JSON', () => {
    const fs = memFs('не json')
    const s = createSessions({ file: 'x.json', fs })
    expect(s.get(1)).toBeNull()
    s.set(1, 'abc')
    expect(s.get(1)).toBe('abc')
  })
  it('забывает восстановленную сессию если она старше TTL', () => {
    let t = 1_000_000
    const fs = memFs(JSON.stringify({
      chats: { 1: { sessionId: 'abc', lastUsed: 0, awaitingCode: false } }
    }))
    const s = createSessions({ file: 'x.json', fs, now: () => t })
    t += 12 * 60 * 60 * 1000 + 1
    expect(s.get(1)).toBeNull()
  })
  it('не падает при ошибке сохранения состояния', () => {
    const fs = {
      existsSync: () => false,
      writeFileSync: () => { throw new Error('I/O error') }
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = createSessions({ file: 'x.json', fs })
    expect(() => s.set(1, 'abc')).not.toThrow()
    expect(() => s.reset(1)).not.toThrow()
    expect(() => s.setAwaitingCode(1, true)).not.toThrow()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('сбрасывает все диалоги при смене версии правил и сохраняет новую версию', () => {
    const fs = memFs(JSON.stringify({ version: 'v1', chats: { 1: { sessionId: 'abc', lastUsed: Date.now(), awaitingCode: false } } }))
    const same = createSessions({ file: 'x.json', fs, version: 'v1' })
    expect(same.get(1)).toBe('abc')
    const changed = createSessions({ file: 'x.json', fs, version: 'v2' })
    expect(changed.get(1)).toBeNull()
    changed.set(1, 'new')
    expect(JSON.parse(fs.dump()).version).toBe('v2')
  })
})
