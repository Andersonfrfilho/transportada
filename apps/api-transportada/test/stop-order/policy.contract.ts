/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF25/RF27: fora da ordem da parada só a tripulação é conferida, e só quando a etapa não é da
 * parada em andamento nem (na saída) a próxima do roteiro.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { resolveStopOrderViolation } from '../../src/trips/domain/stop-order.policy.js'

function buildStop(
  sequence: number,
  overrides: Partial<WhatsAppStopCandidate> = {},
): WhatsAppStopCandidate {
  return {
    arrivedAt: null,
    completedAt: null,
    documents: [{ number: '100', separationStatus: 'loaded' }],
    enRouteSince: null,
    id: `stop-${sequence}`,
    sequence,
    ...overrides,
  }
}

const NOT_STARTED = [buildStop(1), buildStop(2), buildStop(3)]

describe('resolveStopOrderViolation (spec 294 RF25)', () => {
  test('a saída para a próxima pendente do roteiro está na ordem', () => {
    expect(
      resolveStopOrderViolation({
        authorship: 'driver_app',
        requestedEvent: 'departed',
        requestedStopId: 'stop-1',
        stops: NOT_STARTED,
      }),
    ).toBeNull()
  })

  test('a saída para outra que não a próxima pendente é fora de ordem, com a próxima no corpo', () => {
    expect(
      resolveStopOrderViolation({
        authorship: 'whatsapp',
        requestedEvent: 'departed',
        requestedStopId: 'stop-3',
        stops: NOT_STARTED,
      }),
    ).toEqual({
      currentSequence: null,
      currentStopId: null,
      nextSequence: 1,
      nextStopId: 'stop-1',
      requestedSequence: 3,
      requestedStopId: 'stop-3',
    })
  })

  test('com a parada 2 a caminho, a baixa da parada 3 é fora de ordem e a da 2 não', () => {
    const stops = [
      buildStop(1, { arrivedAt: 'x', completedAt: 'x' }),
      buildStop(2, { enRouteSince: 'x' }),
      buildStop(3),
    ]
    const violation = resolveStopOrderViolation({
      authorship: 'driver_app',
      requestedEvent: 'delivered',
      requestedStopId: 'stop-3',
      stops,
    })

    expect(violation).toMatchObject({ currentSequence: 2, currentStopId: 'stop-2' })
    expect(
      resolveStopOrderViolation({
        authorship: 'driver_app',
        requestedEvent: 'delivered',
        requestedStopId: 'stop-2',
        stops,
      }),
    ).toBeNull()
  })

  test('chegada, entrega e devolução fora da parada chegada e aberta são fora de ordem', () => {
    const stops = [buildStop(1, { arrivedAt: 'x' }), buildStop(2)]
    for (const requestedEvent of ['arrived', 'delivered', 'returned'] as const) {
      expect(
        resolveStopOrderViolation({
          authorship: 'driver_app',
          requestedEvent,
          requestedStopId: 'stop-2',
          stops,
        })?.currentStopId,
      ).toBe('stop-1')
    }
  })

  test('sem parada em andamento a chegada e a baixa não perguntam nada', () => {
    for (const requestedEvent of ['arrived', 'delivered', 'returned'] as const) {
      expect(
        resolveStopOrderViolation({
          authorship: 'driver_app',
          requestedEvent,
          requestedStopId: 'stop-3',
          stops: NOT_STARTED,
        }),
      ).toBeNull()
    }
  })

  test('parada já fechada e parada desconhecida nunca perguntam (repetição)', () => {
    const stops = [
      buildStop(1, { arrivedAt: 'x', completedAt: 'x' }),
      buildStop(2, { enRouteSince: 'x' }),
    ]

    expect(
      resolveStopOrderViolation({
        authorship: 'driver_app',
        requestedEvent: 'delivered',
        requestedStopId: 'stop-1',
        stops,
      }),
    ).toBeNull()
    expect(
      resolveStopOrderViolation({
        authorship: 'driver_app',
        requestedEvent: 'delivered',
        requestedStopId: 'unknown',
        stops,
      }),
    ).toBeNull()
  })

  test('o escritório nunca é perguntado', () => {
    const stops = [buildStop(1, { arrivedAt: 'x' }), buildStop(2)]
    for (const requestedEvent of ['arrived', 'delivered', 'departed', 'returned'] as const) {
      expect(
        resolveStopOrderViolation({
          authorship: 'office',
          requestedEvent,
          requestedStopId: 'stop-2',
          stops,
        }),
      ).toBeNull()
    }
  })
})
