/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  countActiveTripOccurrenceFilters,
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  formatOccurrenceInvoice,
  readTripOccurrenceColumnPreferences,
  reorderTripOccurrenceColumns,
  resolveOccurrenceTypeLabel,
  serializeTripOccurrenceQuery,
  toggleTripOccurrenceOrder,
  toggleTripOccurrenceStage,
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
