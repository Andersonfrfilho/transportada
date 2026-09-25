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
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000

/**
 * A definição vive na app do motorista e é **copiada por valor** para cá (ADR-0075 §7, no sentido
 * inverso). O caminho relativo entre apps é lido como texto, num teste — não é `import` de código,
 * que é o que a arquitetura proíbe.
 */
const DRIVER_APP_SOURCE = new URL(
  '../../../frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts',
  import.meta.url,
)
const PANEL_SOURCE = new URL(
  '../../src/modules/driver-trip/shared/pendingQueue.service.ts',
  import.meta.url,
)

/**
 * Do tipo `PendingCounts` até o fim de `countPending`: é a definição, sem os gatilhos da drenagem.
 *
 * A única diferença admitida é o dono: a fila da app nova leva `subHash` (ADR-0075 §8) e a do
 * painel não tem de quem ser, então as linhas do filtro de dono saem antes da comparação — e as em
 * branco também, que o `prettier` reorganiza sozinho. Qualquer outra divergência reprova.
 */
const OWNER_FILTER_LINE = /ownerSubHash|isOwned|ADR-0075 §8/u

function extractDefinition(source: string): string {
  const start = source.indexOf('export type PendingCounts')
  const functionStart = source.indexOf('export function countPending')
  const end = source.indexOf('\n}\n', functionStart)
  if (start === -1 || functionStart === -1 || end === -1) {
    throw new Error('PENDING_QUEUE_DEFINITION_NOT_FOUND')
  }
  return source
    .slice(start, end + 2)
    .split('\n')
    .filter((line) => line.trim() !== '' && !OWNER_FILTER_LINE.test(line))
    .join('\n')
}

function report(input: { key: string; rejectionCause?: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW.toISOString(),
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    report: { idempotencyKey: input.key, kind: 'arrive', location: null, stopId: 'stop-1' },
  }
}

function attachment(input: {
  capturedAt?: string
  key: string
  rejectionCause?: string
}): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: input.capturedAt ?? NOW.toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    kind: 'photo',
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
  }
}

/**
 * ADR-0075 §6: pendência é **uma** definição — eventos não recusados, mais anexos no prazo de 7
 * dias, mais recusados ainda não descartados. O painel usa `total` para decidir se o motorista
 * pode ir para a casa nova.
 */
describe('a pendência da fila antiga', () => {
  it('soma eventos e anexos não recusados e no prazo em drainable', () => {
    expect(
      countPending({
        attachments: [['chave-1', [attachment({ key: 'anexo-1' })]]],
        now: NOW,
        reports: [report({ key: 'chave-1' }), report({ key: 'chave-2' })],
      }),
    ).toEqual({ drainable: 3, rejected: 0, total: 3 })
  })

  it('recusado conta em rejected, e total é a soma', () => {
    expect(
      countPending({
        attachments: [['chave-1', [attachment({ key: 'anexo-1', rejectionCause: '422 X' })]]],
        now: NOW,
        reports: [report({ key: 'chave-1', rejectionCause: '409 X' }), report({ key: 'chave-2' })],
      }),
    ).toEqual({ drainable: 1, rejected: 2, total: 3 })
  })

  it('anexo vencido não segura o motorista no painel', () => {
    const stale = new Date(NOW.getTime() - EIGHT_DAYS_MS).toISOString()

    expect(
      countPending({
        attachments: [['document:document-1', [attachment({ capturedAt: stale, key: 'a' })]]],
        now: NOW,
        reports: [],
      }),
    ).toEqual({ drainable: 0, rejected: 0, total: 0 })
  })

  it('fila vazia é zero', () => {
    expect(countPending({ attachments: [], now: NOW, reports: [] })).toEqual({
      drainable: 0,
      rejected: 0,
      total: 0,
    })
  })

  /**
   * ⚠️ Duas cópias de uma regra divergem caladas: o painel diria "fila vazia" para o que a app
   * nova ainda contaria, e o motorista iria embora deixando entrega para trás. A paridade é lida do
   * texto das duas fontes.
   */
  it('é a mesma definição da app do motorista, pelo texto de fonte', async () => {
    const [driverApp, panel] = await Promise.all([
      Bun.file(DRIVER_APP_SOURCE).text(),
      Bun.file(PANEL_SOURCE).text(),
    ])

    expect(extractDefinition(panel)).toBe(extractDefinition(driverApp))
  })

  it('a cópia declara de onde veio', async () => {
    const panel = await Bun.file(PANEL_SOURCE).text()

    expect(panel).toContain(
      'Cópia por valor de apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts (ADR-0075 §7)',
    )
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

/**
 * ADR-0075 §6, revisão M4: a b18564bc8 estabilizou as lojas do `useDriverTrip` do painel e, sem
 * querer, tirou o único gatilho de repetição que a tela de pendências tinha — o efeito de montagem
 * reexecutando a cada render. Estes gatilhos explícitos são a cópia por valor (no sentido inverso)
 * do agendador da app do motorista (`pending-queue.contract.ts` de lá, spec 189 T3.4/T5.4).
 */
describe('scheduleQueueDrainTriggers (revisão M4)', () => {
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
