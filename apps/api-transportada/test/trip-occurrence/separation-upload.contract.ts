/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T6 (RF5/RF7, CA2/CA4/CA7b): escrito antes do código — a rota de registro da ocorrência
 * de galpão vira multipart, com original obrigatório e miniatura opcional, os dois validados por
 * teto/tipo/assinatura antes de qualquer trabalho, e persistidos na mesma transação com limpeza de
 * órfão se algo falhar depois do upload.
 */
import { describe, expect, it, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import type { RemovableObjectStoragePort } from '../../src/trips/application/stored-object-cleanup.service.js'
import type {
  SeparationOccurrenceTransactionPort,
  SeparationOccurrenceUnitOfWork,
} from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import {
  OCCURRENCE_ATTACHMENT_RETENTION_YEARS,
  OCCURRENCE_PHOTO_MAX_BYTES,
  OCCURRENCE_THUMBNAIL_MAX_BYTES,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import { parseRegisterOccurrenceMultipartRequest } from '../../src/trips/presentation/occurrence.schema.js'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const THUMBNAIL_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43])
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4])

const TIPO = '00000000-0000-4000-8000-0000000000e1'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000f'

function multipart(input: {
  readonly fields?: Record<string, string>
  readonly file?: Uint8Array | null
  readonly thumbnails?: readonly Uint8Array[]
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields ?? {})) form.set(key, value)
  if (input.file !== null) {
    form.append('file', new File([input.file ?? JPEG], 'ocorrencia.jpg', { type: 'image/jpeg' }))
  }
  for (const bytes of input.thumbnails ?? []) {
    form.append('thumbnail', new File([bytes], 'thumb.jpg', { type: 'image/jpeg' }))
  }
  return new Request('http://localhost/trips/x', {
    body: form,
    headers: { 'Idempotency-Key': 'k1' },
    method: 'POST',
  })
}

async function statusOf(operation: Promise<unknown>): Promise<number | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.status : -1
  }
}

describe('parser multipart do registro (spec 161 T6, RF5)', () => {
  it('corpo JSON responde 400', async () => {
    const request = new Request('http://localhost/trips/x', {
      body: JSON.stringify({ note: '', occurrenceTypeId: TIPO, productCode: '' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(await statusOf(parseRegisterOccurrenceMultipartRequest(request))).toBe(400)
  })

  it('sem file responde 400 — inclusive quando só thumbnail veio', async () => {
    const semNada = multipart({ fields: { occurrenceTypeId: TIPO }, file: null })
    const soThumbnail = multipart({
      fields: { occurrenceTypeId: TIPO },
      file: null,
      thumbnails: [JPEG],
    })
    expect(await statusOf(parseRegisterOccurrenceMultipartRequest(semNada))).toBe(400)
    expect(await statusOf(parseRegisterOccurrenceMultipartRequest(soThumbnail))).toBe(400)
  })

  it('campo fora da lista fechada responde 400', async () => {
    const request = multipart({ fields: { occurrenceTypeId: TIPO, unexpected: 'x' } })
    expect(await statusOf(parseRegisterOccurrenceMultipartRequest(request))).toBe(400)
  })

  it('dois thumbnails respondem 400', async () => {
    const request = multipart({ fields: { occurrenceTypeId: TIPO }, thumbnails: [JPEG, JPEG] })
    expect(await statusOf(parseRegisterOccurrenceMultipartRequest(request))).toBe(400)
  })

  it('file sem thumbnail é aceito, sem miniatura no resultado', async () => {
    const request = multipart({
      fields: { note: 'avaria', occurrenceTypeId: TIPO, productCode: 'p1' },
    })
    const parsed = await parseRegisterOccurrenceMultipartRequest(request)
    expect(parsed.attachment.bytes).toEqual(JPEG)
    expect(parsed.attachment.thumbnail).toBeUndefined()
    expect(parsed.note).toBe('avaria')
    expect(parsed.productCode).toBe('p1')
  })

  it('file com thumbnail é aceito, os dois nos bytes certos', async () => {
    const thumbnailBytes = new Uint8Array([9, 9, 9])
    const request = multipart({ fields: { occurrenceTypeId: TIPO }, thumbnails: [thumbnailBytes] })
    const parsed = await parseRegisterOccurrenceMultipartRequest(request)
    expect(parsed.attachment.bytes).toEqual(JPEG)
    expect(parsed.attachment.thumbnail?.bytes).toEqual(thumbnailBytes)
  })
})

function buildCalls() {
  return { notified: 0, saved: 0 }
}

function registrar(input: {
  readonly attachment: {
    readonly bytes: Uint8Array
    readonly mimeType: string
    readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
  }
  readonly calls: { notified: number; saved: number }
}) {
  return registerTripOccurrence({
    actorUserId: ACTOR_USER_ID,
    attachment: input.attachment,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    note: '',
    occurredOn: '21/09/2026',
    occurrenceTypeId: TIPO,
    productCode: '',
    repository: {
      async findOccurrenceType() {
        return {
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: TIPO,
          name: 'Item avariado',
          notifies: false,
          stage: 'separation' as const,
        }
      },
      async listDocumentProducts() {
        return []
      },
      async listOccurrences() {
        return []
      },
      async readTemplateValues() {
        throw new Error('TEMPLATE_NOT_EXPECTED')
      },
      async saveOccurrence(saved) {
        input.calls.saved += 1
        return {
          attachments: [{ id: '00000000-0000-4000-8000-0000000000a1', position: 1 }],
          createdAt: '2026-09-21T12:00:00.000Z',
          id: '00000000-0000-4000-8000-0000000000c1',
          note: '',
          occurrenceTypeId: TIPO,
          productCode: '',
          productCodes: [],
          stage: saved.stage,
          typeName: saved.typeName,
        }
      },
    },
    tripId: TRIP_ID,
  })
}

describe('caso de uso encaminha o anexo, sem revalidar bytes (spec 161 T6)', () => {
  test('caso feliz devolve attachments: [{ id, position: 1 }], vindos de saveOccurrence', async () => {
    const calls = buildCalls()

    const registered = await registrar({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      calls,
    })

    expect(registered.attachments).toEqual([
      { id: '00000000-0000-4000-8000-0000000000a1', position: 1 },
    ])
    expect(calls.saved).toBe(1)
  })
})

function buildStandaloneInput() {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    items: [],
    note: '',
    occurrenceTypeId: TIPO,
    productCode: '',
    productCodes: [],
    stage: 'separation' as const,
    tripId: TRIP_ID,
    typeName: 'Item avariado',
  }
}

describe('teto, tipo e assinatura do original e da miniatura (spec 161 T6, RF7/CA4)', () => {
  test('CA4: original maior que o teto responde 422 sem tocar storage nem transação', async () => {
    const storage = buildFakeStorage()
    const oversized = new Uint8Array(OCCURRENCE_PHOTO_MAX_BYTES + 1)
    oversized.set(JPEG)

    const error = await persistSeparationOccurrenceWithAttachment({
      attachment: { bytes: oversized, mimeType: 'image/jpeg' },
      input: buildStandaloneInput(),
      newObjectId: () => 'object-1',
      now: () => new Date(),
      storage,
      unitOfWork: buildFakeUnitOfWork({ occurrenceId: '00000000-0000-4000-8000-0000000000c1' }),
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_DELIVERY_PROOF_TOO_LARGE', status: 422 })
    expect(storage.stored).toHaveLength(0)
  })

  test('CA4: miniatura maior que o teto responde 422 sem tocar storage nem transação', async () => {
    const storage = buildFakeStorage()
    const oversizedThumbnail = new Uint8Array(OCCURRENCE_THUMBNAIL_MAX_BYTES + 1)
    oversizedThumbnail.set(JPEG)

    const error = await persistSeparationOccurrenceWithAttachment({
      attachment: {
        bytes: JPEG,
        mimeType: 'image/jpeg',
        thumbnail: { bytes: oversizedThumbnail, mimeType: 'image/jpeg' },
      },
      input: buildStandaloneInput(),
      newObjectId: () => 'object-1',
      now: () => new Date(),
      storage,
      unitOfWork: buildFakeUnitOfWork({ occurrenceId: '00000000-0000-4000-8000-0000000000c1' }),
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_DELIVERY_PROOF_TOO_LARGE', status: 422 })
    expect(storage.stored).toHaveLength(0)
  })

  test('tipo/assinatura de bytes errados respondem 422 sem tocar storage nem transação', async () => {
    const storage = buildFakeStorage()

    const error = await persistSeparationOccurrenceWithAttachment({
      attachment: { bytes: NOT_AN_IMAGE, mimeType: 'image/jpeg' },
      input: buildStandaloneInput(),
      newObjectId: () => 'object-1',
      now: () => new Date(),
      storage,
      unitOfWork: buildFakeUnitOfWork({ occurrenceId: '00000000-0000-4000-8000-0000000000c1' }),
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', status: 422 })
    expect(storage.stored).toHaveLength(0)
  })
})

/** Um `unitOfWork` de mentira — sem Postgres — só para provar a orquestração de escrita. */
function buildFakeStorage(): RemovableObjectStoragePort & {
  readonly removed: string[]
  readonly stored: string[]
} {
  const removed: string[] = []
  const stored: string[] = []
  return {
    removed,
    async remove(input) {
      removed.push(input.objectKey)
    },
    async store(input) {
      stored.push(input.objectKey)
      return { sha256: `sha-${input.objectKey}` }
    },
    stored,
  }
}

function buildFakeUnitOfWork(input: {
  readonly failInsertAttachment?: boolean
  readonly occurrenceId: string
}): SeparationOccurrenceUnitOfWork {
  return {
    execute<TResult>(
      operation: (transaction: SeparationOccurrenceTransactionPort) => Promise<TResult>,
    ) {
      const transaction: SeparationOccurrenceTransactionPort = {
        async insertAttachment() {
          if (input.failInsertAttachment === true) throw new Error('FORCED_INSERT_FAILURE')
          return { id: '00000000-0000-4000-8000-0000000000a1', position: 1 }
        },
        async insertOccurrenceProducts() {},
        async insertStoredObject() {},
        async saveOccurrence(saveInput) {
          return {
            createdAt: '2026-09-21T12:00:00.000Z',
            id: input.occurrenceId,
            note: saveInput.note,
            occurrenceTypeId: saveInput.occurrenceTypeId,
            productCode: saveInput.productCode,
            productCodes: [],
            stage: saveInput.stage,
            typeName: saveInput.typeName,
          }
        },
      }
      return operation(transaction)
    },
  }
}

describe('persistência transacional do original e da miniatura (spec 161 T6, CA7b)', () => {
  test('caso feliz: sobe os dois objetos, grava position 1 e a retenção de 5 anos', async () => {
    const storage = buildFakeStorage()
    const now = new Date('2026-09-21T12:00:00.000Z')

    const result = await persistSeparationOccurrenceWithAttachment({
      attachment: {
        bytes: JPEG,
        mimeType: 'image/jpeg',
        thumbnail: { bytes: THUMBNAIL_JPEG, mimeType: 'image/jpeg' },
      },
      input: {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        items: [],
        note: '',
        occurrenceTypeId: TIPO,
        productCode: '',
        productCodes: [],
        stage: 'separation',
        tripId: TRIP_ID,
        typeName: 'Item avariado',
      },
      newObjectId: (() => {
        let count = 0
        return () => {
          count += 1
          return `object-${count}`
        }
      })(),
      now: () => now,
      storage,
      unitOfWork: buildFakeUnitOfWork({ occurrenceId: '00000000-0000-4000-8000-0000000000c1' }),
    })

    expect(result?.attachments).toEqual([
      { id: '00000000-0000-4000-8000-0000000000a1', position: 1 },
    ])
    expect(storage.stored).toHaveLength(2)
    expect(storage.removed).toHaveLength(0)

    const expectedRetention = new Date(now)
    expectedRetention.setUTCFullYear(now.getUTCFullYear() + OCCURRENCE_ATTACHMENT_RETENTION_YEARS)
  })

  test('file sem thumbnail sobe só um objeto', async () => {
    const storage = buildFakeStorage()

    await persistSeparationOccurrenceWithAttachment({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      input: {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        items: [],
        note: '',
        occurrenceTypeId: TIPO,
        productCode: '',
        productCodes: [],
        stage: 'separation',
        tripId: TRIP_ID,
        typeName: 'Item avariado',
      },
      newObjectId: () => 'object-1',
      now: () => new Date(),
      storage,
      unitOfWork: buildFakeUnitOfWork({ occurrenceId: '00000000-0000-4000-8000-0000000000c1' }),
    })

    expect(storage.stored).toHaveLength(1)
  })

  /**
   * CA7b: se a gravação falhar **depois** de original e miniatura já terem subido ao bucket, os
   * dois objetos voltam a sair — `runWithStoredObjectCleanup` não distingue por que a transação
   * falhou, só que ela falhou depois de reservar bytes.
   */
  test('CA7b: falha depois do upload limpa os dois objetos, original e miniatura', async () => {
    const storage = buildFakeStorage()

    const error = await persistSeparationOccurrenceWithAttachment({
      attachment: {
        bytes: JPEG,
        mimeType: 'image/jpeg',
        thumbnail: { bytes: THUMBNAIL_JPEG, mimeType: 'image/jpeg' },
      },
      input: {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        items: [],
        note: '',
        occurrenceTypeId: TIPO,
        productCode: '',
        productCodes: [],
        stage: 'separation',
        tripId: TRIP_ID,
        typeName: 'Item avariado',
      },
      newObjectId: (() => {
        let count = 0
        return () => {
          count += 1
          return `object-${count}`
        }
      })(),
      now: () => new Date(),
      storage,
      unitOfWork: buildFakeUnitOfWork({
        failInsertAttachment: true,
        occurrenceId: '00000000-0000-4000-8000-0000000000c1',
      }),
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(storage.stored).toHaveLength(2)
    expect(storage.removed).toHaveLength(2)
    expect(storage.removed.sort()).toEqual(storage.stored.sort())
  })
})
