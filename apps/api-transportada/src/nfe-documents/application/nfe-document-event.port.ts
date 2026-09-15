/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

/**
 * Spec 149 D16 — o vínculo pode ser apagado fisicamente, e a trilha não pode expor o id cru quando
 * isso acontece (H13): sem membership ativa na mesma empresa, o autor vira `null` por inteiro, nunca
 * `{ id, name: null }`. `origin` chega `'unknown'` para o evento gravado antes desta spec (D17).
 */
export type NfeDocumentEventActor = {
  readonly id: string
  readonly name: string
}

export type NfeDocumentEventEntry = {
  readonly correctionText: string | null
  readonly eventType: string | null
  readonly id: string
  readonly kind: 'event' | 'statusChange'
  readonly occurredAt: string | null
  readonly origin: 'automatic' | 'manual' | 'unknown'
  readonly actor: NfeDocumentEventActor | null
  readonly protocol: string | null
  readonly registeredAt: string
  readonly requestedBy: NfeDocumentEventActor | null
  readonly sequence: string | null
  readonly statusAfter: NfeDocumentStatus | null
  readonly statusBefore: NfeDocumentStatus | null
  readonly statusCode: string | null
}

export type NfeDocumentEventPage = {
  readonly items: readonly NfeDocumentEventEntry[]
  readonly nextCursor: string | null
}

export type NfeDocumentEventRepositoryPort = {
  listEvents(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly documentId: string
    readonly limit: number
  }): Promise<NfeDocumentEventPage>
}
