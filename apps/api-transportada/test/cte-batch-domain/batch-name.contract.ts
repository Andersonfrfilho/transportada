/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildBatchNamePrefix,
  suggestBatchName,
} from '../../src/cte-batches/domain/cte-batch-name.service.js'

const PREFIX = 'CT-e 2026-07-30 #'

describe('CT-e batch name suggestion contract', () => {
  test('builds the prefix from the operator date, not from UTC', () => {
    expect(buildBatchNamePrefix({ now: new Date('2026-07-30T12:00:00Z') })).toBe(PREFIX)
    // 22h de 30/07 em São Paulo: o dia UTC já virou, o do operador não.
    expect(buildBatchNamePrefix({ now: new Date('2026-07-31T01:00:00Z') })).toBe(PREFIX)
    // 23h de 29/07 em São Paulo: o dia UTC já é 30, o do operador ainda é 29.
    expect(buildBatchNamePrefix({ now: new Date('2026-07-30T02:00:00Z') })).toBe(
      'CT-e 2026-07-29 #',
    )
  })

  test('starts at one when the company has no batch named for the day', () => {
    expect(suggestBatchName({ names: [], prefix: PREFIX })).toBe(`${PREFIX}1`)
  })

  test('takes the highest sequence in use and never reuses a number', () => {
    expect(suggestBatchName({ names: [`${PREFIX}1`, `${PREFIX}3`], prefix: PREFIX })).toBe(
      `${PREFIX}4`,
    )
    expect(suggestBatchName({ names: [`${PREFIX}10`, `${PREFIX}9`], prefix: PREFIX })).toBe(
      `${PREFIX}11`,
    )
  })

  test('ignores names that do not carry a plain sequence for this day', () => {
    const names = [
      `${PREFIX}2 revisado`,
      `${PREFIX}`,
      `${PREFIX}2.5`,
      `${PREFIX}-3`,
      `${PREFIX}01x`,
      'CT-e 2026-07-29 #9',
      'entrega da manhã',
    ]

    expect(suggestBatchName({ names, prefix: PREFIX })).toBe(`${PREFIX}1`)
  })

  test('keeps counting from the valid names when invalid ones are mixed in', () => {
    const names = ['CT-e 2026-07-29 #40', `${PREFIX}2 revisado`, `${PREFIX}2`, 'rascunho']

    expect(suggestBatchName({ names, prefix: PREFIX })).toBe(`${PREFIX}3`)
  })
})
