import { describe, expect, test } from 'bun:test'

import {
  flattenPendingItemPages,
  lastPendingItemsCursor,
  type PendingItemPage,
} from '../../src/modules/pending-items/shared/pendingItemsClient.service'

function page(overrides: Partial<PendingItemPage>): PendingItemPage {
  return { items: [], nextCursor: null, ...overrides }
}

const FIRST_ITEM = {
  entityId: '00000000-0000-4000-8000-000000000001',
  entityType: 'vehicle' as const,
  kind: 'vehicleBodyTypeMissing' as const,
  label: 'ABC1D23',
}
const SECOND_ITEM = {
  entityId: '00000000-0000-4000-8000-000000000002',
  entityType: 'vehicle' as const,
  kind: 'vehicleBodyTypeMissing' as const,
  label: 'XYZ9A88',
}

/**
 * T18 (revisão, MENOR 10): "carregar mais" tinha de acumular, e trocava a lista inteira pela
 * página seguinte — cada clique perdia o que já estava na tela. As duas funções puras que o hook
 * usa (`usePendingItems.hook.ts`) são o que garante a soma sem depender de DOM.
 */
describe('pending items pagination', () => {
  test('sums the items of every page read so far, in order', () => {
    const pages = [page({ items: [FIRST_ITEM] }), page({ items: [SECOND_ITEM] })]

    expect(flattenPendingItemPages(pages)).toEqual([FIRST_ITEM, SECOND_ITEM])
  })

  test('no page read yet is an empty list, never an exception', () => {
    expect(flattenPendingItemPages([])).toEqual([])
  })

  test('the cursor for the next click is the last page read, never an earlier one', () => {
    const pages = [
      page({ items: [FIRST_ITEM], nextCursor: 'stale-cursor' }),
      page({ items: [SECOND_ITEM], nextCursor: 'fresh-cursor' }),
    ]

    expect(lastPendingItemsCursor(pages)).toBe('fresh-cursor')
  })

  test('the last page without a cursor closes "load more", not the earlier ones', () => {
    const pages = [
      page({ items: [FIRST_ITEM], nextCursor: 'stale-cursor' }),
      page({ items: [SECOND_ITEM], nextCursor: null }),
    ]

    expect(lastPendingItemsCursor(pages)).toBeNull()
  })
})
