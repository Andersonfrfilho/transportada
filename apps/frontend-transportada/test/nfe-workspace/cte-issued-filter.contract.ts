/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_ISSUED_FILTER_VALUES,
  documentMatchesSimpleMode,
  EMPTY_FILTERS,
  evaluateAdvancedFilter,
  hasAnyActiveFilter,
  isCteIssued,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import type {
  AdvancedFilterModel,
  DocumentFilters,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import {
  parseTableViewPreferences,
  serializeTableViewPreferences,
} from '../../src/modules/nfe-workspace/shared/viewPreferences.serialization'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

const ALREADY_LINKED = 'CTE_BATCH_DOCUMENT_ALREADY_LINKED'
const MISSING_DATA = 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function buildDocument(overrides: Partial<NfeDocumentListItem> = {}): NfeDocumentListItem {
  return {
    accessKey: '35190700000000000191550010000000011000000010',
    cteBlockReason: null,
    nfseBlockReason: null,
    tripId: null,
    tripStatus: null,
    emitterAddress: 'Rua das Cargas, 100',
    emitterCity: 'Campinas',
    emitterCityCode: '3509502',
    emitterName: 'Emitente Sintetico',
    emitterState: 'SP',
    emitterTaxId: '00000000000191',
    id: 'document-1',
    issuedAt: '2026-07-22T10:00:00.000Z',
    nfseInvoiceId: null,
    nfseInvoiceNumber: null,
    number: '11',
    recipientAddress: 'Avenida Logistica, 500',
    recipientPostalCode: '14020000',
    recipientAddressNumber: null,
    recipientLatitude: null,
    recipientLongitude: null,
    recipientLocationPrecision: null,
    recipientCity: 'Jundiai',
    recipientCityCode: '3525904',
    recipientName: 'Destinatario Sintetico',
    recipientState: 'SP',
    recipientTaxId: '00000000000272',
    series: '1',
    status: 'authorized',
    totalAmount: '1500.00',
    variant: 'complete',
    ...overrides,
  }
}

const PENDING_DOCUMENT = buildDocument({ cteBlockReason: null, id: 'pending-1' })
const ISSUED_DOCUMENT = buildDocument({ cteBlockReason: ALREADY_LINKED, id: 'issued-1' })
const BLOCKED_BY_DATA_DOCUMENT = buildDocument({ cteBlockReason: MISSING_DATA, id: 'blocked-1' })

function withCteIssued(value: string): DocumentFilters {
  return { ...EMPTY_FILTERS, select: { ...EMPTY_FILTERS.select, cteIssued: value } }
}

describe('cte issued filter contract', () => {
  test('offers the three documented values and defaults to notas sem CT-e', () => {
    expect(CTE_ISSUED_FILTER_VALUES).toEqual(['pending', 'issued'])
    expect(EMPTY_FILTERS.select.cteIssued).toBe('pending')
  })

  test('reads the CT-e as issued only when the nota is linked to a live batch', () => {
    expect(isCteIssued(ISSUED_DOCUMENT)).toBe(true)
    expect(isCteIssued(PENDING_DOCUMENT)).toBe(false)
    expect(isCteIssued(BLOCKED_BY_DATA_DOCUMENT)).toBe(false)
  })

  test('hides the notas that already have a CT-e by default', () => {
    expect(documentMatchesSimpleMode(PENDING_DOCUMENT, EMPTY_FILTERS, null)).toBe(true)
    expect(documentMatchesSimpleMode(ISSUED_DOCUMENT, EMPTY_FILTERS, null)).toBe(false)
    expect(documentMatchesSimpleMode(BLOCKED_BY_DATA_DOCUMENT, EMPTY_FILTERS, null)).toBe(true)
  })

  test('inverts the set under issued and shows everything when cleared', () => {
    const issuedOnly = withCteIssued('issued')
    expect(documentMatchesSimpleMode(ISSUED_DOCUMENT, issuedOnly, null)).toBe(true)
    expect(documentMatchesSimpleMode(PENDING_DOCUMENT, issuedOnly, null)).toBe(false)

    const everything = withCteIssued('')
    expect(documentMatchesSimpleMode(ISSUED_DOCUMENT, everything, null)).toBe(true)
    expect(documentMatchesSimpleMode(PENDING_DOCUMENT, everything, null)).toBe(true)
  })

  test('does not count the default as an active filter, but any change does', () => {
    expect(hasAnyActiveFilter(EMPTY_FILTERS)).toBe(false)
    expect(hasAnyActiveFilter(withCteIssued(''))).toBe(true)
    expect(hasAnyActiveFilter(withCteIssued('issued'))).toBe(true)
  })

  test('restores the default when stored preferences predate the filter', () => {
    const parsed = parseTableViewPreferences({ filters: { select: { status: '' } } })
    expect(parsed.filters.select.cteIssued).toBe('pending')

    const roundTrip = parseTableViewPreferences(
      serializeTableViewPreferences({ ...parsed, filters: withCteIssued('') }),
    )
    expect(roundTrip.filters.select.cteIssued).toBe('')
  })

  test('exposes the same field to the advanced builder', () => {
    const model: AdvancedFilterModel = {
      connector: 'and',
      groups: [
        {
          conditions: [
            { field: 'cteIssued', id: 'condition-1', operator: 'eq', value: 'issued', valueTo: '' },
          ],
          connector: 'and',
          id: 'group-1',
        },
      ],
    }
    expect(evaluateAdvancedFilter(ISSUED_DOCUMENT, model)).toBe(true)
    expect(evaluateAdvancedFilter(PENDING_DOCUMENT, model)).toBe(false)
  })

  /**
   * A barra simples saiu da tabela para `NfeDocumentFilterPanel`: ela passou a ter dois
   * consumidores — a listagem e a criação de viagem, que monta o lote com os mesmos filtros. O que
   * se afirma continua sendo o mesmo, só mudou o arquivo que a hospeda.
   */
  test('wires the filter into the simple bar, the pills and both locales', async () => {
    const [panel, pills, builder, ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/nfe-workspace/components/NfeDocumentFilterPanel.component.tsx'),
      readModule('src/modules/nfe-workspace/shared/nfeDocumentFilterPills.service.ts'),
      readModule('src/modules/nfe-workspace/components/AdvancedFilterBuilder.component.tsx'),
      readModule('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      readModule('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])

    expect(panel).toContain('cteIssuedOptions')
    expect(panel).toContain('select.cteIssued')
    /**
     * ⚠️ A pílula é cobrada no **serviço de descritores**, não na tabela: a tabela deixou de nomear
     * a chave quando o rótulo passou a sair de `describeNfeDocumentFilterPills`. Cobrá-la no
     * arquivo que só a renderiza faria o contrato reprovar a extração e passar batido se o
     * descritor sumisse — o inverso do que ele existe para guardar.
     */
    expect(pills).toContain('filters.cteIssued')
    expect(builder).toContain('cteIssued')
    for (const locale of [ptLocale, enLocale]) {
      expect(locale).toContain('"cteIssued"')
      expect(locale).toContain('"cteIssuedPending"')
      expect(locale).toContain('"cteIssuedIssued"')
    }
  })
})
