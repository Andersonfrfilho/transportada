/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'

/**
 * Spec 147 D2/RF9: hoje só o cadastro antigo de carroceria. A página nasce genérica, com um tipo
 * só, para receber outros depois.
 */
export type PendingItemKind = 'vehicleBodyTypeMissing'

export type PendingItem = {
  readonly entityId: string
  readonly entityType: 'vehicle'
  readonly kind: PendingItemKind
  /** Placa: não é PII, e não carrega dado de motorista. */
  readonly label: string
}

export type PendingItemPage = {
  readonly items: readonly PendingItem[]
  readonly nextCursor: string | null
}

export type ListPendingItemSourceInput = {
  readonly companyId: string
  readonly cursor: string | null
  readonly limit: number
}

/**
 * Cada tipo de pendência é uma porta com a permissão que exige. Quem não tem essa permissão nem
 * chega a consultar a fonte — o filtro é por fonte, não por rota (a rota aceita qualquer membro
 * autenticado da empresa).
 */
export type PendingItemSourcePort = {
  readonly kind: PendingItemKind
  readonly list: (input: ListPendingItemSourceInput) => Promise<PendingItemPage>
  readonly requiredPermission: CompanyPermission
}
