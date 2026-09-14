/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016 — o operador separa, carrega e despacha viagens do armazém pela conversa (D7/D8).
 * Contrato por `FlowAction`, com fakes: nenhum banco, nenhum HTTP. A prova ponta a ponta contra
 * Postgres e webhook real fica em `test/integration/whatsapp-operator-flow-actions.integration.ts`.
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
import type { WarehouseTrip } from '../../src/trips/application/list-warehouse-trips.use-case.js'
import { resolveOperatorTripActions } from '../../src/trips/domain/operator-trip-actions.policy.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import {
  createOperatorWhatsAppFlowActions,
  type OperatorFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-operator-trip-flow-actions.js'
import { WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET } from '../../src/whatsapp-commands/application/whatsapp-list-answer.service.js'
import { createWithAuthorizedActor } from '../../src/whatsapp-commands/application/with-authorized-actor.service.js'
import {
  OPERATOR_DISPATCH_CONFIRM_ANSWER,
  OPERATOR_FLOW_ACTION_KIND,
  OPERATOR_FLOW_CONTEXT_KEY,
  OPERATOR_FLOW_NODE,
} from '../../src/whatsapp-commands/domain/whatsapp-operator-flow.constant.js'
import {
  WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_LIST_ANSWER_FALLBACK,
} from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import {
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000161'
const USER_ID = '00000000-0000-4000-8000-000000000162'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000163'
const TRIP_ID = '00000000-0000-4000-8000-000000000164'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000165'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-000000000166'
const PHONE = '5516999996666'
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

function buildTrip(overrides: Partial<WarehouseTrip> = {}): WarehouseTrip {
  return {
    documents: [
      { id: DOCUMENT_ID, number: '1', recipientName: 'Cliente Um', separationStatus: 'pending' },
    ],
    hasRoute: true,
    id: TRIP_ID,
    status: 'route_planned',
    vehiclePlate: 'ABC1D23',
    ...overrides,
  }
}

function buildDeps(
  overrides: Partial<OperatorFlowActionDependencies> = {},
): OperatorFlowActionDependencies {
  return {
    batchTransition: async () => ({
      items: [{ documentId: DOCUMENT_ID, outcome: 'applied' }],
      tripStatus: 'separating',
    }),
    dispatchTrip: async () => ({ tripStatus: 'dispatched' }),
    listOccurrenceTypes: async () => [],
    listWarehouseTrips: async () => [buildTrip()],
    loadDocument: async () => ({
      document: { id: DOCUMENT_ID } as never,
      tripStatus: 'loading',
    }),
    registerOccurrence: async () => ({
      createdAt: NOW.toISOString(),
      id: crypto.randomUUID(),
      note: '',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      productCode: '',
      stage: 'separation',
      typeName: 'Avaria no barracão',
    }),
    separateDocument: async () => ({
      document: { id: DOCUMENT_ID } as never,
      tripStatus: 'separating',
    }),
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
    id: 'session-operator-1',
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
      permissions: new Set<CompanyPermission>(['fleet.read', 'trip.manage']),
      roles: ['separator' as const],
      userId: USER_ID,
    },
  }
}

function buildOccurrenceType(overrides: Partial<OccurrenceTypeRecord> = {}): OccurrenceTypeRecord {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: OCCURRENCE_TYPE_ID,
    name: 'Avaria no barracão',
    notifies: false,
    stage: 'separation',
    ...overrides,
  }
}

function findAction(actions: ReturnType<typeof createOperatorWhatsAppFlowActions>, kind: string) {
  const found = actions.find((definition) => definition.kind === kind)
  if (found === undefined) throw new Error(`FlowAction ${kind} não registrada`)
  return found
}

async function callAction(input: {
  readonly channel?: ChannelAdapterInterface
  readonly context?: Record<string, unknown>
  readonly deps: OperatorFlowActionDependencies
  readonly kind: string
}): Promise<FlowActionResult | void> {
  const actions = createOperatorWhatsAppFlowActions(input.deps)
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
 * T020 (B5): o `entrada_choice` aceitava texto livre como id de nota ou de tipo de ocorrência. A
 * lista relida é a das notas **da viagem**, não só as da ação: a nota já separada que o operador toca
 * de novo com a rede ruim continua convergindo em "Já estava registrada".
 */
describe('resposta de lista conferida contra a lista relida (spec 144 T020, B5)', () => {
  const SEPARATE_CONTEXT = {
    [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'separate',
    [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
  }

  function separationDeps(trip: WarehouseTrip = buildTrip()) {
    const separated: unknown[] = []
    const deps = buildDeps({
      listWarehouseTrips: async () => [trip],
      separateDocument: async (input) => {
        separated.push(input)
        return { document: { id: DOCUMENT_ID } as never, tripStatus: 'separating' }
      },
    })
    return { deps, separated }
  }

  const rejections: readonly (readonly [string, string])[] = [
    ['texto livre', 'separei tudo'],
    ['id de outra lista', OCCURRENCE_TYPE_ID],
  ]
  for (const [label, answer] of rejections) {
    test(`${label}: fallback, conta a tentativa e não grava nada`, async () => {
      const { channel, sent } = buildChannel()
      const { deps, separated } = separationDeps()

      const result = await callAction({
        channel,
        context: { ...SEPARATE_CONTEXT, [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: answer },
        deps,
        kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
      })

      expect(separated).toEqual([])
      expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
      expect(result).toEqual({
        context: { [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1 },
        next: OPERATOR_FLOW_NODE.documentEntry,
      })
    })
  }

  test('id de nota que saiu da viagem é recusado como fora da lista', async () => {
    const { channel, sent } = buildChannel()
    const { deps, separated } = separationDeps(
      buildTrip({
        documents: [
          {
            id: '00000000-0000-4000-8000-000000000169',
            number: '2',
            recipientName: 'Outro',
            separationStatus: 'pending',
          },
        ],
      }),
    )

    await callAction({
      channel,
      context: { ...SEPARATE_CONTEXT, [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID },
      deps,
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(separated).toEqual([])
    expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
  })

  test('a segunda recusa seguida pede uma pessoa, pelo mesmo mecanismo do despachante', async () => {
    const { deps } = separationDeps()

    await expect(
      callAction({
        context: {
          ...SEPARATE_CONTEXT,
          [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: 'separei tudo',
          [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1,
        },
        deps,
        kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
      }),
    ).rejects.toBeInstanceOf(WhatsAppCommandHandoffRequestedError)
  })

  test('tipo de ocorrência digitado não vira id', async () => {
    const { channel, sent } = buildChannel()

    const result = await callAction({
      channel,
      context: { [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeAnswer]: 'caixa amassada' },
      deps: buildDeps({ listOccurrenceTypes: async () => [buildOccurrenceType()] }),
      kind: OPERATOR_FLOW_ACTION_KIND.occurrenceTypeRouter,
    })

    expect(sent).toEqual([{ body: WHATSAPP_LIST_ANSWER_FALLBACK, kind: 'text' }])
    expect(result).toEqual({
      context: { [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: 1 },
      next: OPERATOR_FLOW_NODE.occurrenceTypeEntry,
    })
  })
})

describe('resolveOperatorTripActions — tabela estado → ações (espelha state-gates.contract.ts)', () => {
  test('barracão sem pendência oferece separar, carregar, ocorrência e despachar', () => {
    expect(
      resolveOperatorTripActions({
        hasPendingDocuments: false,
        hasRoute: true,
        tripStatus: 'route_planned',
      }),
    ).toEqual(['separate', 'load', 'occurrence', 'dispatch'])
  })

  test('barracão com nota pendente não oferece despachar', () => {
    expect(
      resolveOperatorTripActions({
        hasPendingDocuments: true,
        hasRoute: true,
        tripStatus: 'separating',
      }),
    ).toEqual(['separate', 'load', 'occurrence'])
  })

  test.each([
    'draft',
    'dispatched',
    'in_transit',
    'on_delivery_route',
    'completed',
    'cancelled',
  ] as const)('estado "%s" não oferece nenhuma ação de barracão', (tripStatus) => {
    const actions = resolveOperatorTripActions({
      hasPendingDocuments: false,
      hasRoute: true,
      tripStatus,
    })
    expect(actions).not.toContain('separate')
    expect(actions).not.toContain('load')
    expect(actions).not.toContain('occurrence')
  })

  test('sem roteiro planejado, despachar não é oferecido mesmo sem pendência', () => {
    expect(
      resolveOperatorTripActions({
        hasPendingDocuments: false,
        hasRoute: false,
        tripStatus: 'draft',
      }),
    ).not.toContain('dispatch')
  })
})

describe('FlowActions do operador — Viagens do armazém (spec 144 T016)', () => {
  test('toda FlowAction passa pelo guarda de permissão, mesmo chamada direto', async () => {
    const withAuthorizedActor = createWithAuthorizedActor({
      authorization: new AuthorizationService(),
      clock: () => NOW,
      logger: { error() {}, info() {}, warn() {} },
      resolveActor: async () => ({ reason: 'no_membership', status: 'denied' }),
    })
    const [definition] = createOperatorWhatsAppFlowActions(buildDeps())
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

  test('recusa sem trip.manage: a ação de mutação exige a permissão, não só fleet.read', () => {
    const actions = createOperatorWhatsAppFlowActions(buildDeps())
    const menu = findAction(actions, OPERATOR_FLOW_ACTION_KIND.tripActionMenu)
    expect(menu.policy).toEqual({ permission: 'trip.manage', scope: 'company' })
    const list = findAction(actions, OPERATOR_FLOW_ACTION_KIND.listTrips)
    expect(list.policy).toEqual({ permission: 'fleet.read', scope: 'company' })
  })

  test('sem viagens no armazém, avisa e volta ao menu', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({ listWarehouseTrips: async () => [] }),
      kind: OPERATOR_FLOW_ACTION_KIND.listTrips,
    })

    expect(sent).toEqual([{ body: 'Não há viagens no armazém agora.', kind: 'text' }])
    expect(result).toEqual({ next: 'menu' })
  })

  test('lista as viagens como "placa · N notas", nunca guardando dado no contexto', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.listTrips,
    })

    const [message] = sent
    expect(message?.kind).toBe('list')
    if (message?.kind !== 'list') throw new Error('esperava lista')
    expect(message.rows).toEqual([{ id: TRIP_ID, title: 'ABC1D23 · 1 notas' }])
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.tripEntry })
  })

  test('escolhida a viagem, guarda o tripId opaco e segue para o menu de ações', async () => {
    const result = await callAction({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.tripAnswer]: TRIP_ID },
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.tripRouter,
    })

    expect(result).toEqual({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      next: OPERATOR_FLOW_NODE.tripActionMenu,
    })
  })

  test('o menu de ações oferece exatamente o que o portão aceita — sem pendência, oferece despachar', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID },
      deps: buildDeps({
        listWarehouseTrips: async () => [
          buildTrip({
            documents: [
              { id: DOCUMENT_ID, number: '1', recipientName: 'X', separationStatus: 'loaded' },
            ],
          }),
        ],
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.tripActionMenu,
    })

    const [message] = sent
    if (message?.kind !== 'list') throw new Error('esperava lista')
    expect(message.rows.map((row) => row.id)).toEqual([
      'separate',
      'load',
      'occurrence',
      'dispatch',
    ])
    expect(result).toEqual({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: OPERATOR_FLOW_NODE.actionEntry,
    })
  })

  test('com nota pendente, o menu de ações não oferece despachar', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID },
      deps: buildDeps({ listWarehouseTrips: async () => [buildTrip()] }),
      kind: OPERATOR_FLOW_ACTION_KIND.tripActionMenu,
    })

    const [message] = sent
    if (message?.kind !== 'list') throw new Error('esperava lista')
    expect(message.rows.map((row) => row.id)).not.toContain('dispatch')
  })

  test('despachar com pendências não é oferecido: escolher a opção antiga vira aviso, nunca confirmação', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionAnswer]: 'dispatch',
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({ listWarehouseTrips: async () => [buildTrip()] }),
      kind: OPERATOR_FLOW_ACTION_KIND.actionRouter,
    })

    expect(sent).toEqual([{ body: 'Há 1 notas pendentes — despache pelo painel.', kind: 'text' }])
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.tripActionMenu })
  })

  test('despachar sem pendência pede confirmação antes de tocar no domínio', async () => {
    const result = await callAction({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionAnswer]: 'dispatch',
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        listWarehouseTrips: async () => [
          buildTrip({
            documents: [
              { id: DOCUMENT_ID, number: '1', recipientName: 'X', separationStatus: 'loaded' },
            ],
          }),
        ],
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.actionRouter,
    })

    expect(result).toEqual({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'dispatch' },
      next: OPERATOR_FLOW_NODE.dispatchConfirmMenu,
    })
  })

  test('"🔙 Voltar" na confirmação não chama dispatchTrip', async () => {
    let called = false
    await callAction({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.dispatchConfirmAnswer]: OPERATOR_DISPATCH_CONFIRM_ANSWER.cancel,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        dispatchTrip: async () => {
          called = true
          return { tripStatus: 'dispatched' }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.dispatchConfirmRouter,
    })

    expect(called).toBe(false)
  })

  test('"✅ Confirmar" chama a mesma função composta da rota do painel', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.dispatchConfirmAnswer]: OPERATOR_DISPATCH_CONFIRM_ANSWER.confirm,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        dispatchTrip: async (input) => {
          calls.push(input)
          return { tripStatus: 'dispatched' }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.dispatchConfirmRouter,
    })

    expect(calls).toEqual([{ context: buildActor().scope, tripId: TRIP_ID }])
    expect(sent).toEqual([{ body: 'Viagem despachada. 🚚', kind: 'text' }])
  })

  test('separar chama a mesma função composta da rota do painel e confirma', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'separate',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        separateDocument: async (input) => {
          calls.push(input)
          return { document: { id: DOCUMENT_ID } as never, tripStatus: 'separating' }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(calls).toEqual([
      { context: buildActor().scope, documentId: DOCUMENT_ID, tripId: TRIP_ID },
    ])
    expect(sent).toEqual([{ body: 'Separação registrado. ✅', kind: 'text' }])
  })

  test('repetir a mesma separação é idempotente: "Já estava registrada."', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'separate',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        listWarehouseTrips: async () => [
          buildTrip({
            documents: [
              { id: DOCUMENT_ID, number: '1', recipientName: 'X', separationStatus: 'separated' },
            ],
          }),
        ],
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([{ body: 'Já estava registrada.', kind: 'text' }])
  })

  test('portão recusado (409) vira mensagem clara, nunca erro cru', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'load',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        loadDocument: async () => {
          throw new TripStateTransitionNotAllowedError('TRIP_DOCUMENT_NOT_SEPARATED')
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([{ body: 'Esta nota ainda não foi separada.', kind: 'text' }])
  })

  test('"Todas as pendentes" chama o lote com os candidatos da ação', async () => {
    const { channel, sent } = buildChannel()
    const calls: unknown[] = []
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'separate',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: 'all_pending',
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        batchTransition: async (input) => {
          calls.push(input)
          return {
            items: [{ documentId: DOCUMENT_ID, outcome: 'applied' }],
            tripStatus: 'separating',
          }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(calls).toEqual([
      {
        action: 'separate',
        context: buildActor().scope,
        documentIds: [DOCUMENT_ID],
        tripId: TRIP_ID,
      },
    ])
    expect(sent).toEqual([{ body: '1 de 1 notas atualizadas. ✅', kind: 'text' }])
  })

  test('escolher "ocorrência" para uma nota segue para o catálogo de tipos de estágio "separation"', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({
        listOccurrenceTypes: async () => [
          buildOccurrenceType(),
          buildOccurrenceType({ stage: 'delivery' }),
        ],
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.listOccurrenceTypes,
    })

    expect(sent[0]?.kind).toBe('list')
    expect(result).toEqual({
      context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
      next: OPERATOR_FLOW_NODE.occurrenceTypeEntry,
    })
  })

  test('catálogo de ocorrência vazio avisa e volta ao menu de ações', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      deps: buildDeps({ listOccurrenceTypes: async () => [] }),
      kind: OPERATOR_FLOW_ACTION_KIND.listOccurrenceTypes,
    })

    expect(sent[0]?.body).toContain('Ainda não há tipos de ocorrência')
    expect(result).toEqual({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: OPERATOR_FLOW_NODE.tripActionMenu,
    })
  })

  test('ocorrência registrada grava actor_user_id do contexto, sem driverId', async () => {
    const calls: unknown[] = []
    await callAction({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: 'skip',
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
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
            stage: 'separation',
            typeName: 'Avaria no barracão',
          }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.completeOccurrence,
    })

    expect(calls).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        note: '',
        occurrenceTypeId: OCCURRENCE_TYPE_ID,
        tripId: TRIP_ID,
      },
    ])
  })

  test('observação em texto livre acima do limite pede de novo, sem gravar', async () => {
    const { channel, sent } = buildChannel()
    let registered = false
    const result = await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: 'x'.repeat(501),
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        registerOccurrence: async () => {
          registered = true
          throw new Error('não deveria gravar')
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.completeOccurrence,
    })

    expect(registered).toBe(false)
    expect(sent[0]?.body).toContain('Observação muito longa')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.notePrompt })
  })
})
