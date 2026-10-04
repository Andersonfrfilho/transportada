/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: parâmetros e resultados entre caso de uso e repositório da prévia. Empresa e ator
 * chegam do contexto, nunca do corpo.
 */
import type { Paging } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  CargoPreviewItemState,
  CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewItemAction } from '../domain/cargo-preview-item-action.policy.js'

type ContextParams = { readonly context: CompanyContext }

export type UploadCargoPreviewInput = {
  readonly bytes: Uint8Array
  readonly contractorId: string
  readonly fileName: string
}

export type UploadCargoPreviewParams = ContextParams & {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly input: UploadCargoPreviewInput
}

export type ListCargoPreviewsFilters = {
  readonly contractorId?: string
  readonly status?: CargoPreviewStatus
}

export type ListCargoPreviewsParams = ContextParams & {
  readonly filters: ListCargoPreviewsFilters
  readonly paging: Paging
}

export type CargoPreviewItemFilters = {
  readonly afterRow?: number
  readonly limit: number
  readonly routeName?: string
  readonly state?: CargoPreviewItemState
}

export type GetCargoPreviewParams = ContextParams & {
  readonly items: CargoPreviewItemFilters
  readonly previewId: string
}

export type CargoPreviewItemActionParams = ContextParams & {
  readonly action: CargoPreviewItemAction
  readonly correlationId: string
  readonly documentId?: string
  readonly itemId: string
  readonly previewId: string
}

export type ProposeCargoPreviewArrivalParams = ContextParams & {
  readonly correlationId: string
  readonly previewId: string
}

/** O que o repositório do envio precisa para gravar prévia, evento e pedido ao worker juntos. */
export type CreateCargoPreviewRecord = {
  readonly actorUserId: string
  readonly bucket: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly fileName: string
  readonly fileObjectId: string
  readonly fileSha256: string
  readonly fileSizeBytes: number
  readonly idempotencyKey: string
  readonly objectKey: string
  readonly receivedAt: Date
  readonly requestFingerprint: string
}

export type CreateCargoPreviewResult =
  | { readonly kind: 'created' | 'replayed'; readonly previewId: string }
  | { readonly kind: 'key_reused' }

/** A prévia que já existe para a chave ou o arquivo, com o que decide se ela reabre. */
export type ReplayedCargoPreview = {
  readonly fileObjectId: string
  readonly kind: 'replayed'
  readonly previewId: string
  readonly status: CargoPreviewStatus
  readonly updatedAt: Date
}

export type CargoPreviewUploadGate =
  | { readonly kind: 'contractor_not_found' | 'key_reused' | 'not_enabled' }
  | { readonly kind: 'open' }
  | ReplayedCargoPreview

/** Reabrir: a mesma prévia volta à fila, com evento e pedido novo ao worker, numa transação. */
export type ReopenCargoPreviewRecord = {
  readonly actorUserId: string
  readonly bucket: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly fileSizeBytes: number
  readonly now: Date
  readonly objectKey: string
  readonly previewId: string
}

export type CargoPreviewItemActionResult =
  | { readonly kind: 'changed' | 'unchanged'; readonly itemIds: readonly string[] }
  | { readonly kind: 'document_linked_elsewhere' | 'document_not_candidate' }
  | { readonly kind: 'item_not_found' | 'not_ready' | 'preview_not_found' }
  | { readonly code: string; readonly kind: 'refused' }
