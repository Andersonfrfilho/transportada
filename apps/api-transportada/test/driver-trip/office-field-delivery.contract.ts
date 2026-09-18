/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6, ADR-0067 §3/§5: `field-delivery`, `field-return` e `field-proof` — o comprovante na
 * mesma transação da entrega, `deliveredAt` validado, baixa repetida do escritório sem evento novo,
 * foto obrigatória e idempotência estendida ao ator. Dublês (`field-report.double.ts`); o caminho
 * HTTP e o Postgres real ficam em `test/trip-field-office/` e
 * `test/integration/trip-field-office.integration.ts`.
 */
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS as DEFAULT_PUNCTUALITY_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  reportDocumentDelivery,
  type OfficeDeliveryProofAttachment,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { reportFieldProof } from '../../src/trips/application/report-field-proof.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import type { ResolvedTripFieldTarget } from '../../src/trips/application/field-trip-target.types.js'
import { createFieldReportState, createFieldReportUnitOfWork } from './field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000a'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const NOW = new Date('2026-09-18T13:00:00.000Z')
const DISPATCHED_AT = new Date('2026-09-17T08:00:00.000Z')

async function resolveTarget(): Promise<ResolvedTripFieldTarget> {
  return resolveFieldTripTarget({
    companyId: COMPANY_ID,
    repository: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus: 'in_transit',
      }),
    },
    target: { kind: 'trip', tripId: TRIP_ID },
  })
}

function buildWorld() {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  state.documents.set(DOCUMENT_ID, {
    separationStatus: 'loaded',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  state.dispatchedAtByTripId.set(TRIP_ID, DISPATCHED_AT)
  return { unitOfWork: createFieldReportUnitOfWork(state), state }
}

function buildProof(input: {
  readonly settings: DeliveryProofFieldSettings
  readonly upload: OfficeDeliveryProofAttachment['upload']
}): OfficeDeliveryProofAttachment {
  return {
    newObjectId: () => 'object-1',
    newProofId: () => 'proof-1',
    resolveSettings: async () => input.settings,
    sealDocument: async () => ({ ciphertext: '', iv: '', keyId: 'k1', tag: '' }) as never,
    storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
    upload: input.upload,
  }
}

const OPTIONAL_SETTINGS: DeliveryProofFieldSettings = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const REQUIRED_PHOTO_SETTINGS: DeliveryProofFieldSettings = {
  ...OPTIONAL_SETTINGS,
  photo: 'required',
}

async function expectApiError(
  operation: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    expect((error as ApiError).status).toBe(status)
  }
}

describe('field-delivery: entrega + comprovante na mesma transação (spec 156 T6)', () => {
  it('grava a entrega e o comprovante, e devolve o proofId', async () => {
    const world = buildWorld()
    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-field-delivery-1',
      location: null,
      now: new Date('2026-09-18T12:00:00.000Z'),
      proof: buildProof({
        settings: OPTIONAL_SETTINGS,
        upload: {
          attachmentKey: '',
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'image/jpeg',
          receiverDocument: '',
          receiverName: 'João da Silva',
        },
      }),
      recordedAt: NOW,
      target: await resolveTarget(),
      unitOfWork: world.unitOfWork,
    })

    expect(result.alreadySettled).toBe(false)
    expect(result.proofId).not.toBeNull()
    expect(world.state.calls).toContain(`saveDeliveryProofWithinTransaction:${result.id}:photo`)
  })

  it('aceite 9: configuração exige foto e ela não veio — 422 TRIP_DELIVERY_PROOF_PHOTO_REQUIRED', async () => {
    const world = buildWorld()

    await expectApiError(
      reportDocumentDelivery({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-photo-required',
        location: null,
        now: new Date('2026-09-18T12:00:00.000Z'),
        proof: buildProof({ settings: REQUIRED_PHOTO_SETTINGS, upload: null }),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      }),
      'TRIP_DELIVERY_PROOF_PHOTO_REQUIRED',
      422,
    )
  })

  it('foto opcional ausente conclui a entrega sem comprovante', async () => {
    const world = buildWorld()

    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-field-delivery-no-photo',
      location: null,
      now: new Date('2026-09-18T12:00:00.000Z'),
      proof: buildProof({ settings: OPTIONAL_SETTINGS, upload: null }),
      recordedAt: NOW,
      target: await resolveTarget(),
      unitOfWork: world.unitOfWork,
    })

    expect(result.proofId).toBeNull()
  })

  it('aceite 8: "Entregue em" no futuro responde 400 DELIVERED_AT_IN_FUTURE', async () => {
    const world = buildWorld()

    await expectApiError(
      reportDocumentDelivery({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-future',
        location: null,
        now: new Date(NOW.getTime() + 10 * 60 * 1000),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      }),
      'DELIVERED_AT_IN_FUTURE',
      400,
    )
  })

  it('aceite 8: "Entregue em" antes do despacho responde 400 DELIVERED_AT_BEFORE_DISPATCH', async () => {
    const world = buildWorld()

    await expectApiError(
      reportDocumentDelivery({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-before-dispatch',
        location: null,
        now: new Date(DISPATCHED_AT.getTime() - 60 * 1000),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      }),
      'DELIVERED_AT_BEFORE_DISPATCH',
      400,
    )
  })

  it('aceite 12: nota já delivered no canal office responde 409 DOCUMENT_ALREADY_SETTLED, sem evento novo', async () => {
    const world = buildWorld()
    world.state.documents.set(DOCUMENT_ID, {
      separationStatus: 'delivered',
      stopId: STOP_ID,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })

    await expectApiError(
      reportDocumentDelivery({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-already-settled',
        location: null,
        now: new Date('2026-09-18T12:00:00.000Z'),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      }),
      'DOCUMENT_ALREADY_SETTLED',
      409,
    )
    expect(world.state.events.size).toBe(0)
  })

  it('aceite 7: repetir a mesma Idempotency-Key devolve o mesmo resultado, sem duplicar evento nem comprovante', async () => {
    const world = buildWorld()
    const call = async () =>
      reportDocumentDelivery({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-repeat',
        location: null,
        now: new Date('2026-09-18T12:00:00.000Z'),
        proof: buildProof({
          settings: OPTIONAL_SETTINGS,
          upload: {
            attachmentKey: 'attachment-1',
            bytes: new Uint8Array([1, 2, 3]),
            mimeType: 'image/jpeg',
            receiverDocument: '',
            receiverName: 'João da Silva',
          },
        }),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      })

    const first = await call()
    const second = await call()

    expect(second.id).toBe(first.id)
    expect(second.proofId).toBe(first.proofId)
    expect(world.state.events.size).toBe(1)
    expect(
      world.state.calls.filter((call_) => call_.startsWith('saveDeliveryProofWithinTransaction')),
    ).toHaveLength(1)
  })

  it('ADR-0067 §5 (emenda): a mesma chave usada por outro ator responde 409 TRIP_FIELD_REPORT_KEY_REUSED', async () => {
    const world = buildWorld()
    await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-field-delivery-shared-key',
      location: null,
      now: new Date('2026-09-18T12:00:00.000Z'),
      recordedAt: NOW,
      target: await resolveTarget(),
      unitOfWork: world.unitOfWork,
    })

    await expectApiError(
      reportDocumentDelivery({
        actorUserId: OTHER_ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-delivery-shared-key',
        location: null,
        now: new Date('2026-09-18T12:00:00.000Z'),
        recordedAt: NOW,
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
      }),
      'TRIP_FIELD_REPORT_KEY_REUSED',
      409,
    )
  })

  it('o caminho do motorista continua sem validar deliveredAt nem exigir foto', async () => {
    const world = buildWorld()

    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'driver-field-delivery-1',
      location: null,
      now: new Date(NOW.getTime() + 10 * 60 * 1000),
      unitOfWork: world.unitOfWork,
    })

    expect(result.alreadySettled).toBe(false)
    expect(result.proofId).toBeNull()
    expect(result.proofPending).toBe(false)
  })

  /**
   * Spec 157 T6, ADR-0068 §1: com `photo = 'required'` e sem foto anexada, a resposta avisa
   * `proofPending: true` — a entrega **continua aceita** (aceite 1). Ampliação do teste acima.
   */
  it('com photo = required e sem foto, proofPending é true — a entrega continua aceita', async () => {
    const world = buildWorld()

    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'driver-field-delivery-photo-required',
      location: null,
      now: new Date(NOW.getTime() + 10 * 60 * 1000),
      resolveProofSettings: async () => REQUIRED_PHOTO_SETTINGS,
      unitOfWork: world.unitOfWork,
    })

    expect(result.alreadySettled).toBe(false)
    expect(result.proofId).toBeNull()
    expect(result.proofPending).toBe(true)
  })

  it('com photo = optional, proofPending é sempre false', async () => {
    const world = buildWorld()

    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'driver-field-delivery-photo-optional',
      location: null,
      now: new Date(NOW.getTime() + 10 * 60 * 1000),
      resolveProofSettings: async () => OPTIONAL_SETTINGS,
      unitOfWork: world.unitOfWork,
    })

    expect(result.proofPending).toBe(false)
  })
})

describe('field-proof: anexa a uma entrega já feita, sem evento novo (spec 156 T6)', () => {
  it('não cria evento nem muda delivered_at — só substitui pelo unique (company, stop_event, kind)', async () => {
    const world = buildWorld()
    const delivery = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-field-delivery-for-proof',
      location: null,
      now: new Date('2026-09-18T12:00:00.000Z'),
      recordedAt: NOW,
      target: await resolveTarget(),
      unitOfWork: world.unitOfWork,
    })

    const proof = await reportFieldProof({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-field-proof-1',
      newObjectId: () => 'object-2',
      newProofId: () => 'proof-2',
      now: NOW,
      repository: {
        findDeliveryEventId: async () => delivery.id,
        findDeliveryContext: async () => ({
          deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
          deliveryEventPosition: undefined,
          stopPosition: undefined,
        }),
        findProofIdByAttachmentKey: async () => null,
        resolveProofFieldSettings: async () => OPTIONAL_SETTINGS,
        resolveProofPunctualitySettings: async () => DEFAULT_PUNCTUALITY_SETTINGS,
        saveProof: async (input) => ({ id: input.id }),
      },
      sealDocument: async () => ({ ciphertext: '', iv: '', keyId: 'k1', tag: '' }) as never,
      storage: { store: async () => ({ sha256: 'b'.repeat(64) }) },
      target: await resolveTarget(),
      unitOfWork: world.unitOfWork,
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array([1]),
        capturedAt: undefined,
        kind: 'photo',
        position: undefined,
        mimeType: 'image/jpeg',
        receiverDocument: '',
        receiverName: 'João da Silva',
      },
    })

    expect(proof.id).toBe('proof-2')
    expect(world.state.events.size).toBe(1)
  })

  it('nota sem entrega alcançável responde 409 TRIP_DOCUMENT_NOT_REACHABLE', async () => {
    const world = buildWorld()

    await expectApiError(
      reportFieldProof({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        idempotencyKey: 'office-field-proof-no-delivery',
        newObjectId: () => 'object-3',
        newProofId: () => 'proof-3',
        now: NOW,
        repository: {
          findDeliveryEventId: async () => null,
          findDeliveryContext: async () => ({
            deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
            deliveryEventPosition: undefined,
            stopPosition: undefined,
          }),
          findProofIdByAttachmentKey: async () => null,
          resolveProofFieldSettings: async () => OPTIONAL_SETTINGS,
          resolveProofPunctualitySettings: async () => DEFAULT_PUNCTUALITY_SETTINGS,
          saveProof: async (input) => ({ id: input.id }),
        },
        sealDocument: async () => ({ ciphertext: '', iv: '', keyId: 'k1', tag: '' }) as never,
        storage: { store: async () => ({ sha256: 'c'.repeat(64) }) },
        target: await resolveTarget(),
        unitOfWork: world.unitOfWork,
        upload: {
          attachmentKey: '',
          bytes: new Uint8Array([1]),
          capturedAt: undefined,
          kind: 'photo',
          mimeType: 'image/jpeg',
          position: undefined,
          receiverDocument: '',
          receiverName: '',
        },
      }),
      'TRIP_DOCUMENT_NOT_REACHABLE',
      409,
    )
  })
})

/** Prova que `attachDeliveryProof` (usada por `field-proof`) só carrega `receiverName` em `kind: 'photo'` no canal `office`. */
describe('attach-delivery-proof: receiverName em kind photo só no canal office (decisão do líder, spec 156 T6)', () => {
  it('canal office com kind photo persiste o receiverName', async () => {
    const saved: unknown[] = []
    await attachDeliveryProof({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      newObjectId: () => 'object-4',
      newProofId: () => 'proof-4',
      now: NOW,
      repository: {
        findDeliveryEventId: async () => 'event-1',
        findDeliveryContext: async () => ({
          deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
          deliveryEventPosition: undefined,
          stopPosition: undefined,
        }),
        findProofIdByAttachmentKey: async () => null,
        resolveProofFieldSettings: async () => OPTIONAL_SETTINGS,
        resolveProofPunctualitySettings: async () => DEFAULT_PUNCTUALITY_SETTINGS,
        saveProof: async (input) => {
          saved.push(input)
          return { id: input.id }
        },
      },
      sealDocument: async () => ({ ciphertext: '', iv: '', keyId: 'k1', tag: '' }) as never,
      storage: { store: async () => ({ sha256: 'd'.repeat(64) }) },
      target: await resolveTarget(),
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array([1]),
        capturedAt: undefined,
        kind: 'photo',
        position: undefined,
        mimeType: 'image/jpeg',
        receiverDocument: '',
        receiverName: 'Maria Souza',
      },
    })

    expect(saved).toEqual([expect.objectContaining({ receiverName: 'Maria Souza' })])
  })

  it('canal driver_app com kind photo continua sem receiverName', async () => {
    const saved: unknown[] = []
    await attachDeliveryProof({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      newObjectId: () => 'object-5',
      newProofId: () => 'proof-5',
      now: NOW,
      repository: {
        findDeliveryEventId: async () => 'event-1',
        findDeliveryContext: async () => ({
          deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
          deliveryEventPosition: undefined,
          stopPosition: undefined,
        }),
        findProofIdByAttachmentKey: async () => null,
        resolveProofFieldSettings: async () => OPTIONAL_SETTINGS,
        resolveProofPunctualitySettings: async () => DEFAULT_PUNCTUALITY_SETTINGS,
        saveProof: async (input) => {
          saved.push(input)
          return { id: input.id }
        },
      },
      sealDocument: async () => ({ ciphertext: '', iv: '', keyId: 'k1', tag: '' }) as never,
      storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array([1]),
        capturedAt: undefined,
        kind: 'photo',
        position: undefined,
        mimeType: 'image/jpeg',
        receiverDocument: '',
        receiverName: 'Maria Souza',
      },
    })

    expect(saved).toEqual([expect.objectContaining({ receiverName: '' })])
  })
})
