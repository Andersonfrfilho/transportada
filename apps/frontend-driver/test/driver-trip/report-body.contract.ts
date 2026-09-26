/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { reportBody } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { LATE_REGISTRATION_FIELD_ENABLED } from '../../src/modules/driver-trip/shared/lateRegistration.constant'

/**
 * Pedido do usuário (25/09): "Registrar entrega depois" manda `lateRegistration: true`. A API passou
 * a aceitar a chave na spec 205 (`312263c6f`), então o interruptor está ligado.
 */
describe('o corpo de deliver/return leva a marca do registro tardio', () => {
  it('a constante está ligada — a API da spec 205 aceita o campo', () => {
    expect(LATE_REGISTRATION_FIELD_ENABLED).toBe(true)
  })

  it('deliver com `lateRegistration: true` leva a chave no corpo', () => {
    const body = reportBody({
      documentId: 'document-1',
      idempotencyKey: 'key-1',
      kind: 'deliver',
      lateRegistration: true,
      location: null,
    })

    expect(JSON.parse(body)).toEqual({ lateRegistration: true, location: null })
  })

  it('return com `lateRegistration: true` leva a chave no corpo', () => {
    const body = reportBody({
      documentId: 'document-1',
      idempotencyKey: 'key-1',
      kind: 'return',
      lateRegistration: true,
      location: null,
      reason: 'recipient_absent',
    })

    expect(JSON.parse(body)).toEqual({
      lateRegistration: true,
      location: null,
      reason: 'recipient_absent',
    })
  })

  it('sem a marca, o corpo continua igual', () => {
    const body = reportBody({
      documentId: 'document-1',
      idempotencyKey: 'key-1',
      kind: 'deliver',
      location: null,
    })

    expect(JSON.parse(body)).toEqual({ location: null })
  })
})
