import { describe, it, expect } from 'vitest'
import { compactRecipes, compactSearch } from '../workspace/tools/vv-format.mjs'

describe('compactRecipes', () => {
  it('оставляет три рецепта с ингредиентами и id товаров, без шагов', () => {
    const raw = { data: { items: [1, 2, 3, 4].map(n => ({
      name: `Рецепт&nbsp;${n}`, url: `https://vkusvill.ru/r${n}`, portions: 4, image: `https://img/${n}.webp`,
      steps: [{ text: 'длинный шаг' }],
      ingredients: [{ name: 'Свёкла', quantity: '500 г', ids: ['611', '16073', '1', '2'] }],
    })) } }
    const r = compactRecipes(raw)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({
      name: 'Рецепт 1', url: 'https://vkusvill.ru/r1', portions: 4, photo: 'https://img/1.webp',
      ingredients: [{ name: 'Свёкла', quantity: '500 г', product_ids: [611, 16073, 1] }],
    })
    expect(JSON.stringify(r)).not.toContain('длинный шаг')
  })
  it('переживает пустой ответ', () => {
    expect(compactRecipes({ data: { items: [] } })).toEqual([])
    expect(compactRecipes(null)).toEqual([])
  })
})

describe('compactSearch', () => {
  it('сжимает товар до id, названия, цены и веса', () => {
    const raw = { data: { items: [{ id: 1, xml_id: 21849, name: 'Сельдь&nbsp;филе, 200 г', price: { current: 185 }, weight: { value: 0.2, unit: 'кг' }, unit: 'шт' }] } }
    expect(compactSearch(raw)).toEqual([{ id: 21849, name: 'Сельдь филе, 200 г', price: 185, weight: null, unit: 'шт' }])
    const bulk = { data: { items: [{ xml_id: 606, name: 'Морковь', price: { current: 55 }, weight: { value: 1, unit: 'кг' }, unit: 'кг' }] } }
    expect(compactSearch(bulk)[0].weight).toBe('1 кг')
  })
  it('режет до шести позиций', () => {
    const raw = { data: { items: Array.from({ length: 10 }, (_, i) => ({ xml_id: i, name: `t${i}`, price: { current: i } })) } }
    expect(compactSearch(raw)).toHaveLength(6)
  })
})
