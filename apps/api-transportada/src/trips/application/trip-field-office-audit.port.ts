/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §2, security.md §10: cada ação do escritório em nome do motorista é sensível — ela
 * encerra entrega que outra pessoa fez — e grava trilha própria em `audit_logs`.
 *
 * Spec 156 T15 M11/seg B1: a linha nasce **dentro** da transação da ação, e só quando a ação fez
 * alguma coisa — o reenvio idempotente e o toque repetido (`changed: false`) não gravam de novo.
 */
import type { FieldTripLocator } from './field-trip-target.types.js'

/** O que só a rota sabe: qual ação, a requisição e o IP. */
export type OfficeAuditRequest = {
  readonly action: string
  readonly correlationId: string
  /** `security.md` §10: ator, alvo, IP e timestamp — o IP viaja em `metadata`, sem coluna própria. */
  readonly ipAddress: string
}

/** Os alvos da ação, por id opaco — nunca dado de negócio (`security.md` §1). */
export type OfficeAuditDetails = {
  readonly documentId?: string
  /** Spec 156 T7.3: as notas de um lote. */
  readonly documentIds?: readonly string[]
  /** Spec 156 T15 M1: o objeto do canhoto do escritório que o `field-proof` substituiu. */
  readonly replacedObjectId?: string | null
  readonly stopId?: string
}

export type TripFieldOfficeAuditInput = OfficeAuditRequest &
  OfficeAuditDetails & {
    readonly actorUserId: string
    readonly companyId: string
    readonly onBehalfOfDriverId: string
    readonly tripId: string
  }

/**
 * Monta a linha de auditoria quando a ação é do escritório (`target`) e a rota mandou o pedido.
 * `undefined` para o motorista — a trilha dele é o próprio registro de campo.
 */
export function buildOfficeAuditEntry(params: {
  readonly actorUserId: string
  readonly audit: OfficeAuditRequest | undefined
  readonly companyId: string
  readonly details: OfficeAuditDetails
  readonly locator: FieldTripLocator
}): TripFieldOfficeAuditInput | undefined {
  const { audit, locator } = params
  if (audit === undefined || locator.target === undefined) return undefined

  return {
    ...audit,
    ...params.details,
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    onBehalfOfDriverId: locator.target.onBehalfOfDriverId,
    tripId: locator.target.tripId,
  }
}
