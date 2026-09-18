import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

const base = { TELEGRAM_TOKEN: 't', OWNER_ID: '42', CLAUDE_CODE_OAUTH_TOKEN: 'o', VKUSVILL_PHONE: '+79990000000' }

describe('loadConfig', () => {
  it('читает обязательные переменные и приводит OWNER_ID к числу', () => {
    const c = loadConfig(base)
    expect(c.ownerId).toBe(42)
    expect(c.telegramToken).toBe('t')
    expect(c.apiBase).toBe('https://api.telegram.org')
    expect(c.workspaceDir.endsWith('workspace')).toBe(true)
  })
  it('падает без TELEGRAM_TOKEN', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_TOKEN: '' })).toThrow(/TELEGRAM_TOKEN/)
  })
  it('падает, если OWNER_ID не число', () => {
    expect(() => loadConfig({ ...base, OWNER_ID: 'abc' })).toThrow(/OWNER_ID/)
  })
})
