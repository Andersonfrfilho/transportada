/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CargoPreviewItemActionParams,
  CargoPreviewItemActionResult,
  CargoPreviewItemFilters,
  CargoPreviewUploadGate,
  CreateCargoPreviewRecord,
  CreateCargoPreviewResult,
  ListCargoPreviewsFilters,
} from './cargo-preview-request.types.js'
import type { Paging } from '../../http/request-parsing.service.js'
import type { Page } from './cargo-arrival.types.js'
import type {
  CargoPreviewArrivalProposal,
  CargoPreviewDetail,
  CargoPreviewSummary,
} from './cargo-preview.types.js'

type Scope = { readonly companyId: string }

export type CargoPreviewUploadRepositoryPort = {
  /** Contratante da empresa, chave já usada, arquivo já enviado e perfil ligado — nessa ordem. */
  checkGate(
    params: Scope & {
      readonly contractorId: string
      readonly fileSha256: string
      readonly idempotencyKey: string
      readonly requestFingerprint: string
    },
  ): Promise<CargoPreviewUploadGate>
  /** Uma transação: prévia, evento `uploaded` e o pedido ao worker — ou nada. */
  create(params: CreateCargoPreviewRecord): Promise<CreateCargoPreviewResult>
}

export type CargoPreviewObjectStoragePort = {
  deleteObject(input: { readonly bucket: string; readonly key: string }): Promise<void>
  storeObject(input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }): Promise<unknown>
}

export type CargoPreviewReadRepositoryPort = {
  findDetail(
    params: Scope & { readonly items: CargoPreviewItemFilters; readonly previewId: string },
  ): Promise<CargoPreviewDetail | null>
  findSummary(params: Scope & { readonly previewId: string }): Promise<CargoPreviewSummary | null>
  list(
    params: Scope & { readonly filters: ListCargoPreviewsFilters; readonly paging: Paging },
  ): Promise<Page<CargoPreviewSummary>>
}

export type CargoPreviewActionRepositoryPort = {
  /** Trava o vínculo do contratante (a mesma trava do worker) antes de ler e escrever. */
  applyItemAction(
    params: Omit<CargoPreviewItemActionParams, 'context'> & {
      readonly actorUserId: string
      readonly companyId: string
      readonly now: Date
    },
  ): Promise<CargoPreviewItemActionResult>
  proposeArrival(
    params: Scope & {
      readonly actorUserId: string
      readonly now: Date
      readonly previewId: string
    },
  ): Promise<CargoPreviewArrivalProposal | 'not_found' | 'not_ready'>
}
