/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { cteIssuanceAttempts } from '../../src/database/database.schema.js'
import { mapCteIssuanceAttempt } from '../../src/cte-issuance/infrastructure/cte-issuance-attempt.mapper.js'

type IssuanceAttemptRecord = typeof cteIssuanceAttempts.$inferSelect

const ATTEMPT_ID = '4c1f1a4c-6f4c-4a5e-9c0a-2f1b4d6e8a01'
const BATCH_ID = '4c1f1a4c-6f4c-4a5e-9c0a-2f1b4d6e8a02'
const BATCH_ITEM_ID = '4c1f1a4c-6f4c-4a5e-9c0a-2f1b4d6e8a03'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

function buildAttemptRecord(overrides: Partial<IssuanceAttemptRecord> = {}): IssuanceAttemptRecord {
  return {
    attemptKind: 'issue',
    attemptNumber: 2n,
    batchId: BATCH_ID,
    batchItemId: BATCH_ITEM_ID,
    companyId: COMPANY_ID,
    correlationId: 'correlation-001',
    createdAt: new Date('2026-07-27T12:00:00.000Z'),
    fiscalEnvironment: 'homologation',
    fiscalNumber: 138n,
    fiscalSeries: '1',
    id: ATTEMPT_ID,
    idempotencyFingerprint: 'fingerprint-001',
    idempotencyKey: 'idempotency-001',
    lastErrorCause: null,
    lastErrorCode: null,
    requestFingerprint: 'fingerprint-001',
    reservationId: '4c1f1a4c-6f4c-4a5e-9c0a-2f1b4d6e8a04',
    status: 'in_flight',
    updatedAt: new Date('2026-07-27T12:00:00.000Z'),
    ...overrides,
  }
}

describe('mapCteIssuanceAttempt — contrato do retorno de createIssuance', () => {
  test('devolve ambiente, série e número fiscais reservados', () => {
    const attempt = mapCteIssuanceAttempt(buildAttemptRecord())

    expect(attempt.fiscalEnvironment).toBe('homologation')
    expect(attempt.fiscalSeries).toBe('1')
    expect(attempt.fiscalNumber).toBe('138')
  })

  test('repete os campos fiscais no contexto consumido pelo caso de uso', () => {
    const attempt = mapCteIssuanceAttempt(
      buildAttemptRecord({ fiscalEnvironment: 'production', fiscalNumber: 9007199254740993n }),
    )

    expect(attempt.context.fiscalEnvironment).toBe('production')
    expect(attempt.context.fiscalSeries).toBe('1')
    expect(attempt.context.fiscalNumber).toBe('9007199254740993')
  })

  test('identifica a tentativa persistida', () => {
    const attempt = mapCteIssuanceAttempt(buildAttemptRecord({ attemptKind: 'reprocess' }))

    expect(attempt.attemptId).toBe(ATTEMPT_ID)
    expect(attempt.attemptKind).toBe('reprocess')
    expect(attempt.attemptNumber).toBe('2')
    expect(attempt.attemptFingerprint).toBe('fingerprint-001')
    expect(attempt.batchId).toBe(BATCH_ID)
    expect(attempt.companyId).toBe(COMPANY_ID)
    expect(attempt.context.batchItemId).toBe(BATCH_ITEM_ID)
  })

  test('reconhece a tentativa de cancelamento fiscal', () => {
    const attempt = mapCteIssuanceAttempt(buildAttemptRecord({ attemptKind: 'cancel' }))

    expect(attempt.attemptKind).toBe('cancel')
  })

  test('recusa tipo de tentativa fora do contrato', () => {
    const unsupported = { attemptKind: 'inutilizacao' } as unknown as Partial<IssuanceAttemptRecord>

    expect(() => mapCteIssuanceAttempt(buildAttemptRecord(unsupported))).toThrow(
      'CTE_ISSUANCE_UNSUPPORTED_ATTEMPT_KIND',
    )
  })
})
