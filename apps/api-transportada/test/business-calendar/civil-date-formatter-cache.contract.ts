/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2e: o formatador de data civil é guardado por fuso. Medido: ~22 µs por `new
 * Intl.DateTimeFormat` contra ~0,5 µs com ele guardado, e uma leitura do detalhe da viagem chama
 * `toCivilDate` ~5 vezes por nota. O resultado não muda; só a construção deixa de se repetir.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { toCivilDate } from '../../src/business-calendar/application/civil-date.service.js'

const ORIGINAL_FORMATTER = Intl.DateTimeFormat
const INSTANT = new Date('2026-10-10T02:30:00.000Z')
const CALL_COUNT = 100
const DISTINCT_TIME_ZONES = [
  'Asia/Tokyo',
  'Europe/Lisbon',
  'America/Bogota',
  'Africa/Lagos',
  'Pacific/Auckland',
  'Asia/Kolkata',
  'America/Argentina/Buenos_Aires',
  'Europe/Berlin',
  'Asia/Dubai',
  'America/Denver',
  'Australia/Perth',
  'Asia/Seoul',
  'America/Lima',
  'Europe/Madrid',
  'Asia/Manila',
  'Africa/Cairo',
  'America/Chicago',
  'Europe/Oslo',
  'Asia/Karachi',
  'America/Halifax',
] as const

function countFormatterConstructions(): { readonly count: () => number } {
  let constructions = 0
  Intl.DateTimeFormat = new Proxy(ORIGINAL_FORMATTER, {
    construct(target, args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      constructions += 1
      return Reflect.construct(target, args) as Intl.DateTimeFormat
    },
  })
  return { count: () => constructions }
}

afterEach(() => {
  Intl.DateTimeFormat = ORIGINAL_FORMATTER
})

describe('spec 236 T1.2e — toCivilDate guarda o formatador por fuso', () => {
  test('cem chamadas no mesmo fuso constroem o formatador no máximo uma vez', () => {
    const constructions = countFormatterConstructions()

    for (let call = 0; call < CALL_COUNT; call += 1) {
      expect(toCivilDate({ instant: INSTANT, timeZone: 'Pacific/Honolulu' })).toBe('2026-10-09')
    }

    expect(constructions.count()).toBeLessThanOrEqual(1)
  })

  test('fusos diferentes seguem dando a data de cada um, com o guardado limitado', () => {
    for (const timeZone of DISTINCT_TIME_ZONES) {
      const expected = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone,
        year: 'numeric',
      }).format(INSTANT)

      expect(toCivilDate({ instant: INSTANT, timeZone })).toBe(expected)
      expect(toCivilDate({ instant: INSTANT, timeZone })).toBe(expected)
    }
  })
})
