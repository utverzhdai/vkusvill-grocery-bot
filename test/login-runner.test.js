import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createLoginRunner } from '../src/login-runner.js'

function fakeSpawn(stdoutText, code) {
  const calls = []
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    setTimeout(() => { child.stdout.emit('data', Buffer.from(stdoutText)); child.emit('close', code) }, 5)
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
  it('submitCode пишет код в sms-code.txt в папке браузера', () => {
    const fs = memFs()
    const r = createLoginRunner({ workspaceDir: '/ws', browserDir: '/br', phone: '+7999', spawnImpl: () => new EventEmitter(), fs })
    r.submitCode('1234')
    expect(fs.files['/br/sms-code.txt']).toBe('1234')
  })
})
