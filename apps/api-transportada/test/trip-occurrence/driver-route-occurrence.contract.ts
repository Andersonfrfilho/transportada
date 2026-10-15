/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.5 (ADR-0105): `GET /me/trips/current/route-occurrences` e `.../:kind/:id` — o formato, a
 * frase fixa da resolução do sistema, a reabertura, os 404 distintos e a permissão, com o leitor em memória.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { DriverRouteOccurrenceReaderPort } from '../../src/trips/application/driver-route-occurrence.port.js'
import { createFindDriverRouteOccurrenceUseCase } from '../../src/trips/application/find-driver-route-occurrence.use-case.js'
import { createSignDriverRouteOccurrenceFileUseCase } from '../../src/trips/application/sign-driver-route-occurrence-file.use-case.js'
import { createListDriverRouteOccurrencesUseCase } from '../../src/trips/application/list-driver-route-occurrences.use-case.js'
import type { DriverRouteOccurrenceFacts } from '../../src/trips/domain/driver-route-occurrence.types.js'
import type { OccurrenceResolutionEventFact } from '../../src/trips/domain/occurrence-resolution.types.js'
import { createMeRouteOccurrenceRoutes } from '../../src/trips/presentation/me-route-occurrence.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000a1'
const LIST_PATH = '/me/trips/current/route-occurrences'
const DETAIL_PATH = '/me/trips/current/route-occurrences/:kind/:id'
const FILE_URL_PATH = '/me/trips/current/route-occurrences/:kind/:id/attachments/:objectId/url'
const NOW = new Date('2026-10-15T12:00:00.000Z')

type FakeState = {
  driverId: string | null
  facts: DriverRouteOccurrenceFacts[]
  signed: { bucket: string; filename: string; key: string; expiresInSeconds: number }[]
  tripId: string | null
}

function event(
  partial: Partial<OccurrenceResolutionEventFact> & Pick<OccurrenceResolutionEventFact, 'kind'>,
): OccurrenceResolutionEventFact {
  const createdAt = partial.createdAt ?? '2026-10-15T10:00:00.000Z'
  return {
    actorKind: 'internal',
    caseEventStatus: undefined,
    createdAt,
    id: crypto.randomUUID(),
    note: undefined,
    sequence: Date.parse(createdAt),
    ...partial,
  }
}

function facts(partial: Partial<DriverRouteOccurrenceFacts> = {}): DriverRouteOccurrenceFacts {
  return {
    cancelledAt: undefined,
    chatAttachments: [],
    documentId: '00000000-0000-4000-8000-0000000000d1',
    documentNumber: '1234',
    events: [],
    hasConversation: false,
    id: OCCURRENCE_ID,
    kind: 'document',
    note: 'caixa avariada',
    photos: [],
    recordedAt: '2026-10-15T09:00:00.000Z',
    recordedByMe: true,
    reportKey: 'report-key-1',
    signature: null,
    stopId: '00000000-0000-4000-8000-0000000000b1',
    stopSequence: 2,
    type: { iconName: 'box', id: '00000000-0000-4000-8000-0000000000c1', name: 'Avaria' },
    ...partial,
  }
}

function file(objectId: string, createdAt: string, fileName: string | null = null) {
  return {
    bucket: 'bucket',
    contentType: 'image/jpeg',
    createdAt,
    fileName,
    objectId,
    objectKey: `key/${objectId}`,
    retentionUntil: undefined,
    sizeBytes: 10,
  }
}

function context(
  permissions: readonly string[] = ['trip.read'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(permissions as never),
      roles: ['driver'],
      userId: USER_ID,
    },
  }
}

function routes(state: FakeState) {
  const reader: DriverRouteOccurrenceReaderPort = {
    findCurrentTripId: async () => state.tripId,
    readOccurrences: async (input) =>
      state.facts.filter(
        (item) =>
          input.target === undefined ||
          (item.id === input.target.id && item.kind === input.target.kind),
      ),
  }
  return createMeRouteOccurrenceRoutes({
    findOccurrence: createFindDriverRouteOccurrenceUseCase({ reader }),
    listOccurrences: createListDriverRouteOccurrencesUseCase({ reader }),
    resolveDriverId: async () => state.driverId,
    signFile: createSignDriverRouteOccurrenceFileUseCase({
      clock: () => NOW,
      reader,
      storage: {
        createSignedDownload: async (input) => {
          state.signed.push({
            bucket: input.bucket,
            expiresInSeconds: input.expiresInSeconds,
            filename: input.filename,
            key: input.key,
          })
          return new URL(`https://storage.example.test/${input.key}?signature=secret`)
        },
      },
    }),
  })
}

function fresh(overrides: Partial<FakeState> = {}): FakeState {
  return { driverId: DRIVER_ID, facts: [facts()], signed: [], tripId: TRIP_ID, ...overrides }
}

async function list(state: FakeState): Promise<Response> {
  const route = routes(state).find((item) => item.pathname === LIST_PATH)
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route.execute({
    context: context(),
    correlationId: 'correlation-1',
    pathParameters: {},
    request: new Request(`http://localhost${LIST_PATH}`),
  })
}

async function detail(
  state: FakeState,
  input: { id?: string; kind?: string } = {},
): Promise<Response> {
  const route = routes(state).find((item) => item.pathname === DETAIL_PATH)
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  const kind = input.kind ?? 'document'
  const id = input.id ?? OCCURRENCE_ID
  return route.execute({
    context: context(),
    correlationId: 'correlation-1',
    pathParameters: { id, kind },
    request: new Request(`http://localhost${LIST_PATH}/${kind}/${id}`),
  })
}

async function listed(state: FakeState) {
  const body = (await (await list(state)).json()) as { data: Record<string, unknown>[] }
  const [item] = body.data
  if (item === undefined) throw new Error('EXPECTED_ITEM')
  return item
}

describe('GET /me/trips/current/route-occurrences (spec 266 T2.5)', () => {
  it('200 com o envelope e o item do contrato; sem evento a ocorrência está em aberto', async () => {
    const response = await list(fresh())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: [
        {
          conversation: { exists: false },
          documentCount: 0,
          documentId: '00000000-0000-4000-8000-0000000000d1',
          documentNumber: '1234',
          id: OCCURRENCE_ID,
          kind: 'document',
          recordedAt: '2026-10-15T09:00:00.000Z',
          recordedByMe: true,
          reopenedAt: null,
          reportKey: 'report-key-1',
          resolution: null,
          state: 'open',
          stopId: '00000000-0000-4000-8000-0000000000b1',
          stopSequence: 2,
          type: { iconName: 'box', id: '00000000-0000-4000-8000-0000000000c1', name: 'Avaria' },
        },
      ],
    })
  })

  it('resolvida pelo escritório: a observação do operador, sem frase', async () => {
    const item = await listed(
      fresh({ facts: [facts({ events: [event({ kind: 'resolved', note: 'Cliente avisado' })] })] }),
    )

    expect(item).toMatchObject({
      resolution: {
        actorKind: 'internal',
        at: '2026-10-15T10:00:00.000Z',
        note: 'Cliente avisado',
        phraseKey: null,
      },
      state: 'resolved',
    })
  })

  it('resolvida pelo sistema: só a frase fixa do status terminal, nunca a nota interna', async () => {
    const statuses = [
      ['closed', 'case_closed'],
      ['returned_to_warehouse', 'case_returned_to_warehouse'],
      ['cancelled', 'case_cancelled'],
    ] as const
    for (const [caseEventStatus, phraseKey] of statuses) {
      const item = await listed(
        fresh({
          facts: [
            facts({
              events: [
                event({
                  actorKind: 'system',
                  caseEventStatus,
                  kind: 'resolved',
                  note: 'nota interna da tratativa',
                }),
              ],
            }),
          ],
        }),
      )

      expect(item.resolution).toEqual({
        actorKind: 'system',
        at: '2026-10-15T10:00:00.000Z',
        note: null,
        phraseKey,
      })
    }
  })

  it('reaberta: em aberto com a hora da reabertura e sem resolução', async () => {
    const item = await listed(
      fresh({
        facts: [
          facts({
            events: [
              event({ kind: 'resolved', note: 'ok' }),
              event({
                actorKind: 'driver',
                createdAt: '2026-10-15T11:00:00.000Z',
                kind: 'reopened',
              }),
            ],
          }),
        ],
      }),
    )

    expect(item).toMatchObject({
      reopenedAt: '2026-10-15T11:00:00.000Z',
      resolution: null,
      state: 'open',
    })
  })

  it('cancelada vence qualquer histórico', async () => {
    const item = await listed(
      fresh({
        facts: [
          facts({
            cancelledAt: '2026-10-15T12:00:00.000Z',
            events: [event({ kind: 'resolved', note: 'ok' })],
          }),
        ],
      }),
    )

    expect(item).toMatchObject({ resolution: null, state: 'cancelled' })
  })

  it('documentCount soma fotos, assinatura e anexos do chat', async () => {
    const item = await listed(
      fresh({
        facts: [
          facts({
            chatAttachments: [
              { ...file('o3', '2026-10-15T10:00:00.000Z', 'boleto.pdf'), messageId: 'm1' },
            ],
            hasConversation: true,
            photos: [file('o1', '2026-10-15T09:01:00.000Z')],
            signature: file('o2', '2026-10-15T09:02:00.000Z'),
          }),
        ],
      }),
    )

    expect(item).toMatchObject({ conversation: { exists: true }, documentCount: 3 })
  })

  it('404 DRIVER_TRIP_NOT_ACTIVE sem viagem atual ou com a viagem finalizada', async () => {
    await expect(list(fresh({ tripId: null }))).rejects.toMatchObject({
      code: 'DRIVER_TRIP_NOT_ACTIVE',
      status: 404,
    })
    await expect(detail(fresh({ tripId: null }))).rejects.toMatchObject({
      code: 'DRIVER_TRIP_NOT_ACTIVE',
      status: 404,
    })
  })

  it('409 DRIVER_NOT_REGISTERED para a conta sem ficha de motorista', async () => {
    await expect(list(fresh({ driverId: null }))).rejects.toMatchObject({
      code: 'DRIVER_NOT_REGISTERED',
    })
  })

  it('exige trip.read nas duas rotas', () => {
    for (const route of routes(fresh())) {
      expect(route.method).toBe('GET')
      expect(route.policy).toEqual({ permission: 'trip.read', scope: 'company' })
    }
  })
})

describe('GET /me/trips/current/route-occurrences/:kind/:id (spec 266 T2.5)', () => {
  it('200 com o item, a observação, fotos, assinatura, anexos e a linha do tempo sem tratativa', async () => {
    const state = fresh({
      facts: [
        facts({
          chatAttachments: [
            { ...file('o3', '2026-10-15T09:30:00.000Z', 'boleto.pdf'), messageId: 'm1' },
          ],
          events: [event({ createdAt: '2026-10-15T10:00:00.000Z', kind: 'resolved', note: 'ok' })],
          photos: [file('o1', '2026-10-15T09:01:00.000Z')],
          signature: file('o2', '2026-10-15T09:02:00.000Z'),
        }),
      ],
    })

    const body = (await (await detail(state)).json()) as { data: Record<string, unknown> }

    expect(body.data).toMatchObject({
      attachments: [
        {
          contentType: 'image/jpeg',
          messageId: 'm1',
          name: 'boleto.pdf',
          objectId: 'o3',
          sizeBytes: 10,
        },
      ],
      note: 'caixa avariada',
      photos: [{ name: null, objectId: 'o1' }],
      signature: { objectId: 'o2' },
      state: 'resolved',
      timeline: [
        { at: '2026-10-15T09:00:00.000Z', kind: 'recorded' },
        { at: '2026-10-15T09:01:00.000Z', kind: 'photo' },
        { at: '2026-10-15T10:00:00.000Z', kind: 'resolution.resolved' },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('key/')
    expect(JSON.stringify(body)).not.toContain('case.transition')
  })

  it('cancelada e reaberta entram na linha do tempo, em ordem', async () => {
    const state = fresh({
      facts: [
        facts({
          cancelledAt: '2026-10-15T12:00:00.000Z',
          events: [
            event({ createdAt: '2026-10-15T10:00:00.000Z', kind: 'resolved', note: 'ok' }),
            event({ actorKind: 'driver', createdAt: '2026-10-15T11:00:00.000Z', kind: 'reopened' }),
          ],
        }),
      ],
    })

    const body = (await (await detail(state)).json()) as {
      data: { timeline: { kind: string }[] }
    }

    expect(body.data.timeline.map((entry) => entry.kind)).toEqual([
      'recorded',
      'resolution.resolved',
      'resolution.reopened',
      'cancelled',
    ])
  })

  it('404 TRIP_OCCURRENCE_NOT_FOUND para id desconhecido e para o outro tipo', async () => {
    await expect(
      detail(fresh(), { id: '00000000-0000-4000-8000-0000000000ff' }),
    ).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
      status: 404,
    })
    await expect(detail(fresh(), { kind: 'stop' })).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
      status: 404,
    })
  })

  it('400 para kind inválido e id que não é uuid', async () => {
    await expect(detail(fresh(), { kind: 'trip' })).rejects.toMatchObject({ status: 400 })
    await expect(detail(fresh(), { id: 'not-a-uuid' })).rejects.toMatchObject({ status: 400 })
  })
})

async function signUrl(
  state: FakeState,
  input: { id?: string; kind?: string; objectId?: string } = {},
): Promise<Response> {
  const route = routes(state).find((item) => item.pathname === FILE_URL_PATH)
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  const kind = input.kind ?? 'document'
  const id = input.id ?? OCCURRENCE_ID
  const objectId = input.objectId ?? PHOTO_OBJECT_ID
  return route.execute({
    context: context(),
    correlationId: 'correlation-1',
    pathParameters: { id, kind, objectId },
    request: new Request(`http://localhost${LIST_PATH}/${kind}/${id}/attachments/${objectId}/url`),
  })
}

const PHOTO_OBJECT_ID = '00000000-0000-4000-8000-0000000000f1'
const SIGNATURE_OBJECT_ID = '00000000-0000-4000-8000-0000000000f2'
const CHAT_OBJECT_ID = '00000000-0000-4000-8000-0000000000f3'
const FOREIGN_OBJECT_ID = '00000000-0000-4000-8000-0000000000f9'

function withFiles(partial: Partial<DriverRouteOccurrenceFacts> = {}): FakeState {
  return fresh({
    facts: [
      facts({
        chatAttachments: [
          { ...file(CHAT_OBJECT_ID, '2026-10-15T09:30:00.000Z', 'boleto.pdf'), messageId: 'm1' },
        ],
        photos: [file(PHOTO_OBJECT_ID, '2026-10-15T09:01:00.000Z')],
        signature: file(SIGNATURE_OBJECT_ID, '2026-10-15T09:02:00.000Z'),
        ...partial,
      }),
    ],
  })
}

describe('GET /me/trips/current/route-occurrences/:kind/:id/attachments/:objectId/url (spec 266 T2.6)', () => {
  it('200 com a URL de 5 minutos para a foto, a assinatura e o anexo do chat, com o nome do anexo', async () => {
    for (const [objectId, filename] of [
      [PHOTO_OBJECT_ID, 'ocorrencia'],
      [SIGNATURE_OBJECT_ID, 'ocorrencia'],
      [CHAT_OBJECT_ID, 'boleto.pdf'],
    ] as const) {
      const state = withFiles()
      const response = await signUrl(state, { objectId })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
        data: {
          expiresAt: '2026-10-15T12:05:00.000Z',
          url: `https://storage.example.test/key/${objectId}?signature=secret`,
        },
      })
      expect(state.signed).toEqual([
        { bucket: 'bucket', expiresInSeconds: 300, filename, key: `key/${objectId}` },
      ])
    }
  })

  it('404 TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND para objeto de outra ocorrência, sem assinar nada', async () => {
    const state = withFiles()

    await expect(signUrl(state, { objectId: FOREIGN_OBJECT_ID })).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND',
      status: 404,
    })
    expect(state.signed).toEqual([])
  })

  it('404 TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND quando a retenção do objeto já venceu', async () => {
    const state = withFiles({
      photos: [
        {
          ...file(PHOTO_OBJECT_ID, '2026-10-15T09:01:00.000Z'),
          retentionUntil: '2026-10-14T00:00:00.000Z',
        },
      ],
    })

    await expect(signUrl(state)).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND',
    })
    expect(state.signed).toEqual([])
  })

  it('404 distintos para viagem finalizada e ocorrência desconhecida', async () => {
    await expect(
      signUrl(withFiles(), { id: '00000000-0000-4000-8000-0000000000ff' }),
    ).rejects.toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
    })
    await expect(signUrl({ ...withFiles(), tripId: null })).rejects.toMatchObject({
      code: 'DRIVER_TRIP_NOT_ACTIVE',
    })
  })

  it('400 para objectId que não é uuid e para kind inválido; exige trip.read', async () => {
    await expect(signUrl(withFiles(), { objectId: 'not-a-uuid' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(signUrl(withFiles(), { kind: 'trip' })).rejects.toMatchObject({ status: 400 })
    const route = routes(fresh()).find((item) => item.pathname === FILE_URL_PATH)
    expect(route?.policy).toEqual({ permission: 'trip.read', scope: 'company' })
  })
})
