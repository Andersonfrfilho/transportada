/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 D8: paridade das chaves de ocorrência de parada com o catálogo da API.
 *
 * Quem dispara é a API, pelo trilho `notification.v1`; este worker renderiza o template semeado
 * no banco. Os literais são fixados aqui e no contrato gêmeo da API
 * (`test/trip-occurrence/stop-notification.contract.ts`) — mudou de um lado? mude do outro.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_OCCURRENCE_TEMPLATE_KEY,
  TRIP_OCCURRENCE_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification/notification.constant.js'

describe('contrato de paridade das chaves de ocorrência de parada (spec 082 D8)', () => {
  test('as chaves são as quatro do catálogo da API, com os mesmos literais', () => {
    expect(TRIP_OCCURRENCE_TEMPLATE_KEY).toEqual({
      TRIP_OCCURRENCE_APPOINTMENT_REQUIRED: 'trip.occurrence-appointment-required',
      TRIP_OCCURRENCE_DOCK_CLOSED: 'trip.occurrence-dock-closed',
      TRIP_OCCURRENCE_LONG_WAIT: 'trip.occurrence-long-wait',
      TRIP_OCCURRENCE_UNEXPECTED_CHARGE: 'trip.occurrence-unexpected-charge',
    })
  })

  /** `other` não tem chave de propósito: motivo sem template grava a ocorrência e segue. */
  test('não existe chave para `other`', () => {
    const keys = Object.values(TRIP_OCCURRENCE_TEMPLATE_KEY)
    expect(keys.some((key) => key.includes('other'))).toBe(false)
  })

  test('os marcadores são nota, hora e parada — nunca PII', () => {
    expect([...TRIP_OCCURRENCE_TEMPLATE_PLACEHOLDERS].toSorted()).toEqual([
      'documentLabel',
      'occurredAt',
      'stopLabel',
    ])
  })
})
