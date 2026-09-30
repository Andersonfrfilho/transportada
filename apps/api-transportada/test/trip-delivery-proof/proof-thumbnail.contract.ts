/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF17-RF19 (T3.3): a miniatura do comprovante é um campo multipart opcional, com teto de
 * 128 KiB; ausente é o caso normal, e a recaptura troca a miniatura junto com o original.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { DELIVERY_PROOF_THUMBNAIL_MAX_BYTES } from '../../src/trips/domain/delivery-proof.policy.js'
import { buildProofUpsertSet } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const OBJECT_ID = '00000000-0000-4000-8000-000000000006'
const PROOF_ID = '00000000-0000-4000-8000-000000000007'
const THUMBNAIL_OBJECT_ID = '00000000-0000-4000-8000-000000000008'
const KIB = 1024

function proofRequest(thumbnail?: File | string): Request {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  if (thumbnail !== undefined) form.set('thumbnail', thumbnail)

  return new Request('http://api.test/me/trips/current/documents/x/proof', {
    body: form,
    method: 'POST',
  })
}

function thumbnailFile(bytes: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], 'miniatura.jpg', { type })
}

describe('o campo thumbnail do multipart do /proof', () => {
  it('ausente é o caso normal: o upload não carrega miniatura', async () => {
    const upload = await parseDeliveryProofUpload(proofRequest())

    expect(upload.thumbnail).toBeUndefined()
  })

  it('campo vazio conta como ausente', async () => {
    const upload = await parseDeliveryProofUpload(proofRequest(''))

    expect(upload.thumbnail).toBeUndefined()
  })

  it('arquivo presente vira bytes e tipo', async () => {
    const upload = await parseDeliveryProofUpload(proofRequest(thumbnailFile(4 * KIB)))

    expect(upload.thumbnail?.bytes.byteLength).toBe(4 * KIB)
    expect(upload.thumbnail?.mimeType).toBe('image/jpeg')
  })

  it('texto no lugar do arquivo é 400', async () => {
    const error = await parseDeliveryProofUpload(proofRequest('nao-e-arquivo')).catch(
      (cause) => cause,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
  })
})

function buildWorld() {
  const saved: Parameters<DeliveryProofPort['saveProof']>[0][] = []
  const stored: string[] = []
  const repository: DeliveryProofPort = {
    countProofsForEvent: () => Promise.resolve(0),
    findDeliveryContext: () =>
      Promise.resolve({
        deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
        deliveryEventPosition: undefined,
      }),
    findDeliveryEventId: () => Promise.resolve(EVENT_ID),
    findProofIdByAttachmentKey: () => Promise.resolve(null),
    findProofPunctuality: () => Promise.resolve(null),
    resolveProofFieldSettings: () => Promise.resolve(DEFAULT_DELIVERY_PROOF_SETTINGS),
    resolveProofPunctualitySettings: () =>
      Promise.resolve(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS),
    saveProof: (proof) => {
      saved.push(proof)
      return Promise.resolve({ id: proof.id })
    },
  }
  const storage: DeliveryProofStoragePort = {
    store: (object) => {
      stored.push(object.objectId)
      return Promise.resolve({ sha256: 'a'.repeat(64) })
    },
  }
  const objectIds = [OBJECT_ID, THUMBNAIL_OBJECT_ID]

  return { objectIds, repository, saved, storage, stored }
}

async function runUpload(
  world: ReturnType<typeof buildWorld>,
  thumbnail: { readonly bytes: Uint8Array; readonly mimeType: string } | undefined,
) {
  return attachDeliveryProof({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    newObjectId: () => world.objectIds.shift() ?? 'exhausted',
    newProofId: () => PROOF_ID,
    now: new Date('2026-09-18T12:00:00.000Z'),
    repository: world.repository,
    sealDocument: () => Promise.reject(new Error('NOT_EXPECTED')),
    storage: world.storage,
    upload: {
      attachmentKey: '',
      bytes: new Uint8Array(KIB),
      capturedAt: undefined,
      kind: 'photo',
      mimeType: 'image/jpeg',
      position: undefined,
      receiverDocument: '',
      receiverName: '',
      ...(thumbnail === undefined ? {} : { thumbnail }),
    },
  })
}

async function expectRejection(operation: Promise<unknown>, code: string): Promise<void> {
  const error = await operation.catch((cause) => cause)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).code).toBe(code)
}

describe('o caso de uso grava a miniatura ao lado do original', () => {
  it('sem miniatura, grava só o original e o vínculo fica nulo', async () => {
    const world = buildWorld()
    await runUpload(world, undefined)

    expect(world.stored).toEqual([OBJECT_ID])
    expect(world.saved[0]?.thumbnail).toBeUndefined()
  })

  it('com miniatura, guarda o segundo objeto e o entrega ao repositório', async () => {
    const world = buildWorld()
    await runUpload(world, { bytes: new Uint8Array(60 * KIB), mimeType: 'image/jpeg' })

    expect(world.stored).toEqual([OBJECT_ID, THUMBNAIL_OBJECT_ID])
    expect(world.saved[0]?.thumbnail).toMatchObject({
      mimeType: 'image/jpeg',
      objectId: THUMBNAIL_OBJECT_ID,
      sizeBytes: 60 * KIB,
    })
  })

  it('exatamente 128 KiB passa', async () => {
    const world = buildWorld()
    await runUpload(world, {
      bytes: new Uint8Array(DELIVERY_PROOF_THUMBNAIL_MAX_BYTES),
      mimeType: 'image/jpeg',
    })

    expect(world.saved[0]?.thumbnail?.sizeBytes).toBe(128 * KIB)
  })

  it('um byte acima de 128 KiB é recusado antes de tocar o bucket', async () => {
    const world = buildWorld()
    await expectRejection(
      runUpload(world, {
        bytes: new Uint8Array(DELIVERY_PROOF_THUMBNAIL_MAX_BYTES + 1),
        mimeType: 'image/jpeg',
      }),
      'TRIP_DELIVERY_PROOF_TOO_LARGE',
    )

    expect(world.stored).toEqual([])
    expect(world.saved).toEqual([])
  })

  it('tipo que não é imagem aceita é recusado', async () => {
    const world = buildWorld()
    await expectRejection(
      runUpload(world, { bytes: new Uint8Array(KIB), mimeType: 'application/pdf' }),
      'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE',
    )

    expect(world.stored).toEqual([])
  })
})

describe('a recaptura troca a miniatura junto com o original (buildProofUpsertSet)', () => {
  const BASE = {
    accuracyMeters: null,
    actorUserId: ACTOR_USER_ID,
    attachmentKey: '',
    authorship: { channel: 'driver_app' as const, onBehalfOfDriverId: DRIVER_ID },
    capturedAt: null,
    companyId: COMPANY_ID,
    eventId: EVENT_ID,
    id: PROOF_ID,
    kind: 'photo' as const,
    lateRegistration: false,
    latitude: null,
    longitude: null,
    mimeType: 'image/jpeg',
    objectId: OBJECT_ID,
    objectKey: 'object-key',
    punctuality: 'not_required' as const,
    receivedBy: null,
    receivedByDetail: null,
    receiverDocumentEnvelope: null,
    receiverDocumentMasked: '',
    receiverName: '',
    sha256: 'a'.repeat(64),
    sizeBytes: KIB,
  }

  it('recaptura com miniatura nova aponta o vínculo para ela', () => {
    const set = buildProofUpsertSet({
      ...BASE,
      thumbnail: {
        mimeType: 'image/jpeg',
        objectId: THUMBNAIL_OBJECT_ID,
        objectKey: 'thumbnail-key',
        sha256: 'b'.repeat(64),
        sizeBytes: 60 * KIB,
      },
    })

    expect(set).toMatchObject({ objectId: OBJECT_ID, thumbnailObjectId: THUMBNAIL_OBJECT_ID })
  })

  it('recaptura sem miniatura zera o vínculo: a antiga é do original que saiu', () => {
    const set = buildProofUpsertSet(BASE)

    expect(set).toMatchObject({ objectId: OBJECT_ID, thumbnailObjectId: null })
  })
})
