/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  drainQueueWithAttachments,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  drainQueue,
  type OfflineQueueStore,
  type QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

/**
 * Spec 254 T1.3 (RF8, CA3/CA4) para a fila de anexos: o mesmo espaçamento do temporizador
 * (30 s × 2, teto 10 min) vale para o evento e para o anexo, e "Enviar agora" o ignora. API
 * futura: `origin`, `now` e `random` em `drainQueueWithAttachments`; `attempts` e `lastAttemptAt`
 * no item de anexo — por isso a chamada passa por um tipo local.
 */
type DrainOrigin = 'immediate' | 'timer'

type BackoffAttachment = QueuedAttachment & Readonly<{ attempts?: number; lastAttemptAt?: string }>

type BackoffDrainInput = Readonly<{
  attachmentStore: AttachmentStore
  now: Date
  origin: DrainOrigin
  random: () => number
  send: (stamped: unknown) => Promise<AttachmentSendOutcome>
  sendAttachment: (attachment: QueuedAttachment) => Promise<AttachmentSendOutcome>
  store: OfflineQueueStore
}>

const drainWithOrigin = drainQueueWithAttachments as unknown as (
  input: BackoffDrainInput,
) => ReturnType<typeof drainQueueWithAttachments>

const PINNED_RANDOM = () => 0.5
const TICK_MILLISECONDS = 30_000
const START_MILLISECONDS = Date.parse('2026-10-07T12:00:00.000Z')
const NETWORK_DOWN: AttachmentSendOutcome = { kind: 'failed-network' }

function clockAt(tick: number): Date {
  return new Date(START_MILLISECONDS + tick * TICK_MILLISECONDS)
}

function createMemoryQueue(initial: readonly QueuedReport[] = []) {
  let items = [...initial]
  const store: OfflineQueueStore = {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
  return store
}

function createMemoryAttachments(
  groups: readonly (readonly [string, readonly QueuedAttachment[]])[],
) {
  const entries = new Map<string, readonly QueuedAttachment[]>(groups)
  const store: AttachmentStore & { readonly entries: () => typeof entries } = {
    entries: () => entries,
    read: (eventKey) => Promise.resolve(entries.get(eventKey) ?? []),
    readAll: () =>
      Promise.resolve([...entries.entries()].map(([key, items]) => [key, items] as const)),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: (eventKey) => {
      entries.delete(eventKey)
      return Promise.resolve()
    },
    update: (input) => {
      const next = input.mutate(entries.get(input.eventKey) ?? [])
      if (next.length === 0) entries.delete(input.eventKey)
      else entries.set(input.eventKey, [...next])
      return Promise.resolve(next)
    },
  }
  return store
}

function buildAttachment(input: {
  documentId: string
  attempts?: number
  lastAttemptAt?: string
}): QueuedAttachment {
  const attachment: BackoffAttachment = {
    attachmentKey: `anexo-${input.documentId}`,
    blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
    capturedAt: clockAt(0).toISOString(),
    documentId: input.documentId,
    fileName: 'canhoto.jpg',
    kind: 'photo',
    ...(input.attempts === undefined ? {} : { attempts: input.attempts }),
    ...(input.lastAttemptAt === undefined ? {} : { lastAttemptAt: input.lastAttemptAt }),
  }
  return attachment
}

function buildReport(input: {
  key: string
  attempts: number
  lastAttemptAt?: string
  rejectionCause?: string
}): QueuedReport {
  const base: QueuedReport = {
    attempts: input.attempts,
    createdAt: clockAt(0).toISOString(),
    report: {
      documentId: 'document-1',
      idempotencyKey: input.key,
      kind: 'deliver',
      location: null,
    },
  }
  return input.lastAttemptAt === undefined ? base : { ...base, lastAttemptAt: input.lastAttemptAt }
}

function readAttachmentField(
  attachment: QueuedAttachment | undefined,
  field: 'attempts' | 'lastAttemptAt',
): unknown {
  return (attachment as BackoffAttachment | undefined)?.[field]
}

describe('a drenagem de anexos espaça o reenvio do temporizador (spec 254)', () => {
  async function runTicks(input: { origin: DrainOrigin; ticks: number }) {
    const attachmentStore = createMemoryAttachments([
      ['document:document-1', [buildAttachment({ documentId: 'document-1' })]],
    ])
    let sends = 0

    for (let tick = 0; tick < input.ticks; tick += 1) {
      await drainWithOrigin({
        attachmentStore,
        now: clockAt(tick),
        origin: input.origin,
        random: PINNED_RANDOM,
        send: () => Promise.resolve({ kind: 'sent' }),
        sendAttachment: () => {
          sends += 1
          return Promise.resolve(NETWORK_DOWN)
        },
        store: createMemoryQueue(),
      })
    }

    return { attachment: attachmentStore.entries().get('document:document-1')?.[0], sends }
  }

  it('20 ticks de 30 s com a rede caída fazem 5 envios do anexo, não 20', async () => {
    const { attachment, sends } = await runTicks({ origin: 'timer', ticks: 20 })

    expect(sends).toBeLessThan(20)
    expect(sends).toBe(5)
    expect(readAttachmentField(attachment, 'attempts')).toBe(5)
    expect(readAttachmentField(attachment, 'lastAttemptAt')).toBe(clockAt(15).toISOString())
  })

  it('"Enviar agora" (immediate) ignora o espaçamento do anexo', async () => {
    const { sends } = await runTicks({ origin: 'immediate', ticks: 20 })

    expect(sends).toBe(20)
  })

  it('o anexo continua na fila depois de 100 ticks (spec 227 D1)', async () => {
    const { attachment, sends } = await runTicks({ origin: 'timer', ticks: 100 })

    expect(sends).toBe(9)
    expect(attachment).toBeDefined()
  })

  it('anexo em espera na frente PARA a drenagem do temporizador: o grupo de trás não sobe', async () => {
    const now = clockAt(10)
    const waiting = buildAttachment({
      attempts: 1,
      documentId: 'document-1',
      lastAttemptAt: new Date(now.getTime() - 1_000).toISOString(),
    })
    const behind = buildAttachment({ documentId: 'document-2' })
    const attachmentStore = createMemoryAttachments([
      ['document:document-1', [waiting]],
      ['document:document-2', [behind]],
    ])
    const sentKeys: string[] = []
    const sendAttachment = (attachment: QueuedAttachment) => {
      sentKeys.push(attachment.attachmentKey)
      return Promise.resolve<AttachmentSendOutcome>({ kind: 'sent' })
    }
    const input = {
      attachmentStore,
      now,
      random: PINNED_RANDOM,
      send: () => Promise.resolve<AttachmentSendOutcome>({ kind: 'sent' }),
      sendAttachment,
      store: createMemoryQueue(),
    }

    await drainWithOrigin({ ...input, origin: 'timer' })

    expect(sentKeys).toEqual([])
    expect(
      readAttachmentField(attachmentStore.entries().get('document:document-1')?.[0], 'attempts'),
    ).toBe(1)

    await drainWithOrigin({ ...input, origin: 'immediate' })

    expect(sentKeys).toEqual(['anexo-document-1', 'anexo-document-2'])
  })

  it('evento em espera na frente PARA o temporizador: nem evento de trás nem anexo saem', async () => {
    const now = clockAt(10)
    const store = createMemoryQueue([
      buildReport({
        attempts: 2,
        key: 'cheguei',
        lastAttemptAt: new Date(now.getTime() - 1_000).toISOString(),
      }),
      buildReport({ attempts: 0, key: 'entreguei' }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['document:document-9', [buildAttachment({ documentId: 'document-9' })]],
    ])
    const calls: string[] = []

    await drainWithOrigin({
      attachmentStore,
      now,
      origin: 'timer',
      random: PINNED_RANDOM,
      send: () => {
        calls.push('send')
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => {
        calls.push('sendAttachment')
        return Promise.resolve({ kind: 'sent' })
      },
      store,
    })

    expect(calls).toEqual([])
    expect((await store.read()).map((item) => item.attempts)).toEqual([2, 0])
  })

  it('o evento que a rede recusa ganha lastAttemptAt e o espaçamento vale para ele', async () => {
    const store = createMemoryQueue([buildReport({ attempts: 0, key: 'cheguei' })])
    let sends = 0

    for (let tick = 0; tick < 20; tick += 1) {
      await drainWithOrigin({
        attachmentStore: createMemoryAttachments([]),
        now: clockAt(tick),
        origin: 'timer',
        random: PINNED_RANDOM,
        send: () => {
          sends += 1
          return Promise.resolve(NETWORK_DOWN)
        },
        sendAttachment: () => Promise.resolve({ kind: 'sent' }),
        store,
      })
    }

    const [item] = await store.read()
    expect(sends).toBe(5)
    expect(item?.attempts).toBe(5)
    expect((item as { lastAttemptAt?: string } | undefined)?.lastAttemptAt).toBe(
      clockAt(15).toISOString(),
    )
  })
})

describe('lastAttemptAt sobrevive à remontagem do item recusado (spec 254)', () => {
  it('o evento recusado pelo servidor mantém attempts e lastAttemptAt', async () => {
    const lastAttemptAt = clockAt(0).toISOString()
    const store = createMemoryQueue([buildReport({ attempts: 3, key: 'cheguei', lastAttemptAt })])

    await drainWithOrigin({
      attachmentStore: createMemoryAttachments([]),
      now: clockAt(100),
      origin: 'immediate',
      random: PINNED_RANDOM,
      send: () => Promise.resolve({ cause: 'recusado', kind: 'rejected' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    const [item] = await store.read()
    expect(item?.rejectionCause).toBe('recusado')
    expect(item?.attempts).toBe(3)
    expect((item as { lastAttemptAt?: string } | undefined)?.lastAttemptAt).toBe(lastAttemptAt)
  })

  it('o anexo recusado pelo servidor mantém attempts e lastAttemptAt', async () => {
    const lastAttemptAt = clockAt(0).toISOString()
    const attachmentStore = createMemoryAttachments([
      [
        'document:document-1',
        [buildAttachment({ attempts: 2, documentId: 'document-1', lastAttemptAt })],
      ],
    ])

    await drainWithOrigin({
      attachmentStore,
      now: clockAt(100),
      origin: 'immediate',
      random: PINNED_RANDOM,
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment: () => Promise.resolve({ cause: 'recusado', kind: 'rejected' }),
      store: createMemoryQueue(),
    })

    const attachment = attachmentStore.entries().get('document:document-1')?.[0]
    expect(attachment?.rejectionCause).toBe('recusado')
    expect(readAttachmentField(attachment, 'attempts')).toBe(2)
    expect(readAttachmentField(attachment, 'lastAttemptAt')).toBe(lastAttemptAt)
  })
})

describe('a drenagem diz ao envio qual tentativa é esta (spec 254 RF1)', () => {
  it('drainQueueWithAttachments: item com 3 tentativas gravadas envia como a 4ª', async () => {
    const received: unknown[] = []
    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments([]),
      now: clockAt(0),
      origin: 'immediate',
      send: ((_stamped: unknown, options: unknown) => {
        received.push(options)
        return Promise.resolve({ kind: 'sent' })
      }) as never,
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store: createMemoryQueue([buildReport({ attempts: 3, key: 'cheguei' })]),
    })

    expect(received).toEqual([{ attempt: 4 }])
  })

  it('drainQueue: item novo envia como a 1ª tentativa', async () => {
    const received: unknown[] = []
    await drainQueue({
      now: clockAt(0),
      origin: 'immediate',
      send: ((_stamped: unknown, options: unknown) => {
        received.push(options)
        return Promise.resolve('sent')
      }) as never,
      store: createMemoryQueue([buildReport({ attempts: 0, key: 'cheguei' })]),
    })

    expect(received).toEqual([{ attempt: 1 }])
  })
})
