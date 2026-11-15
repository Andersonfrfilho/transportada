/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ANTT_CARGO_TYPES,
  ANTT_FLOOR_AXLES,
  ANTT_FLOOR_SOURCE,
  ANTT_FLOOR_TABLES,
  findAnttFloorCoefficients,
} from '../../src/freight-quote/domain/antt-floor.constant.js'

describe('ANTT floor table (Res. 6.084/2026)', () => {
  test('cites the official resolution and its effective date', () => {
    expect(ANTT_FLOOR_SOURCE.resolution).toContain('6.084/2026')
    expect(ANTT_FLOOR_SOURCE.effectiveFrom).toBe('2026-07-17')
    expect(ANTT_FLOOR_SOURCE.url.startsWith('https://anttlegis.antt.gov.br/')).toBe(true)
  })

  test('every table has the twelve cargo types and the seven axle columns', () => {
    for (const table of ['A', 'C'] as const) {
      for (const type of ANTT_CARGO_TYPES) {
        const row = ANTT_FLOOR_TABLES[table][type.code]
        expect(row.length).toBe(ANTT_FLOOR_AXLES.length)
      }
    }
  })

  test('there is no 8-axle column in the norm', () => {
    expect(ANTT_FLOOR_AXLES).toEqual([2, 3, 4, 5, 6, 7, 9])
  })

  test('the coefficient grows with the number of axles in every filled row', () => {
    for (const table of ['A', 'C'] as const) {
      for (const type of ANTT_CARGO_TYPES) {
        const ccds = ANTT_FLOOR_TABLES[table][type.code]
          .filter((cell) => cell !== null)
          .map((cell) => Number.parseFloat(cell?.[0] ?? '0'))
        expect(ccds).toEqual([...ccds].sort((left, right) => left - right))
      }
    }
  })

  test('general cargo, 5 axles, table A is 6.6718 R$/km plus 657.56', () => {
    expect(findAnttFloorCoefficients({ axles: 5, cargoType: 5, table: 'A' })).toEqual({
      axlesUsed: 5,
      cc: '657.56',
      ccd: '6.6718',
    })
  })

  test('high performance (table C) is cheaper per fixed charge than table A', () => {
    const regular = findAnttFloorCoefficients({ axles: 5, cargoType: 5, table: 'A' })
    const high = findAnttFloorCoefficients({ axles: 5, cargoType: 5, table: 'C' })
    expect(Number.parseFloat(high?.cc ?? '0')).toBeLessThan(Number.parseFloat(regular?.cc ?? '0'))
  })

  test('8 axles use the lower neighbour (7), as Art. 5 §5 says', () => {
    expect(findAnttFloorCoefficients({ axles: 8, cargoType: 5, table: 'A' })?.axlesUsed).toBe(7)
  })

  test('an empty cell falls back to the neighbour: type 4 with 2 axles uses 3, type 12 with 3 uses 5', () => {
    expect(findAnttFloorCoefficients({ axles: 2, cargoType: 4, table: 'A' })?.axlesUsed).toBe(3)
    expect(findAnttFloorCoefficients({ axles: 3, cargoType: 12, table: 'A' })?.axlesUsed).toBe(5)
  })
})
