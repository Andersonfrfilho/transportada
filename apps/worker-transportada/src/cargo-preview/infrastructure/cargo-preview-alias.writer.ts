/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 7: `Company` ↔ CNPJ do destinatário, aprendido só de linha `matched` (a política
 * nunca aprende de sugestão nem de ambiguidade, e `matched` sempre tem reforço). Medido 1:1. Revisão de
 * segurança S6: um vínculo reforçado que contradiz o par gravado INVALIDA o par — nunca o troca; o
 * código volta a ser aprendido só de um vínculo novo, e o conflito é contado no log.
 */
import { and, eq } from 'drizzle-orm'

import type {
  CargoPreviewCandidateDocument,
  RecipientAlias,
  ResolveCargoPreviewMatchesResult,
} from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import { contractorRecipientAliases } from '../../database/cargo-preview-trail.schema.js'
import { CARGO_PREVIEW_ITEM_STATE } from '../../shared/cargo-preview.constant.js'
import type { Transaction } from './cargo-preview-match.store.js'

/** O CNPJ/CPF vem do XML de terceiro: fora do formato do CHECK, não vira par. */
const TAX_ID = /^([0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/u

export type LearnAliasesInput = {
  readonly aliases: readonly RecipientAlias[]
  readonly candidates: readonly CargoPreviewCandidateDocument[]
  readonly companyId: string
  readonly contractorId: string
  readonly items: readonly { readonly id: string; readonly recipientCode: string | null }[]
  readonly previewId: string
  readonly result: ResolveCargoPreviewMatchesResult
}

/** Linhas vinculadas cujo código já tem par com OUTRO CNPJ: o conflito e o par contrariado. */
export function findAliasConflicts(input: LearnAliasesInput): {
  readonly conflicts: number
  readonly contradicted: readonly RecipientAlias[]
} {
  const known = new Map(input.aliases.map((alias) => [alias.recipientCode, alias.recipientTaxId]))
  const taxIdOf = new Map(
    input.candidates.map((document) => [document.id, document.recipientTaxId]),
  )
  const codeOf = new Map(input.items.map((item) => [item.id, item.recipientCode]))
  const contradicted = new Map<string, string>()
  const conflicts = input.result.items.filter((match) => {
    if (match.state !== CARGO_PREVIEW_ITEM_STATE.matched) return false
    const code = codeOf.get(match.itemKey)
    const taxId = taxIdOf.get(match.documentIds[0] ?? '')
    const knownTaxId = code === null || code === undefined ? undefined : known.get(code)
    if (knownTaxId === undefined || taxId === undefined || knownTaxId === taxId) return false
    contradicted.set(code ?? '', knownTaxId)
    return true
  }).length
  const pairs = [...contradicted.entries()].map(([recipientCode, recipientTaxId]) => ({
    recipientCode,
    recipientTaxId,
  }))
  return { conflicts, contradicted: pairs }
}

async function revokeAliases(
  tx: Transaction,
  input: LearnAliasesInput & { readonly aliases: readonly RecipientAlias[] },
): Promise<void> {
  for (const alias of input.aliases) {
    await tx
      .delete(contractorRecipientAliases)
      .where(
        and(
          eq(contractorRecipientAliases.companyId, input.companyId),
          eq(contractorRecipientAliases.contractorId, input.contractorId),
          eq(contractorRecipientAliases.recipientCode, alias.recipientCode),
          eq(contractorRecipientAliases.recipientTaxId, alias.recipientTaxId),
        ),
      )
  }
}

export async function learnRecipientAliases(
  tx: Transaction,
  input: LearnAliasesInput,
): Promise<{
  readonly conflicts: number
  readonly learned: readonly RecipientAlias[]
  readonly revoked: readonly RecipientAlias[]
}> {
  const learned = input.result.learnedAliases.filter((alias) => TAX_ID.test(alias.recipientTaxId))
  if (learned.length > 0) {
    await tx
      .insert(contractorRecipientAliases)
      .values(
        learned.map((alias) => ({
          companyId: input.companyId,
          contractorId: input.contractorId,
          learnedFromPreviewId: input.previewId,
          recipientCode: alias.recipientCode,
          recipientTaxId: alias.recipientTaxId,
        })),
      )
      .onConflictDoNothing()
  }
  const { conflicts, contradicted } = findAliasConflicts(input)
  await revokeAliases(tx, { ...input, aliases: contradicted })
  return { conflicts, learned, revoked: contradicted }
}
