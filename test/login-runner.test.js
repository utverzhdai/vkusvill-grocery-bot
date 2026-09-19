import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createLoginRunner } from '../src/login-runner.js'

function fakeSpawn(stdoutText, code, stderrText = '') {
  const calls = []
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.kill = () => {}
    setTimeout(() => {
      child.stdout.emit('data', Buffer.from(stdoutText))
      if (stderrText) child.stderr.emit('data', Buffer.from(stderrText))
      child.emit('close', code)
    }, 5)
    return child
  }
  return { spawnImpl, calls }
}
const memFs = () => { const files = {}; return { writeFileSync: (p, d) => { files[p] = d }, files } }

describe('login-runner', () => {
  it('запускает login.mjs с номером и резолвится ok', async () => {
    const { spawnImpl, calls } = fakeSpawn('{"status":"ok"}', 0)
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs() })
    const res = await r.start()
    expect(res.ok).toBe(true)
    expect(calls[0].args).toEqual(['tools/login.mjs', '+7999'])
    expect(calls[0].opts.cwd).toBe('/ws')
    expect(calls[0].opts.env.GROCERY_BROWSER_DIR).toBe('/br')
  })
  it('возвращает ошибку при ненулевом коде', async () => {
    const { spawnImpl } = fakeSpawn('{"status":"error","message":"капча"}', 1)
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs() })
    const res = await r.start()
    expect(res).toEqual({ ok: false, message: 'капча' })
  })
  it('кладёт stderr в сообщение, когда login.mjs молчит в stdout', async () => {
    const { spawnImpl } = fakeSpawn('', 1, 'Error: browserType.launch: нет chromium')
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs() })
    const res = await r.start()
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/нет chromium/)
    expect(res.message).toMatch(/кодом 1/)
  })
  it('резолвится ok:false по сторожевому таймеру', async () => {
    let killed = false
    const spawnImpl = () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      child.kill = () => { killed = true }
      return child // навсегда молчит
    }
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl, fs: memFs(), timeoutMs: 20 })
    const res = await r.start()
    expect(res).toEqual({ ok: false, message: 'вход не ответил за 6 минут' })
    expect(killed).toBe(true)
  })
  it('submitCode пишет код в sms-code.txt в папке браузера', () => {
    const fs = memFs()
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl: () => new EventEmitter(), fs })
    r.submitCode('1234')
    expect(fs.files['/br/sms-code.txt']).toBe('1234')
  })
})
