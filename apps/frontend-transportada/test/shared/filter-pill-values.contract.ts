/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  OPEN_RANGE_MARK,
  describeRangeValue,
  selectionDiffersFromDefault,
} from '../../src/modules/shared/filterPill.service'

describe('filter pill values contract', () => {
  test('describes nothing when both ends of the range are empty', () => {
    expect(describeRangeValue({ from: '', to: '' })).toBe('')
    expect(describeRangeValue({ from: '   ', to: '' })).toBe('')
  })

  test('marks the open side of a half filled range', () => {
    expect(describeRangeValue({ from: '10', to: '' })).toBe(`10–${OPEN_RANGE_MARK}`)
    expect(describeRangeValue({ from: '', to: '40' })).toBe(`${OPEN_RANGE_MARK}–40`)
    expect(describeRangeValue({ from: '10', to: '40' })).toBe('10–40')
  })

  test('formats each end when a formatter is given, without touching the open mark', () => {
    const format = (value: string): string => value.split('-').reverse().join('/')

    expect(describeRangeValue({ format, from: '2026-03-01', to: '' })).toBe(
      `01/03/2026–${OPEN_RANGE_MARK}`,
    )
  })

  test('treats a selection equal to the default as not applied, whatever the order', () => {
    expect(
      selectionDiffersFromDefault({ defaults: ['draft', 'ready'], values: ['ready', 'draft'] }),
    ).toBe(false)
    expect(selectionDiffersFromDefault({ defaults: [], values: [] })).toBe(false)
  })

  test('treats a narrowed or widened selection as applied', () => {
    expect(selectionDiffersFromDefault({ defaults: ['draft', 'ready'], values: ['draft'] })).toBe(
      true,
    )
    expect(selectionDiffersFromDefault({ defaults: [], values: ['draft'] })).toBe(true)
    expect(selectionDiffersFromDefault({ defaults: ['draft'], values: [] })).toBe(true)
  })
})
