/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CreateFleetDriverAttachmentInput,
  FleetDriverAttachmentAuditInput,
  FleetDriverAttachmentSuggestionRead,
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
  type: 'cnh',
}
const CLIENT_IP = '203.0.113.9'
const AUDIT_CONTEXT = { actorUserId: USER_ID, clientIp: CLIENT_IP, correlationId: CORRELATION_ID }

const LISTED_ITEM: FleetDriverAttachmentListItem = {
  createdAt: '2026-11-05T00:00:00.000Z',
  hasSuggestion: true,
  id: ATTACHMENT_ID,
  type: 'cnh',
  uploadedBy: { id: USER_ID, name: 'Ana Operadora' },
}

const SUGGESTION: FleetDriverAttachmentSuggestionRead = {
  fields: { licenseCategory: 'D', licenseNumber: '01234567890' },
  isFound: true,
}

type Fixture = ReturnType<typeof buildFixture>

function buildFixture(
  overrides: Readonly<{
    createError?: Error
    deleteError?: Error
    decisionOutcome?: 'already_decided' | 'decided' | 'not_found'
    suggestion?: FleetDriverAttachmentSuggestionRead
    driverExists?: boolean
    location?: FleetDriverAttachmentLocation | null
    objectMissing?: boolean
    removeResult?: boolean
    storeError?: Error
  }> = {},
) {
  const events: string[] = []
  const created: CreateFleetDriverAttachmentInput[] = []
  const stored: { readonly contentType: string; readonly key: string }[] = []
  const deletedKeys: string[] = []
  const listed: FleetDriverAttachmentListItem[] = [LISTED_ITEM]
  const decisions: Parameters<FleetDriverAttachmentRepositoryPort['decideSuggestion']>[0][] = []
  const audited: FleetDriverAttachmentAuditInput[] = []
  const warnings: Record<string, unknown>[] = []
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
    async findByType() {
      return null
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
    async readSuggestion() {
      return overrides.suggestion === undefined ? SUGGESTION : overrides.suggestion
    },
    async remove() {
      events.push('remove-row')
      return overrides.removeResult ?? true
    },
  }
  const useCase = createFleetDriverAttachmentUseCase({
    audit: {
      async record(input) {
        events.push(`audit-${input.action}`)
        audited.push(input)
      },
    },
    bucket: 'bucket',
    logger: { warn: (_message, meta) => void warnings.push(meta) },
    repository,
    storage: {
      async headObject() {
        return overrides.objectMissing === true ? undefined : {}
      },
      async createSignedDownload(input) {
        signed.push({ expiresInSeconds: input.expiresInSeconds, key: input.key })
        return new URL('https://bucket.example.test/signed')
      },
      async deleteObject({ key }) {
        events.push('delete-object')
        deletedKeys.push(key)
        if (overrides.deleteError !== undefined) throw overrides.deleteError
      },
      async storeObject(input) {
        events.push('store')
        if (overrides.storeError !== undefined) throw overrides.storeError
        stored.push({ contentType: input.contentType, key: input.key })
      },
    },
  })
  return { audited, created, decisions, deletedKeys, events, signed, stored, useCase, warnings }
}

function attach(
  fixture: Fixture,
  overrides: Partial<Parameters<Fixture['useCase']['attach']>[0]> = {},
) {
  return fixture.useCase.attach({
    bytes: PDF_BYTES,
    clientIp: CLIENT_IP,
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

    expect(fixture.events).toEqual(['store', 'create', 'audit-attached'])
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
  const remove = (fixture: Fixture) =>
    fixture.useCase.remove({
      ...AUDIT_CONTEXT,
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
    })

  test('tira a linha primeiro, depois o objeto do bucket, e grava a trilha', async () => {
    const fixture = buildFixture()

    await remove(fixture)

    expect(fixture.events).toEqual(['remove-row', 'delete-object', 'audit-removed'])
    expect(fixture.deletedKeys).toEqual([LOCATION.objectKey])
    expect(fixture.audited[0]).toMatchObject({
      ...AUDIT_CONTEXT,
      attachmentId: ATTACHMENT_ID,
      driverId: DRIVER_ID,
      type: 'cnh',
    })
  })

  test('bucket fora do ar não desfaz a remoção: loga só ids e segue', async () => {
    const fixture = buildFixture({ deleteError: new Error('bucket fora do ar') })

    await remove(fixture)

    expect(fixture.warnings).toEqual([{ bucket: 'bucket', objectKey: LOCATION.objectKey }])
    expect(fixture.events).toEqual(['remove-row', 'delete-object', 'audit-removed'])
  })

  test('anexo que não é deste motorista e empresa é 404 e não apaga nada', async () => {
    const fixture = buildFixture({ location: null })

    await expect(remove(fixture)).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

    expect(fixture.events).toEqual([])
  })

  test('linha que sumiu na corrida é 404 e o objeto não é tocado', async () => {
    const fixture = buildFixture({ removeResult: false })

    await expect(remove(fixture)).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

    expect(fixture.events).toEqual(['remove-row'])
  })
})

describe('anexo do motorista — revelar', () => {
  const reveal = (fixture: Fixture) =>
    fixture.useCase.reveal({
      ...AUDIT_CONTEXT,
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
    })

  test('audita e então assina o objeto por prazo curto, devolvendo só a URL', async () => {
    const fixture = buildFixture()

    const result = await reveal(fixture)

    expect(result).toEqual({ url: 'https://bucket.example.test/signed' })
    expect(fixture.signed).toEqual([{ expiresInSeconds: 300, key: LOCATION.objectKey }])
    expect(fixture.events).toEqual(['audit-revealed'])
    expect(fixture.audited[0]).toMatchObject({
      ...AUDIT_CONTEXT,
      action: 'revealed',
      attachmentId: ATTACHMENT_ID,
      driverId: DRIVER_ID,
      type: 'cnh',
    })
  })

  test('anexo que não é deste motorista e empresa é 404, sem assinar nem auditar', async () => {
    const fixture = buildFixture({ location: null })

    await expect(reveal(fixture)).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

    expect(fixture.signed).toEqual([])
    expect(fixture.audited).toEqual([])
  })

  test('objeto que sumiu do bucket é 404, e não um link morto', async () => {
    const fixture = buildFixture({ objectMissing: true })

    await expect(reveal(fixture)).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)

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

describe('anexo do motorista — ler a sugestão da CNH', () => {
  const read = (fixture: Fixture) =>
    fixture.useCase.readSuggestion({
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
    })

  test('devolve os campos lidos que a ficha sabe receber', async () => {
    expect(await read(buildFixture())).toEqual({
      fields: { licenseCategory: 'D', licenseNumber: '01234567890' },
    })
  })

  test('sem leitura, ou já decidida, devolve campos nulos — e anexo alheio é 404', async () => {
    expect(await read(buildFixture({ suggestion: { fields: null, isFound: true } }))).toEqual({
      fields: null,
    })
    await expect(
      read(buildFixture({ suggestion: { fields: null, isFound: false } })),
    ).rejects.toBeInstanceOf(FleetDriverAttachmentNotFoundError)
  })
})
