/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A estabilização das lojas padrão do `useDriverTrip` (parâmetro padrão → inicializador de estado)
 * tirou, sem querer, o único gatilho de repetição que a drenagem tinha — o efeito de montagem
 * reexecutando a cada render por causa da loja instável. `scheduleQueueDrainTriggers`
 * (`queueDrainScheduler.service.ts`) é o gatilho explícito que veio no lugar, e este é o teste que
 * prova a montagem: monta o hook de verdade, com o DOM, e conta drenagens — a garantia é que montar
 * dispara uma só, cada gatilho do navegador dispara mais uma, e desmontar corta todas.
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'

import { useDriverTrip } from '@/modules/driver-trip/hooks/useDriverTrip.hook'
import type { AttachmentStore } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

import { driverTripHookFakes, resetDriverTripHookFakes } from './driverTripClientMocks.helper'
import { renderHook, settle, waitFor } from './renderHook.helper'

const NOW = '2026-09-25T12:00:00.000Z'

function createQueueStore(initial: readonly QueuedReport[]): OfflineQueueStore {
  let items = [...initial]
  return {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
}

/** Sem anexo nenhum: só a fila de eventos importa para contar drenagens. */
function createEmptyAttachmentStore(): AttachmentStore {
  return {
    read: () => Promise.resolve([]),
    readAll: () => Promise.resolve([]),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: () => Promise.resolve(),
    update: () => Promise.resolve([]),
  }
}

function queuedArrival(key: string): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW,
    report: { idempotencyKey: key, kind: 'arrive', location: null, stopId: 'stop-1' },
  }
}

describe('useDriverTrip — gatilhos da drenagem', () => {
  beforeEach(() => {
    resetDriverTripHookFakes()
  })

  it('montar drena uma vez, e online/pageshow drenam mais uma cada — sem emendar', async () => {
    const store = createQueueStore([queuedArrival('chave-1')])
    const attachmentStore = createEmptyAttachmentStore()

    const rendered = await renderHook(() => useDriverTrip(store, attachmentStore))

    /** "Abertura": a montagem já dispara a primeira drenagem, sem esperar gatilho nenhum. */
    await waitFor(() => expect(driverTripHookFakes.sendCallCount).toBe(1))

    void act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(driverTripHookFakes.sendCallCount).toBe(2))

    void act(() => window.dispatchEvent(new Event('pageshow')))
    await waitFor(() => expect(driverTripHookFakes.sendCallCount).toBe(3))

    /**
     * A garantia central: parado sem gatilho nenhum, o número não sobe sozinho. Se o efeito de
     * montagem reexecutasse a cada render (o defeito da loja instável), a contagem cresceria aqui
     * sem nenhum evento disparado.
     */
    await settle()
    await settle()
    expect(driverTripHookFakes.sendCallCount).toBe(3)

    rendered.unmount()
  })

  it('desmontar cancela os gatilhos: disparar depois não drena mais', async () => {
    const store = createQueueStore([queuedArrival('chave-1')])
    const attachmentStore = createEmptyAttachmentStore()

    const rendered = await renderHook(() => useDriverTrip(store, attachmentStore))
    await waitFor(() => expect(driverTripHookFakes.sendCallCount).toBe(1))

    rendered.unmount()
    const countAfterUnmount = driverTripHookFakes.sendCallCount

    void act(() => window.dispatchEvent(new Event('online')))
    void act(() => window.dispatchEvent(new Event('pageshow')))
    await settle()

    expect(driverTripHookFakes.sendCallCount).toBe(countAfterUnmount)
  })

  it('fila vazia: montar não drena e não liga o temporizador', async () => {
    const store = createQueueStore([])
    const attachmentStore = createEmptyAttachmentStore()

    const rendered = await renderHook(() => useDriverTrip(store, attachmentStore))
    await waitFor(() => expect(rendered.result().isQueueLoading).toBe(false))
    await settle()

    expect(driverTripHookFakes.sendCallCount).toBe(0)

    rendered.unmount()
  })
})
