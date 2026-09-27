/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  countActiveTripOccurrenceFilters,
  describeOccurrenceConversationCell,
  describeOccurrenceDocumentCells,
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  formatOccurrenceInvoice,
  readTripOccurrenceColumnPreferences,
  reorderTripOccurrenceColumns,
  resolveOccurrenceTypeLabel,
  serializeTripOccurrenceQuery,
  toggleTripOccurrenceOrder,
  toggleTripOccurrenceStage,
  TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
  TRIP_OCCURRENCE_COLUMN_KEYS,
  TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY,
  TRIP_OCCURRENCE_STAGES,
  writeTripOccurrenceColumnPreferences,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'
import {
  clearTripOccurrenceFilterField,
  describeTripOccurrenceFilterPills,
  TRIP_OCCURRENCE_PILL_FIELDS,
} from '@/modules/trip/shared/tripOccurrenceFilterPills.service'

const formatDay = (value: string): string => `dia:${value}`

describe('listagem de ocorrências — serialização da consulta', () => {
  test('sem filtro só viajam perPage e cursor — chave vazia não é serializada', () => {
    expect(
      serializeTripOccurrenceQuery({
        cursor: null,
        filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
        order: 'desc',
        perPage: 25,
      }),
    ).toBe('perPage=25')
  })

  test('filtros multi-valor viram listas separadas por vírgula', () => {
    const query = serializeTripOccurrenceQuery({
      cursor: '2026-09-01T10:00:00.000Z::abc',
      filters: {
        ...EMPTY_TRIP_OCCURRENCE_FILTERS,
        platesQuery: ' ABC1D23 , DEF4G56 ',
        stages: ['separation'],
        typesQuery: 'recusa_total',
      },
      order: 'asc',
      perPage: 50,
    })
    const search = new URLSearchParams(query)
    expect(search.get('plateIn')).toBe('ABC1D23,DEF4G56')
    expect(search.get('stageIn')).toBe('separation')
    expect(search.get('typeIn')).toBe('recusa_total')
    expect(search.get('order')).toBe('asc')
    expect(search.get('cursor')).toBe('2026-09-01T10:00:00.000Z::abc')
    expect(search.get('perPage')).toBe('50')
  })

  test('o período cobre o dia inteiro: de 00:00 até 23:59:59.999', () => {
    const query = serializeTripOccurrenceQuery({
      cursor: null,
      filters: {
        ...EMPTY_TRIP_OCCURRENCE_FILTERS,
        createdFrom: '2026-09-01',
        createdUntil: '2026-09-02',
      },
      order: 'desc',
      perPage: 25,
    })
    const search = new URLSearchParams(query)
    expect(search.get('createdFrom')).toBe('2026-09-01T00:00:00.000Z')
    expect(search.get('createdUntil')).toBe('2026-09-02T23:59:59.999Z')
  })

  test('seleção de grupo no default não viaja — não restringe nada', () => {
    const allStages = serializeTripOccurrenceQuery({
      cursor: null,
      filters: { ...EMPTY_TRIP_OCCURRENCE_FILTERS, stages: TRIP_OCCURRENCE_STAGES },
      order: 'desc',
      perPage: 25,
    })
    expect(new URLSearchParams(allStages).get('stageIn')).toBeNull()
  })
})

describe('listagem de ocorrências — pílulas de filtro', () => {
  test('cada filtro ativo vira uma pílula, na ordem declarada', () => {
    const pills = describeTripOccurrenceFilterPills({
      filters: {
        caseStatuses: ['recorded'],
        createdFrom: '2026-09-01',
        createdUntil: '2026-09-02',
        platesQuery: 'ABC1D23',
        stages: ['stop'],
        typesQuery: 'long_wait',
      },
      formatDay,
    })
    expect(pills.map((pill) => pill.field)).toEqual([...TRIP_OCCURRENCE_PILL_FIELDS])
    const stagePill = pills[0]
    expect(stagePill?.valueKeys).toEqual(['occurrenceFeed.stage.stop'])
  })

  test('sem filtro aplicado não há pílula nenhuma', () => {
    expect(
      describeTripOccurrenceFilterPills({ filters: EMPTY_TRIP_OCCURRENCE_FILTERS, formatDay }),
    ).toEqual([])
  })

  test('limpar a faixa zera as duas pontas; limpar o grupo restaura o default, nunca []', () => {
    const filters = {
      caseStatuses: TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
      createdFrom: '2026-09-01',
      createdUntil: '2026-09-02',
      platesQuery: '',
      stages: ['stop'] as const,
      typesQuery: '',
    }
    const withoutRange = clearTripOccurrenceFilterField({ field: 'createdRange', filters })
    expect(withoutRange.createdFrom).toBe('')
    expect(withoutRange.createdUntil).toBe('')
    const withoutStages = clearTripOccurrenceFilterField({ field: 'stages', filters })
    expect(withoutStages.stages).toEqual(TRIP_OCCURRENCE_STAGES)
  })
})

describe('listagem de ocorrências — colunas persistidas', () => {
  test('a chave do localStorage é versionada e estável', () => {
    expect(TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY).toBe('trip.occurrences.columns.v1')
  })

  test('a leitura degrada para o default quando o storage falha', () => {
    const preferences = readTripOccurrenceColumnPreferences({
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => undefined,
    })
    expect(preferences.order).toEqual(TRIP_OCCURRENCE_COLUMN_KEYS)
  })

  test('escrita e leitura fazem a ida e volta', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    const reordered = reorderTripOccurrenceColumns(TRIP_OCCURRENCE_COLUMN_KEYS, 'stage', 'up')
    writeTripOccurrenceColumnPreferences(storage, {
      order: reordered,
      visibility: Object.fromEntries(
        TRIP_OCCURRENCE_COLUMN_KEYS.map((key) => [key, true]),
      ) as never,
    })
    expect(readTripOccurrenceColumnPreferences(storage).order[0]).toBe('stage')
  })

  test('reordenar na borda é no-op', () => {
    expect(reorderTripOccurrenceColumns(TRIP_OCCURRENCE_COLUMN_KEYS, 'createdAt', 'up')).toEqual(
      TRIP_OCCURRENCE_COLUMN_KEYS,
    )
  })
})

/**
 * Spec 183 T205 (P1): contratante, destino físico e valor da nota viram colunas. A coluna Conversa
 * espera o estado da conversa na listagem (RF4, T404).
 */
describe('listagem de ocorrências — colunas da nota', () => {
  const DOCUMENT = {
    contractor: { contractorId: 'c-1', name: 'Contratante Alfa', taxId: '11222333000181' },
    destination: {
      city: 'Guarulhos',
      label: 'Avenida da Doca, 500 - Guarulhos/SP',
      origin: 'delivery',
      postalCode: '07000000',
      recipientName: 'Galpão Beta',
      state: 'SP',
    },
    nfeDocumentId: 'nfe-1',
    totalValue: '48320.0000',
  } as const

  test('as colunas novas entram depois da nota, e o aviso continua por último', () => {
    expect(TRIP_OCCURRENCE_COLUMN_KEYS).toEqual([
      'createdAt',
      'stage',
      'typeName',
      'vehiclePlate',
      'driverName',
      'stopLabel',
      'invoice',
      'contractor',
      'destination',
      'invoiceValue',
      'conversation',
      'notified',
    ])
  })

  test('preferência gravada antes das colunas novas as ganha visíveis, no fim, sem perder a ordem', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          order: [
            'stage',
            'createdAt',
            'typeName',
            'vehiclePlate',
            'driverName',
            'stopLabel',
            'invoice',
            'notified',
          ],
          visibility: { driverName: false },
        }),
      setItem: () => undefined,
    }
    const preferences = readTripOccurrenceColumnPreferences(storage)
    expect(preferences.order.slice(0, 2)).toEqual(['stage', 'createdAt'])
    expect(preferences.order.slice(-4)).toEqual([
      'contractor',
      'destination',
      'invoiceValue',
      'conversation',
    ])
    expect(preferences.visibility.driverName).toBe(false)
    expect(preferences.visibility.contractor).toBe(true)
    expect(preferences.visibility.invoiceValue).toBe(true)
    expect(preferences.visibility.conversation).toBe(true)
  })

  test('com nota: nome e CNPJ da contratante, destino físico e valor como string decimal', () => {
    expect(describeOccurrenceDocumentCells(DOCUMENT)).toEqual({
      contractorName: 'Contratante Alfa',
      contractorTaxId: '11222333000181',
      destination: 'Avenida da Doca, 500 - Guarulhos/SP',
      totalValue: '48320.0000',
    })
  })

  test('sem nota, sem contratante casada ou sem destino, a célula fica vazia — nunca "null"', () => {
    expect(describeOccurrenceDocumentCells(null)).toEqual({
      contractorName: '',
      contractorTaxId: '',
      destination: '',
      totalValue: null,
    })
    expect(
      describeOccurrenceDocumentCells({ ...DOCUMENT, contractor: null, destination: null }),
    ).toEqual({
      contractorName: '',
      contractorTaxId: '',
      destination: '',
      totalValue: '48320.0000',
    })
  })
})

/**
 * Spec 183 T404 (RF4): a coluna Conversa. A decisão da tratativa **não** é estado de conversa — com
 * decisão, a célula mostra a decisão (vinda de `case`); sem ela, o estado da conversa com a
 * contratante. As não lidas do motorista são de quem está vendo e vão ao lado, em qualquer caso.
 */
describe('listagem de ocorrências — coluna Conversa', () => {
  const DECIDED_CASE = {
    decision: { decidedAt: '2026-09-24T12:00:00.000Z', kind: 'goods_paid', note: 'Pagou' },
    redeliveryPolicy: 'allowed',
    settlementTotal: null,
    status: 'decided',
    updatedAt: '2026-09-24T12:00:00.000Z',
  } as const

  test('sem conversa, sem decisão e sem não lidas, a célula fica vazia', () => {
    expect(
      describeOccurrenceConversationCell({
        case: null,
        conversation: { contractorState: 'none', driverUnreadCount: 0 },
      }),
    ).toEqual({ driverUnreadCount: 0, state: null })
  })

  test('aguardando e respondida saem do estado da conversa com a contratante', () => {
    expect(
      describeOccurrenceConversationCell({
        case: null,
        conversation: { contractorState: 'awaiting', driverUnreadCount: 0 },
      }).state,
    ).toEqual({ kind: 'conversation', value: 'awaiting' })
    expect(
      describeOccurrenceConversationCell({
        case: null,
        conversation: { contractorState: 'replied', driverUnreadCount: 3 },
      }),
    ).toEqual({ driverUnreadCount: 3, state: { kind: 'conversation', value: 'replied' } })
  })

  test('com decisão, a célula mostra a decisão da tratativa, nunca o estado da conversa', () => {
    expect(
      describeOccurrenceConversationCell({
        case: DECIDED_CASE,
        conversation: { contractorState: 'replied', driverUnreadCount: 1 },
      }),
    ).toEqual({ driverUnreadCount: 1, state: { kind: 'decision', value: 'goods_paid' } })
  })
})

describe('listagem de ocorrências — ordenação, tipo e contagem', () => {
  test('o cabeçalho de hora alterna desc/asc', () => {
    expect(toggleTripOccurrenceOrder('desc')).toBe('asc')
    expect(toggleTripOccurrenceOrder('asc')).toBe('desc')
  })

  test('desmarcar e marcar grupo preserva a ordem canônica', () => {
    const without = toggleTripOccurrenceStage(EMPTY_TRIP_OCCURRENCE_FILTERS, 'delivery')
    expect(without.stages).toEqual(['separation', 'stop'])
    expect(toggleTripOccurrenceStage(without, 'delivery').stages).toEqual(TRIP_OCCURRENCE_STAGES)
  })

  test('nota sem número imprime ausência, nunca null/null', () => {
    expect(formatOccurrenceInvoice(null, null)).toBe('')
    expect(formatOccurrenceInvoice('883658', '1')).toBe('883658/1')
    expect(formatOccurrenceInvoice('883658', null)).toBe('883658')
  })

  test('o tipo cadastrado imprime o nome da empresa; o relato de parada traduz o kind', () => {
    expect(resolveOccurrenceTypeLabel({ source: 'document', typeName: 'Recusa total' })).toEqual({
      labelKey: null,
      value: 'Recusa total',
    })
    expect(resolveOccurrenceTypeLabel({ source: 'stop', typeName: 'long_wait' })).toEqual({
      labelKey: 'occurrenceFeed.kind.long_wait',
      value: 'long_wait',
    })
  })

  test('a contagem de filtros ativos ignora o default', () => {
    expect(countActiveTripOccurrenceFilters(EMPTY_TRIP_OCCURRENCE_FILTERS)).toBe(0)
    expect(
      countActiveTripOccurrenceFilters({
        ...EMPTY_TRIP_OCCURRENCE_FILTERS,
        platesQuery: 'ABC1D23',
        stages: ['stop'],
      }),
    ).toBe(2)
  })
})

describe('listagem de ocorrências — fiação da tela', () => {
  test('a página entra pela navegação e a rota é /ocorrencias', async () => {
    const main = await Bun.file(new URL('../../src/main.tsx', import.meta.url)).text()
    expect(main).toContain(
      "{ href: '/ocorrencias', key: 'trip-occurrences', label: 'Ocorrências' }",
    )
    expect(main).toContain('TripOccurrencesWorkspacePage')
  })

  test('a tabela usa pílulas do design system e o date-range-picker', async () => {
    const filters = await Bun.file(
      new URL(
        '../../src/modules/trip/components/TripOccurrenceFilters.component.tsx',
        import.meta.url,
      ),
    ).text()
    expect(filters).toContain("from '@/components/ui/filter-pills'")
    expect(filters).toContain("from '@/components/ui/date-range-picker'")
  })

  test('a paginação é cursor com carregar mais — nunca offset', async () => {
    const query = await Bun.file(
      new URL('../../src/modules/trip/queries/tripOccurrenceFeed.query.ts', import.meta.url),
    ).text()
    expect(query).toContain('useInfiniteQuery')
    expect(query).toContain('getNextPageParam')
    expect(query).not.toContain('offset')
  })
})
