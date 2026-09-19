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
      { xmlId: '107311', name: 'Сыр «Пармезан» 100 г', qty: '1', price: '286 ₽', available: true },
      { xmlId: '555', name: 'Бекон 200 г', qty: '2', price: '350 ₽', available: false },
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
    expect(r.items.length).toBe(3)
    expect(r.items[0].name.length).toBeGreaterThan(0)
    expect(r.items.every(i => i.available)).toBe(true)
    expect(r.total).toBe('881')
  })

  it('количество и цена первой позиции реального снимка заполнены', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    await page.setContent(readFileSync('test/fixtures/cart-real.html', 'utf8'))
    const r = await parseCart(page, selectors)
    expect(r.items[0].qty.length).toBeGreaterThan(0)
    expect(r.items[0].price.length).toBeGreaterThan(0)
    expect(r.items[0].price).toMatch(/^\d+$/)
  })

  it('открытый блок «нет в наличии» помечает позицию недоступной', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    const html = readFileSync('test/fixtures/cart-real.html', 'utf8')
      .replace(/js-delivery__basket--row__wo_maxq\s+hidden/, 'js-delivery__basket--row__wo_maxq')
    await page.setContent(html)
    const r = await parseCart(page, selectors)
    expect(r.items.filter(i => !i.available).length).toBe(1)
  })

  it('окно share_basket под входом: есть признак входа и кнопка «В корзину»', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    await page.setContent(readFileSync('test/fixtures/share-modal-real.html', 'utf8'))
    expect(await page.$(selectors.loggedIn)).not.toBeNull()
    expect(await page.$(selectors.shareAccept)).not.toBeNull()
  })

  it('окно share_basket без входа: нет ни признака входа, ни кнопки', async () => {
    const selectors = JSON.parse(readFileSync('workspace/tools/selectors.json', 'utf8'))
    await page.setContent(readFileSync('test/fixtures/share-modal-loggedout-real.html', 'utf8'))
    expect(await page.$(selectors.loggedIn)).toBeNull()
    expect(await page.$(selectors.shareAccept)).toBeNull()
  })
})
