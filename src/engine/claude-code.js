// Движок v1: Claude Code в headless-режиме (claude -p) по подписке.
// Интерфейс run(text, sessionId) не зависит от способа вызова модели:
// при переходе на API меняется только этот файл.
import { spawn as nodeSpawn } from 'node:child_process'

const ALLOWED_TOOLS = [
  'mcp__vkusvill__*',
  'WebSearch',
  'WebFetch',
  'Read',
  // Писать модель может только в память — остальной воркспейс для неё только на чтение.
  'Write(memory/**)',
  'Edit(memory/**)',
  'Bash(node tools/cart.mjs *)',
  'Bash(node tools/vv.mjs *)',
]

// Модель иногда пишет абсолютный путь к скрипту; без второго правила такая
// команда упирается в «requires approval», и размещение срывается.
function allowedTools(workspaceDir) {
  const list = [...ALLOWED_TOOLS]
  if (workspaceDir) list.push(`Bash(node ${workspaceDir.replace(/\\/g, '/')}/tools/cart.mjs *)`)
  return list.join(',')
}

// При shell: true Node не экранирует аргументы сам: строка вроде
// Bash(node tools/cart.mjs *) в cmd.exe рассыпается на куски.
const NEEDS_QUOTES = /[ ()*,"]/

export function quoteForShell(args, platform = process.platform) {
  if (platform !== 'win32') return args
  return args.map(a => (NEEDS_QUOTES.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
}

// Дочернему процессу отдаём только то, что нужно самому claude: токен бота
// и прочие секреты бота в его окружении делать нечего.
function childEnv({ oauthToken, browserDir }) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    USERPROFILE: process.env.USERPROFILE ?? '',
    APPDATA: process.env.APPDATA ?? '',
    LOCALAPPDATA: process.env.LOCALAPPDATA ?? '',
    SYSTEMROOT: process.env.SYSTEMROOT ?? '',
    TEMP: process.env.TEMP ?? '',
    TMP: process.env.TMP ?? '',
    LANG: process.env.LANG ?? 'ru_RU.UTF-8',
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken ?? '',
    GROCERY_BROWSER_DIR: browserDir ?? '',
  }
}

export function buildArgs({ sessionId, model = 'sonnet', workspaceDir = null }) {
  const args = [
    '-p',
    '--model', model,
    '--output-format', 'json',
    '--append-system-prompt-file', 'prompts/system.md',
    '--mcp-config', 'mcp.json',
    '--strict-mcp-config',
    '--allowedTools', allowedTools(workspaceDir),
  ]
  if (sessionId) args.push('--resume', sessionId)
  return args
}

export function createEngine({ workspaceDir, browserDir, oauthToken, spawnImpl = nodeSpawn, timeoutMs = 480_000, model = 'sonnet' }) {
  return {
    run(text, sessionId) {
      return new Promise(resolve => {
        const args = buildArgs({ sessionId, model, workspaceDir })
        let timer = null
        let done = false
        const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }

        try {
          // На Windows claude — .cmd-шим, без shell spawn его не запустит. На сервере Linux не нужно.
          const useShell = process.platform === 'win32'
          const child = spawnImpl('claude', useShell ? quoteForShell(args) : args, {
            cwd: workspaceDir,
            env: childEnv({ oauthToken, browserDir }),
            shell: useShell,
            // Своя группа процессов, чтобы по таймауту убить claude вместе с его детьми.
            detached: process.platform !== 'win32',
          })
          if (child.stdin) {
            child.stdin.on('error', () => {})
            child.stdin.write(text)
            child.stdin.end()
          }
          let out = '', err = ''
          timer = setTimeout(() => {
            if (process.platform === 'win32') child.kill()
            else {
              try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill() }
            }
            finish({ reply: 'Таймаут ответа модели (8 минут). Корзина могла собраться частично — проверь приложение или повтори запрос.', sessionId, isError: true })
          }, timeoutMs)
          child.stdout.on('data', d => { out += d })
          child.stderr.on('data', d => { err += d })
          child.on('error', e => finish({ reply: `Не удалось запустить claude: ${e.message}`, sessionId, isError: true }))
          child.on('close', code => {
            try {
              const data = JSON.parse(out)
              finish({ reply: String(data.result ?? ''), sessionId: data.session_id ?? sessionId, isError: Boolean(data.is_error) || code !== 0 })
            } catch {
              finish({ reply: `Модель не ответила (код ${code}). ${err.slice(0, 300)}`.trim(), sessionId, isError: true })
            }
          })
        } catch (e) {
          finish({ reply: `Не удалось запустить claude: ${e.message}`, sessionId, isError: true })
        }
      })
    },
  }
}
