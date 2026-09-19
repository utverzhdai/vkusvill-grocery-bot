import { loadConfig } from './config.js'
import { createTelegram } from './telegram.js'
import { createSessions } from './sessions.js'
import { createEngine } from './engine/claude-code.js'
import { createLoginRunner } from './login-runner.js'
import { createHandler } from './handler.js'

const cfg = loadConfig()
const telegram = createTelegram({ token: cfg.telegramToken, apiBase: cfg.apiBase })
const sessions = createSessions({ file: cfg.stateFile })
const engine = createEngine({ workspaceDir: cfg.workspaceDir, browserDir: cfg.browserDir, oauthToken: cfg.oauthToken })
const loginRunner = createLoginRunner({ workspaceDir: cfg.workspaceDir, browserDir: cfg.browserDir, phone: cfg.phone })
const handler = createHandler({ ownerId: cfg.ownerId, telegram, engine, sessions, loginRunner })

// Одна потерянная ошибка не должна ронять процесс: systemd перезапустит, но
// в журнале нужно видеть, что именно случилось.
process.on('unhandledRejection', e => console.error('unhandledRejection:', e))
process.on('uncaughtException', e => console.error('uncaughtException:', e))

let offset = 0
console.log('grocery-bot: запущен, long polling')
for (;;) {
  try {
    const updates = await telegram.getUpdates(offset, 30)
    for (const u of updates) {
      offset = u.update_id + 1
      if (u.message) handler.handleMessage(u.message) // не ждём: очередь внутри handler
    }
  } catch (e) {
    console.error('getUpdates:', e.message)
    await new Promise(r => setTimeout(r, 5000))
  }
}
