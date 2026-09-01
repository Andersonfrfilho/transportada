/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NO_NUMBER_KEY,
  buildStopAddressKey,
  normalizeAddressNumber,
  normalizePostalCode,
} from '../../src/trips/domain/stop-address-key.js'

describe('stop address key (ADR-0043 §3)', () => {
  test('treats a dashed and an undashed postal code as the same place', () => {
    expect(normalizePostalCode('01310-100')).toBe(normalizePostalCode('01310100'))
    expect(normalizePostalCode('01310-100')).toBe('01310100')
  })

  test('treats a number with and without the "nº" prefix as the same place', () => {
    expect(normalizeAddressNumber('nº 45')).toBe(normalizeAddressNumber('45'))
    expect(normalizeAddressNumber('nº 45')).toBe('45')
  })

  test('the same four variants collapse into the same stop key', () => {
    const withPunctuation = buildStopAddressKey({
      cityCode: '3550308',
      number: 'nº 45',
      postalCode: '01310-100',
    })
    const bare = buildStopAddressKey({
      cityCode: '3550308',
      number: '45',
      postalCode: '01310100',
    })

    expect(withPunctuation).not.toBeNull()
    expect(withPunctuation).toBe(bare)
  })

  test('two different postal codes never collapse into the same portão', () => {
    const first = buildStopAddressKey({ cityCode: '3550308', number: '45', postalCode: '01310100' })
    const second = buildStopAddressKey({
      cityCode: '3550308',
      number: '45',
      postalCode: '01310101',
    })

    expect(first).not.toBe(second)
  })

  test('two different numbers never collapse into the same portão', () => {
    const first = buildStopAddressKey({ cityCode: '3550308', number: '45', postalCode: '01310100' })
    const second = buildStopAddressKey({
      cityCode: '3550308',
      number: '46',
      postalCode: '01310100',
    })

    expect(first).not.toBe(second)
  })

  test('a postal code without eight digits does not normalize — the caller decides SEM ENDEREÇO', () => {
    expect(normalizePostalCode('0131010')).toBeNull()
    expect(normalizePostalCode('')).toBeNull()
    expect(normalizePostalCode(null)).toBeNull()
    expect(
      buildStopAddressKey({ cityCode: '3550308', number: '45', postalCode: '0131010' }),
    ).toBeNull()
  })

  test('an address without a number is S/N, never an empty string', () => {
    expect(normalizeAddressNumber(null)).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('')).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('  ')).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('s/n')).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('S/N')).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('sem número')).toBe(NO_NUMBER_KEY)
  })

  test('an address without a number at the same postal code is one stop, not many', () => {
    const first = buildStopAddressKey({ cityCode: '3550308', number: null, postalCode: '01310100' })
    const second = buildStopAddressKey({ cityCode: '3550308', number: '', postalCode: '01310100' })

    expect(first).toBe(second)
  })
})
