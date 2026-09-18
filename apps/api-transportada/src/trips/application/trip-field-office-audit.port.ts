/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §2, security.md §10: cada ação do escritório em nome do motorista é sensível — ela
 * encerra entrega que outra pessoa fez — e grava trilha própria em `audit_logs`.
 */
export type TripFieldOfficeAuditInput = {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  /** Spec 156 T7.3: as notas de um lote, por id opaco — nunca dado de negócio. */
  readonly documentIds?: readonly string[]
  /** `security.md` §10: ator, alvo, IP e timestamp — o IP viaja em `metadata`, sem coluna própria. */
  readonly ipAddress: string
  readonly onBehalfOfDriverId: string
  /** Spec 156 T15 M1: o objeto do canhoto do escritório que o `field-proof` substituiu. */
  readonly replacedObjectId?: string | null
  readonly tripId: string
}

export type TripFieldOfficeAuditPort = {
  record(input: TripFieldOfficeAuditInput): Promise<void>
}
