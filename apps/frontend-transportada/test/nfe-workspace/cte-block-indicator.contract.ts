/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  countBlockedDocuments,
  isDocumentBlocked,
  toggleAllDocumentSelection,
  toggleDocumentSelection,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import {
  DOCUMENT_LIST_PAGE,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    listDocuments: (input: {
      readonly cursor: null | string
      readonly limit: number
    }) => Promise<{ readonly items: readonly NfeDocumentListItem[] }>
  }
}

const ALREADY_LINKED = 'CTE_BATCH_DOCUMENT_ALREADY_LINKED'

function buildDocument(overrides: Partial<NfeDocumentListItem> = {}): NfeDocumentListItem {
  return {
    accessKey: '35190730290856000160550010000000011000000010',
    cteBlockReason: null,
    emitterAddress: 'Rua das Cargas, 100',
    emitterCity: 'Campinas',
    emitterCityCode: '3509502',
    emitterName: 'Emitente Transportada',
    emitterState: 'SP',
    emitterTaxId: '30290856000160',
    id: 'free-1',
    issuedAt: '2026-07-22T10:00:00.000Z',
    number: '11',
    recipientAddress: 'Avenida Logística, 500',
    recipientCity: 'Jundiaí',
    recipientCityCode: '3525904',
    recipientName: 'Destinatario Cliente',
    recipientState: 'SP',
    recipientTaxId: '12345678000199',
    series: '1',
    status: 'authorized',
    totalAmount: '1234.5600',
    variant: 'complete',
    ...overrides,
  }
}

const FREE = buildDocument({ id: 'free-1' })
const OTHER_FREE = buildDocument({ id: 'free-2', number: '12' })
const BLOCKED = buildDocument({ cteBlockReason: ALREADY_LINKED, id: 'blocked-1', number: '13' })

describe('nfe document cte block indicator contract', () => {
  test('carries the block reason from the listing payload into the document item', async () => {
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: [
              DOCUMENT_LIST_PAGE.items[0],
              { ...DOCUMENT_LIST_PAGE.items[0], cteBlockReason: ALREADY_LINKED, id: 'blocked-1' },
            ],
            page: { nextCursor: null },
          }),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const page = await client.listDocuments({ cursor: null, limit: 20 })

    expect(page.items[0]?.cteBlockReason).toBeNull()
    expect(page.items[1]?.cteBlockReason).toBe(ALREADY_LINKED)
  })

  test('rejects a listing payload whose block reason is not a nullable string', async () => {
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: [{ ...DOCUMENT_LIST_PAGE.items[0], cteBlockReason: 7 }],
            page: { nextCursor: null },
          }),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const failure = await client
      .listDocuments({ cursor: null, limit: 20 })
      .catch((caught: unknown) => caught)

    expect(failure).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_RESPONSE_INVALID' }))
  })

  test('reads the block straight from the reason the API resolved', () => {
    expect(isDocumentBlocked(FREE)).toBe(false)
    expect(isDocumentBlocked(BLOCKED)).toBe(true)
    expect(countBlockedDocuments([FREE, BLOCKED, OTHER_FREE])).toBe(1)
  })

  test('refuses to select a blocked row and keeps toggling the free ones', () => {
    const documents = [FREE, OTHER_FREE, BLOCKED]

    const afterBlocked = toggleDocumentSelection({
      documentId: BLOCKED.id,
      documents,
      selectedIds: new Set<string>(),
    })
    expect([...afterBlocked]).toEqual([])

    const afterFree = toggleDocumentSelection({
      documentId: FREE.id,
      documents,
      selectedIds: new Set<string>(),
    })
    expect([...afterFree]).toEqual([FREE.id])

    const afterUnselect = toggleDocumentSelection({
      documentId: FREE.id,
      documents,
      selectedIds: afterFree,
    })
    expect([...afterUnselect]).toEqual([])
  })

  test('keeps a blocked row out of select all and clears only what it had taken', () => {
    const pageItems = [FREE, BLOCKED, OTHER_FREE]

    const selected = toggleAllDocumentSelection({
      allSelected: false,
      pageItems,
      selectedIds: new Set<string>(),
    })
    expect([...selected].sort()).toEqual([FREE.id, OTHER_FREE.id])

    const cleared = toggleAllDocumentSelection({
      allSelected: true,
      pageItems,
      selectedIds: new Set([...selected, 'kept-from-another-page']),
    })
    expect([...cleared]).toEqual(['kept-from-another-page'])
  })
})
