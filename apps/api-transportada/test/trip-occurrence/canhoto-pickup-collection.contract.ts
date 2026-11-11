/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (D4b, CA04): a foto do canhoto retido, pelo motorista da viagem da coleta. Contra Postgres:
 * `test/integration/canhoto-pickup-collection.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import type { DeliveryProofUpload } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  collectCanhotoPickupPhoto,
  type CanhotoPickupCollectionPort,
  type CollectCanhotoPickupPhotoInput,
} from '../../src/trips/application/collect-canhoto-pickup-photo.use-case.js'
import {
  CanhotoPickupNotFoundError,
  CanhotoPickupProofKindError,
} from '../../src/trips/domain/canhoto-pickup.error.js'

const NOW = new Date('2026-11-10T15:00:00.000Z')
const UPLOAD: DeliveryProofUpload = {
  attachmentKey: 'k1',
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]),
  capturedAt: undefined,
  kind: 'photo',
  mimeType: 'image/jpeg',
  position: undefined,
  receiverDocument: '',
  receiverName: '',
}
const PICKUP = {
  id: 'PK1',
  originTripDocumentId: 'DOC-ORIGIN',
  originTripId: 'TRIP-ORIGIN',
  pickupStopId: 'STOP-PICKUP',
  pickupTripId: 'TRIP-PICKUP',
}

function setup(options: { duplicateOf?: string; pickup?: typeof PICKUP | null } = {}) {
  const attached: unknown[] = []
  const recorded: unknown[] = []
  const found: unknown[] = []
  const collection: CanhotoPickupCollectionPort = {
    findDriverPickup: async (input) => {
      found.push(input)
      return options.pickup === undefined ? PICKUP : options.pickup
    },
    recordPhotoSent: async (input) => {
      recorded.push(input)
      return { stopClosed: true, tripCompleted: false }
    },
  }
  const run = (overrides: Partial<CollectCanhotoPickupPhotoInput> = {}) =>
    collectCanhotoPickupPhoto({
      actorUserId: 'U1',
      attach: async (input) => {
        attached.push(input)
        return {
          ...(options.duplicateOf === undefined
            ? {}
            : { duplicate: { attachedAt: NOW, documentId: options.duplicateOf } }),
          id: 'PROOF1',
          processingState: 'ready',
          punctuality: 'not_required',
        }
      },
      channel: 'driver_app',
      collection,
      companyId: 'C1',
      driverId: 'D2',
      now: NOW,
      pickupId: 'PK1',
      upload: UPLOAD,
      ...overrides,
    })
  return { attached, found, recorded, run }
}

describe('a foto da coleta vira o canhoto da entrega de origem (spec 321 T4)', () => {
  test('grava na nota de origem, pela viagem de origem, e marca a coleta como fotografada', async () => {
    const t = setup()
    const result = await t.run()
    expect(t.found).toEqual([{ companyId: 'C1', driverId: 'D2', pickupId: 'PK1' }])
    expect(t.attached).toEqual([
      {
        channel: 'driver_app',
        documentId: 'DOC-ORIGIN',
        driverId: 'D2',
        originTripId: 'TRIP-ORIGIN',
        upload: UPLOAD,
      },
    ])
    expect(t.recorded).toEqual([
      {
        actorUserId: 'U1',
        at: NOW,
        authorship: { channel: 'driver_app', onBehalfOfDriverId: null },
        companyId: 'C1',
        pickupId: 'PK1',
      },
    ])
    expect(result).toMatchObject({
      documentId: 'DOC-ORIGIN',
      stopClosed: true,
      tripCompleted: false,
    })
  })

  test('coleta alheia, de outra empresa ou não encaixada é 404 e nada é gravado', async () => {
    const t = setup({ pickup: null })
    await expect(t.run()).rejects.toThrow(CanhotoPickupNotFoundError)
    expect(t.attached).toEqual([])
    expect(t.recorded).toEqual([])
  })

  test('só a foto do canhoto: assinatura e foto da carga são recusadas antes de procurar a coleta', async () => {
    for (const kind of ['signature', 'cargo'] as const) {
      const t = setup()
      await expect(t.run({ upload: { ...UPLOAD, kind } })).rejects.toThrow(
        CanhotoPickupProofKindError,
      )
      expect(t.found).toEqual([])
    }
  })

  test('a mesma imagem que já é o canhoto desta nota conta como enviada (reenvio)', async () => {
    const t = setup({ duplicateOf: 'DOC-ORIGIN' })
    await t.run()
    expect(t.recorded).toHaveLength(1)
  })

  test('a imagem que já é canhoto de outra nota não fecha a coleta', async () => {
    const t = setup({ duplicateOf: 'DOC-OTHER' })
    const result = await t.run()
    expect(t.recorded).toEqual([])
    expect(result).toMatchObject({ stopClosed: false, tripCompleted: false })
  })
})
