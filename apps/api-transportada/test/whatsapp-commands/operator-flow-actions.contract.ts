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
import {
  TripDeliveryProofRejectedError,
  TripOccurrenceAttachmentLimitError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
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
  OPERATOR_OCCURRENCE_PHOTO_ANSWER,
} from '../../src/whatsapp-commands/domain/whatsapp-operator-flow.constant.js'
import {
  WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY,
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
    attachOccurrencePhoto: async () => ({ id: crypto.randomUUID(), position: 2 }),
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
    allowsMultipleItems: true,
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

  /**
   * B1 (revisão da spec 161): registrar a ocorrência A e, na mesma sessão, começar outra sem
   * recarregar o WhatsApp deixava `occurrenceId` da sessão apontando para A — `photoRouter` via o
   * contexto com id preenchido e nunca chamava `registerOccurrence` de novo, então a foto da
   * segunda ocorrência (B) era anexada à primeira (A) em silêncio. `occurrenceTypeRouter` começa
   * uma ocorrência nova a cada tipo escolhido, então ele é quem tem de zerar o id da sessão
   * anterior.
   */
  test('escolher o tipo de ocorrência de novo limpa o occurrenceId de um registro anterior na mesma sessão', async () => {
    const { channel } = buildChannel()
    const sessionContextBeforeThisTurn = {
      [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: 'occurrence-1',
    }

    const result = await callAction({
      channel,
      context: {
        ...sessionContextBeforeThisTurn,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeAnswer]: OCCURRENCE_TYPE_ID,
      },
      deps: buildDeps({ listOccurrenceTypes: async () => [buildOccurrenceType()] }),
      kind: OPERATOR_FLOW_ACTION_KIND.occurrenceTypeRouter,
    })

    /**
     * `FlowInterpreter.step` (meta-whatsapp-module) funde o patch por `{ ...contextoAnterior,
     * ...result.context }` — uma chave **ausente** do patch preserva o valor antigo da sessão;
     * só uma chave presente com `undefined` sobrescreve. `toEqual` não distingue as duas formas
     * (trata ausência e `undefined` como iguais), então a prova certa é `Object.hasOwn` no patch
     * em si, e a simulação do merge que o pacote faz de verdade.
     */
    if (result === undefined) throw new Error('occurrenceTypeRouter não devolveu resultado')
    expect(Object.hasOwn(result.context ?? {}, OPERATOR_FLOW_CONTEXT_KEY.occurrenceId)).toBe(true)

    const mergedSessionContext = { ...sessionContextBeforeThisTurn, ...result.context }
    expect(mergedSessionContext[OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]).toBeUndefined()
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

  /**
   * Spec 185 T4.1/T4.2 (CA01, ADR-0074 §1): carregar a última nota pode fechar a carga sozinha —
   * a confirmação da carga vem primeiro, e o desfecho do gatilho automático é uma mensagem à parte
   * (conversation-flow.md §5, uma ideia por mensagem).
   */
  test('carregar chama loadDocument e, sem autoDispatch, manda só a confirmação da carga', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'load',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([{ body: 'Carregamento registrado. ✅', kind: 'text' }])
  })

  test('carregar a última nota despacha: "Viagem despachada." chega numa segunda mensagem', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'load',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        loadDocument: async () => ({
          autoDispatch: { outcome: 'dispatched' },
          document: { id: DOCUMENT_ID } as never,
          tripStatus: 'dispatched',
        }),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([
      { body: 'Carregamento registrado. ✅', kind: 'text' },
      { body: 'Viagem despachada. 🚚', kind: 'text' },
    ])
  })

  test('carregar a última nota com gate recusado: a frase de bloqueio chega numa segunda mensagem', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'load',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        loadDocument: async () => ({
          autoDispatch: {
            code: 'TRIP_HAS_UNSCHEDULED_STOPS',
            details: { stopIds: ['stop-1'] },
            outcome: 'blocked',
          },
          document: { id: DOCUMENT_ID } as never,
          tripStatus: 'loading',
        }),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
    })

    expect(sent).toEqual([
      { body: 'Carregamento registrado. ✅', kind: 'text' },
      { body: 'A viagem não saiu: parada aguardando agendamento.', kind: 'text' },
    ])
  })

  test('"Todas as pendentes" para carregar e despachar: a segunda mensagem é "Viagem despachada."', async () => {
    const { channel, sent } = buildChannel()
    await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: 'load',
        [OPERATOR_FLOW_CONTEXT_KEY.documentAnswer]: 'all_pending',
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        batchTransition: async () => ({
          autoDispatch: { outcome: 'dispatched' },
          items: [{ documentId: DOCUMENT_ID, outcome: 'applied' }],
          tripStatus: 'dispatched',
        }),
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

    expect(sent).toEqual([
      { body: '1 de 1 notas atualizadas. ✅', kind: 'text' },
      { body: 'Viagem despachada. 🚚', kind: 'text' },
    ])
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

  test('observação válida oferece Concluir/Cancelar e segue para o passo de foto, sem gravar nada', async () => {
    const { channel, sent } = buildChannel()
    let registered = false
    const result = await callAction({
      channel,
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: 'skip',
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
      },
      deps: buildDeps({
        registerOccurrence: async () => (
          (registered = true),
          Promise.reject(new Error('não deveria gravar'))
        ),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoPrompt,
    })

    expect(registered).toBe(false)
    expect(sent[0]?.kind).toBe('list')
    expect(sent[0]?.body).toContain('Sem foto nada é registrado')
    expect(result).toEqual({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: '' },
      next: OPERATOR_FLOW_NODE.photoEntry,
    })
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
      kind: OPERATOR_FLOW_ACTION_KIND.photoPrompt,
    })

    expect(registered).toBe(false)
    expect(sent[0]?.body).toContain('Observação muito longa')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.notePrompt })
  })
})

/**
 * Spec 161 T15 (RF18/RF18b/RF18c/RF19/RF20, CA10/CA11/CA11d): o passo de foto do operador —
 * `photoRouter`. `handlePhotoUpload` (a foto de verdade) e as respostas texto (Concluir/Cancelar/
 * inválida) do mesmo nó.
 */
describe('FlowAction do passo de foto do operador (spec 161 T15)', () => {
  const PHOTO_CONTEXT = {
    [OPERATOR_FLOW_CONTEXT_KEY.documentId]: DOCUMENT_ID,
    [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: '',
    [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: OCCURRENCE_TYPE_ID,
    [OPERATOR_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
  } as const

  function withImage(mimeType = 'image/jpeg') {
    return { [WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY]: { mediaId: 'wamid.1', mimeType } }
  }

  async function buildChannelWithMedia(bytesLength: number, mimeType = 'image/jpeg') {
    const base = buildChannel()
    const channel: ChannelAdapterInterface = {
      ...base.channel,
      fetchMediaAsBase64: async () => ({
        data: Buffer.from(new Uint8Array(bytesLength)).toString('base64'),
        mimeType,
      }),
    }
    return { channel, sent: base.sent }
  }

  test('primeira foto (entre 512 KiB e 960 KiB) chega inteira a registerOccurrence — teto do WhatsApp, não o da web', async () => {
    /**
     * `deps.registerOccurrence` é a fronteira: a validação de bytes de verdade
     * (`assertOccurrenceUploadAccepted` com `maxOriginalBytes`) mora dentro da implementação real
     * (`persistSeparationOccurrenceWithAttachment`, T6/T15), fora do alcance de um FlowAction
     * testado com dublê — provada em `test/trip-occurrence/separation-upload.contract.ts` e na
     * fiação de `main.ts` (T13/T15). Aqui a prova é a que este nível pode dar: uma foto de 600 KiB
     * — que a web (teto de 512 KiB) recusaria — chega **inteira e sem alteração** ao dep, sinal de
     * que o router não trunca nem valida à revelia do teto parametrizado.
     */
    const { channel, sent } = await buildChannelWithMedia(600 * 1024)
    const calls: unknown[] = []
    const result = await callAction({
      channel,
      context: { ...PHOTO_CONTEXT, ...withImage() },
      deps: buildDeps({
        registerOccurrence: async (input) => {
          calls.push(input)
          return {
            createdAt: NOW.toISOString(),
            id: 'occurrence-1',
            note: '',
            occurrenceTypeId: OCCURRENCE_TYPE_ID,
            productCode: '',
            stage: 'separation',
            typeName: 'Avaria no barracão',
          }
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(calls).toHaveLength(1)
    expect((calls[0] as { attachment: { bytes: Uint8Array } }).attachment.bytes.byteLength).toBe(
      600 * 1024,
    )
    expect(sent[0]?.body).toContain('Foto 1 anexada')
    expect(result).toEqual({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: 'occurrence-1',
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 1,
        [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 0,
      },
      next: OPERATOR_FLOW_NODE.photoEntry,
    })
  })

  /**
   * Revisão da spec 185 (RF2, ADR-0074 §4): a ocorrência que deixa a última nota para trás pode
   * despachar a viagem — o desfecho do gatilho chega numa mensagem à parte, depois de "Foto 1
   * anexada" (conversation-flow.md §5, uma ideia por mensagem).
   */
  for (const [autoDispatch, expected] of [
    [{ outcome: 'dispatched' }, 'Viagem despachada. 🚚'],
    [
      { code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' },
      'A viagem não saiu sozinha — use Despachar.',
    ],
  ] as const) {
    test(`primeira foto com gatilho ${autoDispatch.outcome}: "${expected}" depois de "Foto 1 anexada"`, async () => {
      const { channel, sent } = await buildChannelWithMedia(1024)
      await callAction({
        channel,
        context: { ...PHOTO_CONTEXT, ...withImage() },
        deps: buildDeps({
          registerOccurrence: async () => ({
            autoDispatch,
            createdAt: NOW.toISOString(),
            id: 'occurrence-1',
            note: '',
            occurrenceTypeId: OCCURRENCE_TYPE_ID,
            productCode: '',
            stage: 'separation',
            typeName: 'Item faltante',
          }),
        }),
        kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
      })

      expect(sent.map((message) => message.body)).toEqual([
        'Foto 1 anexada. Envie outra, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
        expected,
      ])
    })
  }

  test('primeira foto sem gatilho: só "Foto 1 anexada"', async () => {
    const { channel, sent } = await buildChannelWithMedia(1024)
    await callAction({
      channel,
      context: { ...PHOTO_CONTEXT, ...withImage() },
      deps: buildDeps({
        registerOccurrence: async () => ({
          createdAt: NOW.toISOString(),
          id: 'occurrence-1',
          note: '',
          occurrenceTypeId: OCCURRENCE_TYPE_ID,
          productCode: '',
          stage: 'separation',
          typeName: 'Item faltante',
        }),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent).toHaveLength(1)
  })

  test('foto grande demais: a recusa da persistência vira mensagem com o motivo e o limite, nada muda no fluxo', async () => {
    const { channel, sent } = await buildChannelWithMedia(961 * 1024)
    const result = await callAction({
      channel,
      context: { ...PHOTO_CONTEXT, ...withImage() },
      deps: buildDeps({
        registerOccurrence: async () => {
          throw new TripDeliveryProofRejectedError('TOO_LARGE')
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent[0]?.body).toContain('maior que o tamanho aceito')
    expect(sent[0]?.body).toContain('960')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.photoEntry })
  })

  test('tipo de arquivo não suportado é recusado com o motivo', async () => {
    const { channel, sent } = await buildChannelWithMedia(10, 'application/pdf')
    const result = await callAction({
      channel,
      context: { ...PHOTO_CONTEXT, ...withImage('application/pdf') },
      deps: buildDeps({
        registerOccurrence: async () => {
          throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent[0]?.body).toContain('precisa ser uma imagem')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.photoEntry })
  })

  test('segunda foto em diante usa attachOccurrencePhoto, não registerOccurrence de novo', async () => {
    const { channel, sent } = await buildChannelWithMedia(10 * 1024)
    let registerCalls = 0
    const attachCalls: unknown[] = []
    const result = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: 'occurrence-1',
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 1,
        ...withImage(),
      },
      deps: buildDeps({
        attachOccurrencePhoto: async (input) => {
          attachCalls.push(input)
          return { id: 'attachment-2', position: 2 }
        },
        registerOccurrence: async () => {
          registerCalls += 1
          throw new Error('não deveria registrar de novo')
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(registerCalls).toBe(0)
    expect(attachCalls).toEqual([
      {
        actorUserId: USER_ID,
        attachment: { bytes: expect.any(Uint8Array), mimeType: 'image/jpeg' },
        companyId: COMPANY_ID,
        occurrenceId: 'occurrence-1',
      },
    ])
    expect(sent[0]?.body).toContain('Foto 2 anexada')
    expect(result).toEqual({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 2,
        [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 0,
      },
      next: OPERATOR_FLOW_NODE.photoEntry,
    })
  })

  test('sexta foto é recusada (TripOccurrenceAttachmentLimitError) e encerra o passo', async () => {
    const { channel, sent } = await buildChannelWithMedia(10 * 1024)
    const result = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: 'occurrence-1',
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 5,
        ...withImage(),
      },
      deps: buildDeps({
        attachOccurrencePhoto: async () => {
          throw new TripOccurrenceAttachmentLimitError()
        },
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent[0]?.body).toContain('Limite de 5 fotos')
    expect(result).toEqual({
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: undefined,
      },
      next: OPERATOR_FLOW_NODE.tripActionMenu,
    })
  })

  test('falha de download não grava ocorrência nenhuma', async () => {
    const base = buildChannel()
    const channel: ChannelAdapterInterface = {
      ...base.channel,
      fetchMediaAsBase64: async () => {
        throw new Error('graph api timeout')
      },
    }
    let registered = false
    const result = await callAction({
      channel,
      context: { ...PHOTO_CONTEXT, ...withImage() },
      deps: buildDeps({
        registerOccurrence: async () => ((registered = true), Promise.reject(new Error('x'))),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(registered).toBe(false)
    expect(base.sent[0]?.body).toContain('Não consegui baixar')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.photoEntry })
  })

  test('"Concluir" sem nenhuma foto ainda pede a foto de novo', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: OPERATOR_OCCURRENCE_PHOTO_ANSWER.done,
      },
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent[0]?.body).toContain('Envie ao menos uma')
    expect(result).toEqual({ next: OPERATOR_FLOW_NODE.photoEntry })
  })

  test('"Concluir" com fotos anexadas encerra o passo e limpa o contexto', async () => {
    const { channel, sent } = buildChannel()
    const result = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: 'occurrence-1',
        [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: OPERATOR_OCCURRENCE_PHOTO_ANSWER.done,
        [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 2,
      },
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(sent[0]?.body).toContain('registrada com 2 foto(s)')
    expect(result?.next).toBe(OPERATOR_FLOW_NODE.tripActionMenu)
  })

  test('"Cancelar" antes de qualquer foto não grava nada (D15)', async () => {
    const { channel, sent } = buildChannel()
    let registered = false
    const result = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: OPERATOR_OCCURRENCE_PHOTO_ANSWER.cancel,
      },
      deps: buildDeps({
        registerOccurrence: async () => ((registered = true), Promise.reject(new Error('x'))),
      }),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })

    expect(registered).toBe(false)
    expect(sent[0]?.body).toContain('Ocorrência cancelada')
    expect(result?.next).toBe(OPERATOR_FLOW_NODE.tripActionMenu)
  })

  test('texto fora das opções incrementa o contador; na segunda vez chama uma pessoa (D8)', async () => {
    const { channel, sent } = buildChannel()
    const first = await callAction({
      channel,
      context: {
        ...PHOTO_CONTEXT,
        [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: 'oi, tudo bem?',
      },
      deps: buildDeps(),
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
    })
    expect(first).toEqual({
      context: { [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 1 },
      next: OPERATOR_FLOW_NODE.photoEntry,
    })

    await expect(
      callAction({
        channel,
        context: {
          ...PHOTO_CONTEXT,
          [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: 'ainda não entendi',
          [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 1,
        },
        deps: buildDeps(),
        kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
      }),
    ).rejects.toBeInstanceOf(WhatsAppCommandHandoffRequestedError)

    expect(sent.filter((message) => message.kind === 'text').length).toBeGreaterThan(0)
  })
})
