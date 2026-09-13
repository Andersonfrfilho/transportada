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
