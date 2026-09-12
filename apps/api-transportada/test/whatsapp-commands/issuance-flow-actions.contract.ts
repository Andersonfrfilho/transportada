/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — as FlowActions do ramo "Emitir documentos", com fakes. A prova ponta a ponta
 * contra Postgres e webhook real fica em `test/integration/whatsapp-issuance-preview.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowActionResult,
} from '@adatechnology/meta-whatsapp-contracts'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { PreviewDocumentSelectionInput } from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import {
  createIssuanceWhatsAppFlowActions,
  type IssuanceFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-issuance-flow-actions.js'
import { createWithAuthorizedActor } from '../../src/whatsapp-commands/application/with-authorized-actor.service.js'
import { buildEmitterKey } from '../../src/whatsapp-commands/domain/document-selection.policy.js'
import { WhatsAppCommandDeniedError } from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'
import {
  ISSUANCE_CONFIRM_ANSWER_PREFIX,
  ISSUANCE_FLOW_ACTION_KIND,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_FLOW_NODE,
} from '../../src/whatsapp-commands/domain/whatsapp-issuance-flow.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001501'
const USER_ID = '00000000-0000-4000-8000-000000001502'
const REQUEST_ID = '00000000-0000-4000-8000-000000001503'
const TRIP_ID = '00000000-0000-4000-8000-000000001504'
const EMITTER_TAX_ID = '11111111000191'
const OTHER_EMITTER_TAX_ID = '12345678901'
const PHONE = '5516999995555'
const NOW = new Date('2026-09-11T12:00:00.000Z')

type Sent =
  | { readonly body: string; readonly kind: 'text' }
  | {
      readonly body: string
      readonly kind: 'list'
      readonly rows: readonly { id: string; title: string }[]
    }

function buildChannel(): { readonly channel: ChannelAdapterInterface; readonly sent: Sent[] } {
  const sent: Sent[] = []
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

type Harness = {
  readonly deps: IssuanceFlowActionDependencies
  readonly previews: PreviewDocumentSelectionInput[]
}

function buildHarness(overrides: Partial<IssuanceFlowActionDependencies> = {}): Harness {
  const previews: PreviewDocumentSelectionInput[] = []
  const deps: IssuanceFlowActionDependencies = {
    clock: () => NOW,
    listIssueDateEmitters: async () => [{ name: 'Emitente Um', taxId: EMITTER_TAX_ID }],
    listPendingEmitters: async () => [
      { name: 'Emitente Um', taxId: EMITTER_TAX_ID },
      { name: 'Produtor Rural', taxId: OTHER_EMITTER_TAX_ID },
    ],
    listPendingSeries: async () => ['1'],
    listRecentTrips: async () => [
      { createdAt: NOW, documentCount: 3, id: TRIP_ID, vehiclePlate: 'ABC1D23' },
    ],
    previewSelection: async (input) => {
      previews.push(input)
      return { kind: 'needs_due_date' }
    },
    ...overrides,
  }
  return { deps, previews }
}

function buildSession(context: Record<string, unknown>): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context,
    createdAt: NOW.toISOString(),
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-issuance-1',
    lastActivity: NOW.toISOString(),
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: NOW.toISOString(),
    whatsappNumber: PHONE,
  }
}

function buildActor(permissions: readonly CompanyPermission[] = ['cte.submit', 'nfse.issue']) {
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
      membershipId: '00000000-0000-4000-8000-000000001505',
      permissions: new Set<CompanyPermission>(permissions),
      roles: ['operator' as const],
      userId: USER_ID,
    },
  }
}

async function call(input: {
  readonly context?: Record<string, unknown>
  readonly harness?: Harness
  readonly kind: string
}): Promise<{ readonly result: FlowActionResult | void; readonly sent: Sent[] }> {
  const harness = input.harness ?? buildHarness()
  const definition = createIssuanceWhatsAppFlowActions(harness.deps).find(
    (candidate) => candidate.kind === input.kind,
  )
  if (definition === undefined) throw new Error(`FlowAction ${input.kind} não registrada`)
  const { channel, sent } = buildChannel()
  const context = input.context ?? {}
  const result = await definition.handler({
    actor: buildActor(),
    channel,
    context,
    node: { actionKind: input.kind, id: 'node', type: 'action' },
    session: buildSession(context),
  })
  return { result, sent }
}

const RANGE_WITH_EMITTER = {
  [KEY.criterion]: 'number_range',
  [KEY.emitterKey]: buildEmitterKey(EMITTER_TAX_ID),
}

describe('guarda do ramo "Emitir documentos" — cte.submit OU nfse.issue', () => {
  function guard(permissions: readonly CompanyPermission[]) {
    const withAuthorizedActor = createWithAuthorizedActor({
      authorization: new AuthorizationService(),
      clock: () => NOW,
      resolveActor: async () => ({ context: buildActor(permissions), status: 'authorized' }),
    })
    return createIssuanceWhatsAppFlowActions(buildHarness().deps).map((definition) =>
      withAuthorizedActor(definition.policy, definition.handler),
    )
  }

  async function run(handler: ReturnType<typeof guard>[number]) {
    return handler({
      channel: buildChannel().channel,
      context: {},
      node: { actionKind: ISSUANCE_FLOW_ACTION_KIND.start, id: 'node', type: 'action' },
      session: buildSession({}),
    })
  }

  test.each([[['cte.submit']], [['nfse.issue']]] as const)(
    'qualquer uma das duas abre o ramo (%j)',
    async (permissions) => {
      for (const handler of guard(permissions)) await expect(run(handler)).resolves.toBeDefined()
    },
  )

  test('sem nenhuma das duas, toda FlowAction recusa mesmo chamada direto', async () => {
    for (const handler of guard(['trip.manage', 'fleet.read'])) {
      await expect(run(handler)).rejects.toBeInstanceOf(WhatsAppCommandDeniedError)
    }
  })
})

describe('FlowActions da emissão por seleção (spec 144 T012)', () => {
  test('começar limpa a seleção anterior e vai para o menu de critério', async () => {
    const { result } = await call({
      context: { ...RANGE_WITH_EMITTER, [KEY.requestId]: REQUEST_ID },
      kind: ISSUANCE_FLOW_ACTION_KIND.start,
    })
    expect(result).toMatchObject({ next: ISSUANCE_FLOW_NODE.criterionMenu })
    const context = (result as FlowActionResult).context ?? {}
    for (const key of Object.values(KEY)) expect(context[key]).toBeUndefined()
    expect(Object.keys(context)).toContain(KEY.emitterKey)
  })

  test('faixa: a lista de emitentes leva só a chave opaca — nenhum CNPJ/CPF sai do servidor', async () => {
    const { result, sent } = await call({
      context: { [KEY.criterion]: 'number_range' },
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(result).toMatchObject({
      context: { [KEY.step]: 'emitter' },
      next: ISSUANCE_FLOW_NODE.paramEntry,
    })
    const list = sent.find((message) => message.kind === 'list')
    if (list?.kind !== 'list') throw new Error('lista de emitentes não enviada')
    expect(list.rows.map((row) => row.id)).toEqual([
      buildEmitterKey(EMITTER_TAX_ID),
      buildEmitterKey(OTHER_EMITTER_TAX_ID),
    ])
    expect(JSON.stringify(sent)).not.toContain(EMITTER_TAX_ID)
    expect(JSON.stringify(sent)).not.toContain(OTHER_EMITTER_TAX_ID)
  })

  test('escolher o emitente guarda a chave; chave que não está na lista é recusada', async () => {
    const valid = await call({
      context: {
        [KEY.answer]: buildEmitterKey(EMITTER_TAX_ID),
        [KEY.criterion]: 'number_range',
        [KEY.step]: 'emitter',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(valid.result).toMatchObject({
      context: { [KEY.emitterKey]: buildEmitterKey(EMITTER_TAX_ID) },
      next: ISSUANCE_FLOW_NODE.prompt,
    })

    const invalid = await call({
      context: {
        [KEY.answer]: 'em_forjada',
        [KEY.criterion]: 'number_range',
        [KEY.step]: 'emitter',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(invalid.result).toMatchObject({ next: ISSUANCE_FLOW_NODE.prompt })
    expect((invalid.result as FlowActionResult).context?.[KEY.emitterKey]).toBeUndefined()
    expect(invalid.sent[0]).toMatchObject({ kind: 'text' })
  })

  test('série única não é perguntada: o bot segue direto para o número inicial', async () => {
    const { result, sent } = await call({
      context: RANGE_WITH_EMITTER,
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(result).toMatchObject({
      context: { [KEY.series]: '1', [KEY.step]: 'first_number' },
      next: ISSUANCE_FLOW_NODE.paramEntry,
    })
    expect(sent).toEqual([{ body: expect.stringContaining('número inicial'), kind: 'text' }])
  })

  test('mais de uma série vira lista', async () => {
    const { result, sent } = await call({
      context: RANGE_WITH_EMITTER,
      harness: buildHarness({ listPendingSeries: async () => ['1', '2'] }),
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(result).toMatchObject({ context: { [KEY.step]: 'series' } })
    expect(sent[0]).toMatchObject({ kind: 'list', rows: [{ id: '1' }, { id: '2' }] })
  })

  test('número: texto que não é inteiro é recusado, e o final não pode ser menor que o inicial', async () => {
    const notNumber = await call({
      context: {
        ...RANGE_WITH_EMITTER,
        [KEY.answer]: 'mil e duzentos',
        [KEY.series]: '1',
        [KEY.step]: 'first_number',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect((notNumber.result as FlowActionResult).context?.[KEY.firstNumber]).toBeUndefined()
    expect(notNumber.sent[0]).toMatchObject({ kind: 'text' })

    const first = await call({
      context: {
        ...RANGE_WITH_EMITTER,
        [KEY.answer]: '1200',
        [KEY.series]: '1',
        [KEY.step]: 'first_number',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(first.result).toMatchObject({ context: { [KEY.firstNumber]: 1200 } })

    const backwards = await call({
      context: {
        ...RANGE_WITH_EMITTER,
        [KEY.answer]: '1100',
        [KEY.firstNumber]: 1200,
        [KEY.series]: '1',
        [KEY.step]: 'last_number',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect((backwards.result as FlowActionResult).context?.[KEY.lastNumber]).toBeUndefined()
    expect(backwards.sent[0]).toMatchObject({ body: expect.stringContaining('1200'), kind: 'text' })
  })

  test('data: dd/mm/aaaa é aceita; formato errado e final antes da inicial são recusados', async () => {
    const dateContext = { [KEY.criterion]: 'issue_date' }
    const valid = await call({
      context: { ...dateContext, [KEY.answer]: '01/09/2026', [KEY.step]: 'start_date' },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(valid.result).toMatchObject({ context: { [KEY.startDate]: '2026-09-01' } })

    const wrong = await call({
      context: { ...dateContext, [KEY.answer]: '2026-09-01', [KEY.step]: 'start_date' },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect((wrong.result as FlowActionResult).context?.[KEY.startDate]).toBeUndefined()

    const backwards = await call({
      context: {
        ...dateContext,
        [KEY.answer]: '31/08/2026',
        [KEY.startDate]: '2026-09-01',
        [KEY.step]: 'end_date',
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect((backwards.result as FlowActionResult).context?.[KEY.endDate]).toBeUndefined()
  })

  test('viagem: lista das recentes, e a escolha guarda o id da viagem', async () => {
    const listed = await call({
      context: { [KEY.criterion]: 'trip' },
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(listed.sent[0]).toMatchObject({ kind: 'list', rows: [{ id: TRIP_ID }] })

    const chosen = await call({
      context: { [KEY.answer]: TRIP_ID, [KEY.criterion]: 'trip', [KEY.step]: 'trip' },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(chosen.result).toMatchObject({ context: { [KEY.tripId]: TRIP_ID } })
  })

  test('seleção completa chama a prévia com o documento do emitente resolvido em memória', async () => {
    const harness = buildHarness()
    const { result, sent } = await call({
      context: {
        ...RANGE_WITH_EMITTER,
        [KEY.firstNumber]: 1200,
        [KEY.lastNumber]: 1250,
        [KEY.series]: '1',
      },
      harness,
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(harness.previews[0]).toMatchObject({
      criterion: {
        emitterTaxId: EMITTER_TAX_ID,
        firstNumber: 1200,
        kind: 'number_range',
        lastNumber: 1250,
        series: '1',
      },
      dueDays: undefined,
      period: undefined,
    })
    expect(result).toMatchObject({ context: { [KEY.step]: 'due_date' } })
    expect(sent[0]).toMatchObject({
      kind: 'list',
      rows: [{ id: '7' }, { id: '15' }, { id: '30' }],
    })
  })

  test('período: botão Pular grava em branco, texto acima de 60 é recusado', async () => {
    const skipped = await call({
      context: { [KEY.answer]: 'skip', [KEY.step]: 'period' },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect(skipped.result).toMatchObject({ context: { [KEY.period]: '' } })

    const long = await call({
      context: { [KEY.answer]: 'x'.repeat(61), [KEY.step]: 'period' },
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
    })
    expect((long.result as FlowActionResult).context?.[KEY.period]).toBeUndefined()
  })

  test('prévia congelada: volumetria, bloqueados à parte, e Confirmar carrega o id do pedido', async () => {
    const harness = buildHarness({
      previewSelection: async () => ({
        expiresAt: new Date('2026-09-11T12:15:00.000Z'),
        kind: 'previewed',
        requestId: REQUEST_ID,
        volumetry: {
          blocked: [{ numbers: ['1201'], reason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT' }],
          blockedCount: 1,
          cte: 1,
          nfse: 0,
          noProfile: [],
          noProfileCount: 0,
          total: 2,
        },
      }),
    })
    const { result, sent } = await call({
      context: {
        [KEY.criterion]: 'trip',
        [KEY.dueDays]: 15,
        [KEY.tripId]: TRIP_ID,
      },
      harness,
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(sent[0]).toEqual({ body: '2 notas · 1 CT-e · 0 NFS-e · 1 bloqueada', kind: 'text' })
    expect(sent[1]).toEqual({ body: 'Bloqueadas:\n• Sem peso da carga: 1201', kind: 'text' })
    expect(sent[2]).toMatchObject({
      kind: 'list',
      rows: [{ id: `${ISSUANCE_CONFIRM_ANSWER_PREFIX}${REQUEST_ID}` }, { id: 'back' }],
    })
    expect(result).toMatchObject({
      context: { [KEY.requestId]: REQUEST_ID },
      next: ISSUANCE_FLOW_NODE.confirmEntry,
    })
  })

  test('acima do teto a recusa diz o número achado e volta ao critério', async () => {
    const { result, sent } = await call({
      context: { [KEY.criterion]: 'trip', [KEY.tripId]: TRIP_ID },
      harness: buildHarness({
        previewSelection: async () => ({ found: 1437, kind: 'too_many', limit: 1000 }),
      }),
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
    })
    expect(sent[0]).toMatchObject({ body: expect.stringContaining('1437'), kind: 'text' })
    expect(result).toMatchObject({ next: ISSUANCE_FLOW_NODE.criterionMenu })
  })

  test('confirmação: Voltar refaz o critério; Confirmar de outro pedido não vale', async () => {
    const back = await call({
      context: { [KEY.confirmAnswer]: 'back', [KEY.requestId]: REQUEST_ID },
      kind: ISSUANCE_FLOW_ACTION_KIND.confirmRouter,
    })
    expect(back.result).toMatchObject({ next: ISSUANCE_FLOW_NODE.criterionMenu })

    const forged = await call({
      context: {
        [KEY.confirmAnswer]: `${ISSUANCE_CONFIRM_ANSWER_PREFIX}00000000-0000-4000-8000-000000009999`,
        [KEY.requestId]: REQUEST_ID,
      },
      kind: ISSUANCE_FLOW_ACTION_KIND.confirmRouter,
    })
    expect(forged.result).toMatchObject({ next: ISSUANCE_FLOW_NODE.confirmEntry })
  })
})
