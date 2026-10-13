/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.4: `GET /me/trips/current` diz, em cada nota do motorista, o estado do retorno da contratante
 * das ocorrências dela. O recorte é pelo vínculo (a consulta só recebe as notas das viagens dele), o campo é o
 * mínimo (id e estado, nenhum dado pessoal), a nota sem retorno e a API sem a dependência não levam a chave, e a
 * falha da leitura só tira o campo — e as rotas antigas seguem byte a byte iguais.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { CONTRACTOR_REPLY_STATUSES } from '../../src/shared/occurrence-contractor-reply.constant.js'
import { attachDriverDocumentContractorReplies } from '../../src/trips/application/attach-driver-document-contractor-replies.service.js'
import type {
  DriverContractorRepliesDependency,
  DriverDocumentContractorReply,
} from '../../src/trips/application/driver-document-contractor-reply.port.js'
import type {
  DriverTrip,
  DriverTripDocument,
  DriverTripStop,
  FindCurrentDriverTripResult,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const CURRENT_TRIP_PATH = '/me/trips/current'
const DOCUMENT_WITH_REPLY = '00000000-0000-4000-8000-0000000000d1'
const DOCUMENT_WITHOUT_REPLY = '00000000-0000-4000-8000-0000000000d2'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000e1'

function buildDocument(id: string): DriverTripDocument {
  return {
    accessKey: '',
    deliveredAt: null,
    deliveryProof: {
      photo: 'optional',
      receiverDocument: 'optional',
      receiverName: 'optional',
      signature: 'optional',
    },
    grossWeight: '0',
    id,
    number: '1',
    occurrenceTypes: null,
    proofPending: false,
    recipientDisplayName: 'Cliente',
    recipientIsCompany: true,
    recipientName: 'Cliente',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '0',
    volumeCount: '1',
  } as DriverTripDocument
}

function buildStop(documents: readonly DriverTripDocument[]): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents,
    enRouteSince: null,
    enRouteTappedAt: null,
    id: '00000000-0000-4000-8000-0000000000a1',
    label: 'Rua A, 1',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
  }
}

function buildTrips(documentIds: readonly string[]): readonly DriverTrip[] {
  return [
    {
      createdAt: '2026-10-20T10:00:00.000Z',
      crewRole: 'driver',
      id: '00000000-0000-4000-8000-000000000030',
      manifest: null,
      status: 'in_transit',
      stops: [buildStop(documentIds.map(buildDocument))],
      vehiclePlate: 'ABC1D23',
    },
  ]
}

function recordingReader(replies: readonly DriverDocumentContractorReply[]) {
  const calls: { readonly companyId: string; readonly documentIds: readonly string[] }[] = []
  const dependency: DriverContractorRepliesDependency = {
    reader: {
      list: (input) => {
        calls.push(input)
        return Promise.resolve(replies)
      },
    },
  }
  return { calls, dependency }
}

function documentsOf(trips: readonly DriverTrip[]): readonly DriverTripDocument[] {
  return trips.flatMap((trip) => trip.stops.flatMap((stop) => stop.documents))
}

describe('o retorno da contratante nas notas do motorista (spec 248 T5.4)', () => {
  test('a consulta recebe só as notas das viagens dele, com a empresa do contexto', async () => {
    const { calls, dependency } = recordingReader([])

    await attachDriverDocumentContractorReplies({
      companyId: COMPANY_ID,
      dependency,
      trips: buildTrips([DOCUMENT_WITH_REPLY, DOCUMENT_WITHOUT_REPLY]),
    })

    expect(calls).toEqual([
      { companyId: COMPANY_ID, documentIds: [DOCUMENT_WITH_REPLY, DOCUMENT_WITHOUT_REPLY] },
    ])
  })

  test('a nota com retorno leva só id e estado; a sem retorno não leva a chave', async () => {
    const { dependency } = recordingReader([
      {
        documentId: DOCUMENT_WITH_REPLY,
        occurrenceId: OCCURRENCE_ID,
        status: 'awaiting_contractor',
      },
    ])

    const trips = await attachDriverDocumentContractorReplies({
      companyId: COMPANY_ID,
      dependency,
      trips: buildTrips([DOCUMENT_WITH_REPLY, DOCUMENT_WITHOUT_REPLY]),
    })
    const [withReply, withoutReply] = documentsOf(trips)

    expect(withReply?.registeredOccurrences).toEqual([
      { contractorReply: { status: 'awaiting_contractor' }, id: OCCURRENCE_ID },
    ])
    expect(Object.keys(withReply?.registeredOccurrences?.[0] ?? {}).sort()).toEqual([
      'contractorReply',
      'id',
    ])
    expect('registeredOccurrences' in (withoutReply ?? {})).toBe(false)
  })

  test('todo estado do vocabulário existente passa como veio', async () => {
    for (const status of CONTRACTOR_REPLY_STATUSES) {
      const { dependency } = recordingReader([
        { documentId: DOCUMENT_WITH_REPLY, occurrenceId: OCCURRENCE_ID, status },
      ])
      const trips = await attachDriverDocumentContractorReplies({
        companyId: COMPANY_ID,
        dependency,
        trips: buildTrips([DOCUMENT_WITH_REPLY]),
      })

      expect(documentsOf(trips)[0]?.registeredOccurrences?.[0]?.contractorReply?.status).toBe(
        status,
      )
    }
  })

  test('sem a dependência, sem notas ou sem retornos a leitura sai como veio e sem consulta a mais', async () => {
    const trips = buildTrips([DOCUMENT_WITH_REPLY])
    const { calls, dependency } = recordingReader([])

    expect(await attachDriverDocumentContractorReplies({ companyId: COMPANY_ID, trips })).toBe(
      trips,
    )
    expect(
      await attachDriverDocumentContractorReplies({ companyId: COMPANY_ID, dependency, trips }),
    ).toBe(trips)
    const empty = buildTrips([])
    expect(
      await attachDriverDocumentContractorReplies({
        companyId: COMPANY_ID,
        dependency,
        trips: empty,
      }),
    ).toBe(empty)
    expect(calls).toHaveLength(1)
  })

  test('a falha da leitura só tira o campo e deixa rastro de contagem, sem id', async () => {
    const warnings: { readonly message: string; readonly metadata: unknown }[] = []
    const logger: ApiLogger = {
      error: () => undefined,
      info: () => undefined,
      warn: (message, metadata) => {
        warnings.push({ message, metadata })
      },
    }
    const trips = buildTrips([DOCUMENT_WITH_REPLY])

    const result = await attachDriverDocumentContractorReplies({
      companyId: COMPANY_ID,
      dependency: {
        logger,
        reader: { list: () => Promise.reject(new Error('connection refused to a.example')) },
      },
      trips,
    })

    expect(result).toBe(trips)
    expect(warnings).toEqual([
      {
        message: 'driver_contractor_reply_unavailable',
        metadata: { companyId: COMPANY_ID, documentCount: 1 },
      },
    ])
  })
})

async function readDocumentsAsJson(trips: readonly DriverTrip[]) {
  const result: FindCurrentDriverTripResult = {
    isRegisteredDriver: true,
    pendingProofs: [],
    score: 85,
    trips,
  }
  const routes = createMeTripRoutes(
    new Proxy({} as never, {
      get: (_target, key) =>
        key === 'findCurrentTrip'
          ? () => Promise.resolve(result)
          : () => {
              throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
            },
    }),
  )
  const route = routes.find((candidate) => candidate.pathname === CURRENT_TRIP_PATH)
  if (route === undefined || route.method !== 'GET') throw new Error('EXPECTED_CURRENT_TRIP_ROUTE')
  const context = {
    scope: { companyId: COMPANY_ID, membershipId: 'membership-1', permissions: new Set<string>() },
  } as unknown as AuthenticatedContext<CompanyContext>
  const response = await route.execute({
    context,
    correlationId: 'correlation-1',
    pathParameters: {},
    request: new Request(`http://api.test${CURRENT_TRIP_PATH}`),
  })
  const body = (await response.json()) as {
    readonly data: {
      readonly trips: readonly {
        readonly stops: readonly { readonly documents: readonly Record<string, unknown>[] }[]
      }[]
    }
  }
  return body.data.trips[0]?.stops[0]?.documents ?? []
}

describe('GET /me/trips/current entrega o retorno como o app do motorista lê (spec 248 T5.4)', () => {
  test('a nota com retorno leva registeredOccurrences exato; a sem retorno é igual à de antes', async () => {
    const { dependency } = recordingReader([
      { documentId: DOCUMENT_WITH_REPLY, occurrenceId: OCCURRENCE_ID, status: 'reply_received' },
    ])
    const withReplies = await attachDriverDocumentContractorReplies({
      companyId: COMPANY_ID,
      dependency,
      trips: buildTrips([DOCUMENT_WITH_REPLY, DOCUMENT_WITHOUT_REPLY]),
    })
    const original = buildTrips([DOCUMENT_WITH_REPLY, DOCUMENT_WITHOUT_REPLY])

    const documents = await readDocumentsAsJson(withReplies)
    const before = await readDocumentsAsJson(original)

    expect(documents[0]?.registeredOccurrences).toEqual([
      { contractorReply: { status: 'reply_received' }, id: OCCURRENCE_ID },
    ])
    expect(documents[1]).toEqual(before[1] as Record<string, unknown>)
    expect(Object.keys(documents[0] ?? {}).filter((key) => !(key in (before[0] ?? {})))).toEqual([
      'registeredOccurrences',
    ])
  })
})
