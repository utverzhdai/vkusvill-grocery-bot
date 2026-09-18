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
