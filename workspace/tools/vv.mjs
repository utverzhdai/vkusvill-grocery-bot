// Компактный доступ к MCP ВкусВилла для модели: короткие ответы вместо
// огромных JSON, все ингредиенты одним вызовом, без лишних ходов.
//   node tools/vv.mjs recipes "селёдка под шубой"          — до 3 рецептов: название, ссылка, ингредиенты с количествами
//   node tools/vv.mjs search "сельдь филе" "свёкла" "майонез" — по каждому запросу до 6 товаров: id, название, цена, вес
//   node tools/vv.mjs link 21849:2 16073:1                  — ссылка на корзину из пар xml_id:количество
import { compactRecipes, compactSearch } from './vv-format.mjs'

const MCP = 'https://mcp.vkusvill.ru/mcp'
const out = obj => console.log(JSON.stringify(obj))

async function call(name, args) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'curl/8.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'ошибка MCP')
  const text = data.result?.content?.[0]?.text
  return JSON.parse(text)
}

const [mode, ...rest] = process.argv.slice(2)
try {
  if (mode === 'recipes') {
    const q = rest.join(' ').trim()
    if (!q) throw new Error('нужен запрос')
    const r = await call('vkusvill_recipes', {
      q, sort: 'popularity', page: 1,
      id_feature_filter: 0, id_cooking_time_filter: 0, id_cooking_method_filter: 0,
      id_complexity_filter: 0, id_category_filter: 0, id_exclude_allergens_filter: [],
    })
    out({ status: 'ok', recipes: compactRecipes(r) })
  } else if (mode === 'search') {
    const queries = rest.map(s => s.trim()).filter(Boolean)
    if (!queries.length) throw new Error('нужен хотя бы один запрос')
    const results = await Promise.all(queries.map(q => call('vkusvill_products_search', {
      q, sort: 'popularity', page: 1, vvonly: 0, mode: 'custom', fields: ['id', 'xml_id', 'name', 'price', 'weight', 'unit'],
    }).then(r => ({ q, items: compactSearch(r) })).catch(e => ({ q, error: e.message, items: [] }))))
    out({ status: 'ok', results })
  } else if (mode === 'link') {
    const products = rest.map(s => { const [id, q] = s.split(':'); return { xml_id: Number(id), q: Number(q ?? 1) } })
      .filter(p => p.xml_id > 0 && p.q > 0)
    if (!products.length) throw new Error('нужны пары xml_id:количество')
    if (products.length > 20) throw new Error('не больше 20 позиций в одной ссылке')
    const r = await call('vkusvill_cart_link_create', { products })
    out({ status: 'ok', link: r.data?.link })
  } else {
    throw new Error('режим: recipes <запрос> | search <запрос> [<запрос> ...] | link <xml_id:кол-во> ...')
  }
} catch (e) {
  out({ status: 'error', message: e.message })
}
