/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createListPendingItemsUseCase } from '../../src/pending-items/application/list-pending-items.use-case.js'
import type {
  ListPendingItemSourceInput,
  PendingItemPage,
  PendingItemSourcePort,
} from '../../src/pending-items/application/pending-item-source.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000801'

const PAGE: PendingItemPage = {
  items: [
    {
      entityId: '00000000-0000-4000-8000-000000000802',
      entityType: 'vehicle',
      kind: 'vehicleBodyTypeMissing',
      label: 'ABC1D23',
    },
  ],
  nextCursor: null,
}

function fakeSource(input: {
  readonly calls: ListPendingItemSourceInput[]
}): PendingItemSourcePort {
  return {
    kind: 'vehicleBodyTypeMissing',
    async list(call) {
      input.calls.push(call)
      return PAGE
    },
    requiredPermission: 'fleet.read',
  }
}

describe('list pending items use case', () => {
  test('serves the source page to a caller who has the required permission', async () => {
    const calls: ListPendingItemSourceInput[] = []
    const useCase = createListPendingItemsUseCase({ sources: [fakeSource({ calls })] })

    const page = await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set(['fleet.read']) },
      cursor: null,
      limit: 25,
    })

    expect(page).toEqual(PAGE)
    expect(calls).toEqual([{ companyId: COMPANY_ID, cursor: null, limit: 25 }])
  })

  /** Spec 147 D2: a página é genérica, e quem não pode ver um tipo não vê `403` — vê lista vazia. */
  test('returns an empty page instead of failing when the caller lacks every source permission', async () => {
    const calls: ListPendingItemSourceInput[] = []
    const useCase = createListPendingItemsUseCase({ sources: [fakeSource({ calls })] })

    const page = await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set() },
      cursor: null,
      limit: 25,
    })

    expect(page).toEqual({ items: [], nextCursor: null })
    expect(calls).toEqual([])
  })

  test('with two sources, only calls the one whose permission the caller has', async () => {
    const fleetReadCalls: ListPendingItemSourceInput[] = []
    const settingsCalls: ListPendingItemSourceInput[] = []
    const settingsSource: PendingItemSourcePort = {
      kind: 'vehicleBodyTypeMissing',
      async list(call) {
        settingsCalls.push(call)
        return { items: [], nextCursor: null }
      },
      requiredPermission: 'settings.manage',
    }
    const useCase = createListPendingItemsUseCase({
      sources: [settingsSource, fakeSource({ calls: fleetReadCalls })],
    })

    await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set(['settings.manage']) },
      cursor: null,
      limit: 25,
    })

    expect(settingsCalls.length).toBe(1)
    expect(fleetReadCalls).toEqual([])
  })
})

describe('list pending items use case with two sources (spec 294 T3.2)', () => {
  const NEWEST = new Date('2026-11-05T12:00:00.000Z')
  const MIDDLE = new Date('2026-11-05T11:00:00.000Z')
  const OLDEST = new Date('2026-11-05T10:00:00.000Z')

  function sourceOf(input: {
    readonly calls?: ListPendingItemSourceInput[]
    readonly createdAts: readonly Date[]
    readonly kind: PendingItemSourcePort['kind']
    readonly nextCursor?: string | null
    readonly permission: PendingItemSourcePort['requiredPermission']
  }): PendingItemSourcePort {
    return {
      kind: input.kind,
      async list(call) {
        input.calls?.push(call)
        return {
          items: input.createdAts.map((createdAt, index) => ({
            createdAt,
            entityId: `00000000-0000-4000-8000-00000000090${index}`,
            entityType: input.kind === 'addressSuggestedByDriver' ? 'addressSuggestion' : 'vehicle',
            kind: input.kind,
            label: `${input.kind}-${index}`,
          })),
          nextCursor: input.nextCursor ?? null,
        }
      },
      requiredPermission: input.permission,
    }
  }

  test('merges both pages newest first, cut at the limit, with a cursor for the rest', async () => {
    const useCase = createListPendingItemsUseCase({
      sources: [
        sourceOf({
          createdAts: [NEWEST, OLDEST],
          kind: 'vehicleBodyTypeMissing',
          permission: 'fleet.read',
        }),
        sourceOf({
          createdAts: [MIDDLE],
          kind: 'addressSuggestedByDriver',
          permission: 'trip.manage',
        }),
      ],
    })

    const page = await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set(['fleet.read', 'trip.manage']) },
      cursor: null,
      limit: 2,
    })

    expect(page.items.map((item) => item.label)).toEqual([
      'vehicleBodyTypeMissing-0',
      'addressSuggestedByDriver-0',
    ])
    expect(page.nextCursor).toBe(`${MIDDLE.toISOString()}::00000000-0000-4000-8000-000000000900`)
  })

  test('without the suggestion permission, only the fleet source is asked', async () => {
    const suggestionCalls: ListPendingItemSourceInput[] = []
    const useCase = createListPendingItemsUseCase({
      sources: [
        sourceOf({
          createdAts: [NEWEST],
          kind: 'vehicleBodyTypeMissing',
          permission: 'fleet.read',
        }),
        sourceOf({
          calls: suggestionCalls,
          createdAts: [MIDDLE],
          kind: 'addressSuggestedByDriver',
          permission: 'trip.manage',
        }),
      ],
    })

    const page = await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set(['fleet.read']) },
      cursor: null,
      limit: 25,
    })

    expect(page.items.map((item) => item.kind)).toEqual(['vehicleBodyTypeMissing'])
    expect(suggestionCalls).toEqual([])
  })

  test('has no cursor when both sources are exhausted inside the limit', async () => {
    const useCase = createListPendingItemsUseCase({
      sources: [
        sourceOf({
          createdAts: [NEWEST],
          kind: 'vehicleBodyTypeMissing',
          permission: 'fleet.read',
        }),
        sourceOf({
          createdAts: [MIDDLE],
          kind: 'addressSuggestedByDriver',
          permission: 'trip.manage',
        }),
      ],
    })

    const page = await useCase.execute({
      context: { companyId: COMPANY_ID, permissions: new Set(['fleet.read', 'trip.manage']) },
      cursor: null,
      limit: 25,
    })

    expect(page.items).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
  })
})
