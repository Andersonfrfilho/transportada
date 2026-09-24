/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — a prévia da emissão por seleção (D4, D5). Resolve as notas do critério dentro da
 * empresa, classifica pela **porta da listagem** (T010) e marca como bloqueado, já na prévia, o que
 * derrubaria a emissão depois (`preview-nfse-blocks.service.ts`). Acima do teto do lote recusa com
 * o número achado — truncar calado emitiria parte do que o operador pediu.
 *
 * A confirmação (T013) recalcula o hash pelas mesmas funções exportadas aqui — classificar, resumir
 * e congelar —, nunca por um caminho paralelo que pudesse discordar da prévia mostrada.
 */
import { CTE_BATCH_MAX_DOCUMENTS } from '../../cte-batches/domain/cte-batch-limits.constant.js'
import type { WhatsAppCommandClassificationEntry } from '../../database/whatsapp-command.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  DocumentOutputDescription,
  NfeDocumentOutputClassifierPort,
} from '../../nfe-documents/application/nfe-document.types.js'
import { resolveDueDate } from '../domain/document-selection.policy.js'
import { buildIssuanceGroups, listIssuanceKeys } from '../domain/issuance-confirmation.policy.js'
import { assertIdempotencyKeys } from '../domain/issuance-idempotency.policy.js'
import {
  buildPreviewDigest,
  type PreviewProfileVersion,
} from '../domain/issuance-preview-digest.policy.js'
import {
  type IssuanceVolumetry,
  summarizeIssuanceVolumetry,
} from '../domain/issuance-volumetry.policy.js'
import { ISSUANCE_PREVIEW_TTL_MINUTES } from '../domain/whatsapp-issuance-flow.constant.js'
import type {
  DocumentSelectionCriterion,
  DocumentSelectionRepositoryPort,
} from './document-selection.port.js'
import {
  applyNfseBlocks,
  normalizePeriod,
  type PreviewEntry,
  type PreviewNfseDependencies,
} from './preview-nfse-blocks.service.js'
import type { WhatsAppCommandRepositoryPort } from './whatsapp-command.port.js'

const MINUTE_MS = 60_000

export type PreviewDocumentSelectionDependencies = PreviewNfseDependencies &
  Readonly<{
    classifier: Pick<NfeDocumentOutputClassifierPort, 'describeDocumentOutputs'>
    clock: () => Date
    commands: Pick<WhatsAppCommandRepositoryPort, 'createPreview'>
    generateId: () => string
    selection: Pick<
      DocumentSelectionRepositoryPort,
      'findCteProfileNames' | 'findNfseProfileVersions' | 'resolveSelection'
    >
  }>

export type PreviewDocumentSelectionInput = Readonly<{
  context: CompanyContext
  criterion: DocumentSelectionCriterion
  /** `undefined` é "ainda não perguntado"; o bot pergunta só se houver CT-e. */
  dueDays: number | undefined
  /** `undefined` é "ainda não perguntado"; `''` é "Pular", e em branco é omitido como na tela. */
  period: string | undefined
}>

export type PreviewDocumentSelectionOutcome =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ found: number; kind: 'too_many'; limit: number }>
  | Readonly<{ kind: 'needs_due_date' }>
  | Readonly<{ kind: 'needs_period' }>
  | Readonly<{ kind: 'no_membership' }>
  | Readonly<{ kind: 'nothing_to_issue'; volumetry: IssuanceVolumetry }>
  | Readonly<{
      expiresAt: Date
      kind: 'previewed'
      requestId: string
      volumetry: IssuanceVolumetry
    }>

export type PreviewDocumentSelection = (
  input: PreviewDocumentSelectionInput,
) => Promise<PreviewDocumentSelectionOutcome>

/** O que a prévia congela: vencimento e período já resolvidos, como vão para o pedido. */
export type FreezeIssuancePreviewInput = Readonly<{
  context: CompanyContext
  deps: PreviewDocumentSelectionDependencies
  dueDate: string | undefined
  entries: readonly PreviewEntry[]
  period: string | undefined
}>

export function createPreviewDocumentSelectionUseCase(
  deps: PreviewDocumentSelectionDependencies,
): PreviewDocumentSelection {
  return async (input) => {
    const { companyId } = input.context
    const selection = await deps.selection.resolveSelection({
      companyId,
      criterion: input.criterion,
      limit: CTE_BATCH_MAX_DOCUMENTS,
    })
    if (selection.total > CTE_BATCH_MAX_DOCUMENTS) {
      return { found: selection.total, kind: 'too_many', limit: CTE_BATCH_MAX_DOCUMENTS }
    }
    if (selection.documentIds.length === 0) return { kind: 'empty' }

    const entries = await classifySelectedDocuments({
      context: input.context,
      deps,
      documentIds: selection.documentIds,
      period: input.period,
    })
    if (entries.length === 0) return { kind: 'empty' }
    return concludePreview({ deps, entries, input })
  }
}

/** Classificação da listagem mais os bloqueios que derrubariam a NFS-e depois (D3, D5). */
export async function classifySelectedDocuments(input: {
  readonly context: CompanyContext
  readonly deps: Pick<
    PreviewDocumentSelectionDependencies,
    'classifier' | 'findNfseCredentialGap' | 'previewNfseInvoices'
  >
  readonly documentIds: readonly string[]
  readonly period: string | undefined
}): Promise<readonly PreviewEntry[]> {
  const { companyId, userId } = input.context
  const described = await input.deps.classifier.describeDocumentOutputs({
    companyId: input.context.companyId,
    documentIds: input.documentIds,
  })
  const entries = toEntries(input.documentIds, described)
  const scope = { companyId, period: input.period, userId }
  return applyNfseBlocks({ deps: input.deps, entries, scope })
}

/** O `preview_sha256` sobre o que o usuário vê: notas, vencimento, período e versões dos perfis. */
export async function digestPreviewEntries(input: {
  readonly companyId: string
  readonly deps: Pick<PreviewDocumentSelectionDependencies, 'selection'>
  readonly dueDate: string | undefined
  readonly entries: readonly PreviewEntry[]
  readonly period: string | undefined
}): Promise<string> {
  return buildPreviewDigest({
    dueDate: input.dueDate ?? null,
    entries: input.entries,
    period: input.period ?? null,
    profileVersions: await collectProfileVersions(input.deps, input.companyId, input.entries),
  })
}

/** Nota que a porta não devolveu é de outra empresa ou não existe: fica fora, sem erro. */
function toEntries(
  documentIds: readonly string[],
  described: ReadonlyMap<string, DocumentOutputDescription>,
): PreviewEntry[] {
  return documentIds.flatMap((documentId) => {
    const description = described.get(documentId)
    if (description === undefined) return []
    const { classification, profile } = description
    return [
      {
        classification,
        documentId,
        freightAmount: description.freightAmount,
        nfseProfileId: classification.output === 'nfse' ? classification.nfseProfileId : null,
        number: description.number,
        profileId: profile?.id ?? null,
        profileVersion: profile?.version ?? null,
        takerTaxId: profile?.takerTaxId ?? null,
      },
    ]
  })
}

async function concludePreview(input: {
  readonly deps: PreviewDocumentSelectionDependencies
  readonly entries: readonly PreviewEntry[]
  readonly input: PreviewDocumentSelectionInput
}): Promise<PreviewDocumentSelectionOutcome> {
  const hasCte = input.entries.some((entry) => entry.classification.output === 'cte')
  const hasNfse = input.entries.some((entry) => entry.classification.output === 'nfse')
  const { dueDays } = input.input
  if (hasCte && dueDays === undefined) return { kind: 'needs_due_date' }
  if (hasNfse && input.input.period === undefined) return { kind: 'needs_period' }
  if (!hasCte && !hasNfse) {
    return { kind: 'nothing_to_issue', volumetry: summarizeIssuanceVolumetry(input.entries) }
  }

  const now = input.deps.clock()
  return freezeIssuancePreview({
    context: input.input.context,
    deps: input.deps,
    dueDate: hasCte && dueDays !== undefined ? resolveDueDate({ days: dueDays, now }) : undefined,
    entries: input.entries,
    period: hasNfse ? normalizePeriod(input.input.period) : undefined,
  })
}

/** Congela o pedido com o grupo de cada nota: a confirmação o lê daqui, sem reclassificar. */
export async function freezeIssuancePreview(
  input: FreezeIssuancePreviewInput,
): Promise<PreviewDocumentSelectionOutcome> {
  const { context, deps, dueDate, period } = input
  const now = deps.clock()
  const requestId = deps.generateId()
  const entries = input.entries.toSorted((left, right) =>
    left.documentId.localeCompare(right.documentId),
  )
  const classification = await freezeClassification(deps, context.companyId, entries)
  const groups = buildIssuanceGroups({ classification, requestId }) ?? []
  assertIdempotencyKeys(listIssuanceKeys(groups))

  const previewSha256 = await digestPreviewEntries({
    companyId: context.companyId,
    deps,
    dueDate,
    entries,
    period,
  })
  const expiresAt = new Date(now.getTime() + ISSUANCE_PREVIEW_TTL_MINUTES * MINUTE_MS)
  const request = await deps.commands.createPreview({
    actorUserId: context.userId,
    classification,
    companyId: context.companyId,
    dueDate,
    expiresAt,
    id: requestId,
    kind: 'document_issuance',
    period,
    previewSha256,
    selection: entries.map((entry) => entry.documentId),
  })
  if (request === undefined) return { kind: 'no_membership' }
  const volumetry = summarizeIssuanceVolumetry(entries)
  return { expiresAt, kind: 'previewed', requestId, volumetry }
}

async function freezeClassification(
  deps: PreviewDocumentSelectionDependencies,
  companyId: string,
  entries: readonly PreviewEntry[],
): Promise<readonly WhatsAppCommandClassificationEntry[]> {
  const cteProfileIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.classification.output === 'cte' && entry.profileId !== null ? [entry.profileId] : [],
      ),
    ),
  ]
  const names = await deps.selection.findCteProfileNames({ companyId, profileIds: cteProfileIds })
  return entries.map((entry) => ({
    classification: entry.classification,
    documentId: entry.documentId,
    profileId: entry.profileId,
    profileName: entry.profileId === null ? null : (names.get(entry.profileId) ?? null),
    takerTaxId: entry.takerTaxId,
  }))
}

/** A versão de cada perfil que decidiu alguma nota: o de CT-e que rege, e o de NFS-e para onde mandou. */
async function collectProfileVersions(
  deps: Pick<PreviewDocumentSelectionDependencies, 'selection'>,
  companyId: string,
  entries: readonly PreviewEntry[],
): Promise<readonly PreviewProfileVersion[]> {
  const versions = new Map<string, PreviewProfileVersion>()
  for (const entry of entries) {
    if (entry.profileId === null || entry.profileVersion === null) continue
    const version = { kind: 'cte', profileId: entry.profileId, version: entry.profileVersion }
    versions.set(`cte:${entry.profileId}`, version as PreviewProfileVersion)
  }
  const nfseProfileIds = [...new Set(entries.flatMap(nfseProfileIdOf))]
  if (nfseProfileIds.length === 0) return [...versions.values()]

  const found = await deps.selection.findNfseProfileVersions({
    companyId,
    profileIds: nfseProfileIds,
  })
  for (const profileId of nfseProfileIds) {
    versions.set(`nfse:${profileId}`, {
      kind: 'nfse',
      profileId,
      version: found.get(profileId) ?? '',
    })
  }
  return [...versions.values()]
}

function nfseProfileIdOf(entry: PreviewEntry): readonly string[] {
  return entry.classification.output === 'nfse' && entry.nfseProfileId !== null
    ? [entry.nfseProfileId]
    : []
}
