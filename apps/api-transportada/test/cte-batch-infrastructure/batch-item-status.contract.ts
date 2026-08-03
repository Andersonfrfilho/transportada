/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveBatchItemStatus } from '../../src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.js'

const AUTHORIZED_DOCUMENT = { cancellationRequestedAt: null, status: 'authorized' } as const

describe('CT-e batch item status resolution', () => {
  test('keeps an authorized document authorized under a later rejected attempt', () => {
    expect(
      resolveBatchItemStatus({ attemptStatus: 'rejected', document: AUTHORIZED_DOCUMENT }),
    ).toBe('authorized')
  })

  test('keeps an authorized document authorized under a later failed attempt', () => {
    expect(resolveBatchItemStatus({ attemptStatus: 'failed', document: AUTHORIZED_DOCUMENT })).toBe(
      'authorized',
    )
  })

  test('reports a cancellation already requested as cancelled', () => {
    expect(
      resolveBatchItemStatus({
        attemptStatus: 'authorized',
        document: {
          cancellationRequestedAt: new Date('2026-07-28T10:00:00.000Z'),
          status: 'authorized',
        },
      }),
    ).toBe('cancelled')
  })

  test('reports a document cancelled at SEFAZ as cancelled', () => {
    expect(
      resolveBatchItemStatus({
        attemptStatus: 'authorized',
        document: { cancellationRequestedAt: null, status: 'cancelled' },
      }),
    ).toBe('cancelled')
  })

  test('falls back to the latest attempt while no fiscal document exists', () => {
    expect(resolveBatchItemStatus({ attemptStatus: 'rejected', document: null })).toBe('rejected')
    expect(resolveBatchItemStatus({ attemptStatus: 'in_flight', document: null })).toBe('in_flight')
  })

  test('reports an item without attempt and without document as pending', () => {
    expect(resolveBatchItemStatus({ attemptStatus: undefined, document: null })).toBe('pending')
  })
})
