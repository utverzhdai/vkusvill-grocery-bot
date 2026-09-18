// Создаёт ссылку share_basket через MCP ВкусВилла без участия Claude.
// Использование: node spike/make-link.mjs 107311:1 115018:2
const MCP = 'https://mcp.vkusvill.ru/mcp'

async function call(name, args, id = 1) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      // Без UA сервер отдавал 403 на urllib; curl проходил.
      'user-agent': 'curl/8.0',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  })
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`)
  const data = await res.json()
  return JSON.parse(data.result.content[0].text)
}

const products = process.argv.slice(2).map(s => {
  const [xml_id, q] = s.split(':')
  return { xml_id: Number(xml_id), q: Number(q ?? 1) }
})
if (!products.length) {
  console.error('нужны пары xml_id:количество, например 107311:1')
  process.exit(1)
}
const out = await call('vkusvill_cart_link_create', { products })
console.log(out.data.link)
