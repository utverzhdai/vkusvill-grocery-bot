import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

describe('sanitized HTML fixtures', () => {
  for (const dir of ['test/fixtures', 'spike/auto']) {
    for (const name of readdirSync(dir).filter(name => name.endsWith('.html'))) {
      it(`${dir}/${name} contains no account or payment markup`, () => {
        const html = readFileSync(join(dir, name), 'utf8')
        expect(html).not.toMatch(/USER_ID|ADDRESS_HASH|sessid|data-card-type|data-pay-way|data-email|sberpay|sbp|••••/i)
        expect(html).not.toMatch(/<(?:script|input|iframe)\b/i)
        expect(html).not.toMatch(/\b(?:src|action|on\w+)\s*=/i)
      })
    }
  }
})
