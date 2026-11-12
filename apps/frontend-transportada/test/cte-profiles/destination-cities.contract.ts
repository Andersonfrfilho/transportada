/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  destinationCitiesFromText,
  destinationCitiesToText,
  parseDestinationCities,
} from '../../src/modules/cte-profiles/shared/cteProfilesDestinationCities.service'

describe('cte profile destination cities (spec 312)', () => {
  test('reads one Cidade/UF per line and flags the lines it cannot read', () => {
    const parsed = parseDestinationCities('Franca/sp\n\nSertãozinho - SP\nSem estado\nMatão, SP')

    expect(parsed.cities).toEqual([
      { city: 'Franca', state: 'SP' },
      { city: 'Sertãozinho', state: 'SP' },
      { city: 'Matão', state: 'SP' },
    ])
    expect(parsed.invalidLines).toEqual(['Sem estado'])
  })

  test('empty text means any city, never an empty list', () => {
    expect(destinationCitiesFromText('  \n ')).toBeNull()
    expect(destinationCitiesToText(null)).toBe('')
  })

  test('round-trips the list the API serves', () => {
    const cities = [{ city: 'Franca', state: 'SP' }]
    expect(destinationCitiesFromText(destinationCitiesToText(cities))).toEqual(cities)
  })
})
