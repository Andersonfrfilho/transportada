/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { OutboxMessage } from '../../src/modules/conversation/shared/conversationOutbox.types'
import { toPendingMessage } from '../../src/modules/conversation/shared/conversationOutboxView.service'
import { toParticipantMessageCandidate } from '../../src/modules/conversation/shared/driverConversationsMapper.service'

function serverMessage(status?: unknown): unknown {
  return {
    attachments: [],
    bodyText: 'Cheguei na doca',
    clientMessageId: 'c1',
    createdAt: '2026-10-09T15:00:00.000Z',
    direction: 'inbound',
    id: 'm1',
    ...(status === undefined ? {} : { status }),
  }
}

function statusOf(raw: unknown): unknown {
  return (toParticipantMessageCandidate(raw) as { status: unknown }).status
}

function outboxMessage(state: OutboxMessage['state']): OutboxMessage {
  return {
    attempts: 0,
    clientMessageId: 'c1',
    createdAt: '2026-10-09T15:00:00.000Z',
    files: [],
    ownerKey: 'owner',
    state,
    subject: { subjectId: 'doc-1', subjectType: 'document' },
    text: 'oi',
  }
}

describe('estados de entrega da mensagem do motorista (spec 260 T5.4)', () => {
  it('delivered e read do servidor chegam ao pacote (dois ticks cinza e azul)', () => {
    expect(statusOf(serverMessage('delivered'))).toBe('delivered')
    expect(statusOf(serverMessage('read'))).toBe('read')
  })

  it('sem status (rota antiga) ou valor desconhecido segue sem status, como antes', () => {
    expect(statusOf(serverMessage())).toBeUndefined()
    expect(statusOf(serverMessage(null))).toBeUndefined()
    expect(statusOf(serverMessage('teleported'))).toBeUndefined()
  })

  it('o outbox vira pendência do pacote: na fila e falhou (reenviar)', () => {
    expect(toPendingMessage(outboxMessage('queued')).state).toBe('queued')
    expect(toPendingMessage(outboxMessage('failed')).state).toBe('failed')
  })
})
