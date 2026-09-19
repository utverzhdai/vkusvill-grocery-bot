import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { buildArgs, createEngine, quoteForShell } from '../src/engine/claude-code.js'

function fakeSpawn(stdoutText, code = 0, throwOnSpawn = false) {
  const calls = []
  const spawnImpl = (cmd, args, opts) => {
    if (throwOnSpawn) throw new Error('Fake spawn error')
    const callInfo = { cmd, args, opts, stdinWritten: '' }
    const stdin = new EventEmitter()
    stdin.write = d => { callInfo.stdinWritten += d; return true }
    stdin.end = () => {}
    callInfo.stdin = stdin
    calls.push(callInfo)
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.stdin = stdin
    child.kill = () => child.emit('close', 137)
    setTimeout(() => { child.stdout.emit('data', Buffer.from(stdoutText)); child.emit('close', code) }, 5)
    return child
  }
  return { spawnImpl, calls }
}

describe('buildArgs', () => {
  it('собирает флаги без текста и resume для новой сессии', () => {
    const a = buildArgs({ sessionId: null })
    expect(a[0]).toBe('-p')
    expect(a).toContain('--model'); expect(a).toContain('sonnet')
    expect(a).toContain('--output-format'); expect(a).toContain('json')
    expect(a).toContain('--strict-mcp-config')
    expect(a).not.toContain('--resume')
    expect(a).not.toContain('шарлотка')
    const tools = a[a.indexOf('--allowedTools') + 1]
    expect(tools).toContain('mcp__vkusvill__*')
    expect(tools).toContain('Bash(node tools/cart.mjs *)')
    expect(tools).toContain('Write(memory/**)')
  })
  it('добавляет --resume при известной сессии', () => {
    const a = buildArgs({ sessionId: 'sid-1' })
    expect(a[a.indexOf('--resume') + 1]).toBe('sid-1')
  })
})

describe('quoteForShell', () => {
  it('на win32 закавычивает аргументы со скобками и пробелами', () => {
    const a = quoteForShell(['-p', '--allowedTools', 'Bash(node tools/cart.mjs *)'], 'win32')
    expect(a[0]).toBe('-p')
    expect(a[1]).toBe('--allowedTools')
    expect(a[2]).toBe('"Bash(node tools/cart.mjs *)"')
  })
  it('на linux возвращает аргументы без изменений', () => {
    const args = ['-p', '--allowedTools', 'Bash(node tools/cart.mjs *)']
    expect(quoteForShell(args, 'linux')).toEqual(args)
  })
  it('экранирует внутренние кавычки', () => {
    expect(quoteForShell(['a "b" c'], 'win32')).toEqual(['"a \\"b\\" c"'])
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
    expect(calls[0].stdinWritten).toBe('шарлотка')
  })
  it('не пробрасывает в дочерний процесс посторонние переменные окружения', async () => {
    process.env.TELEGRAM_TOKEN = 'secret'
    try {
      const { spawnImpl, calls } = fakeSpawn(okJson)
      const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl })
      await e.run('x', null)
      expect(calls[0].opts.env.TELEGRAM_TOKEN).toBeUndefined()
    } finally {
      delete process.env.TELEGRAM_TOKEN
    }
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
      const stdin = new EventEmitter()
      stdin.write = () => true
      stdin.end = () => {}
      child.stdin = stdin
      child.kill = () => setTimeout(() => child.emit('close', 137), 1)
      return child
    }
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl, timeoutMs: 20 })
    const r = await e.run('x', null)
    expect(r.isError).toBe(true)
    expect(r.reply).toMatch(/таймаут/i)
  })
  it('isError при синхронной ошибке spawn', async () => {
    const { spawnImpl } = fakeSpawn('', 0, true)
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl })
    const r = await e.run('x', null)
    expect(r.isError).toBe(true)
    expect(r.reply).toMatch(/Не удалось запустить claude/)
  })
  it('обрабатывает EPIPE ошибку stdin без краша', async () => {
    const spawnImpl = () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      const stdin = new EventEmitter()
      stdin.write = () => true
      stdin.end = () => {}
      child.stdin = stdin
      child.kill = () => {}
      setTimeout(() => { stdin.emit('error', new Error('EPIPE')) }, 1)
      setTimeout(() => { child.emit('close', 1) }, 2)
      return child
    }
    const e = createEngine({ workspaceDir: '/ws', browserDir: '/br', oauthToken: 'tok', spawnImpl })
    const r = await e.run('x', null)
    expect(r.isError).toBe(true)
  })
})
