/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_SORT,
  SUPERSEDED_NUMBER_SORT,
  sortDocuments,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import { parseTableViewPreferences } from '../../src/modules/nfe-workspace/shared/viewPreferences.serialization'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

function buildDocument(overrides: Partial<NfeDocumentListItem> = {}): NfeDocumentListItem {
  return {
    accessKey: '35240712345678000199550010000000011000000010',
    cteBlockReason: null,
    emitterAddress: 'Rua das Cargas, 100',
    emitterCity: 'São Paulo',
    emitterCityCode: '3550308',
    emitterName: 'Transportes Alfa',
    emitterState: 'SP',
    emitterTaxId: '12345678000199',
    id: 'doc-1',
    issuedAt: '2026-03-15T09:00:00.000Z',
    nfseInvoiceId: null,
    nfseInvoiceNumber: null,
    number: '1200',
    recipientAddress: 'Av. Central, 200',
    recipientCity: 'Curitiba',
    recipientCityCode: '4106902',
    recipientName: 'Comércio Beta',
    recipientState: 'PR',
    recipientTaxId: '98765432000155',
    series: '1',
    status: 'authorized',
    totalAmount: '1500.0000',
    variant: 'complete',
    ...overrides,
  }
}

describe('nfe-workspace default sort', () => {
  test('the default sort is the newest issue date first', () => {
    expect(DEFAULT_SORT).toEqual({ column: 'issuedAt', direction: 'desc' })
  })

  test('the default sort puts the most recent document at the top', () => {
    const oldest = buildDocument({
      id: 'oldest',
      issuedAt: '2026-01-05T08:00:00.000Z',
      number: '9',
    })
    const newest = buildDocument({
      id: 'newest',
      issuedAt: '2026-08-10T21:00:00.000Z',
      number: '1',
    })
    const middle = buildDocument({
      id: 'middle',
      issuedAt: '2026-05-20T12:00:00.000Z',
      number: '5',
    })

    const sorted = sortDocuments({ documents: [oldest, newest, middle], sort: DEFAULT_SORT })

    expect(sorted.map((document) => document.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  test('a null sort keeps the order the API delivered', () => {
    const first = buildDocument({ id: 'first', issuedAt: '2026-01-05T08:00:00.000Z' })
    const second = buildDocument({ id: 'second', issuedAt: '2026-08-10T21:00:00.000Z' })

    expect(sortDocuments({ documents: [first, second], sort: null })).toEqual([first, second])
  })

  test('a saved view carrying the superseded number sort adopts the new default', () => {
    expect(parseTableViewPreferences({ sort: SUPERSEDED_NUMBER_SORT }).sort).toEqual(DEFAULT_SORT)
  })

  test('any other saved sort is preserved, including number descending', () => {
    expect(
      parseTableViewPreferences({ sort: { column: 'number', direction: 'desc' } }).sort,
    ).toEqual({ column: 'number', direction: 'desc' })
    expect(
      parseTableViewPreferences({ sort: { column: 'emitter', direction: 'asc' } }).sort,
    ).toEqual({ column: 'emitter', direction: 'asc' })
  })
})
