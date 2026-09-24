/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveDispatchReadiness } from '@/modules/trip/shared/dispatchReadiness.service'
import type { TripDocumentDetail } from '@/modules/trip/shared/trip.types'

/**
 * Spec 185 T6.1 (D1): a mesma tabela de casos da API (`dispatch-readiness.contract.ts` em
 * `api-transportada`), restatada no cliente — vivas × liberadas × devolvidas; ocorrência
 * (`leavesBehindOnDispatch`) tira da conta quando a nota não está carregada; carregada com a mesma
 * marca continua carga; zero carregada não fecha. O diálogo "leva todas" (RF9) depende desta conta
 * bater com a do servidor.
 */
function nota(overrides: Partial<TripDocumentDetail> = {}): TripDocumentDetail {
  return {
    createdAt: '2026-09-24T10:00:00.000Z',
    cteAuthorized: false,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: crypto.randomUUID(),
    loadedAt: null,
    nfeDocumentId: null,
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: '00000000-0000-4000-8000-000000000001',
    updatedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
  }
}

describe('resolveDispatchReadiness (spec 185 T6.1, espelha D1 da API)', () => {
  test('nota liberada não conta nem para carregar nem para deixar para trás', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ releasedAt: '2026-09-24T11:00:00.000Z', separationStatus: 'pending' })],
    })

    expect(readiness).toEqual({ isCargoClosed: false, leftBehindCount: 0, toLoadCount: 0 })
  })

  test('nota devolvida (returned) também sai da conta', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ separationStatus: 'returned' })],
    })

    expect(readiness).toEqual({ isCargoClosed: false, leftBehindCount: 0, toLoadCount: 0 })
  })

  test('pendente/separada sem ocorrência conta para carregar', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ separationStatus: 'pending' }), nota({ separationStatus: 'separated' })],
    })

    expect(readiness).toEqual({ isCargoClosed: false, leftBehindCount: 0, toLoadCount: 2 })
  })

  test('carregada/entregue conta como carga, nunca para carregar', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ separationStatus: 'loaded' }), nota({ separationStatus: 'delivered' })],
    })

    expect(readiness).toEqual({ isCargoClosed: true, leftBehindCount: 0, toLoadCount: 0 })
  })

  test('ocorrência que deixa para trás tira a nota não carregada da conta de "para carregar"', () => {
    const readiness = resolveDispatchReadiness({
      documents: [
        nota({ leavesBehindOnDispatch: true, separationStatus: 'pending' }),
        nota({ separationStatus: 'loaded' }),
      ],
    })

    expect(readiness).toEqual({ isCargoClosed: true, leftBehindCount: 1, toLoadCount: 0 })
  })

  /** D1: nota `loaded` com a ocorrência continua carga — ela foi carregada. */
  test('nota carregada com a ocorrência de "segue sem a nota" continua carga', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ leavesBehindOnDispatch: true, separationStatus: 'loaded' })],
    })

    expect(readiness).toEqual({ isCargoClosed: true, leftBehindCount: 0, toLoadCount: 0 })
  })

  /** "casos extremos": zero nota carregada não fecha, mesmo sem nada para carregar. */
  test('só notas deixadas para trás não fecha a carga (exige ao menos uma carregada)', () => {
    const readiness = resolveDispatchReadiness({
      documents: [nota({ leavesBehindOnDispatch: true, separationStatus: 'pending' })],
    })

    expect(readiness).toEqual({ isCargoClosed: false, leftBehindCount: 1, toLoadCount: 0 })
  })

  test('viagem sem nota nenhuma não fecha', () => {
    expect(resolveDispatchReadiness({ documents: [] })).toEqual({
      isCargoClosed: false,
      leftBehindCount: 0,
      toLoadCount: 0,
    })
  })

  /** Spec 078 D2: campo ausente é API anterior ao campo — nunca falha, nunca conta como deixada. */
  test('leavesBehindOnDispatch ausente (API anterior) conta para carregar, não para deixar', () => {
    const semCampo = nota({ separationStatus: 'pending' })
    delete (semCampo as { leavesBehindOnDispatch?: boolean }).leavesBehindOnDispatch

    expect(resolveDispatchReadiness({ documents: [semCampo] })).toEqual({
      isCargoClosed: false,
      leftBehindCount: 0,
      toLoadCount: 1,
    })
  })
})
