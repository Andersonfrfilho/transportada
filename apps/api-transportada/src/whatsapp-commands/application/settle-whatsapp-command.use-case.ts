/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — a liquidação (D6.4–D6.6). Quem detecta é o worker; quem decide é esta função, que
 * recalcula o estado de cada documento pelo banco antes de tocar em fatura. A fatura sai **em nome
 * de quem confirmou**, depois de revalidar que a membership dele ainda está ativa e ainda fatura: sem
 * isso, um usuário suspenso entre a confirmação e a liquidação faturaria por procuração.
 *
 * O tomador de cada CT-e sai do grupo congelado na prévia, nunca de uma reclassificação: depois da
 * emissão as notas estão vinculadas, e reclassificar daria outro resultado. Ele coincide com o que o
 * faturamento lê (`buildBillingTakerJoin`) porque os dois resolvem o mesmo `taker` do perfil sobre o
 * mesmo participante da nota — `0` é o emitente, `3` o destinatário.
 */
import type { CreateBillingInvoiceInput } from '../../billing/application/billing.use-case.js'
import { SERVICE_COMPANY_ROLES } from '../../database/identity.schema.js'
import type { WhatsAppCommandSettlementCode } from '../../database/whatsapp-command.schema.js'
import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import { ApiError } from '../../shared/api.error.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'
import {
  buildIssuanceGroups,
  describeIssuanceGroup,
} from '../domain/issuance-confirmation.policy.js'
import { buildBillingInvoiceIdempotencyKey } from '../domain/issuance-idempotency.policy.js'
import {
  computeNextSettlementAttemptAt,
  hasExhaustedSettlementAttempts,
  toSettlementErrorCode,
} from '../domain/whatsapp-command-settlement-retry.policy.js'
import {
  classifyWhatsAppCommandDocument,
  decideWhatsAppCommandSettlement,
  type WhatsAppCommandDocumentOutcome,
  type WhatsAppCommandSettlementVerdict,
} from '../domain/whatsapp-command-settlement.policy.js'
import type {
  ConfirmDocumentSelectionOutcome,
  DocumentSelectionConfirmation,
} from './confirm-document-selection.use-case.js'
import {
  buildWhatsAppCommandSettlementSummary,
  type SettlementBillingFailure,
  type SettlementFailedGroup,
  type SettlementInvoice,
} from './whatsapp-command-settlement-summary.service.js'
import type {
  SettlementCteDocument,
  SettlementNfseInvoice,
  WhatsAppCommandSettlementReaderPort,
} from './whatsapp-command-settlement.port.js'
import type {
  WhatsAppCommandJournalStep,
  WhatsAppCommandRepositoryPort,
  WhatsAppCommandRequest,
  WhatsAppCommandSettlementOutcome,
  WhatsAppCommandSettlingStatus,
} from './whatsapp-command.port.js'

const BILLING_CREATE_POLICY = { permission: 'billing.create', scope: 'company' } as const
const TAKER_MISSING = 'WHATSAPP_COMMAND_TAKER_MISSING'
const UNKNOWN_GROUP_LABEL = 'Grupo do pedido'
const REQUEST_PREFIX_LENGTH = 8
/** Sem documento, nota nem motivo: não se sabe se quem confirmou ainda tem acesso (T014b M2). */
const SETTLEMENT_FAILED_MESSAGE = (requestId: string): string =>
  `Não consegui concluir o pedido ${requestId.slice(0, REQUEST_PREFIX_LENGTH)}. Confira os documentos no painel.`

export type SettleWhatsAppCommandDependencies = Readonly<{
  authorization: Pick<AuthorizationService, 'authorize'>
  billing: Readonly<{
    create(input: CreateBillingInvoiceInput): Promise<Readonly<Record<string, unknown>>>
  }>
  clock: () => Date
  commands: Pick<
    WhatsAppCommandRepositoryPort,
    | 'abandonSettlement'
    | 'deferSettlement'
    | 'findById'
    | 'listJournal'
    | 'markSettled'
    | 'recordJournalStep'
  >
  documents: WhatsAppCommandSettlementReaderPort
  logger: ApiLogger
  /** Membership ativa + empresa ativa + permissões, pelo mesmo caminho do canal; `null` é recusa. */
  resolveActor(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<AuthenticatedContext<CompanyContext> | null>
  resume: DocumentSelectionConfirmation['resume']
}>

export type SettleWhatsAppCommandInput = Readonly<{
  companyId: string
  correlationId: string
  requestId: string
}>

export type SettleWhatsAppCommandOutcome =
  | Readonly<{ kind: 'already_settled' }>
  /** T020 (B2): lançou fora do domínio; a varredura só volta a ele depois do recuo. */
  | Readonly<{ kind: 'deferred' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'resumed'; result: ConfirmDocumentSelectionOutcome['kind'] }>
  | Readonly<{
      kind: 'settled'
      /** Ausente quando o ator perdeu o acesso: o resumo não sai para ele (T014b). */
      message: string | undefined
      settlementOutcome: WhatsAppCommandSettlementCode
      status: WhatsAppCommandSettlementOutcome
    }>
  | Readonly<{ kind: 'waiting' }>

export type SettleWhatsAppCommand = (
  input: SettleWhatsAppCommandInput,
) => Promise<SettleWhatsAppCommandOutcome>

type Deps = SettleWhatsAppCommandDependencies

type SettlementSnapshot = Readonly<{
  ctes: readonly SettlementCteDocument[]
  failedGroups: readonly SettlementFailedGroup[]
  nfse: readonly SettlementNfseInvoice[]
  outcomes: readonly WhatsAppCommandDocumentOutcome[]
}>

type BillingResult = Readonly<{
  failures: readonly SettlementBillingFailure[]
  invoices: readonly SettlementInvoice[]
}>

const NO_BILLING: BillingResult = { failures: [], invoices: [] }

export function createSettleWhatsAppCommandUseCase(deps: Deps): SettleWhatsAppCommand {
  return (input) => settle(deps, input)
}

async function settle(
  deps: Deps,
  input: SettleWhatsAppCommandInput,
): Promise<SettleWhatsAppCommandOutcome> {
  const request = await deps.commands.findById({ companyId: input.companyId, id: input.requestId })
  if (request === undefined) return { kind: 'not_found' }
  const work = { correlationId: input.correlationId, request }
  switch (request.status) {
    case 'confirming':
    case 'dispatched': {
      const settling = { ...work, fromStatus: request.status }
      return withSettlementRetry(deps, settling, () =>
        request.status === 'confirming' ? resumeStuck(deps, work) : settleDispatched(deps, work),
      )
    }
    case 'settled':
    case 'settled_partial':
      return { kind: 'already_settled' }
    case 'expired':
    case 'previewed':
    case 'superseded':
      return { kind: 'not_found' }
  }
}

/**
 * A retomada da T013, e só daqui: o toque em ✅ Confirmar num `confirming` não retoma. Quem
 * serializa as execuções é a linha de `job_executions` da rotina — duas batidas não correm juntas.
 */
async function resumeStuck(
  deps: Deps,
  input: { readonly correlationId: string; readonly request: WhatsAppCommandRequest },
): Promise<SettleWhatsAppCommandOutcome> {
  const { request } = input
  const verdict = decideWhatsAppCommandSettlement({
    confirmedAt: request.confirmedAt,
    documents: [],
    now: deps.clock(),
    status: request.status,
  })
  if (verdict !== 'resume') return { kind: 'waiting' }

  const actor = await resolveHumanActor(deps, request)
  const metadata = logMetadata(input)
  if (actor === null) return closeDeniedResume(deps, input)
  const result = await deps.resume({ actor, requestId: request.id })
  safeLogInfo({
    logger: deps.logger,
    message: 'whatsapp.command.resumed',
    metadata: { ...metadata, result: result.kind },
  })
  if (result.kind === 'forbidden') return closeDeniedResume(deps, input)
  return { kind: 'resumed', result: result.kind }
}

/**
 * T020 (B2): ator recusado na retomada é estado final, não espera. Em `confirming` para sempre, o
 * pedido voltava a cada batida no topo da varredura e, somando o teto, calava a fila inteira. Sem
 * resumo, pela mesma razão da liquidação (T014b M2).
 */
async function closeDeniedResume(
  deps: Deps,
  input: { readonly correlationId: string; readonly request: WhatsAppCommandRequest },
): Promise<SettleWhatsAppCommandOutcome> {
  const settlementOutcome = 'actor_not_authorized'
  const status = 'settled_partial'
  const marked = await deps.commands.markSettled({
    companyId: input.request.companyId,
    fromStatus: 'confirming',
    id: input.request.id,
    now: deps.clock(),
    outcome: status,
    settlementOutcome,
  })
  if (!marked) return { kind: 'already_settled' }
  safeLogInfo({
    logger: deps.logger,
    message: 'whatsapp.command.resume_denied',
    metadata: logMetadata(input),
  })
  return { kind: 'settled', message: undefined, settlementOutcome, status }
}

/**
 * T020 (B2): erro fora do domínio não sobe para o worker, que o chamaria de novo a cada batida. A
 * tentativa é contada, o pedido recua e, esgotado o limite, encerra com trilha — nunca é apagado.
 * É o "retry com limite" que o catch local admite (`code-standart.md` §7).
 */
type SettlingWork = Readonly<{
  correlationId: string
  fromStatus: WhatsAppCommandSettlingStatus
  request: WhatsAppCommandRequest
}>

async function withSettlementRetry(
  deps: Deps,
  input: SettlingWork,
  work: () => Promise<SettleWhatsAppCommandOutcome>,
): Promise<SettleWhatsAppCommandOutcome> {
  try {
    return await work()
  } catch (error) {
    return recordSettlementFailure(deps, { ...input, error })
  }
}

async function recordSettlementFailure(
  deps: Deps,
  input: SettlingWork & Readonly<{ error: unknown }>,
): Promise<SettleWhatsAppCommandOutcome> {
  const { fromStatus, request } = input
  const attempts = request.settlementAttempts + 1
  const errorCode = toSettlementErrorCode(input.error)
  const now = deps.clock()
  const reference = { companyId: request.companyId, id: request.id }
  safeLogError({
    logger: deps.logger,
    message: 'whatsapp.command.settlement_failed',
    metadata: { ...logMetadata(input), attempts: String(attempts), errorCode },
  })
  if (!hasExhaustedSettlementAttempts(attempts)) {
    const nextSettlementAt = computeNextSettlementAttemptAt({ attempts, now })
    await deps.commands.deferSettlement({
      ...reference,
      attempts,
      errorCode,
      fromStatus,
      nextSettlementAt,
      now,
    })
    return { kind: 'deferred' }
  }
  const abandoned = await deps.commands.abandonSettlement({
    ...reference,
    actorUserId: request.actorUserId,
    attempts,
    correlationId: input.correlationId,
    errorCode,
    fromStatus,
    now,
  })
  if (!abandoned) return { kind: 'already_settled' }
  return {
    kind: 'settled',
    message: SETTLEMENT_FAILED_MESSAGE(request.id),
    settlementOutcome: 'settlement_failed',
    status: 'settled_partial',
  }
}

async function settleDispatched(
  deps: Deps,
  input: { readonly correlationId: string; readonly request: WhatsAppCommandRequest },
): Promise<SettleWhatsAppCommandOutcome> {
  const { request } = input
  const snapshot = await readSnapshot(deps, request)
  const verdict = decideWhatsAppCommandSettlement({
    confirmedAt: request.confirmedAt,
    documents: snapshot.outcomes,
    now: deps.clock(),
    status: request.status,
  })
  if (verdict === 'wait') return { kind: 'waiting' }

  const canBill = await revalidateActor(deps, request)
  const billing = canBill ? await billAuthorizedCtes(deps, { ...input, snapshot }) : NO_BILLING
  const settlementOutcome = resolveSettlementCode({ billing, canBill, verdict })
  return finish(deps, { ...input, billing, settlementOutcome, snapshot })
}

async function readSnapshot(
  deps: Deps,
  request: WhatsAppCommandRequest,
): Promise<SettlementSnapshot> {
  const { companyId } = request
  const journal = await deps.commands.listJournal({ companyId, requestId: request.id })
  const issuing = journal.filter((step) => step.documentKind !== 'billing_invoice')
  const batchIds = documentIdsOf(issuing, 'cte_batch')
  const invoiceIds = documentIdsOf(issuing, 'nfse_invoice')
  const [ctes, nfse] = await Promise.all([
    batchIds.length === 0 ? [] : deps.documents.readCteDocuments({ batchIds, companyId }),
    invoiceIds.length === 0 ? [] : deps.documents.readNfseInvoices({ companyId, invoiceIds }),
  ])
  const failedSteps = issuing.filter((step) => step.status === 'failed')
  const unstartedSteps = issuing.filter((step) => step.status === 'pending')
  return {
    ctes,
    failedGroups: describeFailedSteps(request, failedSteps),
    nfse,
    outcomes: [
      ...ctes.map((cte) => classifyWhatsAppCommandDocument(cte.status)),
      ...nfse.map((invoice) => classifyWhatsAppCommandDocument(invoice.status)),
      ...failedSteps.map(() => 'failure' as const),
      ...unstartedSteps.map(() => 'pending' as const),
    ],
  }
}

function documentIdsOf(
  steps: readonly WhatsAppCommandJournalStep[],
  kind: WhatsAppCommandJournalStep['documentKind'],
): string[] {
  return steps.flatMap((step) =>
    step.documentKind === kind && step.status !== 'failed' && step.documentId !== undefined
      ? [step.documentId]
      : [],
  )
}

function describeFailedSteps(
  request: WhatsAppCommandRequest,
  steps: readonly WhatsAppCommandJournalStep[],
): SettlementFailedGroup[] {
  const groups = buildIssuanceGroups({
    classification: request.classification,
    requestId: request.id,
  })
  const labelByStep = new Map(
    (groups ?? []).map((group) => [
      `${group.kind}:${group.groupKey}`,
      describeIssuanceGroup(group),
    ]),
  )
  return steps.map((step) => ({
    label: labelByStep.get(`${step.documentKind}:${step.groupKey}`) ?? UNKNOWN_GROUP_LABEL,
    reason: step.lastErrorCode ?? 'WHATSAPP_COMMAND_STEP_FAILED',
  }))
}

/**
 * T014b (B2): o ator é sempre gente. Papel de serviço é recusa, como no canal
 * (`resolve-whatsapp-actor.use-case.ts`) — defesa para a linha que um dia nascer do serviço.
 */
async function resolveHumanActor(
  deps: Deps,
  request: WhatsAppCommandRequest,
): Promise<AuthenticatedContext<CompanyContext> | null> {
  const actor = await deps.resolveActor({
    companyId: request.companyId,
    userId: request.actorUserId,
  })
  if (actor === null) return null
  return actor.scope.roles.some((role) => SERVICE_COMPANY_ROLES.includes(role)) ? null : actor
}

/** Pelo mesmo `authorize` do router: ativa, na empresa do pedido, e ainda com `billing.create`. */
async function revalidateActor(deps: Deps, request: WhatsAppCommandRequest): Promise<boolean> {
  const actor = await resolveHumanActor(deps, request)
  if (actor === null) return false
  try {
    deps.authorization.authorize(actor, BILLING_CREATE_POLICY)
    return true
  } catch {
    return false
  }
}

async function billAuthorizedCtes(
  deps: Deps,
  input: {
    readonly correlationId: string
    readonly request: WhatsAppCommandRequest
    readonly snapshot: SettlementSnapshot
  },
): Promise<BillingResult> {
  const { request } = input
  const { groups, missingTaker } = groupAuthorizedByTaker(request, input.snapshot.ctes)
  const missing: SettlementBillingFailure[] =
    missingTaker > 0 ? [{ code: TAKER_MISSING, takerTaxId: undefined }] : []
  if (groups.size === 0) return { failures: missing, invoices: [] }

  const { dueDate } = request
  // A prévia não congela CT-e sem vencimento: pedido com CT-e e sem data não existe.
  if (dueDate === undefined) throw new Error('WHATSAPP_COMMAND_DUE_DATE_MISSING')
  const ordered = [...groups].toSorted(([left], [right]) => left.localeCompare(right))
  const results = await Promise.all(
    ordered.map(([takerTaxId, cteDocumentIds]) =>
      billTaker(deps, { ...input, cteDocumentIds, dueDate, takerTaxId }),
    ),
  )
  return {
    failures: [...missing, ...results.flatMap((result) => ('code' in result ? [result] : []))],
    invoices: results.flatMap((result) => ('count' in result ? [result] : [])),
  }
}

/**
 * Só CT-e autorizado com documento fiscal. O que já está numa fatura ativa de **outra** chave fica
 * de fora (o painel faturou antes); o que está na fatura da própria chave entra, porque é o replay.
 */
function groupAuthorizedByTaker(
  request: WhatsAppCommandRequest,
  ctes: readonly SettlementCteDocument[],
): { readonly groups: Map<string, string[]>; readonly missingTaker: number } {
  const takerByDocument = new Map(
    request.classification.flatMap((entry) =>
      typeof entry.takerTaxId === 'string' && entry.takerTaxId.length > 0
        ? [[entry.documentId, normalizeTaxId(entry.takerTaxId)] as const]
        : [],
    ),
  )
  const groups = new Map<string, string[]>()
  let missingTaker = 0
  for (const cte of ctes) {
    if (classifyWhatsAppCommandDocument(cte.status) !== 'success') continue
    if (cte.cteDocumentId === undefined) continue
    const takerTaxId = takerByDocument.get(cte.nfeDocumentId)
    if (takerTaxId === undefined) {
      missingTaker += 1
      continue
    }
    const key = buildBillingInvoiceIdempotencyKey({ requestId: request.id, takerTaxId })
    if (cte.invoiceIdempotencyKey !== undefined && cte.invoiceIdempotencyKey !== key) continue
    groups.set(takerTaxId, [...(groups.get(takerTaxId) ?? []), cte.cteDocumentId])
  }
  return { groups, missingTaker }
}

/** Erro de domínio fica no diário com o código e não derruba o outro tomador; o resto sobe. */
async function billTaker(
  deps: Deps,
  input: {
    readonly correlationId: string
    readonly cteDocumentIds: readonly string[]
    readonly dueDate: string
    readonly request: WhatsAppCommandRequest
    readonly takerTaxId: string
  },
): Promise<SettlementBillingFailure | SettlementInvoice> {
  const { request, takerTaxId } = input
  const idempotencyKey = buildBillingInvoiceIdempotencyKey({ requestId: request.id, takerTaxId })
  const step = {
    companyId: request.companyId,
    documentKind: 'billing_invoice' as const,
    groupKey: takerTaxId,
    idempotencyKey,
    requestId: request.id,
  }
  try {
    const invoice = await deps.billing.create({
      context: { companyId: request.companyId, userId: request.actorUserId },
      correlationId: input.correlationId,
      cteDocumentIds: input.cteDocumentIds,
      dueDate: input.dueDate,
      idempotencyKey,
    })
    await deps.commands.recordJournalStep({
      ...step,
      documentId: requireInvoiceId(invoice),
      status: 'created',
    })
    return { count: input.cteDocumentIds.length, takerTaxId }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    await deps.commands.recordJournalStep({ ...step, errorCode: error.code, status: 'failed' })
    return { code: error.code, takerTaxId }
  }
}

function requireInvoiceId(invoice: Readonly<Record<string, unknown>>): string {
  const { id } = invoice
  if (typeof id !== 'string' || id.length === 0) throw new Error('BILLING_INVOICE_ID_MISSING')
  return id
}

function resolveSettlementCode(input: {
  readonly billing: BillingResult
  readonly canBill: boolean
  readonly verdict: WhatsAppCommandSettlementVerdict
}): WhatsAppCommandSettlementCode {
  if (!input.canBill) return 'actor_not_authorized'
  if (input.billing.failures.length > 0) return 'billing_failed'
  return input.verdict === 'settle_partial' ? 'timed_out' : 'completed'
}

async function finish(
  deps: Deps,
  input: {
    readonly billing: BillingResult
    readonly correlationId: string
    readonly request: WhatsAppCommandRequest
    readonly settlementOutcome: WhatsAppCommandSettlementCode
    readonly snapshot: SettlementSnapshot
  },
): Promise<SettleWhatsAppCommandOutcome> {
  const { billing, request, settlementOutcome, snapshot } = input
  const status = settlementOutcome === 'completed' ? 'settled' : 'settled_partial'
  const marked = await deps.commands.markSettled({
    companyId: request.companyId,
    id: request.id,
    now: deps.clock(),
    outcome: status,
    settlementOutcome,
  })
  if (!marked) return { kind: 'already_settled' }

  safeLogInfo({
    logger: deps.logger,
    message: 'whatsapp.command.settled',
    metadata: {
      ...logMetadata(input),
      ...countOutcomes(snapshot, billing),
      settlementOutcome,
      status,
    },
  })
  /**
   * T014b (M2): quem perdeu o acesso não recebe o que o pedido produziu — nem lista de documentos,
   * nem número de nota, nem motivo da SEFAZ, nem final de tomador. O desfecho já está gravado.
   */
  if (settlementOutcome === 'actor_not_authorized') {
    return { kind: 'settled', message: undefined, settlementOutcome, status }
  }
  const message = buildWhatsAppCommandSettlementSummary({
    billingFailures: billing.failures,
    ctes: snapshot.ctes,
    dueDate: request.dueDate,
    failedGroups: snapshot.failedGroups,
    invoices: billing.invoices,
    nfse: snapshot.nfse,
    requestId: request.id,
    settlementOutcome,
  })
  return { kind: 'settled', message, settlementOutcome, status }
}

/** Só identificadores opacos: o resumo, o número da nota e o documento do tomador não entram. */
function logMetadata(input: {
  readonly correlationId: string
  readonly request: WhatsAppCommandRequest
}): Record<string, string> {
  return {
    companyId: input.request.companyId,
    correlationId: input.correlationId,
    requestId: input.request.id,
  }
}

function countOutcomes(snapshot: SettlementSnapshot, billing: BillingResult) {
  const count = (outcome: WhatsAppCommandDocumentOutcome) =>
    snapshot.outcomes.filter((candidate) => candidate === outcome).length
  return {
    billingFailures: billing.failures.length,
    failed: count('failure'),
    invoices: billing.invoices.length,
    pending: count('pending'),
    succeeded: count('success'),
  }
}
