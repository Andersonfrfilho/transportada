/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type {
  ConversationOutboxStore,
  OutboxMessage,
} from '../../src/modules/conversation/shared/conversationOutbox.types'
import {
  countOwnedPendingMessages,
  discardConversationOutbox,
  discardOrphanedConversationOutbox,
  requestSignOut,
} from '../../src/modules/conversation/shared/conversationOutboxDiscard.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function message(input: {
  readonly id: string
  readonly ownerKey: string
  readonly state?: 'failed' | 'queued'
}): OutboxMessage {
  return {
    attachments: [
      { id: `upload-${input.id}`, kind: 'image' },
    ] as unknown as OutboxMessage['attachments'],
    attempts: 0,
    clientMessageId: input.id,
    createdAt: '2026-10-09T12:00:00.000Z',
    files: [{ blob: new Blob(['photo']), name: 'photo.jpg', size: 5, type: 'image/jpeg' }],
    ownerKey: input.ownerKey,
    state: input.state ?? 'queued',
    subject: { subjectId: 'occurrence-a', subjectType: 'occurrence' },
    text: 'texto privado',
  }
}

async function seed(store: ConversationOutboxStore): Promise<void> {
  await store.put(message({ id: 'own-1', ownerKey: OWNER }))
  await store.put(message({ id: 'own-2', ownerKey: OWNER, state: 'failed' }))
  await store.put(message({ id: 'other-1', ownerKey: OTHER }))
}

async function idsOf(store: ConversationOutboxStore): Promise<readonly string[]> {
  return (await store.readAll()).map((item) => item.clientMessageId).toSorted()
}

const BROKEN_STORE: ConversationOutboxStore = {
  put: () => Promise.reject(new Error('idb')),
  readAll: () => Promise.reject(new Error('idb')),
  remove: () => Promise.reject(new Error('idb')),
}

describe('descarte do outbox de mensagens (LGPD, T1b.7)', () => {
  it('descartar o dono apaga só as mensagens dele, com anexos', async () => {
    const store = createMemoryOutboxStore()
    await seed(store)

    const result = await discardConversationOutbox({ ownerKey: OWNER, store })

    expect(result).toEqual({ discardedCount: 2, status: 'discarded' })
    expect(await idsOf(store)).toEqual(['other-1'])
  })

  it('descartar sem nada é idempotente', async () => {
    const store = createMemoryOutboxStore()

    const result = await discardConversationOutbox({ ownerKey: OWNER, store })

    expect(result).toEqual({ discardedCount: 0, status: 'discarded' })
  })

  it('órfãos de outro dono saem e os do dono atual ficam', async () => {
    const store = createMemoryOutboxStore()
    await seed(store)

    const result = await discardOrphanedConversationOutbox({ currentOwnerKey: OWNER, store })

    expect(result).toEqual({ discardedCount: 1, status: 'discarded' })
    expect(await idsOf(store)).toEqual(['own-1', 'own-2'])
  })

  it('conta as pendentes do dono, queued e failed', async () => {
    const store = createMemoryOutboxStore()
    await seed(store)

    expect(await countOwnedPendingMessages({ ownerKey: OWNER, store })).toBe(2)
    expect(await countOwnedPendingMessages({ ownerKey: undefined, store })).toBe(0)
  })

  it('falha do store não lança: descarte devolve failed e a contagem vira 0', async () => {
    expect(await discardConversationOutbox({ ownerKey: OWNER, store: BROKEN_STORE })).toEqual({
      status: 'failed',
    })
    expect(
      await discardOrphanedConversationOutbox({ currentOwnerKey: OWNER, store: BROKEN_STORE }),
    ).toEqual({ status: 'failed' })
    expect(await countOwnedPendingMessages({ ownerKey: OWNER, store: BROKEN_STORE })).toBe(0)
  })
})

describe('requestSignOut', () => {
  it('sem pendência (eventos e chat) sai direto, sem aviso', async () => {
    const decision = await requestSignOut({
      countChatMessages: () => Promise.resolve(0),
      ownEventCount: 0,
    })

    expect(decision).toEqual({ step: 'sign-out' })
  })

  it('só mensagem do chat pendente pede confirmação com a contagem', async () => {
    const decision = await requestSignOut({
      countChatMessages: () => Promise.resolve(3),
      ownEventCount: 0,
    })

    expect(decision).toEqual({ chatMessageCount: 3, step: 'confirm', totalCount: 3 })
  })

  it('o total do aviso soma a fila de eventos e as mensagens', async () => {
    const decision = await requestSignOut({
      countChatMessages: () => Promise.resolve(2),
      ownEventCount: 4,
    })

    expect(decision).toEqual({ chatMessageCount: 2, step: 'confirm', totalCount: 6 })
  })
})

describe('fiação do descarte (fonte)', () => {
  const profile = readFileSync(
    new URL('../../src/modules/driver-trip/pages/DriverProfile.page.tsx', import.meta.url),
    'utf8',
  )
  const boot = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8')

  it('o Perfil pede a decisão ao clicar em Sair e descarta o outbox antes do logout', () => {
    expect(profile).toContain('requestSignOut(')
    expect(profile).toContain('discardCurrentConversationOutbox')
    expect(profile.indexOf('discardCurrentConversationOutbox')).toBeLessThan(
      profile.indexOf('logout: () =>'),
    )
    expect(profile).toContain("t('profile.signOutPending.chatNotice'")
  })

  it('o boot descarta o outbox de outros donos logo que conhece o dono atual', () => {
    expect(boot).toContain('discardOrphanedConversationOutboxFor(subHash)')
    expect(boot.indexOf('setDriverConversationOwner(subHash)')).toBeLessThan(
      boot.indexOf('discardOrphanedConversationOutboxFor(subHash)'),
    )
  })
})
