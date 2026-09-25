/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  countPending,
  QUEUE_DRAIN_INTERVAL_MS,
  scheduleQueueDrainTriggers,
  type DrainTriggerTarget,
} from '@/modules/driver-trip/shared/pendingQueue.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000

function report(input: { key: string; rejectionCause?: string; subHash?: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW.toISOString(),
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    report: { idempotencyKey: input.key, kind: 'arrive', location: null, stopId: 'stop-1' },
    ...(input.subHash === undefined ? {} : { subHash: input.subHash }),
  }
}

function attachment(input: {
  capturedAt?: string
  key: string
  rejectionCause?: string
  subHash?: string
}): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: input.capturedAt ?? NOW.toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    kind: 'photo',
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    ...(input.subHash === undefined ? {} : { subHash: input.subHash }),
  }
}

describe('countPending (plan D5)', () => {
  it('drainable soma eventos e anexos não recusados e não vencidos', () => {
    const counts = countPending({
      attachments: [['chave-1', [attachment({ key: 'anexo-1' })]]],
      now: NOW,
      reports: [report({ key: 'chave-1' }), report({ key: 'chave-2' })],
    })

    expect(counts).toEqual({ drainable: 3, rejected: 0, total: 3 })
  })

  it('rejected soma eventos e anexos recusados, ainda na fila', () => {
    const counts = countPending({
      attachments: [['chave-1', [attachment({ key: 'anexo-1', rejectionCause: '422 INVALID' })]]],
      now: NOW,
      reports: [report({ key: 'chave-1', rejectionCause: '409 CONFLICT' })],
    })

    expect(counts).toEqual({ drainable: 0, rejected: 2, total: 2 })
  })

  it('total é a soma de drainable e rejected', () => {
    const counts = countPending({
      attachments: [],
      now: NOW,
      reports: [report({ key: 'chave-1' }), report({ key: 'chave-2', rejectionCause: 'x' })],
    })

    expect(counts).toEqual({ drainable: 1, rejected: 1, total: 2 })
  })

  it('anexo vencido (mais de 7 dias) não entra em drainable nem em rejected', () => {
    const stale = new Date(NOW.getTime() - EIGHT_DAYS_MS).toISOString()

    const counts = countPending({
      attachments: [['chave-1', [attachment({ capturedAt: stale, key: 'anexo-1' })]]],
      now: NOW,
      reports: [],
    })

    expect(counts).toEqual({ drainable: 0, rejected: 0, total: 0 })
  })

  it('anexo vencido e de outra conta: fora por qualquer um dos dois motivos, nunca contado', () => {
    const stale = new Date(NOW.getTime() - EIGHT_DAYS_MS).toISOString()

    const counts = countPending({
      attachments: [
        ['chave-1', [attachment({ capturedAt: stale, key: 'anexo-1', subHash: OTHER })]],
      ],
      now: NOW,
      ownerSubHash: OWNER,
      reports: [],
    })

    expect(counts).toEqual({ drainable: 0, rejected: 0, total: 0 })
  })

  it('item de outra conta não entra em nenhuma contagem quando ownerSubHash é informado', () => {
    const counts = countPending({
      attachments: [['chave-1', [attachment({ key: 'anexo-1', subHash: OTHER })]]],
      now: NOW,
      ownerSubHash: OWNER,
      reports: [
        report({ key: 'chave-own', subHash: OWNER }),
        report({ key: 'chave-other', subHash: OTHER }),
      ],
    })

    expect(counts).toEqual({ drainable: 1, rejected: 0, total: 1 })
  })
})

function createFakeTarget(): DrainTriggerTarget & {
  readonly fireOnline: () => void
  readonly firePageshow: () => void
  readonly fireVisibilityChange: () => void
  readonly intervalCount: () => number
  readonly setVisible: (value: boolean) => void
  readonly tick: () => void
} {
  const listeners = {
    online: new Set<() => void>(),
    pageshow: new Set<() => void>(),
    visibilitychange: new Set<() => void>(),
  }
  const intervals = new Map<number, () => void>()
  let nextId = 1
  let isVisible = true

  return {
    addEventListener: (type, listener) => listeners[type].add(listener),
    clearInterval: (id) => intervals.delete(id),
    fireOnline: () => {
      for (const listener of [...listeners.online]) listener()
    },
    firePageshow: () => {
      for (const listener of [...listeners.pageshow]) listener()
    },
    fireVisibilityChange: () => {
      for (const listener of [...listeners.visibilitychange]) listener()
    },
    intervalCount: () => intervals.size,
    isVisible: () => isVisible,
    removeEventListener: (type, listener) => listeners[type].delete(listener),
    setInterval: (handler) => {
      const id = nextId
      nextId += 1
      intervals.set(id, handler)
      return id
    },
    setVisible: (value) => {
      isVisible = value
    },
    tick: () => {
      for (const handler of [...intervals.values()]) handler()
    },
  }
}

describe('scheduleQueueDrainTriggers (plan D5)', () => {
  it('online, pageshow e visibilitychange (visível) chamam drain', () => {
    const target = createFakeTarget()
    let drainCalls = 0

    scheduleQueueDrainTriggers({ drain: () => (drainCalls += 1), getDrainable: () => 0, target })

    target.fireOnline()
    target.firePageshow()
    target.fireVisibilityChange()

    expect(drainCalls).toBe(3)
  })

  it('visibilitychange invisível não chama drain', () => {
    const target = createFakeTarget()
    target.setVisible(false)
    let drainCalls = 0

    scheduleQueueDrainTriggers({ drain: () => (drainCalls += 1), getDrainable: () => 0, target })
    target.fireVisibilityChange()

    expect(drainCalls).toBe(0)
  })

  it('o temporizador só existe com drainable > 0', () => {
    const target = createFakeTarget()

    scheduleQueueDrainTriggers({ drain: () => undefined, getDrainable: () => 0, target })

    expect(target.intervalCount()).toBe(0)
  })

  it('drainable > 0 desde o início liga o temporizador, no intervalo de 30 s', () => {
    const target = createFakeTarget()
    let drainCalls = 0

    scheduleQueueDrainTriggers({
      drain: () => (drainCalls += 1),
      getDrainable: () => 1,
      target,
    })

    expect(target.intervalCount()).toBe(1)
    target.tick()
    expect(drainCalls).toBe(1)
    expect(QUEUE_DRAIN_INTERVAL_MS).toBe(30_000)
  })

  it('o temporizador para quando a fila zera', () => {
    const target = createFakeTarget()
    let drainable = 1

    scheduleQueueDrainTriggers({
      drain: () => {
        drainable = 0
      },
      getDrainable: () => drainable,
      target,
    })

    expect(target.intervalCount()).toBe(1)
    target.tick()

    expect(target.intervalCount()).toBe(0)
  })

  it('online liga o temporizador quando a fila passa a ter pendência', () => {
    const target = createFakeTarget()
    let drainable = 0

    scheduleQueueDrainTriggers({ drain: () => undefined, getDrainable: () => drainable, target })
    expect(target.intervalCount()).toBe(0)

    drainable = 1
    target.fireOnline()

    expect(target.intervalCount()).toBe(1)
  })

  it('a fila ganhar pendência no meio da sessão liga o temporizador, sem esperar gatilho', () => {
    const target = createFakeTarget()
    let drainable = 0
    let syncQueue: () => void = () => undefined

    scheduleQueueDrainTriggers({
      drain: () => undefined,
      getDrainable: () => drainable,
      onQueueSync: (sync) => {
        syncQueue = sync
      },
      target,
    })
    expect(target.intervalCount()).toBe(0)

    /** O toque enfileira com sinal fraco: `online` nunca dispara, e a tela segue visível. */
    drainable = 1
    syncQueue()

    expect(target.intervalCount()).toBe(1)
  })

  it('cancelar desliga os ouvintes e o temporizador', () => {
    const target = createFakeTarget()

    const cancel = scheduleQueueDrainTriggers({
      drain: () => undefined,
      getDrainable: () => 1,
      target,
    })
    expect(target.intervalCount()).toBe(1)
    cancel()

    expect(target.intervalCount()).toBe(0)
    /** As três também tiram o ouvinte: disparar depois de cancelar não deve estourar nem religar. */
    target.fireOnline()
    target.firePageshow()
    target.fireVisibilityChange()
    expect(target.intervalCount()).toBe(0)
  })
})
