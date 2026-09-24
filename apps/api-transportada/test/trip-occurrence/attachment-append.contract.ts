/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T7 (RF6, CA3): a rota de anexo adicional — segunda foto em diante, para uma ocorrência
 * já registrada. Escrito antes do código: segunda foto vira `position: 2`; sexta responde 409;
 * ocorrência de outra empresa responde 404; ocorrência de etapa `delivery` responde 422; aceita
 * `file` + `thumbnail` com as mesmas regras de T6.
 */
import { describe, expect, test } from 'bun:test'

import {
  attachOccurrencePhoto,
  type AttachOccurrencePhotoPort,
  type AttachOccurrencePhotoTransactionPort,
  type AttachOccurrencePhotoUnitOfWork,
} from '../../src/trips/application/attach-occurrence-photo.use-case.js'
import type { RemovableObjectStoragePort } from '../../src/trips/application/stored-object-cleanup.service.js'
import { OCCURRENCE_ATTACHMENT_LIMIT } from '../../src/trips/domain/occurrence-attachment.policy.js'
import { TripOccurrenceAttachmentLimitError } from '../../src/trips/domain/trip.error.js'
import { parseAttachOccurrencePhotoRequest } from '../../src/trips/presentation/occurrence.schema.js'
import { ApiError } from '../../src/shared/api.error.js'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const THUMBNAIL_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43])
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4])

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000c1'

async function statusOf(operation: Promise<unknown>): Promise<number | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.status : -1
  }
}

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

describe('parser multipart do anexo adicional (spec 161 T7, RF6)', () => {
  test('sem file responde 400', async () => {
    const request = multipart({ file: null })
    expect(await statusOf(parseAttachOccurrencePhotoRequest(request))).toBe(400)
  })

  test('campo fora da lista fechada responde 400 — occurrenceTypeId não é aceito aqui', async () => {
    const request = multipart({ fields: { occurrenceTypeId: 'x' } })
    expect(await statusOf(parseAttachOccurrencePhotoRequest(request))).toBe(400)
  })

  test('dois thumbnails respondem 400', async () => {
    const request = multipart({ thumbnails: [JPEG, JPEG] })
    expect(await statusOf(parseAttachOccurrencePhotoRequest(request))).toBe(400)
  })

  test('file com thumbnail é aceito, os dois nos bytes certos', async () => {
    const thumbnailBytes = new Uint8Array([9, 9, 9])
    const parsed = await parseAttachOccurrencePhotoRequest(
      multipart({ thumbnails: [thumbnailBytes] }),
    )
    expect(parsed.attachment.bytes).toEqual(JPEG)
    expect(parsed.attachment.thumbnail?.bytes).toEqual(thumbnailBytes)
  })
})

type FakeRepositoryInput = {
  readonly existingCount?: number
  readonly occurrence?: { readonly id: string; readonly stage: 'delivery' | 'separation' } | null
  readonly limitOnInsert?: boolean
}

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

function buildFakeRepository(input: FakeRepositoryInput): {
  readonly repository: AttachOccurrencePhotoPort
  readonly storage: ReturnType<typeof buildFakeStorage>
} {
  const storage = buildFakeStorage()
  const unitOfWork: AttachOccurrencePhotoUnitOfWork = {
    execute<TResult>(
      operation: (transaction: AttachOccurrencePhotoTransactionPort) => Promise<TResult>,
    ) {
      const transaction: AttachOccurrencePhotoTransactionPort = {
        async insertAttachment() {
          if (input.limitOnInsert === true) throw new TripOccurrenceAttachmentLimitError()
          return { id: '00000000-0000-4000-8000-0000000000a2', position: 2 }
        },
        async insertStoredObject() {},
      }
      return operation(transaction)
    },
  }

  return {
    repository: {
      async countOccurrenceAttachments() {
        return input.existingCount ?? 1
      },
      async findOccurrence() {
        return input.occurrence === undefined
          ? { id: OCCURRENCE_ID, stage: 'separation' as const }
          : input.occurrence
      },
      newObjectId: (() => {
        let count = 0
        return () => {
          count += 1
          return `object-${count}`
        }
      })(),
      now: () => new Date('2026-09-21T12:00:00.000Z'),
      storage,
      unitOfWork,
    },
    storage,
  }
}

describe('caso de uso do anexo adicional (spec 161 T7, CA3)', () => {
  test('segunda foto vira position: 2', async () => {
    const { repository } = buildFakeRepository({ existingCount: 1 })

    const result = await attachOccurrencePhoto({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    })

    expect(result).toEqual({ id: '00000000-0000-4000-8000-0000000000a2', position: 2 })
  })

  test('sexta foto responde 409, sem tocar o storage', async () => {
    const { repository, storage } = buildFakeRepository({
      existingCount: OCCURRENCE_ATTACHMENT_LIMIT,
    })

    const error = await attachOccurrencePhoto({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_OCCURRENCE_ATTACHMENT_LIMIT', status: 409 })
    expect(storage.stored).toHaveLength(0)
  })

  test('ocorrência de outra empresa (ou inexistente) responde 404', async () => {
    const { repository } = buildFakeRepository({ occurrence: null })

    const error = await attachOccurrencePhoto({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND', status: 404 })
  })

  test('ocorrência de etapa delivery responde 422', async () => {
    const { repository } = buildFakeRepository({
      occurrence: { id: OCCURRENCE_ID, stage: 'delivery' },
    })

    const error = await attachOccurrencePhoto({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'OCCURRENCE_TYPE_NOT_SEPARATION', status: 422 })
  })

  test('bytes que não são a imagem declarada respondem 422 sem tocar o storage', async () => {
    const { repository, storage } = buildFakeRepository({ existingCount: 1 })

    const error = await attachOccurrencePhoto({
      attachment: { bytes: NOT_AN_IMAGE, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', status: 422 })
    expect(storage.stored).toHaveLength(0)
  })

  test('caso feliz com thumbnail sobe os dois objetos', async () => {
    const { repository, storage } = buildFakeRepository({ existingCount: 1 })

    await attachOccurrencePhoto({
      attachment: {
        bytes: JPEG,
        mimeType: 'image/jpeg',
        thumbnail: { bytes: THUMBNAIL_JPEG, mimeType: 'image/jpeg' },
      },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    })

    expect(storage.stored).toHaveLength(2)
  })

  test('a corrida da sexta foto (constraint do banco) também converge em 409', async () => {
    const { repository, storage } = buildFakeRepository({
      existingCount: 1,
      limitOnInsert: true,
    })

    const error = await attachOccurrencePhoto({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_OCCURRENCE_ATTACHMENT_LIMIT', status: 409 })
    expect(storage.stored).toHaveLength(1)
    expect(storage.removed).toHaveLength(1)
  })
})
