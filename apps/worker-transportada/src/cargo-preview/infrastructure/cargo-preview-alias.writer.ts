/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 7: `Company` ↔ CNPJ do destinatário, aprendido só de linha `matched` (a política
 * nunca aprende de sugestão nem de ambiguidade). Medido 1:1; um conflito novo mantém o par gravado e
 * só é contado — quem decide se o cadastro do contratante mudou é gente, não o worker.
 */
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

/** Linha vinculada cujo código já tem par com OUTRO CNPJ: o par fica, o conflito é contado. */
export function countAliasConflicts(input: LearnAliasesInput): number {
  const known = new Map(input.aliases.map((alias) => [alias.recipientCode, alias.recipientTaxId]))
  const taxIdOf = new Map(
    input.candidates.map((document) => [document.id, document.recipientTaxId]),
  )
  const codeOf = new Map(input.items.map((item) => [item.id, item.recipientCode]))
  return input.result.items.filter((match) => {
    if (match.state !== CARGO_PREVIEW_ITEM_STATE.matched) return false
    const code = codeOf.get(match.itemKey)
    const taxId = taxIdOf.get(match.documentIds[0] ?? '')
    const knownTaxId = code === null || code === undefined ? undefined : known.get(code)
    return knownTaxId !== undefined && taxId !== undefined && knownTaxId !== taxId
  }).length
}

export async function learnRecipientAliases(
  tx: Transaction,
  input: LearnAliasesInput,
): Promise<{ readonly conflicts: number; readonly learned: readonly RecipientAlias[] }> {
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
  return { conflicts: countAliasConflicts(input), learned }
}
