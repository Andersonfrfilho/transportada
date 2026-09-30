/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T3.4 (RF17/RF19): a miniatura do canhoto e da foto da mercadoria que o escritório grava
 * por `field-delivery` e `field-proof` — campo opcional no multipart, teto de 128 KiB conferido antes
 * do bucket, e um segundo objeto gravado na mesma transação do original.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  assertOfficeUploadAccepted,
  persistOfficeProof,
  type PersistOfficeProofParams,
} from '../../src/trips/application/office-delivery-proof.service.js'
import { DELIVERY_PROOF_THUMBNAIL_MAX_BYTES } from '../../src/trips/domain/delivery-proof.policy.js'
import {
  parseOfficeFieldDeliveryRequest,
  parseOfficeFieldProofRequest,
} from '../../src/trips/presentation/office-field-delivery.schema.js'

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]
const JPEG = new Uint8Array(JPEG_HEADER)
const THUMBNAIL = new Uint8Array([...JPEG_HEADER, 0x01, 0x02])

function jpegOfSize(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(JPEG_HEADER)
  return bytes
}

function multipart(input: {
  readonly fields?: Record<string, string>
  readonly thumbnail?: File | string
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields ?? {})) form.set(key, value)
  form.set('file', new File([JPEG], 'canhoto.jpg', { type: 'image/jpeg' }))
  if (input.thumbnail !== undefined) form.set('thumbnail', input.thumbnail)
  return new Request('http://localhost/trips/x', { body: form, method: 'POST' })
}

const THUMBNAIL_FILE = new File([THUMBNAIL], 'miniatura.jpg', { type: 'image/jpeg' })
const DELIVERED_AT = { deliveredAt: '2026-09-18T09:00:00.000Z' }

async function statusOf(operation: Promise<unknown>): Promise<number | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.status : -1
  }
}

describe('o campo thumbnail do multipart do escritório (spec 220 RF17)', () => {
  it('field-delivery: arquivo presente vira bytes e tipo da miniatura', async () => {
    const parsed = await parseOfficeFieldDeliveryRequest(
      multipart({ fields: DELIVERED_AT, thumbnail: THUMBNAIL_FILE }),
    )
    expect(parsed.proof?.thumbnail).toEqual({ bytes: THUMBNAIL, mimeType: 'image/jpeg' })
  })

  it('field-proof: arquivo presente vira bytes e tipo da miniatura', async () => {
    const parsed = await parseOfficeFieldProofRequest(
      multipart({ fields: { kind: 'cargo' }, thumbnail: THUMBNAIL_FILE }),
    )
    expect(parsed.proof.thumbnail).toEqual({ bytes: THUMBNAIL, mimeType: 'image/jpeg' })
  })

  it('ausente é válido: nenhuma miniatura, e o original passa como antes', async () => {
    const delivery = await parseOfficeFieldDeliveryRequest(multipart({ fields: DELIVERED_AT }))
    const proof = await parseOfficeFieldProofRequest(multipart({}))
    expect(delivery.proof?.thumbnail).toBeUndefined()
    expect(proof.proof.thumbnail).toBeUndefined()
  })

  it('texto no lugar do arquivo é 400 nas duas rotas', async () => {
    expect(
      await statusOf(
        parseOfficeFieldDeliveryRequest(multipart({ fields: DELIVERED_AT, thumbnail: 'texto' })),
      ),
    ).toBe(400)
    expect(await statusOf(parseOfficeFieldProofRequest(multipart({ thumbnail: 'texto' })))).toBe(
      400,
    )
  })
})

describe('teto e tipo da miniatura do escritório, antes de tocar o bucket (spec 220 RF17)', () => {
  const original = { bytes: JPEG, mimeType: 'image/jpeg' }

  it('exatamente 128 KiB passa', () => {
    expect(() =>
      assertOfficeUploadAccepted({
        ...original,
        thumbnail: {
          bytes: jpegOfSize(DELIVERY_PROOF_THUMBNAIL_MAX_BYTES),
          mimeType: 'image/jpeg',
        },
      }),
    ).not.toThrow()
  })

  it('um byte acima de 128 KiB responde 422 TRIP_DELIVERY_PROOF_TOO_LARGE', () => {
    expect(() =>
      assertOfficeUploadAccepted({
        ...original,
        thumbnail: {
          bytes: jpegOfSize(DELIVERY_PROOF_THUMBNAIL_MAX_BYTES + 1),
          mimeType: 'image/jpeg',
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_TOO_LARGE', status: 422 }))
  })

  it('tipo que não é imagem aceita responde 422 TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', () => {
    expect(() =>
      assertOfficeUploadAccepted({
        ...original,
        thumbnail: { bytes: THUMBNAIL, mimeType: 'application/pdf' },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', status: 422 }),
    )
  })

  it('bytes que não batem com o tipo declarado da miniatura são recusados', () => {
    expect(() =>
      assertOfficeUploadAccepted({
        ...original,
        thumbnail: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE', status: 422 }),
    )
  })
})

type SavedProof = Parameters<
  PersistOfficeProofParams['transaction']['saveDeliveryProofWithinTransaction']
>[0]

async function persistWith(thumbnail: { bytes: Uint8Array; mimeType: string } | undefined) {
  const objectIds = ['original-object', 'thumbnail-object']
  const storedKeys: string[] = []
  const saved: SavedProof[] = []
  const transaction = {
    findProofForEvent: async () => null,
    findProofIdByAttachmentKeyWithinTransaction: async () => null,
    saveDeliveryProofWithinTransaction: async (input: SavedProof) => {
      saved.push(input)
      return { id: input.id }
    },
  } as unknown as PersistOfficeProofParams['transaction']
  const storage = {
    remove: async () => undefined,
    store: async (input: { readonly objectKey: string }) => {
      storedKeys.push(input.objectKey)
      return { sha256: 'a'.repeat(64) }
    },
  }
  await persistOfficeProof({
    actorUserId: 'actor',
    attachment: {
      newObjectId: () => objectIds.shift() ?? 'extra-object',
      newProofId: () => 'proof-1',
      resolveSettings: async () => {
        throw new Error('not used')
      },
      sealDocument: async () => {
        throw new Error('not used')
      },
      storage,
    },
    authorship: { channel: 'office', onBehalfOfDriverId: null },
    companyId: 'company',
    eventId: 'event',
    kind: 'photo',
    storage,
    transaction,
    upload: {
      attachmentKey: '',
      bytes: JPEG,
      mimeType: 'image/jpeg',
      receiverDocument: '',
      receiverName: '',
      ...(thumbnail === undefined ? {} : { thumbnail }),
    },
  })
  return { saved, storedKeys }
}

describe('o escritório grava a miniatura ao lado do original (spec 220 RF17/RF19)', () => {
  it('com miniatura, sobe um segundo objeto e o entrega à gravação', async () => {
    const { saved, storedKeys } = await persistWith({ bytes: THUMBNAIL, mimeType: 'image/jpeg' })
    expect(storedKeys).toHaveLength(2)
    expect(saved[0]?.thumbnail).toMatchObject({
      mimeType: 'image/jpeg',
      objectId: 'thumbnail-object',
      sizeBytes: THUMBNAIL.byteLength,
    })
    expect(saved[0]?.thumbnail?.objectKey).toBe(storedKeys[1])
  })

  it('sem miniatura, sobe um objeto só e a gravação segue sem o campo', async () => {
    const { saved, storedKeys } = await persistWith(undefined)
    expect(storedKeys).toHaveLength(1)
    expect(saved[0]?.thumbnail).toBeUndefined()
  })
})
