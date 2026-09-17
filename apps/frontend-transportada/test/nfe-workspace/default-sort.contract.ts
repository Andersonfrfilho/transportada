/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_SORT,
  SUPERSEDED_ISSUED_AT_SORT,
  SUPERSEDED_NUMBER_SORT,
  sortDocuments,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import { parseTableViewPreferences } from '../../src/modules/nfe-workspace/shared/viewPreferences.serialization'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

function buildDocument(overrides: Partial<NfeDocumentListItem> = {}): NfeDocumentListItem {
  return {
    accessKey: '35240712345678000199550010000000011000000010',
    cteBlockReason: null,
    nfseBlockReason: null,
    tripId: null,
    tripStatus: null,
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
    recipientPostalCode: '14020000',
    recipientPhone: '1639771234',
    freightAmount: '136.8900',
    freightRuleName: 'Spani',
    cargoGrossWeight: '108.6700',
    cargoWeightSource: 'xml' as const,
    recipientAddressNumber: null,
    recipientLatitude: null,
    recipientLongitude: null,
    recipientLocationPrecision: null,
    recipientCity: 'Curitiba',
    recipientCityCode: '4106902',
    recipientName: 'Comércio Beta',
    recipientState: 'PR',
    recipientTaxId: '98765432000155',
    series: '1',
    status: 'authorized',
    totalAmount: '1500.0000',
    updatedAt: '2026-03-15T09:00:00.000000Z',
    variant: 'complete',
    ...overrides,
  }
}

function sortedIds(documents: readonly NfeDocumentListItem[]): readonly string[] {
  return sortDocuments({ documents, sort: DEFAULT_SORT }).map((document) => document.id)
}

/** `totalAmount` é opcional na API (D10) — a ausência é a chave sumindo, nunca `undefined` atribuído. */
function buildDocumentWithoutAmount(
  overrides: Partial<NfeDocumentListItem> = {},
): NfeDocumentListItem {
  const document: Record<string, unknown> = { ...buildDocument(overrides) }
  delete document.totalAmount
  return document as NfeDocumentListItem
}

describe('nfe-workspace default sort', () => {
  test('the default sort is the most recently updated document first', () => {
    expect(DEFAULT_SORT).toEqual({ column: 'updatedAt', direction: 'desc' })
  })

  test('the latest update opens the list, even over a newer issue date', () => {
    const touchedToday = buildDocument({
      id: 'touched-today',
      issuedAt: '2026-01-05T08:00:00.000Z',
      updatedAt: '2026-09-14T10:00:00.000000Z',
    })
    const issuedYesterday = buildDocument({
      id: 'issued-yesterday',
      issuedAt: '2026-09-13T08:00:00.000Z',
      updatedAt: '2026-09-13T09:00:00.000000Z',
    })

    expect(sortedIds([issuedYesterday, touchedToday])).toEqual([
      'touched-today',
      'issued-yesterday',
    ])
  })

  /** O servidor grava microssegundos; comparar como texto ISO de largura fixa preserva a ordem. */
  test('a microsecond apart is still a different update', () => {
    const later = buildDocument({ id: 'later', updatedAt: '2026-09-14T10:00:00.000002Z' })
    const earlier = buildDocument({ id: 'earlier', updatedAt: '2026-09-14T10:00:00.000001Z' })

    expect(sortedIds([earlier, later])).toEqual(['later', 'earlier'])
  })

  test('a tie on the update is broken by the newest issue date, then by the id', () => {
    const updatedAt = '2026-09-14T09:00:00.000000Z'
    const newestIssue = buildDocument({ id: 'b', issuedAt: '2026-09-12T12:00:00.000Z', updatedAt })
    const olderIssueHigherId = buildDocument({
      id: 'z',
      issuedAt: '2026-09-11T12:00:00.000Z',
      updatedAt,
    })
    const olderIssueLowerId = buildDocument({
      id: 'a',
      issuedAt: '2026-09-11T12:00:00.000Z',
      updatedAt,
    })

    expect(sortedIds([olderIssueLowerId, olderIssueHigherId, newestIssue])).toEqual(['b', 'z', 'a'])
  })

  /** A API sobe primeiro; enquanto o corpo antigo chegar sem `updatedAt`, a emissão responde. */
  test('a row served without the update time falls back to its issue date', () => {
    const withoutUpdate = buildDocument({ id: 'old-body', issuedAt: '2026-09-13T08:00:00.000Z' })
    delete (withoutUpdate as { updatedAt?: string }).updatedAt
    const updated = buildDocument({
      id: 'updated',
      issuedAt: '2026-01-01T08:00:00.000Z',
      updatedAt: '2026-09-12T08:00:00.000000Z',
    })

    expect(sortedIds([updated, withoutUpdate])).toEqual(['old-body', 'updated'])
  })

  test('a null sort keeps the order the API delivered', () => {
    const first = buildDocument({ id: 'first', issuedAt: '2026-01-05T08:00:00.000Z' })
    const second = buildDocument({ id: 'second', issuedAt: '2026-08-10T21:00:00.000Z' })

    expect(sortDocuments({ documents: [first, second], sort: null })).toEqual([first, second])
  })

  test('the issue date is still a column the user can sort by', () => {
    const oldest = buildDocument({ id: 'oldest', issuedAt: '2026-01-05T08:00:00.000Z' })
    const newest = buildDocument({ id: 'newest', issuedAt: '2026-08-10T21:00:00.000Z' })

    expect(
      sortDocuments({
        documents: [newest, oldest],
        sort: { column: 'issuedAt', direction: 'asc' },
      }).map((document) => document.id),
    ).toEqual(['oldest', 'newest'])
  })

  test('a saved view carrying a superseded default adopts the current one', () => {
    expect(SUPERSEDED_ISSUED_AT_SORT).toEqual({ column: 'issuedAt', direction: 'desc' })
    expect(parseTableViewPreferences({ sort: SUPERSEDED_NUMBER_SORT }).sort).toEqual(DEFAULT_SORT)
    expect(parseTableViewPreferences({ sort: SUPERSEDED_ISSUED_AT_SORT }).sort).toEqual(
      DEFAULT_SORT,
    )
  })

  test('any other saved sort is preserved, including the current default', () => {
    expect(parseTableViewPreferences({ sort: DEFAULT_SORT }).sort).toEqual(DEFAULT_SORT)
    expect(
      parseTableViewPreferences({ sort: { column: 'issuedAt', direction: 'asc' } }).sort,
    ).toEqual({ column: 'issuedAt', direction: 'asc' })
    expect(
      parseTableViewPreferences({ sort: { column: 'number', direction: 'desc' } }).sort,
    ).toEqual({ column: 'number', direction: 'desc' })
    expect(
      parseTableViewPreferences({ sort: { column: 'emitter', direction: 'asc' } }).sort,
    ).toEqual({ column: 'emitter', direction: 'asc' })
  })
})

/**
 * Segunda revisão da spec 153, N5: `Number(undefined)` é `NaN`, e o comparador antigo devolvia
 * `NaN` para todo par com uma nota sem `totalAmount` — o `sort` fica indefinido, e clicar em
 * "Valor" embaralha a lista sem erro nenhum. O comparador reusa `compareMoneyAmounts` de
 * `tripTable.service.ts`, que joga a ausência para o fim nos dois sentidos.
 */
describe('nfe-workspace: ordenação por valor com nota sem totalAmount (spec 153, segunda revisão N5)', () => {
  test('nota sem valor vai para o fim ordenando por valor crescente', () => {
    const sem = buildDocumentWithoutAmount({ id: 'sem' })
    const barata = buildDocument({ id: 'barata', totalAmount: '100.0000' })
    const cara = buildDocument({ id: 'cara', totalAmount: '900.0000' })

    expect(
      sortDocuments({
        documents: [cara, sem, barata],
        sort: { column: 'amount', direction: 'asc' },
      }).map((document) => document.id),
    ).toEqual(['barata', 'cara', 'sem'])
  })

  /** Ausência não é o menor valor — inverter o sentido não pode promovê-la ao topo. */
  test('nota sem valor continua no fim ordenando por valor decrescente', () => {
    const sem = buildDocumentWithoutAmount({ id: 'sem' })
    const barata = buildDocument({ id: 'barata', totalAmount: '100.0000' })
    const cara = buildDocument({ id: 'cara', totalAmount: '900.0000' })

    expect(
      sortDocuments({
        documents: [barata, sem, cara],
        sort: { column: 'amount', direction: 'desc' },
      }).map((document) => document.id),
    ).toEqual(['cara', 'barata', 'sem'])
  })

  test('duas notas sem valor não trocam de posição entre si', () => {
    const semA = buildDocumentWithoutAmount({ id: 'sem-a' })
    const semB = buildDocumentWithoutAmount({ id: 'sem-b' })

    expect(
      sortDocuments({
        documents: [semA, semB],
        sort: { column: 'amount', direction: 'asc' },
      }).map((document) => document.id),
    ).toEqual(['sem-a', 'sem-b'])
  })
})
