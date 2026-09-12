/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — confirmar é emitir **o que foi visto** (D5, D6). Na ordem: o pedido é do ator;
 * a membership alcança todos os documentos; a prévia não venceu; o hash recalculado bate; e só então
 * a transação curta do `claim` passa o pedido a `confirming` com o diário. Daí em diante cada grupo
 * corre pelo seu caso de uso (`issuance-journal.service.ts`), sem transação única.
 *
 * `resume` é a mesma execução sobre um pedido `confirming` parado — quem a chama é a liquidação
 * (T014). O toque em ✅ Confirmar num pedido em curso **não** retoma: responde com o estado, senão
 * dois processos correriam o mesmo grupo ao mesmo tempo.
 */
import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  buildIssuanceGroups,
  type IssuanceGroup,
  requiredIssuancePermissions,
} from '../domain/issuance-confirmation.policy.js'
import {
  type IssuanceJournalDependencies,
  type IssuanceStepFailure,
  runIssuanceJournal,
} from './issuance-journal.service.js'
import type { PreviewEntry } from './preview-nfse-blocks.service.js'
import {
  classifySelectedDocuments,
  digestPreviewEntries,
  freezeIssuancePreview,
  type PreviewDocumentSelectionDependencies,
  type PreviewDocumentSelectionOutcome,
} from './preview-document-selection.use-case.js'
import type {
  WhatsAppCommandRepositoryPort,
  WhatsAppCommandRequest,
} from './whatsapp-command.port.js'
import { summarizeIssuanceVolumetry } from '../domain/issuance-volumetry.policy.js'

export type ConfirmDocumentSelectionDependencies = PreviewDocumentSelectionDependencies &
  IssuanceJournalDependencies &
  Readonly<{
    authorization: Pick<AuthorizationService, 'authorize'>
    commands: Pick<
      WhatsAppCommandRepositoryPort,
      | 'claimForConfirmation'
      | 'createPreview'
      | 'findById'
      | 'listJournal'
      | 'markDispatched'
      | 'markExpired'
      | 'markJournalStep'
      | 'markSuperseded'
    >
  }>

export type ConfirmDocumentSelectionInput = Readonly<{
  actor: AuthenticatedContext<CompanyContext>
  requestId: string
}>

/** A prévia nova quando a base mudou; `restart` quando falta uma pergunta que a antiga não fez. */
export type SupersededPreview = PreviewDocumentSelectionOutcome | Readonly<{ kind: 'restart' }>

export type ConfirmDocumentSelectionOutcome =
  | Readonly<{ kind: 'already_dispatched' }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'in_progress' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'superseded'; next: SupersededPreview }>
  | Readonly<{
      failures: readonly IssuanceStepFailure[]
      issued: number
      kind: 'dispatched'
    }>

export type DocumentSelectionConfirmation = Readonly<{
  confirm(input: ConfirmDocumentSelectionInput): Promise<ConfirmDocumentSelectionOutcome>
  resume(input: ConfirmDocumentSelectionInput): Promise<ConfirmDocumentSelectionOutcome>
}>

type Deps = ConfirmDocumentSelectionDependencies

export function createConfirmDocumentSelectionUseCase(deps: Deps): DocumentSelectionConfirmation {
  return {
    confirm: (input) => confirmSelection(deps, input),
    resume: (input) => resumeSelection(deps, input),
  }
}

async function confirmSelection(
  deps: Deps,
  input: ConfirmDocumentSelectionInput,
): Promise<ConfirmDocumentSelectionOutcome> {
  const request = await findOwnRequest(deps, input)
  if (request === undefined) return { kind: 'not_found' }
  if (request.status !== 'previewed') return describeState(request)

  const groups = buildIssuanceGroups({
    classification: request.classification,
    requestId: request.id,
  })
  if (groups !== undefined && !canIssue(deps, input.actor, groups)) return { kind: 'forbidden' }

  const now = deps.clock()
  if (request.expiresAt.getTime() <= now.getTime()) {
    await deps.commands.markExpired({ companyId: request.companyId, id: request.id, now })
    return { kind: 'expired' }
  }

  const context = input.actor.scope
  const entries = await classifySelectedDocuments({
    context,
    deps,
    documentIds: request.selection,
    period: request.period,
  })
  const previewSha256 = await digestPreviewEntries({
    companyId: context.companyId,
    deps,
    dueDate: request.dueDate,
    entries,
    period: request.period,
  })
  if (groups === undefined || previewSha256 !== request.previewSha256) {
    return supersede(deps, { ...input, entries, request })
  }

  const claimed = await deps.commands.claimForConfirmation({
    companyId: request.companyId,
    id: request.id,
    now,
    previewSha256,
    steps: groups.map((group) => ({
      documentKind: group.kind,
      groupKey: group.groupKey,
      idempotencyKey: group.idempotencyKey,
    })),
  })
  if (claimed === undefined) return describeCurrentState(deps, input)
  return dispatch(deps, { context, groups, request: claimed })
}

async function resumeSelection(
  deps: Deps,
  input: ConfirmDocumentSelectionInput,
): Promise<ConfirmDocumentSelectionOutcome> {
  const request = await findOwnRequest(deps, input)
  if (request === undefined) return { kind: 'not_found' }
  if (request.status !== 'confirming') return describeState(request)

  const groups = buildIssuanceGroups({
    classification: request.classification,
    requestId: request.id,
  })
  // O `claim` só nasce com os grupos congelados: um `confirming` sem eles não existe.
  if (groups === undefined) throw new Error('WHATSAPP_COMMAND_GROUPS_MISSING')
  if (!canIssue(deps, input.actor, groups)) return { kind: 'forbidden' }
  return dispatch(deps, { context: input.actor.scope, groups, request })
}

async function dispatch(
  deps: Deps,
  input: {
    readonly context: CompanyContext
    readonly groups: readonly IssuanceGroup[]
    readonly request: WhatsAppCommandRequest
  },
): Promise<ConfirmDocumentSelectionOutcome> {
  const result = await runIssuanceJournal({ ...input, deps })
  return { failures: result.failures, issued: result.issued, kind: 'dispatched' }
}

/** O pedido é de quem o congelou: id de outro usuário da mesma empresa não é achado. */
async function findOwnRequest(
  deps: Deps,
  input: ConfirmDocumentSelectionInput,
): Promise<WhatsAppCommandRequest | undefined> {
  const { companyId, userId } = input.actor.scope
  const request = await deps.commands.findById({ companyId, id: input.requestId })
  return request?.actorUserId === userId ? request : undefined
}

/** Todas as permissões dos documentos do pedido, pelo mesmo `authorize` do router (D2). */
function canIssue(
  deps: Deps,
  actor: AuthenticatedContext<CompanyContext>,
  groups: readonly IssuanceGroup[],
): boolean {
  return requiredIssuancePermissions(groups).every((permission) => {
    try {
      deps.authorization.authorize(actor, { permission, scope: 'company' })
      return true
    } catch {
      return false
    }
  })
}

async function describeCurrentState(
  deps: Deps,
  input: ConfirmDocumentSelectionInput,
): Promise<ConfirmDocumentSelectionOutcome> {
  const request = await findOwnRequest(deps, input)
  return request === undefined ? { kind: 'not_found' } : describeState(request)
}

function describeState(request: WhatsAppCommandRequest): ConfirmDocumentSelectionOutcome {
  switch (request.status) {
    case 'confirming':
      return { kind: 'in_progress' }
    case 'dispatched':
    case 'settled':
    case 'settled_partial':
      return { kind: 'already_dispatched' }
    case 'expired':
      return { kind: 'expired' }
    case 'previewed':
    case 'superseded':
      return { kind: 'not_found' }
  }
}

/**
 * A base mudou entre a prévia e o toque (D5): nada emite, e sai uma prévia nova com o vencimento e
 * o período já respondidos. Se a prévia nova precisa de uma pergunta que a antiga não fez — CT-e
 * sem vencimento, NFS-e sem período perguntado —, o usuário refaz a seleção.
 */
async function supersede(
  deps: Deps,
  input: ConfirmDocumentSelectionInput &
    Readonly<{ entries: readonly PreviewEntry[]; request: WhatsAppCommandRequest }>,
): Promise<ConfirmDocumentSelectionOutcome> {
  const { entries, request } = input
  const context = input.actor.scope
  const reference = { companyId: request.companyId, id: request.id }
  if (!(await deps.commands.markSuperseded(reference))) return describeCurrentState(deps, input)

  const hasCte = entries.some((entry) => entry.classification.output === 'cte')
  const hasNfse = entries.some((entry) => entry.classification.output === 'nfse')
  const periodWasAsked = request.classification.some(
    (entry) => entry.classification.output === 'nfse',
  )
  if (!hasCte && !hasNfse) {
    return {
      kind: 'superseded',
      next: { kind: 'nothing_to_issue', volumetry: summarizeIssuanceVolumetry(entries) },
    }
  }
  if ((hasCte && request.dueDate === undefined) || (hasNfse && !periodWasAsked)) {
    return { kind: 'superseded', next: { kind: 'restart' } }
  }
  const next = await freezeIssuancePreview({
    context,
    deps,
    dueDate: hasCte ? request.dueDate : undefined,
    entries,
    period: hasNfse ? request.period : undefined,
  })
  return { kind: 'superseded', next }
}
