/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as portas das respostas rápidas da empresa. Tudo pela empresa do contexto.
 */
import type { CompanyQuickReplyAudience } from '../../database/occurrence-conversation.schema.js'

export type QuickReplyRecord = {
  readonly active: boolean
  readonly audience: CompanyQuickReplyAudience
  readonly bodyText: string
  readonly id: string
  readonly position: number
}

export type QuickRepliesTransactionPort = {
  /** O próximo lugar na fila daquele público — a resposta nova entra no fim. */
  countByAudience(input: {
    readonly audience: CompanyQuickReplyAudience
    readonly companyId: string
  }): Promise<number>
  insert(input: {
    readonly audience: CompanyQuickReplyAudience
    readonly bodyText: string
    readonly companyId: string
    readonly position: number
  }): Promise<QuickReplyRecord>
  list(input: {
    readonly activeOnly: boolean
    readonly audience: CompanyQuickReplyAudience | null
    readonly companyId: string
  }): Promise<readonly QuickReplyRecord[]>
  /** Trava as respostas daquele público, na ordem atual — a reordenação confere o conjunto. */
  lockAudience(input: {
    readonly audience: CompanyQuickReplyAudience
    readonly companyId: string
  }): Promise<readonly QuickReplyRecord[]>
  setPositions(input: {
    readonly companyId: string
    readonly positions: readonly { readonly id: string; readonly position: number }[]
  }): Promise<void>
  /** `null` quando a resposta não existe nesta empresa. */
  update(input: {
    readonly active?: boolean
    readonly bodyText?: string
    readonly companyId: string
    readonly id: string
  }): Promise<QuickReplyRecord | null>
}

export type QuickRepliesUnitOfWorkPort = {
  execute<TResult>(
    work: (transaction: QuickRepliesTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
