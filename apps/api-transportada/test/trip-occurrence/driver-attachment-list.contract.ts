/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.7 (lacuna achada na 1d): a rota do motorista aceitava **um** anexo, então um tipo com
 * `photo_minimum_count > 1` ficava impossível de registrar. Ela passa a aceitar uma **lista**
 * (`attachmentObjectIds`, 1 a 5), retrocompatível com o campo único — o app antigo segue funcionando —,
 * conferindo cada objeto confirmado contra empresa, viagem e motorista, e o mínimo de fotos contra a
 * quantidade. A coluna antiga leva o primeiro (escrita dupla da T1d.5).
 */
import { describe, expect, test } from 'bun:test'

import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceUploadNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import { parseRegisterOccurrenceRequest } from '../../src/trips/presentation/occurrence.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const FIRST_UPLOAD = '00000000-0000-4000-8000-0000000000f1'
const UPLOADS: readonly string[] = [
  FIRST_UPLOAD,
  '00000000-0000-4000-8000-0000000000f2',
  '00000000-0000-4000-8000-0000000000f3',
  '00000000-0000-4000-8000-0000000000f4',
  '00000000-0000-4000-8000-0000000000f5',
  '00000000-0000-4000-8000-0000000000f6',
]

function jsonRequest(body: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return (error as { status?: number } | undefined)?.status
}

describe('a rota do motorista aceita a lista de anexos (spec 246 T2.7)', () => {
  const body = { occurrenceTypeId: TYPE_ID }

  test('de 1 a 5 uuids distintos valem; o campo único antigo segue valendo', async () => {
    const one = await parseRegisterOccurrenceRequest(
      jsonRequest({ ...body, attachmentObjectIds: UPLOADS.slice(0, 1) }),
    )
    const five = await parseRegisterOccurrenceRequest(
      jsonRequest({ ...body, attachmentObjectIds: UPLOADS.slice(0, 5) }),
    )
    const legacy = await parseRegisterOccurrenceRequest(
      jsonRequest({ ...body, attachmentObjectId: FIRST_UPLOAD }),
    )

    expect(one.attachmentObjectIds).toEqual([FIRST_UPLOAD])
    expect(five.attachmentObjectIds).toHaveLength(5)
    expect(legacy.attachmentObjectId).toBe(FIRST_UPLOAD)
    expect(legacy.attachmentObjectIds).toBeUndefined()
  })

  test('lista vazia, com seis, repetida, com valor inválido ou junto do campo único é 400', async () => {
    for (const extra of [
      { attachmentObjectIds: [] },
      { attachmentObjectIds: UPLOADS },
      { attachmentObjectIds: [FIRST_UPLOAD, FIRST_UPLOAD] },
      { attachmentObjectIds: ['x'] },
      { attachmentObjectIds: [FIRST_UPLOAD], attachmentObjectId: UPLOADS[1] },
    ]) {
      expect(
        await statusOf(parseRegisterOccurrenceRequest(jsonRequest({ ...body, ...extra }))),
      ).toBe(400)
    }
  })
})

type Registration = {
  readonly attachmentObjectId?: string
  readonly attachmentObjectIds?: readonly string[]
  readonly confirmed?: ReadonlySet<string>
  readonly photoMinimumCount?: number
}

function register(input: Registration) {
  const state = createFieldReportState({
    documents: new Map([
      [
        DOCUMENT,
        { separationStatus: 'pending', stopId: null, tripId: '', tripStatus: 'on_delivery_route' },
      ],
    ]),
  })
  const base = createFieldReportUnitOfWork(state)
  const saved: {
    readonly attachmentObjectId: string | null
    readonly attachmentObjectIds?: readonly string[]
  }[] = []
  const lookups: { readonly driverId?: string; readonly id: string; readonly tripId: string }[] = []
  const confirmed = input.confirmed ?? new Set(UPLOADS)
  const result = registerDriverOccurrence({
    actorUserId: '00000000-0000-4000-8000-00000000000f',
    ...(input.attachmentObjectId === undefined
      ? {}
      : { attachmentObjectId: input.attachmentObjectId }),
    ...(input.attachmentObjectIds === undefined
      ? {}
      : { attachmentObjectIds: input.attachmentObjectIds }),
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: DRIVER,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente recusou',
    occurrenceTypeId: TYPE_ID,
    productCode: '',
    repository: {
      findConfirmedUpload: async (query) => {
        lookups.push(query)
        return confirmed.has(query.id) ? { id: query.id } : null
      },
      findOccurrenceType: async () => ({
        active: true,
        allowsMultipleItems: true,
        attachmentMode: 'required',
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        id: TYPE_ID,
        name: 'Recusa total',
        notifies: false,
        photoMinimumCount: input.photoMinimumCount ?? 1,
        stage: 'delivery',
      }),
      findOccurrenceTypeOverrides: async () => ({
        contractorOverrides: [],
        recipientOverrides: [],
      }),
      findReachableDocument: async () => ({ tripId: TRIP }),
      listDocumentProducts: async () => [],
    },
    unitOfWork: {
      execute: (operation) =>
        base.execute((transaction) =>
          operation({
            ...transaction,
            saveDocumentOccurrence: async (saveInput) => {
              saved.push(saveInput)
              return transaction.saveDocumentOccurrence(saveInput)
            },
          }),
        ),
    },
  })
  return { lookups, result, saved, state }
}

describe('o caso de uso confere cada anexo e o mínimo de fotos (spec 246 T2.7)', () => {
  test('três fotos num tipo que exige três: grava as três e a coluna antiga leva a primeira', async () => {
    const ids = UPLOADS.slice(0, 3)
    const { lookups, result, saved } = register({ attachmentObjectIds: ids, photoMinimumCount: 3 })

    await result

    expect(saved).toHaveLength(1)
    expect(saved[0]?.attachmentObjectId).toBe(FIRST_UPLOAD)
    expect(saved[0]?.attachmentObjectIds).toEqual(ids)
    expect(lookups.map((lookup) => lookup.id).sort()).toEqual([...ids].sort())
    for (const lookup of lookups) {
      expect(lookup).toMatchObject({ companyId: COMPANY, driverId: DRIVER, tripId: TRIP })
    }
  })

  test('duas fotos num tipo que exige três: 422 PHOTO_MINIMUM_NOT_MET, nada gravado', async () => {
    const { result, state } = register({
      attachmentObjectIds: UPLOADS.slice(0, 2),
      photoMinimumCount: 3,
    })

    const error = await result.catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(TripOccurrencePhotoMinimumNotMetError)
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('um anexo da lista que não é confirmado, desta viagem e deste motorista: inalcançável', async () => {
    const { result, state } = register({
      attachmentObjectIds: UPLOADS.slice(0, 3),
      confirmed: new Set(UPLOADS.slice(0, 2)),
      photoMinimumCount: 3,
    })

    expect(await result.catch((reason: unknown) => reason)).toBeInstanceOf(
      TripOccurrenceUploadNotReachableError,
    )
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('o app antigo, com o campo único, segue registrando', async () => {
    const { result, saved } = register({ attachmentObjectId: FIRST_UPLOAD })

    await result

    expect(saved[0]?.attachmentObjectId).toBe(FIRST_UPLOAD)
    expect(saved[0]?.attachmentObjectIds).toEqual([FIRST_UPLOAD])
  })
})

/**
 * ⚠️ O que a rota aceita e o que ela entrega ao caso de uso são coisas diferentes: sem este teste a
 * rota podia aceitar `signatureObjectId` e `attachmentObjectIds` e jogá-los fora, sem erro nenhum.
 */
describe('a rota entrega a assinatura e a lista de anexos ao caso de uso (spec 246 T2.4, T2.7)', () => {
  const NOT_CALLED = () => {
    throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
  }

  async function postOccurrence(body: Readonly<Record<string, unknown>>) {
    const received: Record<string, unknown>[] = []
    const routes = createMeTripRoutes({
      attachProof: NOT_CALLED,
      cancelStopDeparture: NOT_CALLED,
      confirmOccurrenceUpload: NOT_CALLED,
      createOccurrenceUpload: NOT_CALLED,
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: NOT_CALLED,
      readDeliveryProofs: NOT_CALLED,
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: async (input) => {
        received.push({ ...input })
        return {
          createdAt: '2026-10-06T12:00:00.000Z',
          id: 'occurrence',
          note: '',
          occurrenceTypeId: TYPE_ID,
          productCode: '',
          stage: 'delivery',
          typeName: 'Recusa total',
        }
      },
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportDeparture: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveDriverId: async () => DRIVER,
      startFieldTrip: NOT_CALLED,
    })
    const route = routes.find(
      (candidate) =>
        candidate.method === 'POST' &&
        candidate.pathname === '/me/trips/current/documents/:documentId/occurrences',
    )
    const roles = ['driver'] as const
    const response = await route?.execute({
      context: {
        identity: {
          companyIdClaim: COMPANY,
          externalIdentityId: '00000000-0000-4000-8000-000000000004',
          issuer: 'https://issuer.test',
          platformAdmin: false,
          serviceAccount: false,
          subject: 'driver',
          userId: '00000000-0000-4000-8000-000000000001',
        },
        scope: {
          companyId: COMPANY,
          kind: 'company',
          membershipId: '00000000-0000-4000-8000-000000000003',
          permissions: resolveCompanyPermissions(roles),
          roles,
          userId: '00000000-0000-4000-8000-000000000001',
        },
      },
      correlationId: 'c-1',
      pathParameters: { documentId: DOCUMENT },
      request: new Request('http://localhost/x', {
        body: JSON.stringify({ occurrenceTypeId: TYPE_ID, ...body }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': '00000000-0000-4000-8000-0000000000aa',
        },
        method: 'POST',
      }),
    })
    return { received, response }
  }

  test('lista de anexos e assinatura chegam ao caso de uso', async () => {
    const { received, response } = await postOccurrence({
      attachmentObjectIds: UPLOADS.slice(0, 2),
      signatureObjectId: UPLOADS[5],
    })

    expect(response?.status).toBe(201)
    expect(received[0]).toMatchObject({
      attachmentObjectIds: UPLOADS.slice(0, 2),
      signatureObjectId: UPLOADS[5],
    })
  })

  test('o campo único do app antigo chega como sempre chegou', async () => {
    const { received, response } = await postOccurrence({ attachmentObjectId: FIRST_UPLOAD })

    expect(response?.status).toBe(201)
    expect(received[0]).toMatchObject({ attachmentObjectId: FIRST_UPLOAD })
    expect(received[0]?.attachmentObjectIds).toBeUndefined()
  })
})
