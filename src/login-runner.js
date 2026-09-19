// Запускает вход во ВкусВилл (tools/login.mjs) и передаёт ему код из СМС через файл.
import { spawn as nodeSpawn } from 'node:child_process'
import * as nodeFs from 'node:fs'
import { join } from 'node:path/posix'

export function createLoginRunner({ workspaceDir, browserDir, phone, spawnImpl = nodeSpawn, fs = nodeFs, timeoutMs = 360_000 }) {
  const codeFile = join(browserDir, 'sms-code.txt')
  return {
    start() {
      return new Promise(resolve => {
        const child = spawnImpl('node', ['tools/login.mjs', phone], {
          cwd: workspaceDir,
          env: { ...process.env, GROCERY_BROWSER_DIR: browserDir },
        })
        let out = '', err = '', done = false, timer = null
        const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }
        // Сторожевой таймер: login.mjs ждёт код 3 минуты, но может зависнуть
        // на капче или мёртвом браузере — тогда чат остался бы без ответа.
        timer = setTimeout(() => {
          try { child.kill() } catch {}
          finish({ ok: false, message: 'вход не ответил за 6 минут' })
        }, timeoutMs)
        child.stdout.on('data', d => { out += d })
        child.stderr.on('data', d => { err += d })
        child.on('error', e => finish({ ok: false, message: e.message }))
        child.on('close', code => {
          let data = {}
          try { data = JSON.parse(out.trim().split('\n').pop()) } catch {}
          if (code === 0 && data.status === 'ok') finish({ ok: true })
          else finish({ ok: false, message: data.message ?? `login.mjs завершился с кодом ${code}: ${err.trim().slice(-300)}` })
        })
      })
    },
    submitCode(code) { fs.writeFileSync(codeFile, String(code).trim()) },
  }
}
