// Читает страницу корзины ВкусВилла по селекторам из selectors.json.
// Селекторы вынесены в файл, потому что вёрстка сайта меняется чаще кода.
export async function parseCart(page, s) {
  const loggedIn = s.loggedIn ? (await page.$(s.loggedIn)) !== null : false
  const items = await page.$$eval(s.cartItem, (nodes, s) => nodes.map(n => {
    const text = sel => (sel && n.querySelector(sel)?.textContent.trim()) || ''
    const unavailable = s.itemUnavailable
      ? n.matches(s.itemUnavailable) || n.querySelector(s.itemUnavailable) !== null
      : false
    return { xmlId: n.getAttribute('data-xmlid') || null, name: text(s.itemName), qty: text(s.itemQty), price: text(s.itemPrice), available: !unavailable }
  }), s)
  const totalEl = s.cartTotal ? await page.$(s.cartTotal) : null
  const total = totalEl ? (await totalEl.textContent()).trim() : null
  return { loggedIn, items, total }
}
