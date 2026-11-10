/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 (CA4, CA5, D7): liberar aplica o corpo guardado e é idempotente; descartar não cria nada e fica auditado.
 */
import { describe, expect, it } from 'bun:test'

import {
  discardFieldReportHold,
  releaseFieldReportHold,
  type FieldReportHoldDecisionRepository,
} from '../../src/trips/application/decide-field-report-hold.use-case.js'
import type { FieldReportHoldRecord } from '../../src/trips/infrastructure/drizzle-field-report-hold.repository.js'

const COMPANY = 'company'
const DECIDER = 'decider'

function createFixture() {
  let hold: FieldReportHoldRecord = {
    actorUserId: 'driver',
    decidedAt: null,
    decidedByUserId: null,
    decisionReason: null,
    id: 'hold-1',
    occurredAt: new Date('2026-11-09T13:00:00Z'),
    operation: 'document.occurrence',
    payload: { idempotencyKey: 'key-1' },
    probableDuplicateOf: null,
    receivedAt: new Date('2026-11-10T17:00:00Z'),
    releasedResultId: null,
    state: 'held',
    tappedAt: new Date('2026-11-09T13:00:00Z'),
    tripDocumentId: 'document',
  }
  const decisions: unknown[] = []
  const repository: FieldReportHoldDecisionRepository = {
    decide: async (input) => {
      decisions.push(input)
      if (hold.state !== 'held') return false
      hold = {
        ...hold,
        decidedAt: new Date(),
        decidedByUserId: input.decidedByUserId,
        decisionReason: input.reason,
        releasedResultId: input.releasedResultId,
        state: input.state,
      }
      return true
    },
    findById: async ({ companyId, id }) => (companyId === COMPANY && id === hold.id ? hold : null),
    list: async () => [hold],
  }
  const registered: unknown[] = []
  const register = async (payload: Readonly<Record<string, unknown>>) => {
    registered.push(payload)
    return { id: 'occurrence-1' }
  }

  return { decisions, register, registered, repository }
}

describe('decisão do relato retido', () => {
  it('CA4: liberar registra com o corpo guardado e a segunda liberação não registra de novo', async () => {
    const { register, registered, repository } = createFixture()
    const dependencies = { register, repository }
    const first = await releaseFieldReportHold(dependencies, {
      companyId: COMPANY,
      deciderUserId: DECIDER,
      id: 'hold-1',
    })
    const second = await releaseFieldReportHold(dependencies, {
      companyId: COMPANY,
      deciderUserId: DECIDER,
      id: 'hold-1',
    })
    expect(first).toEqual({ id: 'hold-1', releasedResultId: 'occurrence-1', state: 'released' })
    expect(second).toEqual(first)
    expect(registered).toEqual([{ idempotencyKey: 'key-1' }])
  })

  it('CA5: descartar não registra nada e guarda quem e por quê', async () => {
    const { decisions, register, registered, repository } = createFixture()
    const result = await discardFieldReportHold(
      { register, repository },
      { companyId: COMPANY, deciderUserId: DECIDER, id: 'hold-1', reason: 'já resolvido pelo bot' },
    )
    expect(result.state).toBe('discarded')
    expect(registered).toHaveLength(0)
    expect(decisions).toEqual([
      expect.objectContaining({ decidedByUserId: DECIDER, reason: 'já resolvido pelo bot' }),
    ])
  })

  it('liberar um descartado (ou descartar um liberado) é recusado', async () => {
    const { register, repository } = createFixture()
    const dependencies = { register, repository }
    await discardFieldReportHold(dependencies, {
      companyId: COMPANY,
      deciderUserId: DECIDER,
      id: 'hold-1',
      reason: null,
    })
    await expect(
      releaseFieldReportHold(dependencies, {
        companyId: COMPANY,
        deciderUserId: DECIDER,
        id: 'hold-1',
      }),
    ).rejects.toMatchObject({ code: 'FIELD_REPORT_HOLD_ALREADY_DECIDED' })
  })

  it('o relato de outra empresa é inalcançável', async () => {
    const { register, repository } = createFixture()
    await expect(
      releaseFieldReportHold(
        { register, repository },
        { companyId: 'other-company', deciderUserId: DECIDER, id: 'hold-1' },
      ),
    ).rejects.toMatchObject({ code: 'FIELD_REPORT_HOLD_NOT_FOUND' })
  })
})
