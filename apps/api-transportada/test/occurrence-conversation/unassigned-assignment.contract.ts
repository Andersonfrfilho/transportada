/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): a mensagem sem conversa certa espera o operador. Atribuir grava a mensagem na
 * conversa escolhida — com o horário em que chegou, não o de agora — e marca quem e quando, uma vez
 * só. A escolha fica entre as candidatas (conversas abertas da contratante daquele número): nunca uma
 * conversa qualquer.
 */
import { describe, expect, test } from 'bun:test'

import type {
  UnassignedAssignmentTransactionPort,
  UnassignedMessageRecord,
} from '../../src/occurrence-conversation/application/occurrence-conversation-unassigned.port.js'
import { createAssignUnassignedMessageUseCase } from '../../src/occurrence-conversation/application/occurrence-conversation-unassigned.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000183801'
const USER_ID = '00000000-0000-4000-8000-000000183802'
const NOW = new Date('2026-09-24T16:00:00.000Z')

const PENDING: UnassignedMessageRecord = {
  assignedAt: null,
  bodyText: 'Qual das duas?',
  candidateConversationIds: ['conversation-a', 'conversation-b'],
  channel: 'whatsapp',
  id: 'unassigned-1',
  mailMessageId: null,
  providerMessageId: 'wamid.in-1',
  receivedAt: new Date('2026-09-24T15:00:00.000Z'),
  senderAddress: '5511987654321',
}

function createFixture(record: null | UnassignedMessageRecord) {
  const writes: { kind: string; input: unknown }[] = []
  const transaction: UnassignedAssignmentTransactionPort = {
    async insertConversationMessage(input) {
      writes.push({ input, kind: 'message' })
      return { id: 'message-1' }
    },
    async lockUnassigned() {
      return record
    },
    async markAssigned(input) {
      writes.push({ input, kind: 'assigned' })
    },
  }
  const useCase = createAssignUnassignedMessageUseCase({
    clock: () => NOW,
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { useCase, writes }
}

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

describe('atribuir a mensagem sem conversa (spec 183 T505)', () => {
  test('grava na conversa escolhida com o horário em que chegou, e marca quem e quando', async () => {
    const fixture = createFixture(PENDING)

    const result = await fixture.useCase.assign({
      companyId: COMPANY_ID,
      conversationId: 'conversation-b',
      unassignedId: 'unassigned-1',
      userId: USER_ID,
    })

    expect(result).toEqual({ conversationId: 'conversation-b', messageId: 'message-1' })
    expect(fixture.writes).toEqual([
      {
        input: {
          bodyText: 'Qual das duas?',
          channel: 'whatsapp',
          companyId: COMPANY_ID,
          conversationId: 'conversation-b',
          createdAt: PENDING.receivedAt,
          mailMessageId: null,
          providerMessageId: 'wamid.in-1',
          senderAddress: '5511987654321',
        },
        kind: 'message',
      },
      {
        input: {
          assignedAt: NOW,
          companyId: COMPANY_ID,
          messageId: 'message-1',
          unassignedId: 'unassigned-1',
          userId: USER_ID,
        },
        kind: 'assigned',
      },
    ])
  })

  test('conversa fora das candidatas é 422, sem gravar', async () => {
    const fixture = createFixture(PENDING)
    expect(
      await failure(() =>
        fixture.useCase.assign({
          companyId: COMPANY_ID,
          conversationId: 'conversation-of-someone-else',
          unassignedId: 'unassigned-1',
          userId: USER_ID,
        }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_ASSIGNMENT_INVALID', status: 422 })
    expect(fixture.writes).toEqual([])
  })

  test('já atribuída é 409; inexistente ou de outra empresa é 404', async () => {
    const assigned = createFixture({ ...PENDING, assignedAt: new Date() })
    expect(
      await failure(() =>
        assigned.useCase.assign({
          companyId: COMPANY_ID,
          conversationId: 'conversation-a',
          unassignedId: 'unassigned-1',
          userId: USER_ID,
        }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED', status: 409 })

    const missing = createFixture(null)
    expect(
      await failure(() =>
        missing.useCase.assign({
          companyId: COMPANY_ID,
          conversationId: 'conversation-a',
          unassignedId: 'unassigned-1',
          userId: USER_ID,
        }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UNASSIGNED_NOT_FOUND', status: 404 })
    expect([...assigned.writes, ...missing.writes]).toEqual([])
  })
})
