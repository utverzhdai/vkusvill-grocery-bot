// Запускает вход во ВкусВилл (tools/login.mjs) и передаёт ему код из СМС через файл.
import { spawn as nodeSpawn } from 'node:child_process'
import * as nodeFs from 'node:fs'
import { join } from 'node:path/posix'

export function createLoginRunner({ workspaceDir, browserDir, phone, spawnImpl = nodeSpawn, fs = nodeFs }) {
  const codeFile = join(browserDir, 'sms-code.txt')
  return {
    start() {
      return new Promise(resolve => {
        const child = spawnImpl('node', ['tools/login.mjs', phone], {
          cwd: workspaceDir,
          env: { ...process.env, GROCERY_BROWSER_DIR: browserDir },
        })
        let out = ''
        child.stdout.on('data', d => { out += d })
        child.on('error', e => resolve({ ok: false, message: e.message }))
        child.on('close', code => {
          let data = {}
          try { data = JSON.parse(out.trim().split('\n').pop()) } catch {}
          if (code === 0 && data.status === 'ok') resolve({ ok: true })
          else resolve({ ok: false, message: data.message ?? `login.mjs завершился с кодом ${code}` })
        })
      })
    },
    submitCode(code) { fs.writeFileSync(codeFile, String(code).trim()) },
  }
}
