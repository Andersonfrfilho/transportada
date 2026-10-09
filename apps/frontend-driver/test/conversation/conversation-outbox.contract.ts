/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import type { OutboxEvent } from '../../src/modules/conversation/shared/conversationOutbox.types'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT_A = { subjectId: 'occurrence-a', subjectType: 'occurrence' } as const
const SUBJECT_B = { subjectId: 'occurrence-b', subjectType: 'occurrence' } as const
const NETWORK_FAILURE = new DriverConversationRequestError('DRIVER_CONVERSATION_REQUEST_FAILED')
const REJECTED = new DriverConversationRequestError('VALIDATION', 422)

function createHarness(ownerKey: string | undefined = 'owner-1') {
  let owner: string | undefined = ownerKey
  let clock = new Date('2026-10-09T12:00:00.000Z')
  const store = createMemoryOutboxStore()
  const events: OutboxEvent[] = []
  const outbox = createConversationOutbox({
    getOwnerKey: () => owner,
    now: () => clock,
    random: () => 0.5,
    runExclusive: (run) => run(),
    store,
  })
  outbox.subscribe((event) => events.push(event))
  return {
    advance: (milliseconds: number) => {
      clock = new Date(clock.getTime() + milliseconds)
    },
    events,
    outbox,
    setOwner: (next: string | undefined) => {
      owner = next
    },
  }
}

const message = (clientMessageId: string, subject: ParticipantSubjectRef = SUBJECT_A) => ({
  clientMessageId,
  files: [],
  subject,
  text: `texto ${clientMessageId}`,
})

describe('conversationOutbox (spec 260 T1b.3)', () => {
  it('lista só as pendentes do dono da sessão', async () => {
    const harness = createHarness('owner-1')
    await harness.outbox.enqueue(message('mine'))
    harness.setOwner('owner-2')
    await harness.outbox.enqueue(message('theirs'))

    expect((await harness.outbox.listPending()).map((item) => item.clientMessageId)).toEqual([
      'theirs',
    ])
    harness.setOwner('owner-1')
    expect((await harness.outbox.listPending()).map((item) => item.clientMessageId)).toEqual([
      'mine',
    ])
    harness.setOwner(undefined)
    expect(await harness.outbox.listPending()).toEqual([])
  })

  it('nunca entrega mensagem de outro dono', async () => {
    const harness = createHarness('owner-1')
    await harness.outbox.enqueue(message('mine'))
    harness.setOwner('owner-2')
    const delivered: string[] = []

    await harness.outbox.flush({
      deliver: (item) => Promise.resolve(void delivered.push(item.clientMessageId)),
      origin: 'immediate',
    })

    expect(delivered).toEqual([])
  })

  it('entrega em ordem de criação, uma vez, e remove da fila', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('first'))
    harness.advance(1000)
    await harness.outbox.enqueue(message('second', SUBJECT_A))
    const delivered: string[] = []
    const deliver = (item: { clientMessageId: string }) =>
      Promise.resolve(void delivered.push(item.clientMessageId))

    await harness.outbox.flush({ deliver, origin: 'immediate' })
    await harness.outbox.flush({ deliver, origin: 'immediate' })

    expect(delivered).toEqual(['first', 'second'])
    expect(await harness.outbox.listPending()).toEqual([])
  })

  it('falha de rede mantém na fila, conta a tentativa e respeita o backoff do timer', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('m1'))
    let calls = 0
    const deliver = () => {
      calls += 1
      return Promise.reject(NETWORK_FAILURE)
    }

    await harness.outbox.flush({ deliver, origin: 'immediate' })
    await harness.outbox.flush({ deliver, origin: 'timer' })
    expect(calls).toBe(1)
    expect((await harness.outbox.listPending())[0]?.state).toBe('queued')

    harness.advance(60_000)
    await harness.outbox.flush({ deliver, origin: 'timer' })
    expect(calls).toBe(2)
    await harness.outbox.flush({ deliver, origin: 'immediate' })
    expect(calls).toBe(3)
  })

  it('erro 4xx permanente vira failed e só sai de novo por reenvio manual', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('m1'))
    let calls = 0

    await harness.outbox.flush({
      deliver: () => {
        calls += 1
        return Promise.reject(REJECTED)
      },
      origin: 'immediate',
    })
    await harness.outbox.flush({ deliver: () => Promise.resolve(), origin: 'immediate' })

    expect(calls).toBe(1)
    expect((await harness.outbox.listPending())[0]?.state).toBe('failed')

    await harness.outbox.requeue('m1')
    expect((await harness.outbox.listPending())[0]?.state).toBe('queued')
    await harness.outbox.flush({ deliver: () => Promise.resolve(), origin: 'immediate' })
    expect(await harness.outbox.listPending()).toEqual([])
  })

  it('falha de rede segura as seguintes do mesmo assunto, mas não as de outro', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('a1', SUBJECT_A))
    harness.advance(1)
    await harness.outbox.enqueue(message('a2', SUBJECT_A))
    harness.advance(1)
    await harness.outbox.enqueue(message('b1', SUBJECT_B))
    const attempted: string[] = []

    await harness.outbox.flush({
      deliver: (item) => {
        attempted.push(item.clientMessageId)
        return item.clientMessageId === 'a1' ? Promise.reject(NETWORK_FAILURE) : Promise.resolve()
      },
      origin: 'immediate',
    })

    expect(attempted.toSorted()).toEqual(['a1', 'b1'])
  })

  it('avisa a conversa quando a mensagem sai ou é descartada', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('sent', SUBJECT_A))
    await harness.outbox.enqueue(message('dropped', SUBJECT_B))

    await harness.outbox.remove('dropped')
    await harness.outbox.flush({ deliver: () => Promise.resolve(), origin: 'immediate' })

    const settled = harness.events.filter((event) => event.type === 'message-settled')
    expect(settled.map((event) => event.subject.subjectId)).toEqual([
      'occurrence-b',
      'occurrence-a',
    ])
  })

  it('dois flushes simultâneos entregam uma vez só', async () => {
    const harness = createHarness()
    await harness.outbox.enqueue(message('m1'))
    let calls = 0
    const deliver = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    await Promise.all([
      harness.outbox.flush({ deliver, origin: 'immediate' }),
      harness.outbox.flush({ deliver, origin: 'immediate' }),
    ])

    expect(calls).toBe(1)
  })

  it('expõe nome, tipo e tamanho dos anexos sem o conteúdo', async () => {
    const harness = createHarness()
    const file = new File(['abc'], 'foto.jpg', { type: 'image/jpeg' })
    await harness.outbox.enqueue({ ...message('m1'), files: [file] })

    expect((await harness.outbox.listPending())[0]?.attachments).toEqual([
      { filename: 'foto.jpg', mimeType: 'image/jpeg', sizeBytes: 3 },
    ])
  })
})
