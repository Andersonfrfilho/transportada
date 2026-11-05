/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CreateFleetDriverAttachmentInput,
  FleetDriverAttachmentLocation,
  FleetDriverAttachmentRepositoryPort,
} from '../../src/fleet/application/fleet-driver-attachment.port.js'
import { createFleetDriverAttachmentUseCase } from '../../src/fleet/application/fleet-driver-attachment.use-case.js'
import {
  FleetDriverAttachmentInvalidUploadError,
  FleetDriverAttachmentNotFoundError,
  FleetDriverAttachmentTypeTakenError,
} from '../../src/fleet/domain/fleet-driver-attachment.error.js'
import { FleetDriverNotFoundError } from '../../src/fleet/domain/fleet.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000e1'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const LOCATION: FleetDriverAttachmentLocation = {
  bucket: 'bucket',
  objectKey: 'tenants/x/fleet-driver-attachments/y/cnh/z',
  storedObjectId: '00000000-0000-4000-8000-0000000000f1',
}

type Fixture = ReturnType<typeof buildFixture>

function buildFixture(
  overrides: Readonly<{
    createError?: Error
    driverExists?: boolean
    location?: FleetDriverAttachmentLocation | null
    storeError?: Error
  }> = {},
) {
  const events: string[] = []
  const created: CreateFleetDriverAttachmentInput[] = []
  const stored: { readonly contentType: string; readonly key: string }[] = []
  const deletedKeys: string[] = []

  const repository: FleetDriverAttachmentRepositoryPort = {
    async create(input) {
      events.push('create')
      if (overrides.createError !== undefined) throw overrides.createError
      created.push(input)
      return {
        createdAt: '2026-11-05T00:00:00.000Z',
        id: ATTACHMENT_ID,
        type: input.type,
        uploadedBy: input.uploadedBy,
      }
    },
    async driverExists() {
      return overrides.driverExists ?? true
    },
    async findLocation() {
      return overrides.location === undefined ? LOCATION : overrides.location
    },
    async remove() {
      events.push('remove-row')
      return true
    },
  }
  const useCase = createFleetDriverAttachmentUseCase({
    bucket: 'bucket',
    repository,
    storage: {
      async deleteObject({ key }) {
        events.push('delete-object')
        deletedKeys.push(key)
      },
      async storeObject(input) {
        events.push('store')
        if (overrides.storeError !== undefined) throw overrides.storeError
        stored.push({ contentType: input.contentType, key: input.key })
      },
    },
  })
  return { created, deletedKeys, events, stored, useCase }
}

function attach(
  fixture: Fixture,
  overrides: Partial<Parameters<Fixture['useCase']['attach']>[0]> = {},
) {
  return fixture.useCase.attach({
    bytes: PDF_BYTES,
    companyId: COMPANY_ID,
    declaredMimeType: 'application/pdf',
    driverId: DRIVER_ID,
    fileName: 'cnh.pdf',
    type: 'cnh',
    uploadedBy: USER_ID,
    ...overrides,
  })
}

describe('anexo do motorista — anexar', () => {
  test('grava o objeto antes da linha, com o tipo que a assinatura revela', async () => {
    const fixture = buildFixture()

    const result = await attach(fixture, {
      bytes: JPEG_BYTES,
      declaredMimeType: '',
      fileName: 'foto.jpg',
    })

    expect(fixture.events).toEqual(['store', 'create'])
    expect(fixture.stored[0]?.contentType).toBe('image/jpeg')
    expect(fixture.created[0]).toMatchObject({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      mimeType: 'image/jpeg',
      type: 'cnh',
      uploadedBy: USER_ID,
    })
    expect(result.id).toBe(ATTACHMENT_ID)
  })

  /** Spec 091 T010: o nome e o tipo declarado só confirmam; um JPEG chamado `.pdf` é recusado. */
  test('recusa JPEG chamado de .pdf, e nada é gravado', async () => {
    const fixture = buildFixture()

    await expect(
      attach(fixture, { bytes: JPEG_BYTES, declaredMimeType: '', fileName: 'cnh.pdf' }),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentInvalidUploadError)
    await expect(
      attach(fixture, { bytes: JPEG_BYTES, declaredMimeType: 'application/pdf', fileName: 'cnh' }),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentInvalidUploadError)

    expect(fixture.events).toEqual([])
  })

  test('recusa o que não é PDF, JPEG nem PNG, e o corpo vazio', async () => {
    const fixture = buildFixture()
    const text = new TextEncoder().encode('MZ executavel')

    for (const bytes of [text, new Uint8Array()]) {
      await expect(
        attach(fixture, { bytes, declaredMimeType: '', fileName: 'arquivo' }),
      ).rejects.toBeInstanceOf(FleetDriverAttachmentInvalidUploadError)
    }
    expect(fixture.events).toEqual([])
  })

  test('motorista de outra empresa não recebe arquivo nenhum', async () => {
    const fixture = buildFixture({ driverExists: false })

    await expect(attach(fixture)).rejects.toBeInstanceOf(FleetDriverNotFoundError)

    expect(fixture.events).toEqual([])
  })

  test('quem perde a corrida do mesmo tipo apaga o objeto que acabou de subir', async () => {
    const fixture = buildFixture({ createError: new FleetDriverAttachmentTypeTakenError() })

    await expect(attach(fixture)).rejects.toBeInstanceOf(FleetDriverAttachmentTypeTakenError)

    expect(fixture.events).toEqual(['store', 'create', 'delete-object'])
    expect(fixture.deletedKeys).toEqual([fixture.stored[0]?.key ?? 'missing'])
  })

  test('bucket fora do ar não grava linha', async () => {
    const fixture = buildFixture({ storeError: new Error('bucket fora do ar') })

    await expect(attach(fixture)).rejects.toThrow('bucket fora do ar')

    expect(fixture.events).toEqual(['store'])
  })
})

describe('anexo do motorista — remover', () => {
  test('apaga o objeto do bucket antes de tirar a linha', async () => {
    const fixture = buildFixture()

    await fixture.useCase.remove({
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
    })

    expect(fixture.events).toEqual(['delete-object', 'remove-row'])
    expect(fixture.deletedKeys).toEqual([LOCATION.objectKey])
  })

  test('anexo que não é deste motorista e empresa é 404 e não apaga nada', async () => {
    const fixture = buildFixture({ location: null })

    await expect(
      fixture.useCase.remove({
        attachmentId: ATTACHMENT_ID,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
      }),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

    expect(fixture.events).toEqual([])
  })
})
