/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T015 — o motorista entrega, devolve e registra ocorrência pela conversa (D7/AC7).
 * Contrato por `FlowAction`, com fakes: nenhum banco, nenhum HTTP. A prova ponta a ponta contra
 * Postgres e webhook real fica em `test/integration/whatsapp-driver-flow-actions.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowActionResult,
} from '@adatechnology/meta-whatsapp-contracts'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import type { FindCurrentDriverTripResult } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  TripDocumentNotReachableError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import {
  createDriverWhatsAppFlowActions,
  type DriverFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import { WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET } from '../../src/whatsapp-commands/application/whatsapp-list-answer.service.js'
import { createWithAuthorizedActor } from '../../src/whatsapp-commands/application/with-authorized-actor.service.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import {
  WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_LIST_ANSWER_FALLBACK,
} from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import {
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000141'
const USER_ID = '00000000-0000-4000-8000-000000000142'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000143'
const DRIVER_ID = '00000000-0000-4000-8000-000000000144'
const TRIP_ID = '00000000-0000-4000-8000-000000000145'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000146'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-000000000147'
const PHONE = '5516999995555'
const NOW = new Date('2026-09-11T12:00:00.000Z')

type SentMessage =
  | { readonly body: string; readonly kind: 'text' }
  | {
      readonly body: string
      readonly kind: 'list'
      readonly rows: readonly { id: string; title: string }[]
    }

function buildChannel(): {
  readonly channel: ChannelAdapterInterface
  readonly sent: SentMessage[]
} {
  const sent: SentMessage[] = []
  const channel: ChannelAdapterInterface = {
    fetchMediaAsBase64: async () => ({ data: '', mimeType: 'application/octet-stream' }),
    sendInteractiveList: async ({ body, rows }) => {
      sent.push({ body, kind: 'list', rows })
      return { externalMessageId: null }
    },
    sendMedia: async () => ({ externalMessageId: null }),
    sendTemplate: async () => ({ externalMessageId: null }),
    sendText: async (_to, body) => {
      sent.push({ body, kind: 'text' })
      return { externalMessageId: null }
    },
  }
  return { channel, sent }
}

function buildDeps(
  overrides: Partial<DriverFlowActionDependencies> = {},
): DriverFlowActionDependencies {
  return {
    // T020 (B5): o roteador de nota relê a viagem; o padrão é a viagem do teste, com a nota dentro.
    findCurrentTrip: async () => buildDriverTrip({}),
    listOccurrenceTypes: async () => [],
    registerOccurrence: async () => ({
      createdAt: NOW.toISOString(),
      id: crypto.randomUUID(),
      note: '',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      productCode: '',
      stage: 'delivery',
      typeName: 'Recusa total',
    }),
    reportDelivery: async () => ({ alreadySettled: false }),
    reportReturn: async () => ({ alreadySettled: false }),
    resolveDriverId: async () => DRIVER_ID,
    ...overrides,
  }
}

function buildSession(context: Record<string, unknown> = {}): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context,
    createdAt: NOW.toISOString(),
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-driver-1',
    lastActivity: NOW.toISOString(),
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: NOW.toISOString(),
    whatsappNumber: PHONE,
  }
}

function buildActor() {
  return {
    identity: {
      channel: 'whatsapp' as const,
      companyIdClaim: COMPANY_ID,
      externalIdentityId: 'external',
      issuer: 'https://keycloak.example/realms/transportada',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'subject',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company' as const,
      membershipId: MEMBERSHIP_ID,
      permissions: new Set<CompanyPermission>(['trip.read', 'trip.report']),
      roles: ['driver' as const],
      userId: USER_ID,
    },
  }
}

function buildDriverTrip(input: {
  readonly documents?: readonly { readonly id: string; readonly separationStatus: string }[]
}): FindCurrentDriverTripResult {
  const documents = (input.documents ?? [{ id: DOCUMENT_ID, separationStatus: 'loaded' }]).map(
    (document) => ({
      accessKey: `1${'1'.repeat(43)}`,
      deliveredAt: null,
      deliveryProof: { photo: false, signature: false },
      grossWeight: '0.0000',
      id: document.id,
      number: '1',
      recipientName: 'Cliente Um',
      returnReason: null,
      separationStatus: document.separationStatus,
      series: '1',
      totalAmount: '100.0000',
      volumeCount: '1',
    }),
  )
  return {
    isRegisteredDriver: true,
    trips: [
      {
        id: TRIP_ID,
        manifest: null,
        status: 'dispatched',
        stops: [
          {
            arrivedAt: null,
            completedAt: null,
            deliveryWindowEnd: null,
            deliveryWindowStart: null,
            documents,
            id: 'stop-1',
            label: 'Centro, 100',
            latitude: null,
            longitude: null,
            schedule: null,
            sequence: 1,
          },
        ],
        vehiclePlate: 'ABC1D23',
      },
    ],
  } as unknown as FindCurrentDriverTripResult
}

function buildOccurrenceType(overrides: Partial<OccurrenceTypeRecord> = {}): OccurrenceTypeRecord {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: OCCURRENCE_TYPE_ID,
    name: 'Recusa total',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

function findAction(actions: ReturnType<typeof createDriverWhatsAppFlowActions>, kind: string) {
  const found = actions.find((definition) => definition.kind === kind)
  if (found === undefined) throw new Error(`FlowAction ${kind} não registrada`)
  return found
}

async function callAction(input: {
  readonly channel?: ChannelAdapterInterface
  readonly context?: Record<string, unknown>
  readonly deps: DriverFlowActionDependencies
  readonly kind: string
}): Promise<FlowActionResult | void> {
  const actions = createDriverWhatsAppFlowActions(input.deps)
  const definition = findAction(actions, input.kind)
  const { channel } = input.channel === undefined ? buildChannel() : { channel: input.channel }
  return definition.handler({
    actor: buildActor(),
    channel,
    context: input.context ?? {},
    node: { actionKind: input.kind, id: 'node', type: 'action' },
    session: buildSession(input.context ?? {}),
  })
}

/**
 * T020 (B5): o `entrada_choice` aceitava texto livre como id. "entregue" digitado virava UUID
 * inválido no Postgres, e o limite de tentativas da D8 não valia para as listas dinâmicas.
 */
describe('resposta de lista conferida contra a lista relida (spec 144 T020, B5)', () => {
  const DELIVER_CONTEXT = {
    [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
    [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
  }

  function deliveryDeps(documents?: readonly { id: string; separationStatus: string }[]) {
    const delivered: unknown[] = []
    const deps = buildDeps({
      findCurrentTrip: async () => buildDriverTrip(documents === undefined ? {} : { documents }),
      reportDelivery: async (input) => {
        delivered.push(input)
        return { alreadySettled: false }
      },
    })
    return { delivered, deps }
  }

  const rejections: readonly (readonly [string, string])[] = [
    ['texto livre', 'entregue'],
    ['id de outra lista', OCCURRENCE_TYPE_ID],
  ]
  for (const [label, answer] of rejections) {
    test(`${label}: fallback, conta a tentativa e não grava nada`, async () => {
      const { channel, sent } = buildChannel()
      const { delivered, deps } = deliveryDeps()

      const result = await callAction({
        channel,
        context: { ...DELIVER_CONTEXT, [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: answer },
        deps,
        kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
      })

      expect(delivered).toEqual([])
      expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
      expect(result).toEqual({
        context: { [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1 },
        next: DRIVER_FLOW_NODE.documentEntry,
      })
    })
  }

  test('id de nota que saiu da viagem é recusado como fora da lista', async () => {
    const { channel, sent } = buildChannel()
    const { delivered, deps } = deliveryDeps([
      { id: '00000000-0000-4000-8000-000000000149', separationStatus: 'loaded' },
    ])

    await callAction({
      channel,
      context: { ...DELIVER_CONTEXT, [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID },
      deps,
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(delivered).toEqual([])
    expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
  })

  test('a segunda recusa seguida pede uma pessoa, pelo mesmo mecanismo do despachante', async () => {
    const { deps } = deliveryDeps()

    await expect(
      callAction({
        context: {
          ...DELIVER_CONTEXT,
          [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: 'entregue',
          [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1,
        },
        deps,
        kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
      }),
    ).rejects.toBeInstanceOf(WhatsAppCommandHandoffRequestedError)
  })

  test('tipo de ocorrência digitado não vira id', async () => {
    const { channel, sent } = buildChannel()

    const result = await callAction({
      channel,
      context: { [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeAnswer]: 'quebrou a caixa' },
      deps: buildDeps({ listOccurrenceTypes: async () => [buildOccurrenceType()] }),
      kind: DRIVER_FLOW_ACTION_KIND.occurrenceTypeRouter,
    })

    expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
    expect(result).toEqual({
      context: { [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1 },
      next: DRIVER_FLOW_NODE.occurrenceTypeEntry,
    })
  })

  test('mostrar a lista de novo zera a contagem', async () => {
    const { deps } = deliveryDeps()

    const result = await callAction({
      context: { ...DELIVER_CONTEXT, [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1 },
      deps,
      kind: DRIVER_FLOW_ACTION_KIND.listDocuments,
    })

    expect(result).toMatchObject({ next: DRIVER_FLOW_NODE.documentEntry })
    const context = result?.context ?? {}
    expect(WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY in context).toBe(true)
    expect(context[WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]).toBeUndefined()
  })
})

describe('FlowActions do motorista — Minha viagem (spec 144 T015)', () => {
  test('toda FlowAction passa pelo guarda de permissão, mesmo chamada direto', async () => {
    const withAuthorizedActor = createWithAuthorizedActor({
      authorization: new AuthorizationService(),
      clock: () => NOW,
      logger: { error() {}, info() {}, warn() {} },
      resolveActor: async () => ({ reason: 'no_membership', status: 'denied' }),
    })
    const [definition] = createDriverWhatsAppFlowActions(buildDeps())
    if (definition === undefined) throw new Error('nenhuma FlowAction registrada')
    const guarded = withAuthorizedActor(definition.policy, definition.handler)

    await expect(
      guarded({
        channel: buildChannel().channel,
        context: {},
        node: { actionKind: definition.kind, id: 'node', type: 'action' },
        session: buildSession(),
      }),
    ).rejects.toBeInstanceOf(WhatsAppCommandDeniedError)
  })

  test('sem viagem em andamento, avisa e volta ao menu', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({ findCurrentTrip: async () => ({ isRegisteredDriver: true, trips: [] }) }),
      kind: DRIVER_FLOW_ACTION_KIND.currentTrip,
    })

    expect(sent).toEqual([{ body: 'Você não tem viagem em andamento.', kind: 'text' }])
    expect(result).toEqual({ next: 'menu' })
  })

  test('conta sem cadastro de motorista recebe aviso diferente de "sem viagem"', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      deps: buildDeps({ findCurrentTrip: async () => ({ isRegisteredDriver: false, trips: [] }) }),
      kind: DRIVER_FLOW_ACTION_KIND.currentTrip,
    })

    expect(sent[0]?.body).toContain('não está ligada a um cadastro de motorista')
  })

  test('com viagem, guarda o tripId opaco no contexto e segue para o menu da viagem', async () => {
    const result = await callAction({
      deps: buildDeps({ findCurrentTrip: async () => buildDriverTrip({}) }),
      kind: DRIVER_FLOW_ACTION_KIND.currentTrip,
    })

    expect(result).toEqual({
      context: { [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID },
      next: DRIVER_FLOW_NODE.tripMenu,
    })
  })

  test('lista as notas pendentes com "número · destinatário" e nunca guarda o nome no contexto', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({ findCurrentTrip: async () => buildDriverTrip({}) }),
      kind: DRIVER_FLOW_ACTION_KIND.listDocuments,
    })

    const [message] = sent
    expect(message?.kind).toBe('list')
    if (message?.kind !== 'list') throw new Error('esperava lista')
    expect(message.rows).toEqual([{ id: DOCUMENT_ID, title: '1 · Cliente Um' }])
    expect(result).toEqual({
      context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
      next: DRIVER_FLOW_NODE.documentEntry,
    })
    expect(JSON.stringify(result)).not.toContain('Cliente Um')
  })

  test('catálogo de notas vazio avisa e volta ao menu da viagem', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({
        findCurrentTrip: async () => buildDriverTrip({ documents: [] }),
      }),
      kind: DRIVER_FLOW_ACTION_KIND.listDocuments,
    })

    expect(sent).toEqual([{ body: 'Não há notas pendentes nesta viagem.', kind: 'text' }])
    expect(result).toEqual({
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    })
  })

  test('resposta de página (__more__) reencaminha para a mesma lista, sem tocar no domínio', async () => {
    const result = await callAction({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: '__more__:2',
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps(),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(result).toEqual({
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: 2 },
      next: DRIVER_FLOW_NODE.listDocuments,
    })
  })

  test('entregar chama a mesma função composta da rota do PWA e confirma', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    const result = await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({
        reportDelivery: async (input) => {
          calls.push(input)
          return { alreadySettled: false }
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(calls).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        driverId: DRIVER_ID,
        idempotencyKey: expect.any(String),
        location: null,
      },
    ])
    expect(sent).toEqual([{ body: 'Entrega registrada. ✅', kind: 'text' }])
    expect(result).toEqual({
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    })
  })

  test('repetir a mesma entrega é idempotente: "Já estava registrada."', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({ reportDelivery: async () => ({ alreadySettled: true }) }),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([{ body: 'Já estava registrada.', kind: 'text' }])
  })

  test('portão recusado (409) vira mensagem clara, nunca erro cru', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({
        reportDelivery: async () => {
          throw new TripStateTransitionNotAllowedError('TRIP_NOT_DISPATCHED')
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([
      {
        body: 'A viagem ainda não foi despachada — entregar e devolver só depois da saída.',
        kind: 'text',
      },
    ])
  })

  test('nota inalcançável vira mensagem clara, nunca erro cru', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      deps: buildDeps({
        reportDelivery: async () => {
          throw new TripDocumentNotReachableError()
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([
      { body: 'Essa nota não está mais disponível na sua viagem.', kind: 'text' },
    ])
  })

  test('devolver pede o motivo antes de gravar', async () => {
    const result = await callAction({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'return',
      },
      deps: buildDeps(),
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
    })

    expect(result).toEqual({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
      },
      next: DRIVER_FLOW_NODE.returnReasonMenu,
    })
  })

  test('devolver com motivo escolhido chama reportReturn com o mesmo formato do PWA', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.returnReason]: 'recipient_absent',
      },
      deps: buildDeps({
        reportReturn: async (input) => {
          calls.push(input)
          return { alreadySettled: false }
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.completeReturn,
    })

    expect(calls).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        driverId: DRIVER_ID,
        idempotencyKey: expect.any(String),
        location: null,
        reason: 'recipient_absent',
      },
    ])
    expect(sent).toEqual([{ body: 'Devolução registrada. ↩️', kind: 'text' }])
  })

  test('catálogo de ocorrência vazio avisa e volta ao menu, sem tipos de outro estágio', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({
        listOccurrenceTypes: async () => [
          buildOccurrenceType({ stage: 'separation' }),
          buildOccurrenceType({ active: false }),
        ],
      }),
      kind: DRIVER_FLOW_ACTION_KIND.listOccurrenceTypes,
    })

    expect(sent[0]?.body).toContain('Ainda não há tipos de ocorrência')
    expect(result).toEqual({
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    })
  })

  test('catálogo com tipo de entrega ativo vira lista dinâmica', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({ listOccurrenceTypes: async () => [buildOccurrenceType()] }),
      kind: DRIVER_FLOW_ACTION_KIND.listOccurrenceTypes,
    })

    expect(sent[0]?.kind).toBe('list')
    expect(result).toEqual({
      context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
      next: DRIVER_FLOW_NODE.occurrenceTypeEntry,
    })
  })

  test('escolhido o tipo, segue para o prompt da observação com botão Pular', async () => {
    const { channel, sent } = buildChannel()
    const routed = await callAction({
      context: { [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeAnswer]: OCCURRENCE_TYPE_ID },
      deps: buildDeps({ listOccurrenceTypes: async () => [buildOccurrenceType()] }),
      kind: DRIVER_FLOW_ACTION_KIND.occurrenceTypeRouter,
    })
    expect(routed).toEqual({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
      },
      next: DRIVER_FLOW_NODE.notePrompt,
    })

    const prompted = await callAction({
      channel,
      deps: buildDeps(),
      kind: DRIVER_FLOW_ACTION_KIND.notePrompt,
    })
    expect(sent[0]?.kind).toBe('list')
    expect(prompted).toEqual({ next: DRIVER_FLOW_NODE.noteEntry })
  })

  test('observação "Pular" registra ocorrência com nota vazia', async () => {
    const calls: unknown[] = []
    await callAction({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.noteAnswer]: 'skip',
        [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
      },
      deps: buildDeps({
        registerOccurrence: async (input) => {
          calls.push(input)
          return {
            createdAt: NOW.toISOString(),
            id: crypto.randomUUID(),
            note: '',
            occurrenceTypeId: OCCURRENCE_TYPE_ID,
            productCode: '',
            stage: 'delivery',
            typeName: 'Recusa total',
          }
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.completeOccurrence,
    })

    expect(calls).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        driverId: DRIVER_ID,
        note: '',
        occurrenceTypeId: OCCURRENCE_TYPE_ID,
        productCode: '',
      },
    ])
  })

  test('observação em texto livre acima do limite pede de novo, sem gravar', async () => {
    const { channel, sent } = buildChannel()
    let registered = false
    const result = await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.noteAnswer]: 'x'.repeat(501),
        [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
      },
      deps: buildDeps({
        registerOccurrence: async () => {
          registered = true
          throw new Error('não deveria gravar')
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.completeOccurrence,
    })

    expect(registered).toBe(false)
    expect(sent[0]?.body).toContain('Observação muito longa')
    expect(result).toEqual({ next: DRIVER_FLOW_NODE.notePrompt })
  })

  test('observação em texto livre dentro do limite registra a ocorrência', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    await callAction({
      channel,
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [DRIVER_FLOW_CONTEXT_KEY.noteAnswer]: '  Cliente recusou por avaria  ',
        [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
      },
      deps: buildDeps({
        registerOccurrence: async (input) => {
          calls.push(input)
          return {
            createdAt: NOW.toISOString(),
            id: crypto.randomUUID(),
            note: input.note,
            occurrenceTypeId: OCCURRENCE_TYPE_ID,
            productCode: '',
            stage: 'delivery',
            typeName: 'Recusa total',
          }
        },
      }),
      kind: DRIVER_FLOW_ACTION_KIND.completeOccurrence,
    })

    expect((calls[0] as { note: string }).note).toBe('Cliente recusou por avaria')
    expect(sent).toEqual([{ body: 'Ocorrência registrada. ⚠️', kind: 'text' }])
  })
})
