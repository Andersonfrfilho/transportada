/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { reportBody } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { LATE_REGISTRATION_FIELD_ENABLED } from '../../src/modules/driver-trip/shared/lateRegistration.constant'

/**
 * Pedido do usuário (25/09): "Registrar entrega depois" manda `lateRegistration: true` — mas a API
 * ainda recusa a chave (schemas `.strict()`, 400). Enquanto `LATE_REGISTRATION_FIELD_ENABLED` for
 * `false`, o corpo sai **exatamente** como antes desta feature, mesmo com a marca no relato.
 */
describe('o corpo de deliver/return não muda enquanto o campo estiver desligado', () => {
  it('a constante está desligada hoje', () => {
    expect(LATE_REGISTRATION_FIELD_ENABLED).toBe(false)
  })

  it('deliver com `lateRegistration: true` sai sem a chave no corpo', () => {
    const body = reportBody({
      documentId: 'document-1',
      idempotencyKey: 'key-1',
      kind: 'deliver',
      lateRegistration: true,
      location: null,
    })

    expect(JSON.parse(body)).toEqual({ location: null })
  })

  it('return com `lateRegistration: true` sai sem a chave no corpo', () => {
    const body = reportBody({
      documentId: 'document-1',
      idempotencyKey: 'key-1',
      kind: 'return',
      lateRegistration: true,
      location: null,
      reason: 'recipient_absent',
    })

    expect(JSON.parse(body)).toEqual({ location: null, reason: 'recipient_absent' })
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
