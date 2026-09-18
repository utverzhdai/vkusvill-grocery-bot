// Движок v1: Claude Code в headless-режиме (claude -p) по подписке.
// Интерфейс run(text, sessionId) не зависит от способа вызова модели:
// при переходе на API меняется только этот файл.
import { spawn as nodeSpawn } from 'node:child_process'

const ALLOWED_TOOLS = [
  'mcp__vkusvill__*',
  'WebSearch',
  'WebFetch',
  'Read',
  'Write',
  'Edit',
  'Bash(node tools/cart.mjs *)',
].join(',')

export function buildArgs({ sessionId, model = 'sonnet' }) {
  const args = [
    '-p',
    '--model', model,
    '--output-format', 'json',
    '--append-system-prompt-file', 'prompts/system.md',
    '--mcp-config', 'mcp.json',
    '--strict-mcp-config',
    '--allowedTools', ALLOWED_TOOLS,
  ]
  if (sessionId) args.push('--resume', sessionId)
  return args
}

export function createEngine({ workspaceDir, browserDir, oauthToken, spawnImpl = nodeSpawn, timeoutMs = 180_000, model = 'sonnet' }) {
  return {
    run(text, sessionId) {
      return new Promise(resolve => {
        const args = buildArgs({ sessionId, model })
        let timer = null
        let done = false
        const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }

        try {
          const child = spawnImpl('claude', args, {
            cwd: workspaceDir,
            env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken ?? '', GROCERY_BROWSER_DIR: browserDir ?? '' },
            // На Windows claude — .cmd-шим, без shell spawn его не запустит. На сервере Linux не нужно.
            shell: process.platform === 'win32',
          })
          if (child.stdin) {
            child.stdin.write(text)
            child.stdin.end()
          }
          let out = '', err = ''
          timer = setTimeout(() => {
            child.kill()
            finish({ reply: 'Таймаут ответа модели (3 минуты). Повтори, пожалуйста.', sessionId, isError: true })
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
