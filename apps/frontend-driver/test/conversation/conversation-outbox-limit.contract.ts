/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import type {
  ConversationOutboxStore,
  OutboxEvent,
} from '../../src/modules/conversation/shared/conversationOutbox.types'
import { discardConversationOutbox } from '../../src/modules/conversation/shared/conversationOutboxDiscard.service'
import {
  CONVERSATION_OUTBOX_LIMIT,
  DRIVER_CONVERSATION_ERROR,
} from '../../src/modules/conversation/shared/driverConversation.constant'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT = { subjectId: 'trip-1', subjectType: 'trip' } as const
const MEBIBYTE = 1024 * 1024

/** Um arquivo que diz ter `sizeBytes`: alocar 48 MiB por teste só mediria o coletor de lixo. */
function fileOfSize(sizeBytes: number, name = 'audio.webm'): File {
  const file = new File([new Uint8Array(8)], name, { type: 'audio/webm' })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

function createHarness(store: ConversationOutboxStore = createMemoryOutboxStore()) {
  const events: OutboxEvent[] = []
  const outbox = createConversationOutbox({
    getOwnerKey: () => 'owner-1',
    random: () => 0.5,
    runExclusive: (run) => run(),
    store,
  })
  outbox.subscribe((event) => events.push(event))
  return { events, outbox, store }
}

const input = (clientMessageId: string, files: readonly File[] = [], text = 'oi') => ({
  clientMessageId,
  files,
  subject: SUBJECT,
  text,
})

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

describe('teto da fila de conversa (spec 264 T4.2, contract.md §5.4)', () => {
  it('o teto é de 100 mensagens e 48 MiB de arquivo', () => {
    expect(CONVERSATION_OUTBOX_LIMIT).toEqual({ maxCount: 100, maxFileBytes: 48 * MEBIBYTE })
  })

  it('texto entra sempre até o teto de itens, mesmo com a cota de áudio cheia', async () => {
    const { outbox } = createHarness()
    await outbox.enqueue(input('audio-1', [fileOfSize(48 * MEBIBYTE)]))

    for (let index = 0; index < CONVERSATION_OUTBOX_LIMIT.maxCount - 1; index += 1) {
      await outbox.enqueue(input(`text-${index}`))
    }

    expect(await outbox.listPending()).toHaveLength(CONVERSATION_OUTBOX_LIMIT.maxCount)
  })

  it('a 101ª mensagem é recusada, de texto que seja, antes de gravar', async () => {
    const { events, outbox, store } = createHarness()
    for (let index = 0; index < CONVERSATION_OUTBOX_LIMIT.maxCount; index += 1) {
      await outbox.enqueue(input(`text-${index}`))
    }

    const error = await captureRejection(outbox.enqueue(input('one-too-many')))

    expect(error).toBeInstanceOf(DriverConversationRequestError)
    expect((error as DriverConversationRequestError).code).toBe(
      DRIVER_CONVERSATION_ERROR.OUTBOX_FULL,
    )
    expect((await store.readAll()).map((message) => message.clientMessageId)).not.toContain(
      'one-too-many',
    )
    expect(events.filter((event) => event.type === 'enqueue-refused')).toHaveLength(1)
  })

  it('arquivos somados acima de 48 MiB: recusa a mensagem com arquivo e guarda a que já estava', async () => {
    const { events, outbox, store } = createHarness()
    await outbox.enqueue(input('audio-1', [fileOfSize(30 * MEBIBYTE)]))

    const error = await captureRejection(
      outbox.enqueue(input('audio-2', [fileOfSize(18 * MEBIBYTE + 1)])),
    )

    expect((error as DriverConversationRequestError).code).toBe(
      DRIVER_CONVERSATION_ERROR.OUTBOX_FULL,
    )
    expect((await store.readAll()).map((message) => message.clientMessageId)).toEqual(['audio-1'])
    expect(events.map((event) => event.type)).toEqual(['pending-changed', 'enqueue-refused'])
  })

  it('no limite exato de 48 MiB ainda entra', async () => {
    const { outbox } = createHarness()
    await outbox.enqueue(input('audio-1', [fileOfSize(30 * MEBIBYTE)]))

    await outbox.enqueue(input('audio-2', [fileOfSize(18 * MEBIBYTE)]))

    expect(await outbox.listPending()).toHaveLength(2)
  })

  it('QuotaExceededError do armazenamento é recusa, não erro cru', async () => {
    const memory = createMemoryOutboxStore()
    const store: ConversationOutboxStore = {
      ...memory,
      put: () => Promise.reject(new DOMException('quota', 'QuotaExceededError')),
    }
    const { events, outbox } = createHarness(store)

    const error = await captureRejection(outbox.enqueue(input('audio-1', [fileOfSize(MEBIBYTE)])))

    expect((error as DriverConversationRequestError).code).toBe(
      DRIVER_CONVERSATION_ERROR.OUTBOX_FULL,
    )
    expect(events.map((event) => event.type)).toEqual(['enqueue-refused'])
  })

  it('outro erro do armazenamento continua erro: só a cota vira recusa', async () => {
    const store: ConversationOutboxStore = {
      ...createMemoryOutboxStore(),
      put: () => Promise.reject(new Error('disk on fire')),
    }
    const { outbox } = createHarness(store)

    const error = await captureRejection(outbox.enqueue(input('audio-1')))

    expect((error as Error).message).toBe('disk on fire')
  })

  it('a recusada nunca esteve na fila: "Sair" descarta só o que estava lá', async () => {
    const { outbox, store } = createHarness()
    await outbox.enqueue(input('audio-1', [fileOfSize(40 * MEBIBYTE)]))
    await captureRejection(outbox.enqueue(input('audio-2', [fileOfSize(10 * MEBIBYTE)])))

    const result = await discardConversationOutbox({ ownerKey: 'owner-1', store })

    expect(result).toEqual({ discardedCount: 1, status: 'discarded' })
    expect(await store.readAll()).toEqual([])
  })
})
