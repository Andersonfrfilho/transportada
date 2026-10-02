/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '@/modules/driver-trip/locales/driverTrip.locale.json'
import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'
import {
  formatQueuedAt,
  resolveStalePending,
  STALE_PENDING_AFTER_MS,
} from '@/modules/driver-trip/shared/stalePending.service'

const NOW_MS = Date.parse('2026-10-03T15:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000

function item(input: {
  readonly ageMs: number
  readonly key?: string
  readonly kind?: EventQueueItemView['kind']
  readonly status?: EventQueueItemView['status']
}): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: input.key ?? 'chave-1',
    kind: input.kind ?? 'deliver',
    queuedAt: new Date(NOW_MS - input.ageMs).toISOString(),
    status: input.status ?? { state: 'queued' },
  }
}

/**
 * Spec 229. O app só envia com ele aberto (sem Background Sync, ADR-0075 §8), e desde a 227 nada sai
 * da fila por idade. O motorista que fecha o app sem sinal e esquece não tem como saber que o
 * trabalho dele não chegou ao escritório — a faixa avisa, sem apagar nada.
 */
describe('o que está parado há mais de um dia vira aviso (spec 229)', () => {
  it('o limite é de 24 horas', () => {
    expect(STALE_PENDING_AFTER_MS).toBe(24 * HOUR_MS)
  })

  it('fila vazia ou recente não avisa', () => {
    expect(resolveStalePending({ items: [], nowMs: NOW_MS })).toBeUndefined()
    expect(
      resolveStalePending({ items: [item({ ageMs: 23 * HOUR_MS })], nowMs: NOW_MS }),
    ).toBeUndefined()
  })

  it('exatamente 24 horas ainda não avisa; um instante depois, sim', () => {
    expect(
      resolveStalePending({ items: [item({ ageMs: STALE_PENDING_AFTER_MS })], nowMs: NOW_MS }),
    ).toBeUndefined()
    expect(
      resolveStalePending({ items: [item({ ageMs: STALE_PENDING_AFTER_MS + 1 })], nowMs: NOW_MS }),
    ).toMatchObject({ count: 1 })
  })

  it('conta só o parado e informa o mais antigo', () => {
    const result = resolveStalePending({
      items: [
        item({ ageMs: 30 * HOUR_MS, key: 'a' }),
        item({ ageMs: 80 * HOUR_MS, key: 'b', status: { attempts: 5, state: 'failed' } }),
        item({ ageMs: 2 * HOUR_MS, key: 'c' }),
        item({ ageMs: 50 * HOUR_MS, key: 'd', kind: 'proof' }),
      ],
      nowMs: NOW_MS,
    })

    expect(result).toEqual({
      count: 3,
      oldestQueuedAt: new Date(NOW_MS - 80 * HOUR_MS).toISOString(),
    })
  })

  /** Recusado e não verificado já têm aviso e decisão próprios: contar de novo seria ruído. */
  it('recusado e não verificado ficam de fora', () => {
    expect(
      resolveStalePending({
        items: [
          item({ ageMs: 90 * HOUR_MS, key: 'a', status: { cause: '409 X', state: 'rejected' } }),
          item({ ageMs: 90 * HOUR_MS, key: 'b', status: { state: 'unverified' } }),
        ],
        nowMs: NOW_MS,
      }),
    ).toBeUndefined()
  })

  it('data ilegível não vira aviso', () => {
    expect(
      resolveStalePending({
        items: [{ ...item({ ageMs: 0 }), queuedAt: 'não é data' }],
        nowMs: NOW_MS,
      }),
    ).toBeUndefined()
  })
})

/**
 * A tela de pendências mostrava só a hora do item: com um item de dois dias atrás, "03:34 PM" soa
 * como "hoje". Item de outro dia leva a data.
 */
describe('a hora do item da fila leva a data quando não é de hoje (spec 229)', () => {
  const now = new Date(2026, 9, 3, 15, 0, 0)

  it('do mesmo dia: só a hora', () => {
    const text = formatQueuedAt({
      nowMs: now.getTime(),
      queuedAt: new Date(2026, 9, 3, 9, 5).toISOString(),
    })

    expect(text).not.toInclude('/')
    expect(text).toMatch(/9|09/u)
  })

  it('de outro dia: data e hora', () => {
    const text = formatQueuedAt({
      nowMs: now.getTime(),
      queuedAt: new Date(2026, 9, 1, 9, 5).toISOString(),
    })

    expect(text).toMatch(/01\/10|1\/10|10\/01|10\/1/u)
  })
})

describe('a faixa existe nos textos e na tela (spec 229)', () => {
  it('há o texto no singular e no plural, em pt-BR e en', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      for (const key of ['notice_one', 'notice_other'] as const) {
        expect(locale.stalePending[key]).toInclude('{{count}}')
        expect(locale.stalePending[key]).toInclude('{{date}}')
      }
    }
  })

  it('a viagem mostra a faixa a partir da fila', () => {
    const page = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
      'utf8',
    )

    expect(page).toInclude('resolveStalePending(')
    expect(page).toInclude('<DriverStalePendingNotice')
  })

  it('a tela de pendências mostra a data pelo formatador novo', () => {
    const queuePage = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverEventQueue.page.tsx', import.meta.url),
      'utf8',
    )

    expect(queuePage).toInclude('formatQueuedAt(')
  })
})
