/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: o vínculo de um contratante, numa transação com a trava advisory dele — a mesma das
 * ações do operador na API (`buildCargoPreviewMatchLockKey`, paridade). Duas reavaliações simultâneas
 * se enfileiram na trava e a segunda já encontra as notas ligadas: nenhuma nota vai a dois grupos, e
 * o resultado não depende da ordem. As prévias são vinculadas da mais antiga para a mais nova. A
 * trava também é das ações do operador: cada prévia tem orçamento, e cada consulta tem prazo.
 */
import { sql } from 'drizzle-orm'

import { resolveCargoPreviewMatches } from '../../cargo-receiving/domain/cargo-preview-matching.policy.js'
import type {
  MatchingBudget,
  RecipientAlias,
} from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import type { MonotonicClock } from '../../cargo-receiving/domain/cargo-preview-workbook.types.js'
import { CargoPreviewMatchTimeoutError } from '../application/cargo-preview-match-timeout.error.js'
import { buildCargoPreviewMatchLockKey } from '../domain/cargo-preview-lock.policy.js'
import { CARGO_PREVIEW_MATCH_STATEMENT_TIMEOUT_MS } from '../domain/cargo-preview-match-budget.constant.js'
import { diffPreviewMatches } from '../domain/cargo-preview-match-diff.policy.js'
import { selectCandidateDocuments } from './cargo-preview-candidate.query.js'
import { learnRecipientAliases } from './cargo-preview-alias.writer.js'
import {
  loadAliases,
  loadContext,
  selectPreviews,
  type MatchingContext,
} from './cargo-preview-matching-context.query.js'
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
  readonly createBudget: () => MatchingBudget
  readonly now: Date
}

export type MatchContractorResult = {
  readonly aliasConflicts: number
  readonly changedItems: number
  readonly matchTimeouts: number
  readonly previews: number
  readonly timedOutPreviewIds: readonly string[]
}

/** O prazo corre a partir da primeira consulta ao orçamento de cada prévia. */
export function createMatchBudget(input: {
  readonly budgetMs: number
  readonly clock: MonotonicClock
}): MatchingBudget {
  const startedAt = input.clock()
  return {
    check: () => {
      if (input.clock() - startedAt > input.budgetMs) throw new CargoPreviewMatchTimeoutError()
    },
  }
}

type PreviewOutcome = {
  readonly aliasConflicts: number
  readonly changedItems: number
  readonly learned: readonly RecipientAlias[]
}

const EMPTY_RESULT: MatchContractorResult = {
  aliasConflicts: 0,
  changedItems: 0,
  matchTimeouts: 0,
  previews: 0,
  timedOutPreviewIds: [],
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
    readonly createBudget: () => MatchingBudget
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
    loadReferenceLabel: input.context.arrivalReferenceLabel,
    to: new Date(Math.min(input.now.getTime(), receivedMs + windowMs)),
  })
  const result = resolveCargoPreviewMatches({
    budget: input.createBudget(),
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

/** O orçamento só é consultado dentro da política, antes de qualquer escrita da prévia. */
async function matchPreviewWithinBudget(
  tx: Transaction,
  input: Parameters<typeof matchPreview>[1],
): Promise<PreviewOutcome | undefined> {
  try {
    return await matchPreview(tx, input)
  } catch (error) {
    if (error instanceof CargoPreviewMatchTimeoutError) return undefined
    throw error
  }
}

export async function matchContractorPreviews(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<MatchContractorResult> {
  // Constante numérica do código, nunca entrada: `SET` não aceita parâmetro.
  await tx.execute(
    sql.raw(`set local statement_timeout = ${CARGO_PREVIEW_MATCH_STATEMENT_TIMEOUT_MS}`),
  )
  await lockContractorMatching(tx, buildCargoPreviewMatchLockKey(params))
  const context = await loadContext(tx, params)
  if (context === undefined) return EMPTY_RESULT
  const previews = await selectPreviews(tx, { ...params, windowDays: context.matchWindowDays })
  const aliases = await loadAliases(tx, params)
  let changedItems = 0
  let aliasConflicts = 0
  const timedOutPreviewIds: string[] = []
  // Em série de propósito: a nota que a prévia mais antiga pegou não é candidata da seguinte.
  for (const preview of previews) {
    const outcome = await matchPreviewWithinBudget(tx, { ...params, aliases, context, preview })
    if (outcome === undefined) {
      timedOutPreviewIds.push(preview.id)
      continue
    }
    changedItems += outcome.changedItems
    aliasConflicts += outcome.aliasConflicts
    aliases.push(...outcome.learned)
  }
  return {
    aliasConflicts,
    changedItems,
    matchTimeouts: timedOutPreviewIds.length,
    previews: previews.length,
    timedOutPreviewIds,
  }
}
