/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167: a porta transacional compartilhada por `correct-occurrence-items.use-case.ts` e
 * `cancel-occurrence.use-case.ts`. ⚠️ **A leitura da tratativa e a escrita acontecem na mesma
 * transação** — `hasOpenCase` é chamada de dentro de `execute`, nunca antes: ler fora dela deixaria
 * a janela entre "não tem tratativa" e "abriu agora", a única barreira entre corrigir/cancelar e
 * mexer em dinheiro.
 */
import type { OccurrenceItemQuantity } from '../domain/occurrence-item-quantity.policy.js'
import type {
  OccurrenceTypeRecord,
  TripOccurrence,
  TripOccurrenceAuthorship,
  TripOccurrenceAttachmentPosition,
} from './register-trip-occurrence.use-case.js'

export type LockedOccurrenceRow = {
  readonly cancelledAt: null | string
  readonly occurrenceTypeId: string
  readonly tripDocumentId: string
  readonly tripId: string
}

/** O que a leitura publica depois de corrigir/cancelar (RF9): a ocorrência mais os dois campos novos. */
export type OccurrenceCorrectionEntry = {
  readonly correctedAt: string
  readonly correctedByName: null | string
  readonly previousItems: readonly OccurrenceItemQuantity[]
}

export type OccurrenceCancellationView = {
  readonly cancelledAt: string
  readonly cancelledByName: null | string
  readonly reason: string
}

/**
 * ⚠️ `attachments` só traz `id`/`position` — sem URL assinada, no molde do que `saveOccurrence`
 * devolve (D5): resolver `downloadUrl`/`thumbnailUrl` depende do gateway de storage, que não é
 * concern da transação. A rota/wiring (`main.ts`) enriquece, no mesmo padrão de `listTripOccurrences`.
 */
export type CorrectedOccurrenceView = TripOccurrence &
  TripOccurrenceAuthorship & {
    readonly attachments: readonly TripOccurrenceAttachmentPosition[]
    readonly cancellation: null | OccurrenceCancellationView
    readonly corrections: readonly OccurrenceCorrectionEntry[]
    readonly productCodes: readonly string[]
    readonly products: readonly OccurrenceItemQuantity[]
  }

export type OccurrenceCorrectionTransactionPort = {
  /** `select … for no key update` — trava a linha antes de qualquer decisão (T302). */
  lockOccurrence(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<LockedOccurrenceRow | null>
  /** Existe linha em `trip_occurrence_cases` para esta ocorrência — a janela que fecha RF4/RF8. */
  hasOpenCase(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<boolean>
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<OccurrenceTypeRecord | null>
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly { readonly code: string; readonly description: string }[]>
  listCurrentItems(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<readonly OccurrenceItemQuantity[]>
  /** Substitui o conjunto inteiro (RF2) e regrava `product_code` com o primeiro item, para quem ainda lê dela. */
  replaceItems(input: {
    readonly companyId: string
    readonly items: readonly OccurrenceItemQuantity[]
    readonly occurrenceId: string
    readonly productCode: string
  }): Promise<void>
  insertCorrection(input: {
    readonly companyId: string
    readonly correctedByUserId: string
    readonly occurrenceId: string
    readonly previousItems: readonly OccurrenceItemQuantity[]
  }): Promise<void>
  writeCancellation(input: {
    readonly cancelledByUserId: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly reason: string
  }): Promise<void>
  readOccurrenceView(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<CorrectedOccurrenceView>
}

export type OccurrenceCorrectionUnitOfWork = {
  execute<TResult>(
    operation: (transaction: OccurrenceCorrectionTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
