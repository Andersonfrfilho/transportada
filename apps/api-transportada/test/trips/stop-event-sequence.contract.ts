/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF1–RF4, RF7): a ordem da parada é saída, chegada, baixa. Pedir uma etapa à frente marca as
 * anteriores que faltam, na ordem. O escritório nunca marca junto.
 */
import { describe, expect, test } from 'bun:test'

import type { StopEventStep } from '../../src/trips/domain/stop-event-sequence.policy.js'
import { resolveStopEventSequence } from '../../src/trips/domain/stop-event-sequence.policy.js'

type StopState = Parameters<typeof resolveStopEventSequence>[0]['stop']

const AT = '2026-11-05T10:00:00.000Z'
const FRESH: StopState = { arrivedAt: null, completedAt: null, enRouteSince: null }
const EN_ROUTE: StopState = { ...FRESH, enRouteSince: AT }
const ARRIVED: StopState = { ...FRESH, arrivedAt: new Date(AT) }
const ARRIVED_AFTER_EN_ROUTE: StopState = { ...ARRIVED, enRouteSince: AT }
const COMPLETED: StopState = { arrivedAt: AT, completedAt: AT, enRouteSince: AT }

const DRIVER_CHANNELS = ['driver_app', 'whatsapp'] as const

type Row = readonly [
  string,
  StopState,
  'arrived' | 'delivered' | 'departed' | 'returned',
  StopEventStep[],
]

const DRIVER_ROWS: readonly Row[] = [
  ['nova + saiu', FRESH, 'departed', []],
  ['nova + chegou', FRESH, 'arrived', ['departed']],
  ['nova + entregou', FRESH, 'delivered', ['departed', 'arrived']],
  ['nova + devolveu', FRESH, 'returned', ['departed', 'arrived']],
  ['a caminho + saiu', EN_ROUTE, 'departed', []],
  ['a caminho + chegou', EN_ROUTE, 'arrived', []],
  ['a caminho + entregou', EN_ROUTE, 'delivered', ['arrived']],
  ['a caminho + devolveu', EN_ROUTE, 'returned', ['arrived']],
  ['chegou + saiu', ARRIVED, 'departed', []],
  ['chegou + chegou', ARRIVED, 'arrived', []],
  ['chegou + entregou', ARRIVED, 'delivered', []],
  ['chegou + devolveu', ARRIVED, 'returned', []],
  ['chegou depois de sair + entregou', ARRIVED_AFTER_EN_ROUTE, 'delivered', []],
  ['concluída + saiu', COMPLETED, 'departed', []],
  ['concluída + chegou', COMPLETED, 'arrived', []],
  ['concluída + entregou', COMPLETED, 'delivered', []],
  ['concluída + devolveu', COMPLETED, 'returned', []],
]

describe('resolveStopEventSequence — o que se marca junto', () => {
  for (const channel of DRIVER_CHANNELS) {
    for (const [name, stop, requestedEvent, expected] of DRIVER_ROWS) {
      test(`${channel}: ${name}`, () => {
        expect(resolveStopEventSequence({ authorship: channel, requestedEvent, stop })).toEqual(
          expected,
        )
      })
    }
  }

  test('escritório nunca marca etapa junto, qualquer estado e evento', () => {
    for (const [, stop, requestedEvent] of DRIVER_ROWS) {
      expect(resolveStopEventSequence({ authorship: 'office', requestedEvent, stop })).toEqual([])
    }
  })

  test('aceita datas como texto ou Date no mesmo estado', () => {
    const asText = resolveStopEventSequence({
      authorship: 'driver_app',
      requestedEvent: 'delivered',
      stop: { arrivedAt: null, completedAt: null, enRouteSince: AT },
    })
    const asDate = resolveStopEventSequence({
      authorship: 'driver_app',
      requestedEvent: 'delivered',
      stop: { arrivedAt: null, completedAt: null, enRouteSince: new Date(AT) },
    })
    expect(asText).toEqual(asDate)
  })
})
