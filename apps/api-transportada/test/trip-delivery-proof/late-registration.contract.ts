/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 205: o "Registrar entrega depois" da app do motorista pesa como a foto atrasada. A regra é a
 * pontualidade que já existe (ADR-0070) — o registro tardio só força o veredito `late` da foto
 * obrigatória, e o fato fica gravado no evento e no comprovante.
 */
import { describe, expect, it } from 'bun:test'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import {
  classifyProofPunctuality,
  type ProofPunctuality,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import {
  parseDocumentDeliveryRequest,
  parseDocumentReturnRequest,
  parseFieldReportRequest,
} from '../../src/trips/presentation/me-trip.schema.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const TRIP_ID = '00000000-0000-4000-8000-000000000006'
const STOP_ID = '00000000-0000-4000-8000-000000000007'
const DELIVERED_AT = new Date('2026-09-25T12:00:00.000Z')
const STOP_POSITION = { latitude: '-23.5505200', longitude: '-46.6333080' }

const REQUIRED_PHOTO: DeliveryProofFieldSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  photo: 'required',
}
const OPTIONAL_PHOTO: DeliveryProofFieldSettings = { ...REQUIRED_PHOTO, photo: 'optional' }

/** Foto no lugar e na hora: sem o registro tardio, `on_time`. */
const ON_TIME_PHOTO = {
  capturedAt: new Date('2026-09-25T12:05:00.000Z'),
  deliveredAt: DELIVERED_AT,
  deliveryEventPosition: undefined,
  missingAfterHours: 24,
  photoMode: 'required' as const,
  photoPosition: { accuracyMeters: 10, ...STOP_POSITION },
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
  receivedAt: new Date('2026-09-25T12:05:10.000Z'),
  stopPosition: STOP_POSITION,
}

describe('a política: registro tardio é late (spec 205 D2)', () => {
  it('sem o registro tardio, a foto no lugar e na hora continua on_time', () => {
    expect(classifyProofPunctuality(ON_TIME_PHOTO)).toBe('on_time')
  })

  it('com o registro tardio, a mesma foto é late — seja qual for a hora', () => {
    expect(classifyProofPunctuality({ ...ON_TIME_PHOTO, lateRegistration: true })).toBe('late')
  })

  it('com o registro tardio, a foto longe também é só late — o lugar não muda o veredito', () => {
    expect(
      classifyProofPunctuality({
        ...ON_TIME_PHOTO,
        lateRegistration: true,
        photoPosition: undefined,
      }),
    ).toBe('late')
  })

  it('foto opcional continua not_required — igual à foto atrasada opcional', () => {
    expect(
      classifyProofPunctuality({ ...ON_TIME_PHOTO, lateRegistration: true, photoMode: 'optional' }),
    ).toBe('not_required')
  })
})

describe('os três corpos aceitam lateRegistration (spec 205 RF1-RF3)', () => {
  function jsonRequest(body: unknown): Request {
    return new Request('http://localhost/x', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  }

  it('/deliver: true passa, ausente é false, corpo vazio é false', async () => {
    expect(await parseDocumentDeliveryRequest(jsonRequest({ lateRegistration: true }))).toEqual({
      lateRegistration: true,
      location: null,
    })
    expect((await parseDocumentDeliveryRequest(jsonRequest({}))).lateRegistration).toBe(false)
    expect(
      (await parseDocumentDeliveryRequest(new Request('http://localhost/x', { method: 'POST' })))
        .lateRegistration,
    ).toBe(false)
  })

  it('/deliver: texto no lugar do booleano é 400', async () => {
    await expect(
      parseDocumentDeliveryRequest(jsonRequest({ lateRegistration: 'true' })),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('a chegada continua estrita: o campo é só da baixa da nota', async () => {
    await expect(
      parseFieldReportRequest(jsonRequest({ lateRegistration: true })),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('/return: aceita junto do motivo, e o tipo errado é 400', async () => {
    const parsed = await parseDocumentReturnRequest(
      jsonRequest({ lateRegistration: true, reason: 'recipient_absent' }),
    )
    expect(parsed.lateRegistration).toBe(true)
    expect(
      (await parseDocumentReturnRequest(jsonRequest({ reason: 'recipient_absent' })))
        .lateRegistration,
    ).toBe(false)
    await expect(
      parseDocumentReturnRequest(jsonRequest({ lateRegistration: 1, reason: 'recipient_absent' })),
    ).rejects.toBeInstanceOf(ApiError)
  })

  function proofRequest(lateRegistration: string | undefined): Request {
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
    form.set('kind', 'photo')
    if (lateRegistration !== undefined) form.set('lateRegistration', lateRegistration)
    return new Request('http://localhost/x', { body: form, method: 'POST' })
  }

  it('/proof: "true" e "false" viram booleano, ausente e vazio são false', async () => {
    expect((await parseDeliveryProofUpload(proofRequest('true'))).lateRegistration).toBe(true)
    expect((await parseDeliveryProofUpload(proofRequest('false'))).lateRegistration).toBe(false)
    expect((await parseDeliveryProofUpload(proofRequest(''))).lateRegistration).toBe(false)
    expect((await parseDeliveryProofUpload(proofRequest(undefined))).lateRegistration).toBe(false)
  })

  it('/proof: outro texto é 400', async () => {
    await expect(parseDeliveryProofUpload(proofRequest('sim'))).rejects.toBeInstanceOf(ApiError)
  })
})

describe('as rotas /me repassam lateRegistration (spec 205 RF1-RF3)', () => {
  const NOT_CALLED = () => {
    throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
  }

  function context(): AuthenticatedContext<CompanyContext> {
    return {
      identity: {
        companyIdClaim: COMPANY_ID,
        externalIdentityId: '00000000-0000-4000-8000-0000000000aa',
        issuer: 'https://issuer.test',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'driver',
        userId: ACTOR_USER_ID,
      },
      scope: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: '00000000-0000-4000-8000-0000000000bb',
        permissions: resolveCompanyPermissions(['driver']),
        roles: ['driver'],
        userId: ACTOR_USER_ID,
      },
    }
  }

  function buildRoutes() {
    const received: Array<{ readonly route: string; readonly lateRegistration: unknown }> = []
    const outcome = {
      alreadySettled: false,
      id: EVENT_ID,
      proofId: null,
      proofPending: false,
      stopCompleted: false,
      tripCompleted: false,
    }
    const routes = createMeTripRoutes({
      attachProof: async (input) => {
        received.push({ lateRegistration: input.upload.lateRegistration, route: 'proof' })
        return { id: 'proof-1', punctuality: 'late' }
      },
      confirmOccurrenceUpload: NOT_CALLED,
      createOccurrenceUpload: NOT_CALLED,
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: NOT_CALLED,
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: NOT_CALLED,
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: NOT_CALLED,
      reportDeparture: NOT_CALLED,
      cancelStopDeparture: NOT_CALLED,
      reportDelivery: async (input) => {
        received.push({ lateRegistration: input.lateRegistration, route: 'deliver' })
        return outcome
      },
      reportOccurrence: NOT_CALLED,
      reportReturn: async (input) => {
        received.push({ lateRegistration: input.lateRegistration, route: 'return' })
        return outcome
      },
      resolveDriverId: async () => DRIVER_ID,
      startFieldTrip: NOT_CALLED,
    })
    return { received, routes }
  }

  function find(routes: ReturnType<typeof buildRoutes>['routes'], suffix: string) {
    const route = routes.find(
      (candidate) => candidate.method === 'POST' && candidate.pathname.endsWith(suffix),
    )
    if (route === undefined) throw new Error(`ROUTE_NOT_FOUND:${suffix}`)
    return route
  }

  it('/deliver e /return levam o campo ao caso de uso', async () => {
    const { received, routes } = buildRoutes()
    const headers = { 'content-type': 'application/json', 'idempotency-key': 'k-1' }

    const deliver = await find(routes, '/deliver').execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: { documentId: DOCUMENT_ID },
      request: new Request('http://localhost/x', {
        body: JSON.stringify({ lateRegistration: true }),
        headers,
        method: 'POST',
      }),
    })
    const returned = await find(routes, '/return').execute({
      context: context(),
      correlationId: 'c-2',
      pathParameters: { documentId: DOCUMENT_ID },
      request: new Request('http://localhost/x', {
        body: JSON.stringify({ lateRegistration: true, reason: 'recipient_absent' }),
        headers,
        method: 'POST',
      }),
    })

    expect(deliver.status).toBe(201)
    expect(returned.status).toBe(201)
    expect(received).toEqual([
      { lateRegistration: true, route: 'deliver' },
      { lateRegistration: true, route: 'return' },
    ])
  })

  it('/proof leva o campo do formulário ao caso de uso', async () => {
    const { received, routes } = buildRoutes()
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
    form.set('kind', 'photo')
    form.set('lateRegistration', 'true')

    const response = await find(routes, '/proof').execute({
      context: context(),
      correlationId: 'c-3',
      pathParameters: { documentId: DOCUMENT_ID },
      request: new Request('http://localhost/x', { body: form, method: 'POST' }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: 'proof-1', punctuality: 'late' } })
    expect(received).toEqual([{ lateRegistration: true, route: 'proof' }])
  })
})

type SavedProof = Parameters<DeliveryProofPort['saveProof']>[0]

function buildProofWorld(input: {
  readonly eventLateRegistration?: boolean
  readonly existingProofByKey?: Readonly<Record<string, ProofPunctuality>>
  readonly settings: DeliveryProofFieldSettings
}) {
  const saved: SavedProof[] = []
  const repository: DeliveryProofPort = {
    findDeliveryContext: async () => ({
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      ...(input.eventLateRegistration === undefined
        ? {}
        : { lateRegistration: input.eventLateRegistration }),
      stopPosition: STOP_POSITION,
    }),
    findDeliveryEventId: async () => EVENT_ID,
    findProofIdByAttachmentKey: async (query) => {
      const punctuality = input.existingProofByKey?.[query.attachmentKey]
      return punctuality === undefined ? null : { id: 'proof-existing', punctuality }
    },
    findProofPunctuality: async () => null,
    resolveProofFieldSettings: async () => input.settings,
    resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    saveProof: async (proof) => {
      saved.push(proof)
      return { id: 'proof-1' }
    },
  }

  return { repository, saved }
}

function attach(input: {
  readonly lateRegistration?: boolean
  readonly attachmentKey?: string
  readonly world: ReturnType<typeof buildProofWorld>
}) {
  return attachDeliveryProof({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    newObjectId: () => '00000000-0000-4000-8000-0000000000cc',
    newProofId: () => 'proof-1',
    now: new Date('2026-09-25T12:05:10.000Z'),
    repository: input.world.repository,
    sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
    storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
    upload: {
      attachmentKey: input.attachmentKey ?? '',
      bytes: new Uint8Array(16),
      capturedAt: new Date('2026-09-25T12:05:00.000Z'),
      kind: 'photo',
      ...(input.lateRegistration === undefined ? {} : { lateRegistration: input.lateRegistration }),
      mimeType: 'image/jpeg',
      position: { accuracyMeters: 10, ...STOP_POSITION },
      receiverDocument: '',
      receiverName: '',
    },
  })
}

describe('o comprovante do registro tardio (spec 205 RF4/RF5, D5)', () => {
  it('o envio tardio da foto obrigatória grava late e o fato', async () => {
    const world = buildProofWorld({ settings: REQUIRED_PHOTO })

    const proof = await attach({ lateRegistration: true, world })

    expect(proof.punctuality).toBe('late')
    expect(world.saved[0]?.punctuality).toBe('late')
    expect(world.saved[0]?.lateRegistration).toBe(true)
  })

  it('a entrega registrada depois faz a foto late mesmo sem o campo no envio', async () => {
    const world = buildProofWorld({ eventLateRegistration: true, settings: REQUIRED_PHOTO })

    const proof = await attach({ world })

    expect(proof.punctuality).toBe('late')
    // D1: a coluna do comprovante guarda o que o envio disse; o fato da entrega mora no evento.
    expect(world.saved[0]?.lateRegistration).toBe(false)
  })

  it('sem registro tardio nenhum, a mesma foto é on_time', async () => {
    const world = buildProofWorld({ eventLateRegistration: false, settings: REQUIRED_PHOTO })

    const proof = await attach({ lateRegistration: false, world })

    expect(proof.punctuality).toBe('on_time')
    expect(world.saved[0]?.lateRegistration).toBe(false)
  })

  it('foto opcional grava o fato, mas não classifica', async () => {
    const world = buildProofWorld({ settings: OPTIONAL_PHOTO })

    const proof = await attach({ lateRegistration: true, world })

    expect(proof.punctuality).toBe('not_required')
    expect(world.saved[0]?.lateRegistration).toBe(true)
  })

  it('replay com a mesma attachmentKey não reclassifica', async () => {
    const world = buildProofWorld({
      existingProofByKey: { 'chave-1': 'on_time' },
      settings: REQUIRED_PHOTO,
    })

    const proof = await attach({ attachmentKey: 'chave-1', lateRegistration: true, world })

    expect(proof).toEqual({ id: 'proof-existing', punctuality: 'on_time' })
    expect(world.saved).toHaveLength(0)
  })
})

describe('a baixa do registro tardio (spec 205 RF4, D3, D5)', () => {
  function buildDocumentWorld() {
    const state = createFieldReportState()
    state.stops.set(STOP_ID, {
      arrivedAt: DELIVERED_AT,
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
    return createFieldReportUnitOfWork(state)
  }

  function outcomeInput(input: {
    readonly idempotencyKey: string
    readonly lateRegistration?: boolean
    readonly unitOfWork: ReturnType<typeof buildDocumentWorld>
  }) {
    return {
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      idempotencyKey: input.idempotencyKey,
      ...(input.lateRegistration === undefined ? {} : { lateRegistration: input.lateRegistration }),
      location: null,
      now: DELIVERED_AT,
      unitOfWork: input.unitOfWork,
    }
  }

  it('a entrega grava o registro tardio no evento; sem o campo, false', async () => {
    const late = buildDocumentWorld()
    const onTime = buildDocumentWorld()

    const lateEvent = await reportDocumentDelivery(
      outcomeInput({ idempotencyKey: 'k-late', lateRegistration: true, unitOfWork: late }),
    )
    const onTimeEvent = await reportDocumentDelivery(
      outcomeInput({ idempotencyKey: 'k-on-time', unitOfWork: onTime }),
    )

    expect(late.state.eventLateRegistrations.get(lateEvent.id)).toBe(true)
    expect(onTime.state.eventLateRegistrations.get(onTimeEvent.id)).toBe(false)
  })

  it('a devolução grava o registro tardio no evento (D3: grava, não pesa)', async () => {
    const world = buildDocumentWorld()

    const event = await reportDocumentReturn({
      ...outcomeInput({ idempotencyKey: 'k-return', lateRegistration: true, unitOfWork: world }),
      reason: 'recipient_absent',
    })

    expect(world.state.eventLateRegistrations.get(event.id)).toBe(true)
  })

  it('replay com a mesma chave e outro valor não regrava nem reclassifica (D5)', async () => {
    const world = buildDocumentWorld()

    const first = await reportDocumentDelivery(
      outcomeInput({ idempotencyKey: 'k-1', lateRegistration: false, unitOfWork: world }),
    )
    const replay = await reportDocumentDelivery(
      outcomeInput({ idempotencyKey: 'k-1', lateRegistration: true, unitOfWork: world }),
    )

    expect(replay.id).toBe(first.id)
    expect(world.state.eventLateRegistrations.size).toBe(1)
    expect(world.state.eventLateRegistrations.get(first.id)).toBe(false)
  })
})

describe('a leitura do comprovante no painel (spec 205 RF7)', () => {
  it('publica lateRegistration como dado', async () => {
    const proofs = await readDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads: {
        createDownloadUrl: async () => ({
          expiresAt: '2026-09-25T12:10:00.000Z',
          url: 'https://bucket.test/p',
        }),
      },
      repository: {
        listDeliveryProofs: async () => [
          {
            bucket: 'b',
            createdAt: '2026-09-25T12:05:10.000Z',
            id: 'proof-1',
            kind: 'photo',
            lateRegistration: true,
            mimeType: 'image/jpeg',
            objectKey: 'k',
            receiverDocumentMasked: '',
            receiverName: '',
            receivedBy: null,
            receivedByDetail: null,
          },
        ],
      },
      tripId: TRIP_ID,
    })

    expect(proofs[0]?.lateRegistration).toBe(true)
  })
})
