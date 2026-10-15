/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T3.2: o filtro "Andamento" segue o mesmo contrato do filtro de tratativa — todos selecionados
 * é "sem filtro", limpar devolve o padrão e a pílula só aparece quando a seleção difere dele.
 */
import { describe, expect, test } from 'bun:test'

import {
  countActiveTripOccurrenceFilters,
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  setTripOccurrenceResolutionStates,
  TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'
import {
  clearTripOccurrenceFilterField,
  describeTripOccurrenceFilterPills,
} from '@/modules/trip/shared/tripOccurrenceFilterPills.service'

const FORMAT_DAY = (value: string) => value

describe('filtro de andamento (spec 266 T3.2)', () => {
  test('o padrão é todos os andamentos, que não conta como filtro ativo', () => {
    expect(EMPTY_TRIP_OCCURRENCE_FILTERS.resolutionStates).toEqual(
      TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES,
    )
    expect(countActiveTripOccurrenceFilters(EMPTY_TRIP_OCCURRENCE_FILTERS)).toBe(0)
  })

  test('a seleção volta na ordem das opções, não na ordem do clique', () => {
    const filters = setTripOccurrenceResolutionStates(EMPTY_TRIP_OCCURRENCE_FILTERS, [
      'cancelled',
      'open',
    ])

    expect(filters.resolutionStates).toEqual(['open', 'cancelled'])
    expect(countActiveTripOccurrenceFilters(filters)).toBe(1)
  })

  test('a pílula aparece com os rótulos de andamento e some ao limpar', () => {
    const filters = setTripOccurrenceResolutionStates(EMPTY_TRIP_OCCURRENCE_FILTERS, ['resolved'])
    const pills = describeTripOccurrenceFilterPills({ filters, formatDay: FORMAT_DAY })
    const pill = pills.find((candidate) => candidate.field === 'resolutionStates')

    expect(pill?.labelKey).toBe('occurrenceFeed.filters.resolution')
    expect(pill?.valueKeys).toEqual(['occurrenceResolution.state.resolved'])

    const cleared = clearTripOccurrenceFilterField({ field: 'resolutionStates', filters })
    expect(cleared.resolutionStates).toEqual(TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES)
  })

  test('sem seleção parcial não há pílula', () => {
    const pills = describeTripOccurrenceFilterPills({
      filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
      formatDay: FORMAT_DAY,
    })

    expect(pills.some((candidate) => candidate.field === 'resolutionStates')).toBe(false)
  })
})
