/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — a liquidação fatura em nome de quem confirmou (D6.5), **depois de revalidar** a
 * membership dele. Fakes em tudo o que é banco: aqui se prova a decisão, e a integração prova a
 * mesma coisa contra Postgres.
 */
import { describe, expect, test } from 'bun:test'

import type { CreateBillingInvoiceInput } from '../../src/billing/application/billing.use-case.js'
import type { WhatsAppCommandClassificationEntry } from '../../src/database/whatsapp-command.schema.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { ConfirmDocumentSelectionInput } from '../../src/whatsapp-commands/application/confirm-document-selection.use-case.js'
import {
  createSettleWhatsAppCommandUseCase,
  type SettleWhatsAppCommandDependencies,
} from '../../src/whatsapp-commands/application/settle-whatsapp-command.use-case.js'
import type {
  RecordWhatsAppCommandJournalStepInput,
  WhatsAppCommandJournalStep,
  WhatsAppCommandRequest,
} from '../../src/whatsapp-commands/application/whatsapp-command.port.js'
import type {
  SettlementCteDocument,
  SettlementNfseInvoice,
} from '../../src/whatsapp-commands/application/whatsapp-command-settlement.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001401'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000001409'
const REQUEST_ID = '00000000-0000-4000-8000-000000001402'
const ACTOR_ID = '00000000-0000-4000-8000-000000001403'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000001404'
const BATCH_ID = '00000000-0000-4000-8000-000000001405'
const NFSE_INVOICE_ID = '00000000-0000-4000-8000-000000001406'
const PROFILE_ID = '00000000-0000-4000-8000-000000001407'
const NFSE_PROFILE_ID = '00000000-0000-4000-8000-000000001408'
const TAKER_A = '44555666000109'
const TAKER_B = '77888999000105'
const DUE_DATE = '2026-09-27'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const MINUTE_MS = 60_000
const BILLING_PERMISSIONS: readonly CompanyPermission[] = [
  'billing.create',
  'cte.manage',
  'cte.submit',
  'nfse.issue',
]

const documentId = (index: number): string =>
  `00000000-0000-4000-8000-0000000015${String(index).padStart(2, '0')}`
const cteId = (index: number): string =>
  `00000000-0000-4000-8000-0000000016${String(index).padStart(2, '0')}`
const billingKey = (taker: string): string => `whatsapp:${REQUEST_ID}:billing:${taker}`

const cteEntry = (index: number, taker: string): WhatsAppCommandClassificationEntry => ({
  classification: { output: 'cte' } as WhatsAppCommandClassificationEntry['classification'],
  documentId: documentId(index),
  profileId: PROFILE_ID,
  profileName: 'Perfil CT-e',
  takerTaxId: taker,
})

const CLASSIFICATION: readonly WhatsAppCommandClassificationEntry[] = [
  cteEntry(1, TAKER_A),
  cteEntry(2, TAKER_A),
  cteEntry(3, TAKER_B),
  cteEntry(4, TAKER_A),
  {
    classification: {
      nfseProfileId: NFSE_PROFILE_ID,
      output: 'nfse',
    } as WhatsAppCommandClassificationEntry['classification'],
    documentId: documentId(5),
    profileId: PROFILE_ID,
    profileName: 'Perfil NFS-e',
    takerTaxId: TAKER_B,
  },
]

const cte = (
  index: number,
  status: string,
  overrides: Partial<SettlementCteDocument> = {},
): SettlementCteDocument => ({
  cteDocumentId: status === 'authorized' || status === 'cancelled' ? cteId(index) : undefined,
  errorCause: undefined,
  errorCode: undefined,
  invoiceIdempotencyKey: undefined,
  nfeDocumentId: documentId(index),
  nfeNumber: String(1000 + index),
  status,
  ...overrides,
})

const DEFAULT_CTES: readonly SettlementCteDocument[] = [
  cte(1, 'authorized'),
  cte(2, 'authorized'),
  cte(3, 'authorized'),
  cte(4, 'rejected', { errorCause: 'Rejeicao: Duplicidade de CT-e', errorCode: '539' }),
]

const DEFAULT_NFSE: readonly SettlementNfseInvoice[] = [
  {
    id: NFSE_INVOICE_ID,
    rejectionCode: undefined,
    rejectionMessage: undefined,
    status: 'authorized',
    takerTaxId: TAKER_B,
  },
]

type ScenarioOptions = {
  readonly actor?: 'active' | 'no_billing' | 'service' | 'suspended'
  readonly billingError?: ApiError
  readonly confirmedMinutesAgo?: number
  readonly ctes?: readonly SettlementCteDocument[]
  readonly journal?: readonly WhatsAppCommandJournalStep[]
  readonly markSettledResult?: boolean
  readonly nfse?: readonly SettlementNfseInvoice[]
  readonly status?: WhatsAppCommandRequest['status']
}

function journalStep(
  kind: WhatsAppCommandJournalStep['documentKind'],
  overrides: Partial<WhatsAppCommandJournalStep> = {},
): WhatsAppCommandJournalStep {
  return {
    documentId: kind === 'cte_batch' ? BATCH_ID : NFSE_INVOICE_ID,
    documentKind: kind,
    groupKey: kind === 'cte_batch' ? PROFILE_ID : `${NFSE_PROFILE_ID}:${TAKER_B}`,
    id: crypto.randomUUID(),
    idempotencyKey: `whatsapp:${REQUEST_ID}:${kind}:group`,
    lastErrorCode: undefined,
    requestId: REQUEST_ID,
    status: 'issued',
    ...overrides,
  }
}

function actorContext(
  permissions: readonly CompanyPermission[],
  roles: readonly string[] = ['company-admin'],
) {
  return {
    identity: {
      channel: 'whatsapp' as const,
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '',
      issuer: 'whatsapp',
      platformAdmin: false,
      serviceAccount: false,
      subject: '',
      userId: ACTOR_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company' as const,
      membershipId: MEMBERSHIP_ID,
      permissions: new Set(permissions),
      roles,
      userId: ACTOR_ID,
    },
  } as unknown as AuthenticatedContext<CompanyContext>
}

function createScenario(options: ScenarioOptions = {}) {
  const request: WhatsAppCommandRequest = {
    actorUserId: ACTOR_ID,
    classification: CLASSIFICATION,
    companyId: COMPANY_ID,
    confirmedAt: new Date(NOW.getTime() - (options.confirmedMinutesAgo ?? 30) * MINUTE_MS),
    dueDate: DUE_DATE,
    expiresAt: new Date(NOW.getTime() - 60 * MINUTE_MS),
    groupingMode: undefined,
    id: REQUEST_ID,
    kind: 'document_issuance',
    lastErrorCode: undefined,
    membershipId: MEMBERSHIP_ID,
    period: 'setembro/2026',
    previewSha256: 'a'.repeat(64),
    selection: CLASSIFICATION.map((entry) => entry.documentId),
    settledAt: undefined,
    settlementOutcome: undefined,
    status: options.status ?? 'dispatched',
  }
  const state = { request }
  const billed: CreateBillingInvoiceInput[] = []
  const recorded: RecordWhatsAppCommandJournalStepInput[] = []
  const settled: Record<string, unknown>[] = []
  const resumed: ConfirmDocumentSelectionInput[] = []
  const logs: unknown[] = []
  const resolvedActors: Record<string, string>[] = []

  const deps: SettleWhatsAppCommandDependencies = {
    authorization: new AuthorizationService(),
    billing: {
      async create(input) {
        billed.push(input)
        if (options.billingError !== undefined) throw options.billingError
        return { id: `invoice-${input.idempotencyKey.split(':').at(-1) ?? ''}` }
      },
    },
    clock: () => NOW,
    commands: {
      async findById(input) {
        return input.companyId === state.request.companyId && input.id === state.request.id
          ? state.request
          : undefined
      },
      async listJournal() {
        return options.journal ?? [journalStep('cte_batch'), journalStep('nfse_invoice')]
      },
      async markSettled(input) {
        settled.push(input)
        if (options.markSettledResult === false) return false
        if (state.request.status !== 'dispatched') return false
        state.request = {
          ...state.request,
          settledAt: input.now,
          settlementOutcome: input.settlementOutcome,
          status: input.outcome,
        }
        return true
      },
      async recordJournalStep(input) {
        recorded.push(input)
      },
    },
    documents: {
      async readCteDocuments(input) {
        expect(input).toEqual({ batchIds: [BATCH_ID], companyId: COMPANY_ID })
        return options.ctes ?? DEFAULT_CTES
      },
      async readNfseInvoices(input) {
        expect(input.companyId).toBe(COMPANY_ID)
        return options.nfse ?? DEFAULT_NFSE
      },
    },
    logger: {
      error: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
    },
    async resolveActor(input) {
      resolvedActors.push(input)
      if (options.actor === 'suspended') return null
      // O serviço com a permissão de faturar: só o papel o denuncia.
      if (options.actor === 'service') return actorContext(BILLING_PERMISSIONS, ['automation'])
      return actorContext(
        options.actor === 'no_billing'
          ? BILLING_PERMISSIONS.filter((permission) => permission !== 'billing.create')
          : BILLING_PERMISSIONS,
      )
    },
    async resume(input) {
      resumed.push(input)
      return { failures: [], issued: 1, kind: 'dispatched' }
    },
  }

  return {
    billed,
    logs,
    recorded,
    resolvedActors,
    resumed,
    settle: createSettleWhatsAppCommandUseCase(deps),
    settled,
    state,
  }
}

const settleInput = { companyId: COMPANY_ID, correlationId: 'corr-t014', requestId: REQUEST_ID }

describe('liquidação do pedido (spec 144 T014, AC6)', () => {
  test('uma fatura por tomador, só com os CT-e autorizados, em nome de quem confirmou', async () => {
    const scenario = createScenario()

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed).toEqual([
      {
        context: { companyId: COMPANY_ID, userId: ACTOR_ID },
        correlationId: 'corr-t014',
        cteDocumentIds: [cteId(1), cteId(2)],
        dueDate: DUE_DATE,
        idempotencyKey: billingKey(TAKER_A),
      },
      {
        context: { companyId: COMPANY_ID, userId: ACTOR_ID },
        correlationId: 'corr-t014',
        cteDocumentIds: [cteId(3)],
        dueDate: DUE_DATE,
        idempotencyKey: billingKey(TAKER_B),
      },
    ])
    expect(scenario.recorded).toEqual([
      {
        companyId: COMPANY_ID,
        documentId: `invoice-${TAKER_A}`,
        documentKind: 'billing_invoice',
        groupKey: TAKER_A,
        idempotencyKey: billingKey(TAKER_A),
        requestId: REQUEST_ID,
        status: 'created',
      },
      {
        companyId: COMPANY_ID,
        documentId: `invoice-${TAKER_B}`,
        documentKind: 'billing_invoice',
        groupKey: TAKER_B,
        idempotencyKey: billingKey(TAKER_B),
        requestId: REQUEST_ID,
        status: 'created',
      },
    ])
    expect(scenario.state.request.status).toBe('settled')
    expect(scenario.state.request.settlementOutcome).toBe('completed')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.status).toBe('settled')
    expect(outcome.message).toContain('3 CT-e autorizados')
    expect(outcome.message).toContain('NF-e 1004: 539 — Rejeicao: Duplicidade de CT-e')
    expect(outcome.message).toContain('1 NFS-e autorizada, sem fatura')
    expect(outcome.message).toContain('tomador final 0109: 2 CT-e, vencimento 27/09/2026')
    expect(outcome.message).toContain('tomador final 0105: 1 CT-e, vencimento 27/09/2026')
  })

  test('a revalidação usa o ator do pedido, na empresa do pedido', async () => {
    const scenario = createScenario()
    await scenario.settle(settleInput)
    expect(scenario.resolvedActors).toEqual([{ companyId: COMPANY_ID, userId: ACTOR_ID }])
  })

  /**
   * T014b (M2): quem perdeu o acesso não recebe resumo — nem lista de documentos, nem número de
   * nota, nem motivo da SEFAZ, nem final de tomador. O desfecho continua gravado.
   */
  test('ator suspenso antes da liquidação: nenhuma fatura, desfecho gravado e nenhum resumo', async () => {
    const scenario = createScenario({ actor: 'suspended' })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed).toEqual([])
    expect(scenario.recorded).toEqual([])
    expect(scenario.state.request.status).toBe('settled_partial')
    expect(scenario.state.request.settlementOutcome).toBe('actor_not_authorized')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.settlementOutcome).toBe('actor_not_authorized')
    expect(outcome.message).toBeUndefined()
  })

  test('ator ativo que perdeu a permissão de faturar: nenhuma fatura e nenhum resumo', async () => {
    const scenario = createScenario({ actor: 'no_billing' })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed).toEqual([])
    expect(scenario.state.request.settlementOutcome).toBe('actor_not_authorized')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.message).toBeUndefined()
  })

  /** T014b (B2): o ator da liquidação é sempre gente; papel de serviço é recusa, como no canal. */
  test('ator com papel de serviço é recusado: nenhuma fatura e nenhum resumo', async () => {
    const scenario = createScenario({ actor: 'service' })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed).toEqual([])
    expect(scenario.state.request.settlementOutcome).toBe('actor_not_authorized')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.message).toBeUndefined()
  })

  test('retomada com ator de papel de serviço é negada', async () => {
    const scenario = createScenario({ actor: 'service', status: 'confirming' })

    const outcome = await scenario.settle(settleInput)

    expect(outcome).toEqual({ kind: 'resume_denied' })
    expect(scenario.resumed).toEqual([])
  })

  test('CT-e cancelado é final e não fatura', async () => {
    const scenario = createScenario({
      ctes: [cte(1, 'authorized'), cte(2, 'cancelled'), cte(3, 'authorized')],
    })

    await scenario.settle(settleInput)

    expect(scenario.billed.map((input) => input.cteDocumentIds)).toEqual([[cteId(1)], [cteId(3)]])
    expect(scenario.state.request.settlementOutcome).toBe('completed')
  })

  test('reconciliation_required é pendente: dentro das duas horas não liquida nem fatura', async () => {
    const scenario = createScenario({
      ctes: [cte(1, 'authorized'), cte(2, 'reconciliation_required')],
    })

    expect(await scenario.settle(settleInput)).toEqual({ kind: 'waiting' })
    expect(scenario.billed).toEqual([])
    expect(scenario.settled).toEqual([])
  })

  test('depois das duas horas liquida em parte, fatura o autorizado e nomeia o pendente', async () => {
    const scenario = createScenario({
      confirmedMinutesAgo: 121,
      ctes: [cte(1, 'authorized'), cte(2, 'reconciliation_required')],
    })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed.map((input) => input.cteDocumentIds)).toEqual([[cteId(1)]])
    expect(scenario.state.request.status).toBe('settled_partial')
    expect(scenario.state.request.settlementOutcome).toBe('timed_out')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.message).toContain('Sem resposta depois de 2 horas: NF-e 1002')
  })

  test('repetir depois de liquidado não fatura de novo', async () => {
    const scenario = createScenario()
    await scenario.settle(settleInput)
    const billedOnce = scenario.billed.length

    expect(await scenario.settle(settleInput)).toEqual({ kind: 'already_settled' })
    expect(scenario.billed).toHaveLength(billedOnce)
  })

  test('quem perde a corrida do markSettled responde already_settled', async () => {
    const scenario = createScenario({ markSettledResult: false })
    expect(await scenario.settle(settleInput)).toEqual({ kind: 'already_settled' })
  })

  test('CT-e já em fatura de outra chave fica fora; o da própria chave entra (replay)', async () => {
    const scenario = createScenario({
      ctes: [
        cte(1, 'authorized', { invoiceIdempotencyKey: 'panel-invoice-key-0001' }),
        cte(2, 'authorized', { invoiceIdempotencyKey: billingKey(TAKER_A) }),
        cte(3, 'authorized'),
      ],
    })

    await scenario.settle(settleInput)

    expect(scenario.billed.map((input) => input.cteDocumentIds)).toEqual([[cteId(2)], [cteId(3)]])
  })

  test('fatura recusada pelo domínio fica no diário e o pedido liquida em parte', async () => {
    const scenario = createScenario({
      billingError: new ApiError({
        code: 'BILLING_CTE_ALREADY_INVOICED',
        message: 'x',
        status: 409,
      }),
    })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.recorded.map((step) => [step.status, step.errorCode])).toEqual([
      ['failed', 'BILLING_CTE_ALREADY_INVOICED'],
      ['failed', 'BILLING_CTE_ALREADY_INVOICED'],
    ])
    expect(scenario.state.request.status).toBe('settled_partial')
    expect(scenario.state.request.settlementOutcome).toBe('billing_failed')
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.message).toContain('não saiu (BILLING_CTE_ALREADY_INVOICED)')
  })

  test('erro que não é de domínio sobe e o pedido continua dispatched', async () => {
    const broken = createScenario({ billingError: new Error('connection reset') as ApiError })
    await expect(broken.settle(settleInput)).rejects.toThrow('connection reset')
    expect(broken.state.request.status).toBe('dispatched')
  })

  test('grupo que falhou na confirmação é final e aparece no resumo', async () => {
    const scenario = createScenario({
      ctes: [],
      journal: [
        journalStep('cte_batch', {
          documentId: undefined,
          lastErrorCode: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
          status: 'failed',
        }),
        journalStep('nfse_invoice'),
      ],
    })

    const outcome = await scenario.settle(settleInput)

    expect(scenario.billed).toEqual([])
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
    expect(outcome.message).toContain('não saiu')
    expect(outcome.message).toContain('CTE_BATCH_DOCUMENT_MISSING_WEIGHT')
  })

  test('pedido de outra empresa não é achado', async () => {
    const scenario = createScenario()
    expect(await scenario.settle({ ...settleInput, companyId: OTHER_COMPANY_ID })).toEqual({
      kind: 'not_found',
    })
    expect(scenario.billed).toEqual([])
  })

  test('o log conta, e nunca carrega o resumo, número de nota nem documento do tomador', async () => {
    const scenario = createScenario()
    const outcome = await scenario.settle(settleInput)
    if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)

    const logged = JSON.stringify(scenario.logs)
    expect(scenario.logs.length).toBeGreaterThan(0)
    expect(logged).not.toContain(outcome.message)
    for (const secret of [TAKER_A, TAKER_B, '1004', 'Duplicidade', '0109']) {
      expect(logged).not.toContain(secret)
    }
  })
})

describe('retomada dos pedidos confirming parados (spec 144 T014 × T013)', () => {
  test('parado há mais de quinze minutos: retoma pelo resume da T013, como o ator do pedido', async () => {
    const scenario = createScenario({ confirmedMinutesAgo: 20, status: 'confirming' })

    const outcome = await scenario.settle(settleInput)

    expect(outcome).toEqual({ kind: 'resumed', result: 'dispatched' })
    expect(scenario.resumed).toHaveLength(1)
    expect(scenario.resumed[0]?.requestId).toBe(REQUEST_ID)
    expect(scenario.resumed[0]?.actor.scope.userId).toBe(ACTOR_ID)
    expect(scenario.billed).toEqual([])
  })

  test('confirming recente espera: pode ser a própria confirmação ainda correndo', async () => {
    const scenario = createScenario({ confirmedMinutesAgo: 5, status: 'confirming' })

    expect(await scenario.settle(settleInput)).toEqual({ kind: 'waiting' })
    expect(scenario.resumed).toEqual([])
  })

  test('ator suspenso não é retomado', async () => {
    const scenario = createScenario({
      actor: 'suspended',
      confirmedMinutesAgo: 20,
      status: 'confirming',
    })

    expect(await scenario.settle(settleInput)).toEqual({ kind: 'resume_denied' })
    expect(scenario.resumed).toEqual([])
  })
})
