/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 T012 / `security.md` §7: o nome do objeto aparece em log de bucket, em URL assinada e em
 * backup. Nele só cabem identificadores opacos — nunca CPF, nome, número de CNH ou o nome que o
 * operador deu ao arquivo (que costuma ser o nome da pessoa).
 */
import { describe, expect, test } from 'bun:test'

import { createFleetDriverAttachmentUseCase } from '../../src/fleet/application/fleet-driver-attachment.use-case.js'
import { buildFleetDriverAttachmentObjectKey } from '../../src/fleet/domain/fleet-driver-attachment.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const OBJECT_ID = '00000000-0000-4000-8000-0000000000f1'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const KEY_SHAPE = new RegExp(`^tenants/${UUID}/fleet-driver-attachments/${UUID}/[a-z_]+/${UUID}$`)

const DRIVER_TAX_ID = '12345678909'
const DRIVER_NAME = 'Maria da Silva'
const DRIVER_LICENSE_NUMBER = '01234567890'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

function expectNoPersonalData(key: string): void {
  const normalized = key.toLowerCase()
  for (const personal of [DRIVER_TAX_ID, DRIVER_LICENSE_NUMBER, 'maria', 'silva']) {
    expect(normalized).not.toContain(personal)
  }
  // Partículas curtas ("da", "de") colidem com hexadecimal de UUID por acaso: só o nome próprio conta.
  const nameParts = DRIVER_NAME.split(' ').filter((part) => part.length > 3)
  expect(nameParts.some((part) => normalized.includes(part.toLowerCase()))).toBe(false)
}

describe('chave do objeto do documento do motorista (spec 091 T012)', () => {
  test('é só empresa, motorista, tipo e objeto, todos opacos', () => {
    const key = buildFleetDriverAttachmentObjectKey({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      objectId: OBJECT_ID,
      type: 'cnh',
    })

    expect(key).toMatch(KEY_SHAPE)
    expect(key).toBe(`tenants/${COMPANY_ID}/fleet-driver-attachments/${DRIVER_ID}/cnh/${OBJECT_ID}`)
  })

  test('o que o use case grava no bucket não carrega CPF, nome, CNH nem o nome do arquivo', async () => {
    const keys: string[] = []
    const useCase = createFleetDriverAttachmentUseCase({
      bucket: 'bucket',
      repository: {
        async create(input) {
          return {
            createdAt: '2026-11-05T00:00:00.000Z',
            id: OBJECT_ID,
            type: input.type,
            uploadedBy: input.uploadedBy,
          }
        },
        async decideSuggestion() {
          return 'decided'
        },
        async driverExists() {
          return true
        },
        async findLocation() {
          return null
        },
        async list() {
          return []
        },
        async remove() {
          return false
        },
      },
      storage: {
        async createSignedDownload() {
          return new URL('https://bucket.example.test/signed')
        },
        async deleteObject() {},
        async storeObject(input) {
          keys.push(input.key)
        },
      },
    })

    await useCase.attach({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      correlationId: 'correlation-091',
      declaredMimeType: 'application/pdf',
      driverId: DRIVER_ID,
      fileName: `CNH ${DRIVER_NAME} ${DRIVER_TAX_ID} ${DRIVER_LICENSE_NUMBER}.pdf`,
      type: 'cnh',
      uploadedBy: OBJECT_ID,
    })

    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(KEY_SHAPE)
    expectNoPersonalData(keys[0] ?? '')
  })

  test('o detector reprova uma chave que carregue o dado pessoal', () => {
    const leaking = `tenants/${COMPANY_ID}/fleet-driver-attachments/${DRIVER_TAX_ID}/cnh/${OBJECT_ID}`

    expect(leaking).not.toMatch(KEY_SHAPE)
    expect(() => expectNoPersonalData(leaking)).toThrow()
  })
})
