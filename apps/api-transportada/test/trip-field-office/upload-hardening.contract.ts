/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15 (seg B2, seg B5, M7): o que o multipart do escritório aceita. Lista fechada de campos
 * e no máximo um `file` na borda; bytes que batem com o tipo declarado e o teto do escritório,
 * abaixo do corpo máximo da API, antes de qualquer transação.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES } from '../../src/shared/api.constant.js'
import { assertOfficeUploadAccepted } from '../../src/trips/application/office-delivery-proof.service.js'
import { OFFICE_PROOF_MAX_BYTES } from '../../src/trips/domain/delivery-proof.policy.js'
import {
  parseOfficeFieldDeliveryRequest,
  parseOfficeFieldProofRequest,
} from '../../src/trips/presentation/office-field-delivery.schema.js'
import { parseOfficeFieldOccurrencesRequest } from '../../src/trips/presentation/office-field-occurrences.schema.js'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

function multipart(input: {
  readonly fields: Record<string, string>
  readonly files?: readonly Uint8Array[]
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields)) form.set(key, value)
  for (const bytes of input.files ?? []) {
    form.append('file', new File([bytes], 'canhoto.jpg', { type: 'image/jpeg' }))
  }
  return new Request('http://localhost/trips/x', { body: form, method: 'POST' })
}

async function statusOf(operation: Promise<unknown>): Promise<number | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.status : -1
  }
}

describe('multipart do escritório: lista fechada e um arquivo só (spec 156 T15 seg B5)', () => {
  it('field-delivery recusa campo fora da lista com 400', async () => {
    const request = multipart({
      fields: { deliveredAt: '2026-09-18T09:00:00.000Z', kind: 'signature' },
    })
    expect(await statusOf(parseOfficeFieldDeliveryRequest(request))).toBe(400)
  })

  it('field-delivery recusa dois arquivos com 400', async () => {
    const request = multipart({
      fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
      files: [JPEG, JPEG],
    })
    expect(await statusOf(parseOfficeFieldDeliveryRequest(request))).toBe(400)
  })

  it('field-proof recusa campo fora da lista e dois arquivos com 400', async () => {
    const extra = multipart({ fields: { deliveredAt: '2026-09-18T09:00:00.000Z' }, files: [JPEG] })
    const twoFiles = multipart({ fields: {}, files: [JPEG, JPEG] })

    expect(await statusOf(parseOfficeFieldProofRequest(extra))).toBe(400)
    expect(await statusOf(parseOfficeFieldProofRequest(twoFiles))).toBe(400)
  })

  it('field-occurrences recusa dois arquivos com 400', async () => {
    const request = multipart({
      fields: {
        documentIds: '00000000-0000-4000-8000-0000000000d1',
        occurrenceTypeId: '00000000-0000-4000-8000-000000000005',
      },
      files: [JPEG, JPEG],
    })
    expect(await statusOf(parseOfficeFieldOccurrencesRequest(request))).toBe(400)
  })

  it('o corpo aceito continua passando', async () => {
    const request = multipart({
      fields: {
        attachmentKey: 'k',
        deliveredAt: '2026-09-18T09:00:00.000Z',
        driverId: '00000000-0000-4000-8000-000000000003',
        receiverDocument: '',
        receiverName: 'Ana',
      },
      files: [JPEG],
    })
    const parsed = await parseOfficeFieldDeliveryRequest(request)
    expect(parsed.proof?.bytes).toEqual(JPEG)
  })
})

describe('bytes e teto do canhoto do escritório (spec 156 T15 seg B2, M7)', () => {
  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
  ] as const)('%s com a assinatura de bytes certa passa', (mimeType, bytes) => {
    expect(() => assertOfficeUploadAccepted({ bytes, mimeType })).not.toThrow()
  })

  it('bytes que não batem com o tipo declarado respondem 422 TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', () => {
    expect(() => assertOfficeUploadAccepted({ bytes: PNG, mimeType: 'image/jpeg' })).toThrow(
      expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', status: 422 }),
    )
    expect(() =>
      assertOfficeUploadAccepted({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }),
    ).toThrow(expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE' }))
  })

  it('M7: o teto do escritório cabe no corpo máximo da API, com folga para os campos do multipart', () => {
    expect(OFFICE_PROOF_MAX_BYTES).toBeLessThan(APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES)
    expect(APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES - OFFICE_PROOF_MAX_BYTES).toBeGreaterThanOrEqual(
      64 * 1024,
    )
  })

  it('M7: arquivo acima do teto do escritório responde 422 TRIP_DELIVERY_PROOF_TOO_LARGE', () => {
    const oversized = new Uint8Array(OFFICE_PROOF_MAX_BYTES + 1)
    oversized.set(JPEG)
    expect(() => assertOfficeUploadAccepted({ bytes: oversized, mimeType: 'image/jpeg' })).toThrow(
      expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_TOO_LARGE', status: 422 }),
    )
  })
})
