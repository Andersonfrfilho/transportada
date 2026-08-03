/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_BLOCK_REASON,
  type CteBatchBlockReason,
  type EligibilityDocument,
  resolveDocumentBlock,
} from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'

const BATCH_ID = '00000000-0000-4000-8000-000000000601'

const ELIGIBLE: EligibilityDocument = {
  grossWeight: '120.5000',
  recipientCity: 'Jundiaí',
  recipientState: 'SP',
  recipientTaxId: '12345678000199',
  senderCity: 'Campinas',
  senderState: 'SP',
  senderTaxId: '61156864000191',
  status: 'authorized',
  totalAmount: '1250.4500',
  variant: 'complete',
}

describe('CT-e batch document block contract', () => {
  test('releases an eligible document that is not linked to any batch', () => {
    const decision = resolveDocumentBlock({ document: ELIGIBLE, linkedBatchId: null })

    expect(decision.blocked).toBeUndefined()
    expect(decision.chargeable).toEqual({
      recipientTaxId: '12345678000199',
      senderTaxId: '61156864000191',
      totalAmount: '1250.4500',
    })
  })

  test('blocks a linked document and carries the batch that holds it', () => {
    const decision = resolveDocumentBlock({ document: ELIGIBLE, linkedBatchId: BATCH_ID })

    expect(decision.chargeable).toBeUndefined()
    expect(decision.blocked).toEqual({
      batchId: BATCH_ID,
      reason: CTE_BATCH_BLOCK_REASON.alreadyLinked,
    })
  })

  test('reports the eligibility failure before the link, keeping the preview order', () => {
    const decision = resolveDocumentBlock({
      document: { ...ELIGIBLE, status: 'cancelled' },
      linkedBatchId: BATCH_ID,
    })

    expect(decision.blocked).toEqual({
      batchId: null,
      reason: CTE_BATCH_BLOCK_REASON.notAuthorized,
    })
  })

  test('names every eligibility failure it can reach', () => {
    const cases: readonly (readonly [Partial<EligibilityDocument>, CteBatchBlockReason])[] = [
      [{ status: 'denied' }, CTE_BATCH_BLOCK_REASON.notAuthorized],
      [{ variant: 'summary' }, CTE_BATCH_BLOCK_REASON.summaryOnly],
      [{ totalAmount: '0.0000' }, CTE_BATCH_BLOCK_REASON.missingTotal],
      [{ senderTaxId: '61156864' }, CTE_BATCH_BLOCK_REASON.missingParty],
      [{ recipientCity: null }, CTE_BATCH_BLOCK_REASON.missingMunicipality],
      [{ grossWeight: null }, CTE_BATCH_BLOCK_REASON.missingWeight],
    ]

    for (const [override, reason] of cases) {
      const decision = resolveDocumentBlock({
        document: { ...ELIGIBLE, ...override },
        linkedBatchId: null,
      })
      expect(decision.blocked).toEqual({ batchId: null, reason })
    }
  })
})
