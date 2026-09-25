import { describe, expect, it } from 'bun:test'

import {
  QUEUE_DRAIN_INTERVAL_MS,
  scheduleQueueDrainTriggers,
  type DrainTriggerTarget,
} from '@/modules/driver-trip/shared/queueDrainScheduler.service'

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
 * `useDriverTrip` ficou sem gatilho de repetição quando o efeito de montagem parou de reexecutar a
 * cada render (as lojas do IndexedDB nascem uma vez agora). `scheduleQueueDrainTriggers` é o gatilho
 * explícito que veio no lugar — estes testes provam o agendador isolado, sem DOM nem React.
 */
describe('scheduleQueueDrainTriggers', () => {
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
