/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PickupRequestAddress,
  PickupRequestKind,
  PickupRequestSource,
  PickupRequestStatus,
} from '../../database/pickup-request.schema.js'

export type PickupRequestExtras = {
  readonly accessNotes: string | null
  readonly cargoValue: string | null
  readonly destinationContactName: string | null
  readonly destinationContactPhone: string | null
  readonly originContactName: string | null
  readonly originContactPhone: string | null
}

export type PickupRequestRecord = PickupRequestExtras & {
  readonly acceptedTotalAmount: string | null
  readonly acceptedWindowEnd: string | null
  readonly acceptedWindowStart: string | null
  readonly cargoDescription: string
  readonly companyId: string
  readonly contractorId: string | null
  readonly createdAt: Date
  readonly decidedAt: Date | null
  readonly decisionNote: string | null
  readonly destination: PickupRequestAddress
  readonly expiresAt: Date
  readonly id: string
  /** Spec 340: a chave de integração que fez o pedido; nulo nas demais portas. */
  readonly integrationKeyId: string | null
  readonly kind: PickupRequestKind
  readonly note: string | null
  readonly origin: PickupRequestAddress
  readonly quotedTotalAmount: string | null
  readonly quoteValidUntil: string | null
  readonly requesterEmail: string | null
  readonly requesterName: string
  readonly requesterPhone: string | null
  readonly requesterTaxId: string
  readonly source: PickupRequestSource
  readonly staleAlertedAt: Date | null
  readonly status: PickupRequestStatus
  readonly tripId: string | null
  readonly tripStopId: string | null
  readonly volumes: number
  readonly weightKg: string
  readonly windowEnd: string
  readonly windowStart: string
}

export type NewPickupRequest = Partial<PickupRequestExtras> & {
  readonly cargoDescription: string
  readonly companyId: string
  readonly contractorId: string | null
  readonly destination: PickupRequestAddress
  readonly expiresAt: Date
  readonly idempotencyKey: string
  readonly integrationKeyId?: string | null
  readonly kind: PickupRequestKind
  readonly note: string | null
  readonly origin: PickupRequestAddress
  readonly quotedTotalAmount: string | null
  readonly quoteValidUntil: string | null
  readonly requesterEmail: string | null
  readonly requesterName: string
  readonly requesterPhone: string | null
  readonly requesterTaxId: string
  readonly source: PickupRequestSource
  readonly volumes: number
  readonly weightKg: string
  readonly windowEnd: string
  readonly windowStart: string
}

/** O que a transição grava junto com o novo estado. */
export type PickupRequestTransitionPatch = {
  readonly acceptedTotalAmount?: string | null
  readonly acceptedWindowEnd?: string | null
  readonly acceptedWindowStart?: string | null
  /** Pedido anônimo (338/340): o contratante é ligado só na aceitação (D4). */
  readonly contractorId?: string | null
  readonly decidedByUserId?: string | null
  readonly decisionNote?: string | null
  readonly tripId?: string | null
}

export type SuggestedTrip = {
  readonly createdAt: Date
  readonly id: string
  readonly status: string
  readonly stopCount: number
}

export type PickupRequestAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly after: Readonly<Record<string, unknown>>
  readonly before: Readonly<Record<string, unknown>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly requestId: string
}

export type PickupRequestRepositoryPort = {
  /**
   * Spec 339 D4: o cliente do pedido anônimo entra no cadastro só na aceitação. Reaproveita o contratante do mesmo documento
   * na empresa; senão cria um novo, marcado nas observações como "a conferir".
   */
  resolveContractorByTaxId(input: {
    readonly companyId: string
    readonly displayName: string
    readonly taxId: string
  }): Promise<{ readonly contractorId: string; readonly created: boolean }>
  appendAudit(entry: PickupRequestAuditEntry): Promise<void>
  /** Estados que ficaram `requested` além do prazo, de todas as empresas (rotina do cron). */
  expireDue(input: { readonly now: Date }): Promise<readonly PickupRequestRecord[]>
  find(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<PickupRequestRecord | null>
  /** Viagens ainda antes do despacho, da empresa, para a sugestão de encaixe. */
  listOpenTrips(input: {
    readonly companyId: string
    readonly limit: number
  }): Promise<readonly SuggestedTrip[]>
  listForContractor(input: {
    readonly companyId: string
    readonly contractorIds: readonly string[]
    readonly limit: number
  }): Promise<readonly PickupRequestRecord[]>
  listForOffice(input: {
    readonly companyId: string
    readonly limit: number
    readonly status: PickupRequestStatus | undefined
  }): Promise<readonly PickupRequestRecord[]>
  /** `requested` há tempo demais e ainda sem alerta, de todas as empresas (rotina do cron). */
  listStale(input: { readonly olderThan: Date }): Promise<readonly PickupRequestRecord[]>
  markAlerted(input: { readonly ids: readonly string[]; readonly now: Date }): Promise<void>
  /** Idempotente por (empresa, origem, chave): repetir o envio devolve o mesmo pedido, `created: false`. */
  insert(input: NewPickupRequest): Promise<{
    readonly created: boolean
    readonly record: PickupRequestRecord
  }>
  isTripOpen(input: { readonly companyId: string; readonly tripId: string }): Promise<boolean>
  /**
   * `UPDATE ... WHERE status = :from` — quem gravar primeiro vence e o outro recebe `null`. É a
   * única escrita de estado, e é por ela que "aceitar" e "cancelar" ao mesmo tempo não se atropelam.
   */
  transition(input: {
    readonly companyId: string
    readonly from: PickupRequestStatus
    readonly id: string
    readonly patch: PickupRequestTransitionPatch
    readonly to: PickupRequestStatus
    /** Escopo do contratante: o cliente só mexe no pedido dele. Ausente é o escritório. */
    readonly contractorIds?: readonly string[]
    /** Escopo da chave de integração: ela só mexe no pedido que ela mesma fez. */
    readonly integrationKeyId?: string
  }): Promise<PickupRequestRecord | null>
}
