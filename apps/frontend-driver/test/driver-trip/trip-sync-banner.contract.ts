/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  EventQueueItemStatus,
  EventQueueItemView,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import {
  countSyncingEvents,
  resolveTripSyncBanner,
} from '@/modules/driver-trip/shared/tripSyncBanner.service'

function queueItem(status: EventQueueItemStatus, key: string = status.state): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: key,
    kind: 'deliver',
    queuedAt: '2026-10-15T21:00:00.000Z',
    status,
  }
}

const QUEUED = { state: 'queued' } as const
const FAILED = { attempts: 2, state: 'failed' } as const
const REJECTED = { cause: 'TRIP_STOP_NOT_FOUND', state: 'rejected' } as const
const UNVERIFIED = { state: 'unverified' } as const

/**
 * Cenários medidos à mão na pilha real (15/10): sem sinal, sinal que cai no meio, envio parcial
 * (entrega aceita e foto falhando sozinha) e a fila que esvazia.
 */
describe('aviso de sincronização da viagem (teste local de 15/10)', () => {
  it('fila vazia e nada acabou de sair: nenhum aviso', () => {
    expect(resolveTripSyncBanner({ justSynced: false, queueView: [] })).toEqual({ kind: 'idle' })
  })

  it('sem sinal: o toque na fila mostra "sincronizando" com a contagem', () => {
    const banner = resolveTripSyncBanner({
      justSynced: false,
      queueView: [queueItem(QUEUED, 'a'), queueItem(QUEUED, 'b')],
    })
    expect(banner).toEqual({ kind: 'syncing', syncing: 2 })
  })

  it('sinal que cai no meio: a tentativa que falhou segue como "sincronizando", não some', () => {
    const banner = resolveTripSyncBanner({
      justSynced: false,
      queueView: [queueItem(FAILED, 'a'), queueItem(QUEUED, 'b')],
    })
    expect(banner).toEqual({ kind: 'syncing', syncing: 2 })
  })

  it('envio parcial: a foto que falha sozinha mantém o aviso mesmo com a entrega aceita', () => {
    const proofGroup: EventQueueItemView = { ...queueItem(FAILED, 'proof-1'), kind: 'proof' }
    expect(resolveTripSyncBanner({ justSynced: false, queueView: [proofGroup] })).toEqual({
      kind: 'syncing',
      syncing: 1,
    })
  })

  it('a fila esvazia depois de ter evento em curso: "sincronizado", e só enquanto a tela segura', () => {
    expect(resolveTripSyncBanner({ justSynced: true, queueView: [] })).toEqual({ kind: 'synced' })
    expect(resolveTripSyncBanner({ justSynced: false, queueView: [] })).toEqual({ kind: 'idle' })
  })

  it('o recusado nunca vira "sincronizado" e vem com o que ainda está em curso', () => {
    const banner = resolveTripSyncBanner({
      justSynced: true,
      queueView: [queueItem(REJECTED, 'a'), queueItem(QUEUED, 'b')],
    })
    expect(banner).toEqual({ kind: 'rejected', rejected: 1, syncing: 1 })
  })

  it('o item que espera o dono confirmar não conta como envio em curso', () => {
    expect(countSyncingEvents([queueItem(UNVERIFIED)])).toBe(0)
    expect(
      resolveTripSyncBanner({ justSynced: false, queueView: [queueItem(UNVERIFIED)] }),
    ).toEqual({ kind: 'idle' })
  })

  it('conta só o que está em curso: enfileirado e falho, não o recusado nem o não verificado', () => {
    expect(
      countSyncingEvents([
        queueItem(QUEUED, 'a'),
        queueItem(FAILED, 'b'),
        queueItem(REJECTED, 'c'),
        queueItem(UNVERIFIED, 'd'),
      ]),
    ).toBe(2)
  })
})
