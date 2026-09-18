import { resolve } from 'node:path'

function required(env, name) {
  const v = env[name]
  if (!v) throw new Error(`Не задана переменная ${name}`)
  return v
}

export function loadConfig(env = process.env, root = resolve(import.meta.dirname, '..')) {
  const ownerId = Number(required(env, 'OWNER_ID'))
  if (!Number.isInteger(ownerId)) throw new Error('OWNER_ID должен быть числом')
  return {
    telegramToken: required(env, 'TELEGRAM_TOKEN'),
    ownerId,
    oauthToken: required(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    phone: required(env, 'VKUSVILL_PHONE'),
    apiBase: env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',
    workspaceDir: resolve(root, 'workspace'),
    browserDir: resolve(root, 'browser'),
    stateFile: resolve(root, 'state.json'),
  }
}
