/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — a prévia da emissão por seleção (D4, D5). Resolve as notas do critério dentro da
 * empresa, classifica pela **porta da listagem** (T010) e marca como bloqueado, já na prévia, o que
 * derrubaria a emissão depois (`preview-nfse-blocks.service.ts`). Acima do teto do lote recusa com
 * o número achado — truncar calado emitiria parte do que o operador pediu.
 */
import { CTE_BATCH_MAX_DOCUMENTS } from '../../cte-batches/domain/cte-batch-limits.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  DocumentOutputDescription,
  NfeDocumentOutputClassifierPort,
} from '../../nfe-documents/application/nfe-document.types.js'
import { resolveDueDate } from '../domain/document-selection.policy.js'
import {
  assertIdempotencyKeys,
  buildCteBatchIdempotencyKey,
  buildNfseInvoiceIdempotencyKey,
} from '../domain/issuance-idempotency.policy.js'
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
    selection: Pick<DocumentSelectionRepositoryPort, 'findNfseProfileVersions' | 'resolveSelection'>
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

type Conclusion = Readonly<{
  deps: PreviewDocumentSelectionDependencies
  entries: readonly PreviewEntry[]
  input: PreviewDocumentSelectionInput
}>

export function createPreviewDocumentSelectionUseCase(
  deps: PreviewDocumentSelectionDependencies,
): PreviewDocumentSelection {
  return async (input) => {
    const { companyId, userId } = input.context
    const selection = await deps.selection.resolveSelection({
      companyId,
      criterion: input.criterion,
      limit: CTE_BATCH_MAX_DOCUMENTS,
    })
    if (selection.total > CTE_BATCH_MAX_DOCUMENTS) {
      return { found: selection.total, kind: 'too_many', limit: CTE_BATCH_MAX_DOCUMENTS }
    }
    if (selection.documentIds.length === 0) return { kind: 'empty' }

    const described = await deps.classifier.describeDocumentOutputs({
      context: input.context,
      documentIds: selection.documentIds,
    })
    const classified = toEntries(selection.documentIds, described)
    if (classified.length === 0) return { kind: 'empty' }

    const scope = { companyId, period: input.period, userId }
    const entries = await applyNfseBlocks({ deps, entries: classified, scope })
    return concludePreview({ deps, entries, input })
  }
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

async function concludePreview(input: Conclusion): Promise<PreviewDocumentSelectionOutcome> {
  const hasCte = input.entries.some((entry) => entry.classification.output === 'cte')
  const hasNfse = input.entries.some((entry) => entry.classification.output === 'nfse')
  if (hasCte && input.input.dueDays === undefined) return { kind: 'needs_due_date' }
  if (hasNfse && input.input.period === undefined) return { kind: 'needs_period' }

  const volumetry = summarizeIssuanceVolumetry(input.entries)
  if (!hasCte && !hasNfse) return { kind: 'nothing_to_issue', volumetry }
  return freezePreview({ ...input, hasCte, hasNfse, volumetry })
}

async function freezePreview(
  input: Conclusion & Readonly<{ hasCte: boolean; hasNfse: boolean; volumetry: IssuanceVolumetry }>,
): Promise<PreviewDocumentSelectionOutcome> {
  const { context, dueDays } = input.input
  const now = input.deps.clock()
  const requestId = input.deps.generateId()
  const dueDate =
    input.hasCte && dueDays !== undefined ? resolveDueDate({ days: dueDays, now }) : undefined
  const period = input.hasNfse ? normalizePeriod(input.input.period) : undefined
  assertIdempotencyKeys(buildGroupKeys(input.entries, requestId))

  const entries = input.entries.toSorted((left, right) =>
    left.documentId.localeCompare(right.documentId),
  )
  const previewSha256 = buildPreviewDigest({
    dueDate: dueDate ?? null,
    entries,
    period: period ?? null,
    profileVersions: await collectProfileVersions(input.deps, context.companyId, entries),
  })
  const expiresAt = new Date(now.getTime() + ISSUANCE_PREVIEW_TTL_MINUTES * MINUTE_MS)
  const request = await input.deps.commands.createPreview({
    actorUserId: context.userId,
    classification: entries.map(({ classification, documentId }) => ({
      classification,
      documentId,
    })),
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
  return { expiresAt, kind: 'previewed', requestId, volumetry: input.volumetry }
}

/** A versão de cada perfil que decidiu alguma nota: o de CT-e que rege, e o de NFS-e para onde mandou. */
async function collectProfileVersions(
  deps: PreviewDocumentSelectionDependencies,
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

/** As chaves que a confirmação (T013) vai usar: um lote por perfil, uma NFS-e por perfil e tomador. */
function buildGroupKeys(entries: readonly PreviewEntry[], requestId: string): readonly string[] {
  const keys = new Set<string>()
  for (const entry of entries) {
    if (entry.classification.output === 'cte' && entry.profileId !== null) {
      keys.add(buildCteBatchIdempotencyKey({ profileId: entry.profileId, requestId }))
    }
    const [nfseProfileId] = nfseProfileIdOf(entry)
    if (nfseProfileId !== undefined && entry.takerTaxId !== null) {
      keys.add(
        buildNfseInvoiceIdempotencyKey({ nfseProfileId, requestId, takerTaxId: entry.takerTaxId }),
      )
    }
  }
  return [...keys]
}

function nfseProfileIdOf(entry: PreviewEntry): readonly string[] {
  return entry.classification.output === 'nfse' && entry.nfseProfileId !== null
    ? [entry.nfseProfileId]
    : []
}
