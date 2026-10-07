/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, L2 e L3): a atualização otimista recalcula o selo "Vencida" (tudo
 * separado nunca está vencido, como na API), e a leitura periódica da chegada só roda enquanto há o que
 * esperar de outra pessoa: chegada aberta, aba visível e nenhum toque meu em voo.
 */
import { describe, expect, test } from 'bun:test'

import { applyDocumentStates } from '@/modules/cargo-receiving/shared/cargoDetailStates.service'
import { resolveCargoArrivalRefetchInterval } from '@/modules/cargo-receiving/shared/cargoArrivalPolling.service'
import { CARGO_ARRIVAL_LIMITS } from '@/modules/cargo-receiving/shared/cargoReceiving.constant'

import { buildDetail, buildDocument, documentIdOf } from '../fixtures/cargoReceiving.fixture'

describe('o selo "Vencida" acompanha a atualização otimista (revisão L2)', () => {
  const overdue = buildDetail({
    documents: [
      buildDocument({ number: '4001', separationState: 'separated' }),
      buildDocument({ number: '4002', separationState: 'received' }),
    ],
    isSeparationOverdue: true,
  })

  test('separar a última nota zera o vencimento: tudo separado nunca está vencido', () => {
    const next = applyDocumentStates({
      detail: overdue,
      states: { [documentIdOf(4002)]: 'separated' },
    })

    expect(next.counts.separated).toBe(next.counts.total)
    expect(next.isSeparationOverdue).toBe(false)
  })

  test('enquanto falta nota, a chegada continua vencida', () => {
    const next = applyDocumentStates({
      detail: overdue,
      states: { [documentIdOf(4002)]: 'received' },
    })

    expect(next.isSeparationOverdue).toBe(true)
  })

  test('chegada que não estava vencida não passa a estar', () => {
    const onTime = buildDetail({
      documents: [buildDocument({ number: '4003', separationState: 'received' })],
    })

    expect(applyDocumentStates({ detail: onTime, states: {} }).isSeparationOverdue).toBe(false)
  })
})

describe('a leitura periódica da chegada (revisão L3)', () => {
  const idle = { isTouchInFlight: false, isVisible: true, status: 'open' } as const

  test('chegada aberta, aba visível e sem toque em voo: relê no intervalo curto', () => {
    expect(resolveCargoArrivalRefetchInterval(idle)).toBe(
      CARGO_ARRIVAL_LIMITS.detailRefetchIntervalMs,
    )
  })

  test('o intervalo é curto de verdade: entre 15 e 30 segundos', () => {
    expect(CARGO_ARRIVAL_LIMITS.detailRefetchIntervalMs).toBeGreaterThanOrEqual(15_000)
    expect(CARGO_ARRIVAL_LIMITS.detailRefetchIntervalMs).toBeLessThanOrEqual(30_000)
  })

  test('chegada fechada para sozinha: não há mais o que outra pessoa mude', () => {
    expect(resolveCargoArrivalRefetchInterval({ ...idle, status: 'closed' })).toBe(false)
  })

  test('com toque meu em voo não relê: a releitura brigaria com a atualização otimista', () => {
    expect(resolveCargoArrivalRefetchInterval({ ...idle, isTouchInFlight: true })).toBe(false)
  })

  test('aba escondida não relê', () => {
    expect(resolveCargoArrivalRefetchInterval({ ...idle, isVisible: false })).toBe(false)
  })

  test('sem a chegada ainda carregada não há o que reler por intervalo', () => {
    expect(resolveCargoArrivalRefetchInterval({ ...idle, status: undefined })).toBe(false)
  })
})
