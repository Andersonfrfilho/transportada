/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 (CA1, CA3, CA6): a retenção só entra com o interruptor ligado, o toque de outro dia e a chave ainda
 * não liquidada; o reenvio da mesma chave devolve a mesma linha.
 */
import { describe, expect, it } from 'bun:test'

import {
  holdOrRegisterDriverOccurrence,
  type FieldReportHoldPort,
  type FieldReportHoldRecordInput,
} from '../../src/trips/application/field-report-hold.port.js'

const input = {
  actorUserId: 'actor',
  companyId: 'company',
  documentId: 'document',
  idempotencyKey: 'key-1',
  occurrenceTypeId: 'type',
}
const NOW = new Date('2026-11-10T17:34:00Z')
const YESTERDAY = new Date('2026-11-09T13:02:00Z')

function createHold(overrides: Partial<FieldReportHoldPort> = {}) {
  const recorded: FieldReportHoldRecordInput[] = []
  const hold: FieldReportHoldPort = {
    findProbableDuplicate: async () => null,
    isEnabled: async () => true,
    isKeyRegistered: async () => false,
    record: async (record) => {
      recorded.push(record)
      return { id: 'hold-1' }
    },
    ...overrides,
  }

  return { hold, recorded }
}

describe('holdOrRegisterDriverOccurrence', () => {
  it('CA1: o toque de ontem fica retido e nada é registrado', async () => {
    const { hold, recorded } = createHold()
    let registered = 0
    const result = await holdOrRegisterDriverOccurrence({
      hold,
      input,
      now: NOW,
      register: async () => {
        registered += 1
        return { id: 'occurrence' }
      },
      tappedAt: YESTERDAY,
    })
    expect(result).toEqual({ id: 'hold-1', kind: 'held' })
    expect(registered).toBe(0)
    expect(recorded[0]?.tappedAt).toEqual(YESTERDAY)
    expect(recorded[0]?.payload['idempotencyKey']).toBe('key-1')
  })

  it('CA3: guarda a referência da provável duplicata', async () => {
    const { hold, recorded } = createHold({ findProbableDuplicate: async () => 'occurrence:abc' })
    await holdOrRegisterDriverOccurrence({
      hold,
      input,
      now: NOW,
      register: async () => ({ id: 'x' }),
      tappedAt: YESTERDAY,
    })
    expect(recorded[0]?.probableDuplicateOf).toBe('occurrence:abc')
  })

  it('CA6: interruptor desligado, sem tappedAt ou sem a porta registra como hoje', async () => {
    const disabled = createHold({ isEnabled: async () => false })
    const cases = [
      { hold: disabled.hold, tappedAt: YESTERDAY },
      { hold: createHold().hold, tappedAt: undefined },
      { hold: undefined, tappedAt: YESTERDAY },
    ]
    for (const testCase of cases) {
      const result = await holdOrRegisterDriverOccurrence({
        hold: testCase.hold,
        input,
        now: NOW,
        register: async () => ({ id: 'occurrence' }),
        tappedAt: testCase.tappedAt,
      })
      expect(result.kind).toBe('registered')
    }
  })

  it('toque do mesmo dia é registrado', async () => {
    const { hold } = createHold()
    const result = await holdOrRegisterDriverOccurrence({
      hold,
      input,
      now: NOW,
      register: async () => ({ id: 'occurrence' }),
      tappedAt: new Date('2026-11-10T16:00:00Z'),
    })
    expect(result.kind).toBe('registered')
  })

  it('a chave já liquidada devolve o registro, nunca vira retenção', async () => {
    const { hold, recorded } = createHold({ isKeyRegistered: async () => true })
    const result = await holdOrRegisterDriverOccurrence({
      hold,
      input,
      now: NOW,
      register: async () => ({ id: 'occurrence' }),
      tappedAt: YESTERDAY,
    })
    expect(result.kind).toBe('registered')
    expect(recorded).toHaveLength(0)
  })
})
