/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: o vínculo de um contratante, numa transação com a trava advisory dele — a mesma das
 * ações do operador na API (`buildCargoPreviewMatchLockKey`, paridade). Duas reavaliações simultâneas
 * se enfileiram na trava e a segunda já encontra as notas ligadas: nenhuma nota vai a dois grupos, e
 * o resultado não depende da ordem. As prévias são vinculadas da mais antiga para a mais nova.
 */
import { and, asc, eq, gte } from 'drizzle-orm'

import { resolveCargoPreviewMatches } from '../../cargo-receiving/domain/cargo-preview-matching.policy.js'
import type { RecipientAlias } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  contractorReceivingProfiles,
  contractorRecipientAliases,
} from '../../database/cargo-preview-trail.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { CARGO_PREVIEW_STATUS } from '../../shared/cargo-preview.constant.js'
import { buildCargoPreviewMatchLockKey } from '../domain/cargo-preview-lock.policy.js'
import { diffPreviewMatches } from '../domain/cargo-preview-match-diff.policy.js'
import { selectCandidateDocuments } from './cargo-preview-candidate.query.js'
import { learnRecipientAliases } from './cargo-preview-alias.writer.js'
import {
  insertRoutePairs,
  lockContractorMatching,
  selectOpenItems,
  selectRoutePairs,
  writeItemChanges,
  type Transaction,
} from './cargo-preview-match.store.js'

const DAY_MS = 86_400_000

export type MatchContractorParams = {
  readonly companyId: string
  readonly contractorId: string
  readonly now: Date
}

export type MatchContractorResult = {
  readonly aliasConflicts: number
  readonly changedItems: number
  readonly previews: number
}

type MatchingContext = {
  readonly arrivalReferencePattern: string | null
  readonly matchWindowDays: number
  readonly taxId: string
  readonly weightTolerancePercent: number
}

type PreviewOutcome = {
  readonly aliasConflicts: number
  readonly changedItems: number
  readonly learned: readonly RecipientAlias[]
}

const EMPTY_RESULT: MatchContractorResult = { aliasConflicts: 0, changedItems: 0, previews: 0 }

async function loadContext(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<MatchingContext | undefined> {
  const [row] = await tx
    .select({
      arrivalReferencePattern: contractorReceivingProfiles.arrivalReferencePattern,
      matchWindowDays: contractorReceivingProfiles.matchWindowDays,
      taxId: contractors.taxId,
      weightTolerancePercent: contractorReceivingProfiles.weightTolerancePercent,
    })
    .from(contractors)
    .innerJoin(
      contractorReceivingProfiles,
      and(
        eq(contractorReceivingProfiles.companyId, contractors.companyId),
        eq(contractorReceivingProfiles.contractorId, contractors.id),
        eq(contractorReceivingProfiles.isEnabled, true),
        eq(contractorReceivingProfiles.previewEnabled, true),
      ),
    )
    .where(
      and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
    )
  return row === undefined
    ? undefined
    : { ...row, weightTolerancePercent: Number(row.weightTolerancePercent) }
}

/** Passada a janela, nota nova não é mais candidata: a prévia velha não é reavaliada à toa. */
function selectPreviews(
  tx: Transaction,
  input: MatchContractorParams & { readonly windowDays: number },
) {
  return tx
    .select({ id: cargoPreviews.id, receivedAt: cargoPreviews.receivedAt })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, input.companyId),
        eq(cargoPreviews.contractorId, input.contractorId),
        eq(cargoPreviews.status, CARGO_PREVIEW_STATUS.ready),
        gte(cargoPreviews.receivedAt, new Date(input.now.getTime() - input.windowDays * DAY_MS)),
      ),
    )
    .orderBy(asc(cargoPreviews.receivedAt), asc(cargoPreviews.id))
}

async function loadAliases(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<RecipientAlias[]> {
  return tx
    .select({
      recipientCode: contractorRecipientAliases.recipientCode,
      recipientTaxId: contractorRecipientAliases.recipientTaxId,
    })
    .from(contractorRecipientAliases)
    .where(
      and(
        eq(contractorRecipientAliases.companyId, params.companyId),
        eq(contractorRecipientAliases.contractorId, params.contractorId),
      ),
    )
}

function toMatchItem(item: Awaited<ReturnType<typeof selectOpenItems>>[number]) {
  return {
    city: item.city ?? undefined,
    itemKey: item.id,
    postalCode: item.postalCode ?? undefined,
    recipientCode: item.recipientCode ?? undefined,
    recipientName: item.recipientName ?? undefined,
    routeName: item.routeName ?? '',
    value: item.value ?? '',
    weightKg: item.weightKg ?? '',
  }
}

function readList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

async function matchPreview(
  tx: Transaction,
  input: {
    readonly aliases: RecipientAlias[]
    readonly context: MatchingContext
    readonly now: Date
    readonly preview: { readonly id: string; readonly receivedAt: Date }
    readonly companyId: string
    readonly contractorId: string
  },
): Promise<PreviewOutcome> {
  const scope = { companyId: input.companyId, previewId: input.preview.id }
  const items = await selectOpenItems(tx, scope)
  if (items.length === 0) return { aliasConflicts: 0, changedItems: 0, learned: [] }
  const windowMs = input.context.matchWindowDays * DAY_MS
  const receivedMs = input.preview.receivedAt.getTime()
  const candidates = await selectCandidateDocuments(tx, {
    companyId: input.companyId,
    emitterTaxId: input.context.taxId,
    from: new Date(receivedMs - windowMs),
    loadReferencePattern: input.context.arrivalReferencePattern,
    to: new Date(Math.min(input.now.getTime(), receivedMs + windowMs)),
  })
  const result = resolveCargoPreviewMatches({
    candidates,
    items: items.map(toMatchItem),
    knownAliases: input.aliases,
    knownRoutePairs: await selectRoutePairs(tx, scope),
    weightTolerancePercent: input.context.weightTolerancePercent,
  })
  const current = items.map((item) => ({
    candidateDocumentIds: readList(item.matchEvidence?.candidateDocumentIds),
    evidence: readList(item.matchEvidence?.evidence),
    id: item.id,
    matchState: item.matchState,
  }))
  const changes = diffPreviewMatches({ current, matches: result.items })
  await writeItemChanges(tx, { ...scope, changes, now: input.now })
  await insertRoutePairs(tx, { ...scope, pairs: result.routePairs })
  const aliases = await learnRecipientAliases(tx, { ...input, ...scope, candidates, items, result })
  return {
    aliasConflicts: aliases.conflicts,
    changedItems: changes.length,
    learned: aliases.learned,
  }
}

export async function matchContractorPreviews(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<MatchContractorResult> {
  await lockContractorMatching(tx, buildCargoPreviewMatchLockKey(params))
  const context = await loadContext(tx, params)
  if (context === undefined) return EMPTY_RESULT
  const previews = await selectPreviews(tx, { ...params, windowDays: context.matchWindowDays })
  const aliases = await loadAliases(tx, params)
  let changedItems = 0
  let aliasConflicts = 0
  // Em série de propósito: a nota que a prévia mais antiga pegou não é candidata da seguinte.
  for (const preview of previews) {
    const outcome = await matchPreview(tx, { ...params, aliases, context, preview })
    changedItems += outcome.changedItems
    aliasConflicts += outcome.aliasConflicts
    aliases.push(...outcome.learned)
  }
  return { aliasConflicts, changedItems, previews: previews.length }
}
