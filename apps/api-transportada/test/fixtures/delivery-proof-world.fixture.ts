/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O mundo do caso de uso `attachDeliveryProof`: dublê do repositório (guarda a última pontualidade
 * por evento+tipo, como o upsert do banco) e do bucket. Partilhado por
 * `test/driver-trip/delivery-proof.contract.ts` e `delivery-proof-clock-corrected.contract.ts`.
 */
import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { Coordinate } from '../../src/addresses/domain/coordinate-distance.js'
import type { ProofPunctuality } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'

export const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
export const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
export const EVENT_ID = '00000000-0000-4000-8000-000000000005'
export const OBJECT_ID = '00000000-0000-4000-8000-000000000006'
export const DELIVERED_AT = new Date('2026-09-18T12:00:00.000Z')

type SavedProof = Parameters<DeliveryProofPort['saveProof']>[0]

export function buildWorld(
  input: {
    readonly deliveredAt?: Date
    readonly deliveryEventPosition?: Coordinate
    readonly eventId?: string | null
    readonly existingProofByKey?: Readonly<Record<string, ProofPunctuality>>
    /** Spec 234 R1: o evento de entrega gravou `occurred_at` (a correção do relógio foi aceita). */
    readonly isEventClockCorrected?: boolean
  } = {},
) {
  const saved: SavedProof[] = []
  const stored: Array<{ readonly objectKey: string }> = []

  const repository: DeliveryProofPort = {
    findDeliveryContext: () =>
      Promise.resolve({
        deliveredAt: input.deliveredAt ?? DELIVERED_AT,
        deliveryEventPosition: input.deliveryEventPosition,
        isEventClockCorrected: input.isEventClockCorrected ?? false,
      }),
    findDeliveryEventId: () =>
      Promise.resolve(input.eventId === undefined ? EVENT_ID : input.eventId),
    findProofIdByAttachmentKey: (query) => {
      const punctuality = input.existingProofByKey?.[query.attachmentKey]
      return Promise.resolve(
        punctuality === undefined ? null : { id: 'proof-existing', punctuality },
      )
    },
    /** O padrão de fábrica (ADR-0057 §4): o documento fica de fora destes casos, de propósito. */
    resolveProofFieldSettings: () =>
      Promise.resolve({
        cargo: 'off' as const,
        cargoMinimumCount: 1,
        photo: 'optional' as const,
        receivedBy: 'optional' as const,
        receiverDocument: 'off' as const,
        receiverName: 'optional' as const,
        signature: 'optional' as const,
      }),
    resolveProofPunctualitySettings: () =>
      Promise.resolve(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS),
    /** O dublê guarda a última pontualidade por evento+tipo, como o upsert do banco. */
    countProofsForEvent: async () => 0,
    findProofPunctuality: (query) =>
      Promise.resolve(
        saved.findLast((proof) => proof.eventId === query.eventId && proof.kind === query.kind)
          ?.punctuality ?? null,
      ),
    saveProof: (proof) => {
      saved.push(proof)
      return Promise.resolve({ id: 'proof-1' })
    },
  }
  const storage: DeliveryProofStoragePort = {
    store: (proof) => {
      stored.push({ objectKey: proof.objectKey })
      return Promise.resolve({ sha256: 'a'.repeat(64) })
    },
  }

  return { repository, saved, storage, stored }
}

export function buildInput(
  world: ReturnType<typeof buildWorld>,
  upload: Partial<Parameters<typeof attachDeliveryProof>[0]['upload']> = {},
  now: Date = DELIVERED_AT,
) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    newObjectId: () => OBJECT_ID,
    newProofId: () => 'proof-1',
    now,
    repository: world.repository,
    sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
    storage: world.storage,
    upload: {
      attachmentKey: '',
      bytes: new Uint8Array(1024),
      capturedAt: undefined,
      kind: 'photo' as const,
      mimeType: 'image/jpeg',
      position: undefined,
      receiverDocument: '',
      receiverName: '',
      ...upload,
    },
  }
}
