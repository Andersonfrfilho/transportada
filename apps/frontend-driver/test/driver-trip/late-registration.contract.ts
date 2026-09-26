/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import { LATE_REGISTRATION_FIELD_ENABLED } from '../../src/modules/driver-trip/shared/lateRegistration.constant'
import {
  canOfferLateRegistration,
  shouldSendLateRegistration,
} from '../../src/modules/driver-trip/shared/lateRegistration.service'
import type {
  DriverTripDocument,
  DriverTripStop,
} from '../../src/modules/driver-trip/shared/driverTrip.types'

function buildDocument(overrides: Partial<DriverTripDocument> = {}): DriverTripDocument {
  return {
    accessKey: '0'.repeat(44),
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '10.000',
    id: 'document-1',
    number: '1001',
    proofPending: false,
    recipientName: 'Destinatário',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '100.00',
    volumeCount: '1',
    ...overrides,
  }
}

function buildStop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [buildDocument()],
    id: 'stop-1',
    label: 'Rua das Entregas, 100',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

/**
 * Pedido do usuário (25/09): "Registrar entrega depois" — o escape hatch de quem não tocou
 * "Cheguei" na hora. O link só aparece na parada travada (sem chegada, sem confirmação anterior) e
 * com nota para agir: sem nota pendente não há o que ele liberaria.
 */
describe('"Registrar entrega depois" (pedido do usuário 25/09)', () => {
  it('parada travada com nota pendente: oferece o link', () => {
    expect(canOfferLateRegistration({ canActOnDocuments: false, stop: buildStop() })).toBe(true)
  })

  it('ações já liberadas (chegada ou confirmação anterior): não oferece', () => {
    expect(canOfferLateRegistration({ canActOnDocuments: true, stop: buildStop() })).toBe(false)
  })

  it('parada travada mas sem nota pendente (tudo entregue/devolvido): não oferece', () => {
    const stop = buildStop({
      documents: [buildDocument({ separationStatus: 'delivered' })],
    })
    expect(canOfferLateRegistration({ canActOnDocuments: false, stop })).toBe(false)
  })

  it('textos em pt-BR e en', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.lateRegistration.open).toBeString()
      expect(locale.lateRegistration.warning).toBeString()
      expect(locale.lateRegistration.confirm).toBeString()
      expect(locale.lateRegistration.cancel).toBeString()
      expect(locale.lateRegistration.badge).toBeString()
    }
  })
})

/**
 * A API aceita a chave `lateRegistration` desde a spec 205 (`312263c6f`), então o interruptor está
 * ligado. Parametrizado para provar as duas metades sem mockar módulo.
 */
describe('o campo `lateRegistration` só sai atrás do interruptor', () => {
  it('a constante está ligada — a API da spec 205 aceita a chave', () => {
    expect(LATE_REGISTRATION_FIELD_ENABLED).toBe(true)
  })

  it('desligado: nunca envia, mesmo com o motorista tendo confirmado', () => {
    expect(shouldSendLateRegistration({ isFieldEnabled: false, lateRegistration: true })).toBe(
      false,
    )
  })

  it('ligado, mas o motorista não confirmou: não envia', () => {
    expect(shouldSendLateRegistration({ isFieldEnabled: true, lateRegistration: undefined })).toBe(
      false,
    )
    expect(shouldSendLateRegistration({ isFieldEnabled: true, lateRegistration: false })).toBe(
      false,
    )
  })

  it('ligado e confirmado: envia', () => {
    expect(shouldSendLateRegistration({ isFieldEnabled: true, lateRegistration: true })).toBe(true)
  })
})
