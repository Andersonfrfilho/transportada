/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — o diário de passos da confirmação (D6.2). **Não há transação única**: cada caso de
 * uso abre a sua, então o progresso fica gravado passo a passo, e é o diário que diz de onde a
 * retomada continua. `pending` começa do `create`, `created` continua do `issue`, `issued` e `failed`
 * são finais. A chave de cada chamada sai do pedido: repetir converge no que já existe.
 */
import { getRequiredString } from '../../cte-batches/application/cte-batch-record.service.js'
import type { CreateCteBatchInput } from '../../cte-batches/application/cte-batch.port.js'
import type { CteIssuanceIssueInput } from '../../cte-issuance/application/cte-issuance.use-case.js'
import type { WhatsAppCommandDocumentKind } from '../../database/whatsapp-command.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { CreateNfseInvoiceInput } from '../../nfse-invoices/application/nfse-invoice.use-case.js'
import { ApiError } from '../../shared/api.error.js'
import {
  buildCteBatchName,
  type CteIssuanceGroup,
  describeIssuanceGroup,
  type IssuanceGroup,
  type NfseIssuanceGroup,
} from '../domain/issuance-confirmation.policy.js'
import type {
  WhatsAppCommandJournalStep,
  WhatsAppCommandRepositoryPort,
  WhatsAppCommandRequest,
} from './whatsapp-command.port.js'

export type IssuanceJournalDependencies = Readonly<{
  commands: Pick<
    WhatsAppCommandRepositoryPort,
    'listJournal' | 'markDispatched' | 'markJournalStep'
  >
  createCteBatch: (input: CreateCteBatchInput) => Promise<Readonly<Record<string, unknown>>>
  createNfseInvoice: (input: CreateNfseInvoiceInput) => Promise<Readonly<{ invoiceId: string }>>
  issueCteBatch: (input: CteIssuanceIssueInput) => Promise<unknown>
}>

export type IssuanceStepFailure = Readonly<{
  documentKind: WhatsAppCommandDocumentKind
  label: string
  reason: string
}>

export type IssuanceJournalResult = Readonly<{
  failures: readonly IssuanceStepFailure[]
  issued: number
}>

type StepRun = Readonly<{
  context: CompanyContext
  deps: IssuanceJournalDependencies
  request: WhatsAppCommandRequest
  step: WhatsAppCommandJournalStep
}>

type StepVerdict = Readonly<{ reason: string; status: 'failed' }> | Readonly<{ status: 'issued' }>

const UNKNOWN_FAILURE = 'WHATSAPP_COMMAND_STEP_FAILED'

export async function runIssuanceJournal(input: {
  readonly context: CompanyContext
  readonly deps: IssuanceJournalDependencies
  readonly groups: readonly IssuanceGroup[]
  readonly request: WhatsAppCommandRequest
}): Promise<IssuanceJournalResult> {
  const { context, deps, request } = input
  const reference = { companyId: request.companyId, id: request.id }
  const journal = await deps.commands.listJournal({
    companyId: request.companyId,
    requestId: request.id,
  })
  const groupByStep = new Map(
    input.groups.map((group) => [stepKey(group.kind, group.groupKey), group]),
  )

  const failures: IssuanceStepFailure[] = []
  let issued = 0
  // Em sequência de propósito: os lotes dividem a sequência fiscal da empresa, e o diário é a ordem.
  for (const step of journal) {
    const group = groupByStep.get(stepKey(step.documentKind, step.groupKey))
    if (group === undefined) continue
    const verdict = await settleStep({ context, deps, request, step }, group)
    if (verdict.status === 'issued') issued += 1
    else {
      failures.push({
        documentKind: group.kind,
        label: describeIssuanceGroup(group),
        reason: verdict.reason,
      })
    }
  }
  await deps.commands.markDispatched(reference)
  return { failures, issued }
}

function stepKey(kind: WhatsAppCommandDocumentKind, groupKey: string): string {
  return `${kind}:${groupKey}`
}

/** Erro de domínio fecha o grupo como `failed` e segue; qualquer outro para tudo e a retomada continua. */
async function settleStep(run: StepRun, group: IssuanceGroup): Promise<StepVerdict> {
  if (run.step.status === 'issued') return { status: 'issued' }
  if (run.step.status === 'failed') {
    return { reason: run.step.lastErrorCode ?? UNKNOWN_FAILURE, status: 'failed' }
  }
  try {
    await (group.kind === 'cte_batch' ? advanceCte(run, group) : advanceNfse(run, group))
    return { status: 'issued' }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    await run.deps.commands.markJournalStep({
      companyId: run.request.companyId,
      errorCode: error.code,
      id: run.step.id,
      status: 'failed',
    })
    return { reason: error.code, status: 'failed' }
  }
}

async function advanceCte(run: StepRun, group: CteIssuanceGroup): Promise<void> {
  const { context, deps, request, step } = run
  const batchId =
    step.status === 'created' && step.documentId !== undefined
      ? step.documentId
      : await createBatch(run, group)
  await deps.issueCteBatch({
    batchId,
    context,
    correlationId: request.id,
    idempotencyKey: group.issueIdempotencyKey,
  })
  await deps.commands.markJournalStep({
    companyId: request.companyId,
    documentId: batchId,
    id: step.id,
    status: 'issued',
  })
}

async function createBatch(run: StepRun, group: CteIssuanceGroup): Promise<string> {
  const { context, deps, request, step } = run
  const batch = await deps.createCteBatch({
    context: { companyId: context.companyId, userId: context.userId },
    correlationId: request.id,
    documentIds: group.documentIds,
    emissionProfileId: group.profileId,
    groupingMode: request.groupingMode,
    idempotencyKey: group.idempotencyKey,
    name: buildCteBatchName(group, request.id),
  })
  const batchId = getRequiredString(batch, 'id')
  await deps.commands.markJournalStep({
    companyId: request.companyId,
    documentId: batchId,
    id: step.id,
    status: 'created',
  })
  return batchId
}

/** A NFS-e nasce já agendada para emissão: `create` é o passo inteiro, sem `created` no meio. */
async function advanceNfse(run: StepRun, group: NfseIssuanceGroup): Promise<void> {
  const { context, deps, request, step } = run
  const invoice = await deps.createNfseInvoice({
    context: { companyId: context.companyId, userId: context.userId },
    correlationId: request.id,
    documentIds: group.documentIds,
    idempotencyKey: group.idempotencyKey,
    period: request.period,
    profileId: group.nfseProfileId,
  })
  await deps.commands.markJournalStep({
    companyId: request.companyId,
    documentId: invoice.invoiceId,
    id: step.id,
    status: 'issued',
  })
}
