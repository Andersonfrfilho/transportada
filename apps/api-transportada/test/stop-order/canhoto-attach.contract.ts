/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF26: o canhoto repetido não grava duas vezes; outro canhoto sobre um que a nota já tem só
 * passa com a confirmação; nota entregue sem canhoto recebe a foto como o canhoto que faltava.
 */
import { describe, expect, test } from 'bun:test'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { AttachedCanhoto } from '../../src/trips/application/canhoto-attachment.types.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const ELSEWHERE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000009'
const JPEG_BYTES = new Uint8Array(2048)
JPEG_BYTES.set([0xff, 0xd8, 0xff, 0xe0])

const ALREADY_ATTACHED: AttachedCanhoto = {
  attachedAt: new Date('2026-11-05T14:32:00.000Z'),
  documentId: ELSEWHERE_DOCUMENT_ID,
  proofId: '00000000-0000-4000-8000-000000000008',
}

function buildWorld(options: { readonly attachedOnEvent?: number; readonly sameHash?: boolean }) {
  const hashLookups: string[] = []
  let storedObjects = 0
  const repository: DeliveryProofPort = {
    countProofsForEvent: () => Promise.resolve(options.attachedOnEvent ?? 0),
    findCanhotoByHash: ({ sha256 }) => {
      hashLookups.push(sha256)
      return Promise.resolve(options.sameHash === true ? ALREADY_ATTACHED : null)
    },
    findDeliveryContext: () =>
      Promise.resolve({
        deliveredAt: new Date('2026-11-05T12:00:00.000Z'),
        deliveryEventPosition: undefined,
        isDeliveryRecordedByDriver: true,
      }),
    findDeliveryEventId: () => Promise.resolve(EVENT_ID),
    findProofIdByAttachmentKey: () => Promise.resolve(null),
    findProofPunctuality: () => Promise.resolve(null),
    resolveProofFieldSettings: () => Promise.resolve(DEFAULT_DELIVERY_PROOF_SETTINGS),
    resolveProofPunctualitySettings: () =>
      Promise.resolve(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS),
    saveProof: (proof) => Promise.resolve({ id: proof.id }),
  }

  return {
    attach: (
      upload: { readonly kind?: 'cargo' | 'photo'; readonly replaceCanhoto?: boolean } = {},
    ) =>
      attachDeliveryProof({
        actorUserId: '00000000-0000-4000-8000-000000000002',
        channel: 'whatsapp',
        companyId: COMPANY_ID,
        documentId: '00000000-0000-4000-8000-000000000004',
        driverId: '00000000-0000-4000-8000-000000000003',
        newObjectId: () => '00000000-0000-4000-8000-000000000006',
        newProofId: () => '00000000-0000-4000-8000-000000000007',
        now: new Date('2026-11-05T15:00:00.000Z'),
        repository,
        sealDocument: () => Promise.reject(new Error('not used')),
        storage: {
          store: () => {
            storedObjects += 1
            return Promise.resolve({ sha256: 'a'.repeat(64) })
          },
        },
        upload: {
          attachmentKey: '',
          bytes: JPEG_BYTES,
          capturedAt: undefined,
          kind: 'photo',
          mimeType: 'image/jpeg',
          position: undefined,
          receiverDocument: '',
          receiverName: 'Maria',
          ...upload,
        },
      }),
    hashLookups,
    storedCount: () => storedObjects,
  }
}

describe('o canhoto repetido (spec 294 RF26)', () => {
  test('a mesma imagem já anexada responde duplicate e não grava de novo', async () => {
    const world = buildWorld({ sameHash: true })

    const result = await world.attach()

    expect(result.duplicate).toEqual({
      attachedAt: ALREADY_ATTACHED.attachedAt,
      documentId: ALREADY_ATTACHED.documentId,
    })
    expect(world.storedCount()).toBe(0)
    expect(world.hashLookups).toHaveLength(1)
    expect(world.hashLookups[0]).toMatch(/^[0-9a-f]{64}$/)
  })

  test('nota entregue sem canhoto recebe a foto, sem pergunta', async () => {
    const world = buildWorld({ attachedOnEvent: 0 })

    const result = await world.attach()

    expect(result.duplicate).toBeUndefined()
    expect(world.storedCount()).toBe(1)
  })

  test('canhoto diferente sobre um que a tripulação já anexou é 409 sem a confirmação', async () => {
    const world = buildWorld({ attachedOnEvent: 1 })

    const error = await world.attach().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_CANHOTO_ALREADY_ATTACHED')
    expect((error as ApiError).status).toBe(409)
    expect(world.storedCount()).toBe(0)
  })

  test('com replaceCanhoto o canhoto diferente troca o anterior', async () => {
    const world = buildWorld({ attachedOnEvent: 1 })

    const result = await world.attach({ replaceCanhoto: true })

    expect(result.duplicate).toBeUndefined()
    expect(world.storedCount()).toBe(1)
  })

  test('a foto da carga não é canhoto: nunca confere hash nem pergunta', async () => {
    const world = buildWorld({ attachedOnEvent: 1, sameHash: true })

    await world.attach({ kind: 'cargo' })

    expect(world.hashLookups).toHaveLength(0)
    expect(world.storedCount()).toBe(1)
  })
})
