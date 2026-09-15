/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  readRetryAfterSecondsHeader,
  resolveRetryAfterMinutes,
} from '../../src/modules/shared/retryAfter.service'

describe('Retry-After (spec 150, correção Fase 4, item 11)', () => {
  test('arredonda para cima, e nunca cai a zero', () => {
    expect(resolveRetryAfterMinutes(1)).toBe(1)
    expect(resolveRetryAfterMinutes(59)).toBe(1)
    expect(resolveRetryAfterMinutes(60)).toBe(1)
    expect(resolveRetryAfterMinutes(61)).toBe(2)
    expect(resolveRetryAfterMinutes(0)).toBe(1)
  })

  test('lê o header Retry-After em segundos, undefined quando ausente ou inválido', () => {
    expect(readRetryAfterSecondsHeader(new Headers({ 'retry-after': '90' }))).toBe(90)
    expect(readRetryAfterSecondsHeader(new Headers())).toBeUndefined()
    expect(
      readRetryAfterSecondsHeader(new Headers({ 'retry-after': 'not-a-number' })),
    ).toBeUndefined()
    expect(readRetryAfterSecondsHeader(new Headers({ 'retry-after': '-1' }))).toBeUndefined()
  })
})
