/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { computeDriverScore } from '../../src/fleet/domain/driver-score.policy.js'

const NOW = new Date('2026-09-18T12:00:00.000Z')
const SETTINGS = { latePenaltyPoints: 5, missingAfterHours: 24, missingPenaltyPoints: 10 }

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('nota do motorista (spec 157 RF8-RF9)', () => {
  /** Aceite 5: uma foto late (5) + uma ausente há 25h (10) → 85. */
  test('soma as penalidades vigentes e tira da nota cheia', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(48),
          documentNumber: '1001',
          photoMode: 'required',
          photoPunctuality: 'late',
          tripDocumentId: 'doc-1',
        },
        {
          deliveredAt: hoursAgo(25),
          documentNumber: '1002',
          photoMode: 'required',
          photoPunctuality: undefined,
          tripDocumentId: 'doc-2',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(85)
    expect(result.penalties).toHaveLength(2)
  })

  /** Aceite 5: ausente há 3h, dentro do prazo (24h) → sem penalidade ainda. */
  test('sem foto dentro do prazo não penaliza', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(3),
          documentNumber: '1003',
          photoMode: 'required',
          photoPunctuality: undefined,
          tripDocumentId: 'doc-3',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(100)
    expect(result.penalties).toHaveLength(0)
  })

  /** Aceite 5: entrega de 91 dias atrás não conta — nota fica null, sem histórico avaliável. */
  test('entrega fora da janela de 90 dias não conta', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: daysAgo(91),
          documentNumber: '1004',
          photoMode: 'required',
          photoPunctuality: 'away',
          tripDocumentId: 'doc-4',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBeNull()
    expect(result.penalties).toHaveLength(0)
  })

  test('sem nenhuma entrega avaliável, a nota é null', () => {
    const result = computeDriverScore({ deliveries: [], now: NOW, settings: SETTINGS })

    expect(result.score).toBeNull()
    expect(result.penalties).toHaveLength(0)
  })

  /** RF8: mínimo é 0, nunca negativo, mesmo com muita penalidade. */
  test('a nota nunca passa de 0 para baixo', () => {
    const result = computeDriverScore({
      deliveries: Array.from({ length: 30 }, (_, index) => ({
        deliveredAt: hoursAgo(48 + index),
        documentNumber: `${1000 + index}`,
        photoMode: 'required' as const,
        photoPunctuality: 'away' as const,
        tripDocumentId: `doc-${index}`,
      })),
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(0)
  })

  /** RF8: late_and_away tira só a penalidade de late_proof, nunca soma os dois motivos. */
  test('uma única penalidade por entrega, mesmo com late_and_away', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(48),
          documentNumber: '1005',
          photoMode: 'required',
          photoPunctuality: 'late_and_away',
          tripDocumentId: 'doc-5',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(95)
    expect(result.penalties).toHaveLength(1)
    expect(result.penalties[0]?.reason).toBe('late_proof')
  })

  /** Caso extremo da spec: configuração atual `optional` não penaliza ausência (modo mudou depois). */
  test('modo atual optional não penaliza ausência de foto', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(48),
          documentNumber: '1006',
          photoMode: 'optional',
          photoPunctuality: undefined,
          tripDocumentId: 'doc-6',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBeNull()
    expect(result.penalties).toHaveLength(0)
  })

  /** Foto on_time ou not_required não penaliza. */
  test('foto pontual ou não exigida não penaliza', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(48),
          documentNumber: '1007',
          photoMode: 'required',
          photoPunctuality: 'on_time',
          tripDocumentId: 'doc-7',
        },
        {
          deliveredAt: hoursAgo(30),
          documentNumber: '1008',
          photoMode: 'required',
          photoPunctuality: 'not_required',
          tripDocumentId: 'doc-8',
        },
      ],
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(100)
    expect(result.penalties).toHaveLength(0)
  })
  /**
   * Spec 157 T11 (decisão D1): sem retroatividade — a entrega anterior à ativação da nota não
   * penaliza e não conta como histórico.
   */
  test('entrega anterior à ativação da nota não conta', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(48),
          documentNumber: '1009',
          photoMode: 'required',
          photoPunctuality: undefined,
          tripDocumentId: 'doc-9',
        },
      ],
      effectiveSince: hoursAgo(30),
      now: NOW,
      settings: SETTINGS,
    })

    expect(result).toEqual({ penalties: [], score: null })
  })

  test('entrega depois da ativação conta normalmente', () => {
    const result = computeDriverScore({
      deliveries: [
        {
          deliveredAt: hoursAgo(26),
          documentNumber: '1010',
          photoMode: 'required',
          photoPunctuality: undefined,
          tripDocumentId: 'doc-10',
        },
      ],
      effectiveSince: hoursAgo(30),
      now: NOW,
      settings: SETTINGS,
    })

    expect(result.score).toBe(90)
  })
})
