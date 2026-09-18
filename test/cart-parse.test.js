import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { parseCart } from '../workspace/tools/cart-parse.mjs'

const synthetic = {
  loggedIn: '.profile-name', cartItem: '.item', itemName: '.name', itemQty: '.qty',
  itemPrice: '.price', itemUnavailable: '.unavailable', cartTotal: '.total',
}

let browser, page
beforeAll(async () => { browser = await chromium.launch(); page = await browser.newPage() })
afterAll(async () => { await browser.close() })

describe('parseCart', () => {
  it('читает позиции, наличие и итог из синтетической страницы', async () => {
    await page.setContent(readFileSync('test/fixtures/cart-synthetic.html', 'utf8'))
    const r = await parseCart(page, synthetic)
    expect(r.loggedIn).toBe(true)
    expect(r.items).toEqual([
      { name: 'Сыр «Пармезан» 100 г', qty: '1', price: '286 ₽', available: true },
      { name: 'Бекон 200 г', qty: '2', price: '350 ₽', available: false },
    ])
    expect(r.total).toBe('986 ₽')
  })
  it('loggedIn=false без признака входа', async () => {
    await page.setContent('<html><body><ul></ul></body></html>')
    const r = await parseCart(page, synthetic)
    expect(r.loggedIn).toBe(false)
    expect(r.items).toEqual([])
    expect(r.total).toBeNull()
  })
  it('реальный снимок разбирается реальными селекторами', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    await page.setContent(readFileSync('test/fixtures/cart-real.html', 'utf8'))
    const r = await parseCart(page, selectors)
    expect(r.loggedIn).toBe(true)
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items[0].name.length).toBeGreaterThan(0)
  })
})
