/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Devolução do escritório (`field-return`) solta a nota da viagem por padrão (spec 260 NC1), para
 * ela poder entrar em outra viagem; `returnToWarehouse: false` mantém o vínculo.
 */
import { describe, expect, it } from 'bun:test'

import { parseOfficeFieldReturnRequest } from '../../src/trips/presentation/trip-field-office.schema.js'

function request(body: unknown): Request {
  return new Request('http://localhost/trips/t/documents/d/field-return', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('field-return do escritório', () => {
  it('solta a nota por padrão', async () => {
    const parsed = await parseOfficeFieldReturnRequest(request({ reason: 'recipient_absent' }))
    expect(parsed.returnToWarehouse).toBe(true)
  })

  it('respeita returnToWarehouse false', async () => {
    const parsed = await parseOfficeFieldReturnRequest(
      request({ reason: 'recipient_absent', returnToWarehouse: false }),
    )
    expect(parsed.returnToWarehouse).toBe(false)
  })
})
