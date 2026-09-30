/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF31 (T6.6/T6.8): a trilha da conferência e a verificação por objeto. O comportamento
 * contra Postgres real — travar a linha, o `ON CONFLICT` da recaptura — está em
 * `test/integration/trip-delivery-proof-canhoto.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { reviewCanhotoProof } from '../../src/trips/application/review-canhoto-proof.use-case.js'
import type {
  CanhotoReviewAuditEntry,
  CanhotoReviewCommand,
  CanhotoReviewUnitOfWork,
  LockedCanhotoProof,
} from '../../src/trips/application/canhoto-review.port.js'
import { CanhotoReviewProofNotFoundError } from '../../src/trips/domain/canhoto-review.error.js'

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
const PROOF_ID = '00000000-0000-4000-8000-0000000000f1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000e1'
const CLIENT_IP = '203.0.113.7'
const CORRELATION_ID = 'canhoto-review-correlation'

const PENDING_PROOF: LockedCanhotoProof = {
  id: PROOF_ID,
  review: 'pending',
  reviewOrigin: null,
}

function createFixture(proof: LockedCanhotoProof | null = PENDING_PROOF) {
  const applied: unknown[] = []
  const audits: CanhotoReviewAuditEntry[] = []
  const locked: unknown[] = []
  const unitOfWork: CanhotoReviewUnitOfWork = {
    execute: (run) =>
      run({
        applyReview: async (params) => {
          applied.push(params)
        },
        insertAudit: async (entry) => {
          audits.push(entry)
        },
        lockCanhotoProof: async (params) => {
          locked.push(params)
          return proof
        },
        readReviewView: async () => ({
          canhotoReadNumber: null,
          canhotoReadSeries: null,
          canhotoReadSource: null,
          canhotoReview: 'approved' as const,
          canhotoReviewAt: '2026-09-30T12:00:00.000Z',
          canhotoReviewNote: null,
          canhotoReviewOrigin: 'manual' as const,
          canhotoReviewReason: null,
        }),
      }),
  }
  return { applied, audits, locked, unitOfWork }
}

function run(fixture: ReturnType<typeof createFixture>, command: CanhotoReviewCommand) {
  return reviewCanhotoProof({
    actorUserId: ACTOR_USER_ID,
    command,
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
    documentId: DOCUMENT_ID,
    ipAddress: CLIENT_IP,
    tripId: TRIP_ID,
    unitOfWork: fixture.unitOfWork,
  })
}

describe('a conferência só alcança o canhoto da própria empresa', () => {
  test('a trava carrega a empresa do contexto, a viagem e o documento', async () => {
    const fixture = createFixture()
    await run(fixture, { action: 'approve' })
    expect(fixture.locked).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, tripId: TRIP_ID },
    ])
  })

  test('canhoto de outra empresa é 404, nunca 403 — não se distingue de inexistente', async () => {
    const fixture = createFixture(null)
    await expect(run(fixture, { action: 'approve' })).rejects.toThrow(
      CanhotoReviewProofNotFoundError,
    )
    expect(fixture.applied).toEqual([])
    expect(fixture.audits).toEqual([])
  })
})

describe('a trilha de auditoria da decisão humana (RF31)', () => {
  test('aprovar grava ator, alvo, IP e instante', async () => {
    const fixture = createFixture()
    await run(fixture, { action: 'approve' })
    expect(fixture.audits).toEqual([
      {
        action: 'trip.canhoto-review.approve',
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        ipAddress: CLIENT_IP,
        proofId: PROOF_ID,
        reason: null,
        tripId: TRIP_ID,
      },
    ])
  })

  test('recusar leva o motivo fechado, e o texto livre fica de fora da trilha', async () => {
    const fixture = createFixture()
    await run(fixture, {
      action: 'reject',
      note: 'canhoto rasgado no meio, assinatura cortada ao meio',
      reason: 'other',
    })
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.audits[0]?.action).toBe('trip.canhoto-review.reject')
    expect(fixture.audits[0]?.reason).toBe('other')
    expect(JSON.stringify(fixture.audits[0])).not.toContain('rasgado')
  })

  test('repetir a mesma decisão não grava nada — nem escrita, nem trilha', async () => {
    const fixture = createFixture({ id: PROOF_ID, review: 'approved', reviewOrigin: 'manual' })
    await run(fixture, { action: 'approve' })
    expect(fixture.applied).toEqual([])
    expect(fixture.audits).toEqual([])
  })

  test('o veredito automático não gera trilha: não há ator a registrar', async () => {
    const fixture = createFixture()
    await run(fixture, {
      action: 'automatic',
      readDocumentId: DOCUMENT_ID,
      readNumber: '000012345',
      readSeries: '1',
      readSource: 'barcode',
      review: 'approved',
    })
    expect(fixture.applied).toHaveLength(1)
    expect(fixture.audits).toEqual([])
  })
})
