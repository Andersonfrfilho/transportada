/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'

/**
 * Spec 147 D2/RF9: hoje só o cadastro antigo de carroceria. A página nasce genérica, com um tipo
 * só, para receber outros depois.
 */
export type PendingItemKind = 'addressSuggestedByDriver' | 'vehicleBodyTypeMissing'

export type PendingItem = {
  /** Só ordena a mescla de duas fontes; a resposta HTTP não o leva. */
  readonly createdAt?: Date
  /** Spec 294 T3.2: o que a tela precisa para decidir sem outra leitura (ponto sugerido e distância). */
  readonly details?: Readonly<Record<string, null | number | string>>
  readonly entityId: string
  readonly entityType: 'addressSuggestion' | 'vehicle'
  readonly kind: PendingItemKind
  /** Placa (veículo) ou o endereço da parada (sugestão): não carrega dado de motorista. */
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
