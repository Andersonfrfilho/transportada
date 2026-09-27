/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 209: a foto do "Deu problema" é anexo da ocorrência de parada, nunca canhoto de entrega.
 * Sem banco e sem HTTP de verdade — a integração (`stop-occurrence-photo.integration.ts`) prova o
 * SQL. Aqui ficam as barreiras: a parada tem de ser da viagem dele na rua (RF1), o objeto tem de ser
 * desta empresa, desta viagem e deste motorista (RF2), e o reenvio completa o anexo uma vez (RF3).
 */
import { describe, expect, test } from 'bun:test'

import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { DriverFieldReportUnitOfWork } from '../../src/trips/application/driver-field-report.port.js'
import {
  reportStopOccurrence,
  type StopOccurrenceAttachmentPort,
} from '../../src/trips/application/report-stop-occurrence.use-case.js'
import {
  confirmReachableStopOccurrenceUpload,
  requestStopOccurrenceUpload,
} from '../../src/trips/application/request-stop-occurrence-upload.use-case.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../src/database/trip.schema.js'
import {
  TripOccurrenceUploadNotReachableError,
  TripStopNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { parseStopOccurrenceRequest } from '../../src/trips/presentation/me-trip.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const OTHER_COMPANY = '00000000-0000-4000-8000-000000000002'
const TRIP = '00000000-0000-4000-8000-000000000011'
const OTHER_TRIP = '00000000-0000-4000-8000-000000000099'
const STOP = '00000000-0000-4000-8000-0000000000a1'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const OTHER_DRIVER = '00000000-0000-4000-8000-00000000000e'
const ACTOR = '00000000-0000-4000-8000-0000000000f1'
const OBJECT_ID = '00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-09-25T12:00:00.000Z')
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

describe('pedir e confirmar o upload amarrados à parada (spec 209 RF1)', () => {
  function repository(input: {
    readonly confirmed?: object[]
    readonly pending?: object[]
    readonly reachable: boolean
  }) {
    return {
      async confirmUpload(record: object) {
        input.confirmed?.push(record)
        return { confirmed: true }
      },
      async findConfirmedUpload() {
        return null
      },
      async findPendingUpload() {
        return {
          bucket: 'trip-attachments',
          expiresAt: new Date(NOW.getTime() + 60_000),
          mimeType: 'image/jpeg',
          objectKey: `tenants/${COMPANY}/trip-occurrence-uploads/${TRIP}/${OBJECT_ID}`,
        }
      },
      async findReachableStop() {
        return input.reachable ? { tripId: TRIP } : null
      },
      async insertPendingUpload(record: object) {
        input.pending?.push(record)
      },
    }
  }

  const signing = { createSignedUpload: async () => new URL('https://storage.test/upload') }
  /** A confirmação (spec 179) grava a cópia final e apaga a pendência: as quatro operações do port. */
  const reading = {
    deleteObject: async () => {},
    getObjectStream: async () => new Response(JPEG_BYTES).body as ReadableStream<Uint8Array>,
    headObject: async () => ({ contentLength: JPEG_BYTES.byteLength }),
    storeObject: async () => undefined,
  }

  test('parada alcançável: a URL nasce escopada pela viagem resolvida e pelo motorista', async () => {
    const pending: object[] = []
    const result = await requestStopOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository({ pending, reachable: true }),
      sizeBytes: 1024,
      stopId: STOP,
      storage: signing,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(pending).toEqual([expect.objectContaining({ driverId: DRIVER, tripId: TRIP })])
  })

  test('parada fora da viagem dele: o pedido é 404 e nada é gravado', async () => {
    const pending: object[] = []
    const rejected = await requestStopOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository({ pending, reachable: false }),
      sizeBytes: 1024,
      stopId: STOP,
      storage: signing,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripStopNotReachableError)
    expect(pending).toHaveLength(0)
  })

  test('parada fora da viagem dele: a confirmação também é 404', async () => {
    const confirmed: object[] = []
    const rejected = await confirmReachableStopOccurrenceUpload({
      companyId: COMPANY,
      driverId: DRIVER,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({ confirmed, reachable: false }),
      stopId: STOP,
      storage: reading,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripStopNotReachableError)
    expect(confirmed).toHaveLength(0)
  })

  test('parada alcançável: a confirmação confere o objeto da viagem resolvida', async () => {
    const confirmed: object[] = []
    const result = await confirmReachableStopOccurrenceUpload({
      companyId: COMPANY,
      driverId: DRIVER,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({ confirmed, reachable: true }),
      stopId: STOP,
      storage: reading,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(confirmed).toHaveLength(1)
  })
})

type Upload = { readonly companyId: string; readonly driverId: string; readonly tripId: string }

/** O dublê da transação real, com a gravação da ocorrência espiada: o anexo que chegou até ela. */
function buildWorld(input: { readonly upload?: Upload } = {}) {
  const state = createFieldReportState()
  state.stops.set(STOP, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP,
    tripStatus: 'in_transit',
  })
  const base = createFieldReportUnitOfWork(state)
  const recorded: Array<{ attachmentObjectId: string | null; kind: string }> = []
  const unitOfWork: DriverFieldReportUnitOfWork = {
    execute: (operation) =>
      base.execute((transaction) =>
        operation({
          ...transaction,
          recordOccurrence: async (record) => {
            recorded.push({ attachmentObjectId: record.attachmentObjectId, kind: record.kind })
            return transaction.recordOccurrence(record)
          },
        }),
      ),
  }
  const attached: Array<{ objectId: string; occurrenceId: string; stopId: string }> = []
  const attachmentUploads: StopOccurrenceAttachmentPort = {
    async attachUploadToStopOccurrence(record) {
      attached.push({
        objectId: record.objectId,
        occurrenceId: record.occurrenceId,
        stopId: record.stopId,
      })
    },
    async findConfirmedUpload(query) {
      const upload = input.upload
      if (upload === undefined || query.id !== OBJECT_ID) return null
      if (upload.companyId !== query.companyId || upload.tripId !== query.tripId) return null
      if (query.driverId !== undefined && upload.driverId !== query.driverId) return null
      return { id: query.id }
    },
  }
  return { attached, attachmentUploads, recorded, state, unitOfWork }
}

function occurrenceInput(
  world: ReturnType<typeof buildWorld>,
  overrides: { readonly attachmentObjectId?: string | null; readonly key?: string } = {},
) {
  return {
    actorUserId: ACTOR,
    attachmentObjectId: overrides.attachmentObjectId ?? null,
    attachmentUploads: world.attachmentUploads,
    companyId: COMPANY,
    description: 'Duas horas na fila da doca',
    distanceMeters: null,
    documentId: null,
    driverId: DRIVER,
    idempotencyKey: overrides.key ?? 'chave-1',
    kind: 'long_wait' as const,
    stopId: STOP,
    unitOfWork: world.unitOfWork,
  }
}

const OWN_UPLOAD: Upload = { companyId: COMPANY, driverId: DRIVER, tripId: TRIP }

describe('a foto na ocorrência de parada (spec 209 RF2)', () => {
  test.each([...TRIP_STOP_OCCURRENCE_KINDS])(
    '%s com foto grava a ocorrência com o anexo',
    async (kind) => {
      const world = buildWorld({ upload: OWN_UPLOAD })

      const result = await reportStopOccurrence({
        ...occurrenceInput(world, { attachmentObjectId: OBJECT_ID }),
        kind,
      })

      expect(result.id).toStartWith('occurrence-')
      expect(world.recorded).toEqual([{ attachmentObjectId: OBJECT_ID, kind }])
    },
  )

  test('sem foto grava como antes, e nada é completado depois', async () => {
    const world = buildWorld({ upload: OWN_UPLOAD })

    await reportStopOccurrence(occurrenceInput(world))

    expect(world.recorded).toEqual([{ attachmentObjectId: null, kind: 'long_wait' }])
    expect(world.attached).toEqual([])
  })

  test.each<[string, Upload | undefined]>([
    ['nunca confirmado', undefined],
    ['de outra empresa', { ...OWN_UPLOAD, companyId: OTHER_COMPANY }],
    ['de outra viagem', { ...OWN_UPLOAD, tripId: OTHER_TRIP }],
    ['de outro motorista', { ...OWN_UPLOAD, driverId: OTHER_DRIVER }],
  ])('objeto %s é 404 e nada é gravado', async (_label, upload) => {
    const world = buildWorld(upload === undefined ? {} : { upload })

    const rejected = await reportStopOccurrence(
      occurrenceInput(world, { attachmentObjectId: OBJECT_ID }),
    ).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
    expect(world.recorded).toEqual([])
    expect(world.attached).toEqual([])
  })

  test('parada fora da viagem dele continua 404 de parada, com ou sem foto', async () => {
    const world = buildWorld({ upload: OWN_UPLOAD })
    world.state.stops.clear()

    const rejected = await reportStopOccurrence(
      occurrenceInput(world, { attachmentObjectId: OBJECT_ID }),
    ).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripStopNotReachableError)
    expect(world.recorded).toEqual([])
  })

  test('sem a porta de anexos (canal do escritório), anexo é recusado em vez de ignorado', async () => {
    const world = buildWorld({ upload: OWN_UPLOAD })
    const { attachmentUploads, ...withoutPort } = occurrenceInput(world, {
      attachmentObjectId: OBJECT_ID,
    })
    expect(attachmentUploads).toBeDefined()

    const rejected = await reportStopOccurrence(withoutPort).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
    expect(world.recorded).toEqual([])
  })
})

describe('o reenvio da ocorrência de parada (spec 209 RF3)', () => {
  test('a mesma chave devolve a mesma ocorrência, gravada uma vez só', async () => {
    const world = buildWorld({ upload: OWN_UPLOAD })
    const input = occurrenceInput(world, { attachmentObjectId: OBJECT_ID })

    const first = await reportStopOccurrence(input)
    const second = await reportStopOccurrence(input)

    expect(second.id).toBe(first.id)
    expect(world.recorded).toHaveLength(1)
  })

  test('a foto que chega depois completa a ocorrência gravada sem ela, pela mesma chave', async () => {
    const world = buildWorld({ upload: OWN_UPLOAD })

    const first = await reportStopOccurrence(occurrenceInput(world))
    const second = await reportStopOccurrence(
      occurrenceInput(world, { attachmentObjectId: OBJECT_ID }),
    )

    expect(second.id).toBe(first.id)
    expect(world.recorded).toHaveLength(1)
    expect(world.attached).toEqual([{ objectId: OBJECT_ID, occurrenceId: first.id, stopId: STOP }])
  })

  test('a foto que chega depois de outra viagem é 404, e a ocorrência fica como estava', async () => {
    const world = buildWorld({ upload: { ...OWN_UPLOAD, tripId: OTHER_TRIP } })

    await reportStopOccurrence(occurrenceInput(world))
    const rejected = await reportStopOccurrence(
      occurrenceInput(world, { attachmentObjectId: OBJECT_ID }),
    ).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
    expect(world.attached).toEqual([])
  })
})

describe('o corpo da ocorrência de parada (spec 209 RF2)', () => {
  function request(body: unknown): Request {
    return new Request('http://localhost/me/trips/current/stops/x/occurrences', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  }

  test('aceita attachmentObjectId em qualquer kind', async () => {
    for (const kind of TRIP_STOP_OCCURRENCE_KINDS) {
      const parsed = await parseStopOccurrenceRequest(
        request({ attachmentObjectId: OBJECT_ID, kind }),
      )
      expect(parsed.attachmentObjectId).toBe(OBJECT_ID)
    }
  })

  test('sem o campo continua valendo, e vira null', async () => {
    const parsed = await parseStopOccurrenceRequest(request({ kind: 'long_wait' }))

    expect(parsed.attachmentObjectId).toBeNull()
  })

  test('attachmentObjectId que não é uuid é 400', async () => {
    const rejected = await parseStopOccurrenceRequest(
      request({ attachmentObjectId: 'foto.jpg', kind: 'long_wait' }),
    ).catch((error: unknown) => error)

    expect((rejected as { status?: number }).status).toBe(400)
  })
})

describe('as rotas de upload por parada (spec 209 RF1)', () => {
  const NOT_CALLED = () => {
    throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
  }
  const UPLOADS_PATH = '/me/trips/current/stops/:stopId/occurrence-uploads'

  function context(): AuthenticatedContext<CompanyContext> {
    return {
      identity: {
        companyIdClaim: COMPANY,
        externalIdentityId: '00000000-0000-4000-8000-000000000004',
        issuer: 'https://issuer.test',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'driver',
        userId: ACTOR,
      },
      scope: {
        companyId: COMPANY,
        kind: 'company',
        membershipId: '00000000-0000-4000-8000-000000000003',
        permissions: resolveCompanyPermissions(['driver']),
        roles: ['driver'],
        userId: ACTOR,
      },
    }
  }

  function buildRoutes() {
    const asked: unknown[] = []
    const routes = createMeTripRoutes({
      attachProof: NOT_CALLED,
      confirmOccurrenceUpload: async (input) => {
        asked.push(input)
        return { id: OBJECT_ID }
      },
      createOccurrenceUpload: async (input) => {
        asked.push(input)
        return { id: OBJECT_ID, uploadUrl: new URL('https://storage.test/upload') }
      },
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: NOT_CALLED,
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: NOT_CALLED,
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: NOT_CALLED,
      reportDeparture: NOT_CALLED,
      cancelStopDeparture: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportOccurrence: async (input) => {
        asked.push(input)
        return { id: 'occurrence-1' }
      },
      reportReturn: NOT_CALLED,
      resolveDriverId: async () => DRIVER,
      startFieldTrip: NOT_CALLED,
    })
    return { asked, routes }
  }

  test('pedir a URL por parada leva a parada como alvo, com o motorista do token', async () => {
    const { asked, routes } = buildRoutes()
    const route = routes.find(
      (candidate) => candidate.method === 'POST' && candidate.pathname === UPLOADS_PATH,
    )

    const response = await route?.execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: { stopId: STOP },
      request: new Request(`http://localhost/me/trips/current/stops/${STOP}/occurrence-uploads`, {
        body: JSON.stringify({ mimeType: 'image/jpeg', sizeBytes: 1024 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    })

    expect(route?.policy).toEqual({ permission: 'trip.report', scope: 'company' })
    expect(response?.status).toBe(201)
    expect(asked).toEqual([
      expect.objectContaining({ companyId: COMPANY, driverId: DRIVER, target: { stopId: STOP } }),
    ])
  })

  test('confirmar por parada leva a parada como alvo', async () => {
    const { asked, routes } = buildRoutes()
    const route = routes.find(
      (candidate) =>
        candidate.method === 'POST' && candidate.pathname === `${UPLOADS_PATH}/:uploadId/confirm`,
    )

    const response = await route?.execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: { stopId: STOP, uploadId: OBJECT_ID },
      request: new Request('http://localhost/confirm', { method: 'POST' }),
    })

    expect(response?.status).toBe(200)
    expect(asked).toEqual([expect.objectContaining({ id: OBJECT_ID, target: { stopId: STOP } })])
  })

  test('a ocorrência de parada repassa o attachmentObjectId do corpo', async () => {
    const { asked, routes } = buildRoutes()
    const route = routes.find(
      (candidate) =>
        candidate.method === 'POST' &&
        candidate.pathname === '/me/trips/current/stops/:stopId/occurrences',
    )

    const response = await route?.execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: { stopId: STOP },
      request: new Request('http://localhost/occurrences', {
        body: JSON.stringify({ attachmentObjectId: OBJECT_ID, kind: 'dock_closed' }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'chave-1' },
        method: 'POST',
      }),
    })

    expect(response?.status).toBe(201)
    expect(asked).toEqual([
      expect.objectContaining({ attachmentObjectId: OBJECT_ID, kind: 'dock_closed' }),
    ])
  })
})

describe('a fiação da ocorrência de parada em main.ts (spec 209 RF2)', () => {
  const MAIN_PATH = new URL('../../src/main.ts', import.meta.url)

  function readReportOccurrenceWiring(source: string, factory: string): string {
    const factoryStart = source.indexOf(`...${factory}({`)
    const wiringStart = source.indexOf('reportOccurrence: (input) =>', factoryStart)
    /* Fecha no `}),` da chamada a `reportStopOccurrence`, não no da fábrica. */
    return source.slice(wiringStart, source.indexOf('\n        }),', wiringStart))
  }

  test('o canal do motorista leva o anexo do corpo e a porta que o confere', async () => {
    const wiring = readReportOccurrenceWiring(
      await Bun.file(MAIN_PATH).text(),
      'createMeTripRoutes',
    )

    expect(wiring).not.toContain('attachmentObjectId: null')
    expect(wiring).toContain('attachmentUploads')
  })

  test('o canal do escritório continua sem anexo', async () => {
    const wiring = readReportOccurrenceWiring(
      await Bun.file(MAIN_PATH).text(),
      'createTripFieldOfficeRoutes',
    )

    expect(wiring).toContain('attachmentObjectId: null')
  })
})
