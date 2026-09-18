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
