// Чистые функции сжатия ответов MCP ВкусВилла до того, что нужно модели.
const clean = s => String(s ?? '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

// Рецепты: первые три, без шагов и картинок шагов — только то, что нужно для корзины.
export function compactRecipes(raw, limit = 3) {
  const items = raw?.data?.items ?? []
  return items.slice(0, limit).map(r => ({
    name: clean(r.name),
    url: r.url,
    portions: r.portions ?? null,
    photo: r.image ?? null,
    ingredients: (r.ingredients ?? []).map(i => ({
      name: clean(i.name),
      quantity: clean(i.quantity),
      // id товаров ВкусВилла, уже привязанных к ингредиенту (первые три)
      product_ids: (i.ids ?? []).slice(0, 3).map(Number),
    })),
  }))
}

// Поиск товаров: до шести позиций, одна строка на товар.
export function compactSearch(raw, limit = 6) {
  const items = raw?.data?.items ?? []
  return items.slice(0, limit).map(p => ({
    id: p.xml_id ?? p.id,
    name: clean(p.name),
    price: p.price?.current ?? p.price ?? null,
    // Для штучных товаров MCP отдаёт бессмысленный вес (1 кг у пачки 200 г): вес читать из названия.
    weight: p.unit === 'шт' ? null : (p.weight ? `${p.weight.value} ${p.weight.unit ?? ''}`.trim() : null),
    unit: p.unit ?? null,
  }))
}
