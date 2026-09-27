/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF14): o status que a Meta dá à mensagem vai para a mensagem da conversa, na empresa
 * do canal que recebeu o webhook, com o horário da Meta. Falha não sobe para o webhook.
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationWhatsAppStatusHook } from '../../src/occurrence-conversation/application/whatsapp-conversation-status.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000183701'
const NOW = new Date('2026-09-24T15:00:00.000Z')

describe('o status da Meta na conversa (spec 183 T502)', () => {
  test('sent, delivered, read e failed chegam com o horário da Meta', async () => {
    const applied: unknown[] = []
    const hook = createOccurrenceConversationWhatsAppStatusHook({
      apply: async (input) => void applied.push(input),
      clock: () => NOW,
      companyId: COMPANY_ID,
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    })

    for (const status of ['sent', 'delivered', 'read', 'failed'] as const) {
      await hook({ id: 'wamid.out-1', status, timestamp: '1790000000' }, null)
    }

    expect(applied).toEqual(
      ['sent', 'delivered', 'read', 'failed'].map((incoming) => ({
        at: new Date(1_790_000_000_000),
        companyId: COMPANY_ID,
        incoming,
        providerMessageId: 'wamid.out-1',
      })),
    )
  })

  test('sem horário, vale o relógio; sem id, nada', async () => {
    const applied: { at: Date }[] = []
    const hook = createOccurrenceConversationWhatsAppStatusHook({
      apply: async (input) => void applied.push(input),
      clock: () => NOW,
      companyId: COMPANY_ID,
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    })

    await hook({ id: 'wamid.out-2', status: 'delivered' }, null)
    await hook({ status: 'delivered', timestamp: '1790000000' }, null)

    expect(applied.map((input) => input.at)).toEqual([NOW])
  })

  test('falha ao gravar é registrada pelo nome do erro, e não sobe', async () => {
    const logs: unknown[] = []
    const hook = createOccurrenceConversationWhatsAppStatusHook({
      apply: async () => {
        throw new Error('database down')
      },
      clock: () => NOW,
      companyId: COMPANY_ID,
      logger: {
        error: (...args: unknown[]) => logs.push(args),
        info: () => undefined,
        warn: () => undefined,
      },
    })

    await hook({ id: 'wamid.out-3', recipient_id: '5511987654321', status: 'read' }, null)

    expect(JSON.stringify(logs)).not.toContain('5511987654321')
    expect(logs).toHaveLength(1)
  })
})
