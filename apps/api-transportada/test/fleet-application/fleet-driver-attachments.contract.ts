/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CreateFleetDriverAttachmentInput,
  FleetDriverAttachmentListItem,
  FleetDriverAttachmentLocation,
  FleetDriverAttachmentRepositoryPort,
} from '../../src/fleet/application/fleet-driver-attachment.port.js'
import { createFleetDriverAttachmentUseCase } from '../../src/fleet/application/fleet-driver-attachment.use-case.js'
import {
  FleetDriverAttachmentInvalidUploadError,
  FleetDriverAttachmentNotFoundError,
  FleetDriverAttachmentSuggestionDecidedError,
  FleetDriverAttachmentTypeTakenError,
} from '../../src/fleet/domain/fleet-driver-attachment.error.js'
import { FleetDriverNotFoundError } from '../../src/fleet/domain/fleet.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const CORRELATION_ID = 'correlation-091'
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000e1'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const LOCATION: FleetDriverAttachmentLocation = {
  bucket: 'bucket',
  objectKey: 'tenants/x/fleet-driver-attachments/y/cnh/z',
  storedObjectId: '00000000-0000-4000-8000-0000000000f1',
}

const LISTED_ITEM: FleetDriverAttachmentListItem = {
  createdAt: '2026-11-05T00:00:00.000Z',
  hasSuggestion: true,
  id: ATTACHMENT_ID,
  type: 'cnh',
  uploadedBy: { id: USER_ID, name: 'Ana Operadora' },
}

type Fixture = ReturnType<typeof buildFixture>

function buildFixture(
  overrides: Readonly<{
    createError?: Error
    decisionOutcome?: 'already_decided' | 'decided' | 'not_found'
    driverExists?: boolean
    location?: FleetDriverAttachmentLocation | null
    storeError?: Error
  }> = {},
) {
  const events: string[] = []
  const created: CreateFleetDriverAttachmentInput[] = []
  const stored: { readonly contentType: string; readonly key: string }[] = []
  const deletedKeys: string[] = []
  const listed: FleetDriverAttachmentListItem[] = [LISTED_ITEM]
  const decisions: Parameters<FleetDriverAttachmentRepositoryPort['decideSuggestion']>[0][] = []
  const signed: { readonly expiresInSeconds: number; readonly key: string }[] = []

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
    async decideSuggestion(input) {
      events.push('decide')
      decisions.push(input)
      return overrides.decisionOutcome ?? 'decided'
    },
    async list() {
      return listed
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
      async createSignedDownload(input) {
        signed.push({ expiresInSeconds: input.expiresInSeconds, key: input.key })
        return new URL('https://bucket.example.test/signed')
      },
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
  return { created, decisions, deletedKeys, events, signed, stored, useCase }
}

function attach(
  fixture: Fixture,
  overrides: Partial<Parameters<Fixture['useCase']['attach']>[0]> = {},
) {
  return fixture.useCase.attach({
    bytes: PDF_BYTES,
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
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
      correlationId: CORRELATION_ID,
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

describe('anexo do motorista — revelar', () => {
  test('assina o objeto do anexo por prazo curto e devolve só a URL', async () => {
    const fixture = buildFixture()

    const result = await fixture.useCase.reveal({
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
    })

    expect(result).toEqual({ url: 'https://bucket.example.test/signed' })
    expect(fixture.signed).toEqual([{ expiresInSeconds: 300, key: LOCATION.objectKey }])
  })

  test('anexo que não é deste motorista e empresa é 404 e nada é assinado', async () => {
    const fixture = buildFixture({ location: null })

    await expect(
      fixture.useCase.reveal({
        attachmentId: ATTACHMENT_ID,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
      }),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

    expect(fixture.signed).toEqual([])
  })
})

describe('anexo do motorista — decidir a sugestão da leitura', () => {
  const decide = (fixture: Fixture, decision: 'accepted' | 'dismissed' = 'dismissed') =>
    fixture.useCase.decideSuggestion({
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      decidedBy: USER_ID,
      decision,
      driverId: DRIVER_ID,
    })

  test('registra a decisão de quem decidiu, na empresa e no motorista do anexo', async () => {
    const fixture = buildFixture()

    await decide(fixture, 'accepted')

    expect(fixture.decisions).toEqual([
      {
        attachmentId: ATTACHMENT_ID,
        companyId: COMPANY_ID,
        decidedBy: USER_ID,
        decision: 'accepted',
        driverId: DRIVER_ID,
      },
    ])
  })

  test('anexo inexistente é 404, e decidir de novo é 409', async () => {
    await expect(decide(buildFixture({ decisionOutcome: 'not_found' }))).rejects.toBeInstanceOf(
      FleetDriverAttachmentNotFoundError,
    )
    await expect(
      decide(buildFixture({ decisionOutcome: 'already_decided' })),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentSuggestionDecidedError)
  })
})

describe('anexo do motorista — listar', () => {
  test('lista os anexos do motorista da empresa', async () => {
    const fixture = buildFixture()

    expect(await fixture.useCase.list({ companyId: COMPANY_ID, driverId: DRIVER_ID })).toEqual([
      LISTED_ITEM,
    ])
  })

  test('motorista de outra empresa é 404, não lista vazia', async () => {
    const fixture = buildFixture({ driverExists: false })

    await expect(
      fixture.useCase.list({ companyId: COMPANY_ID, driverId: DRIVER_ID }),
    ).rejects.toBeInstanceOf(FleetDriverNotFoundError)
  })
})
