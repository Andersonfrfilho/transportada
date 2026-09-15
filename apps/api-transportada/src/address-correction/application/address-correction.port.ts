/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AddressCorrectionRequestStatus } from '../../database/address-correction.schema.js'

export type AddressFields = {
  readonly street: string
  readonly number: string
  readonly complement: string | null
  readonly district: string | null
  readonly cityCode: string
  readonly city: string
  readonly state: string
  readonly postalCode: string
}

export type AddressCorrectionRequest = {
  readonly id: string
  readonly companyId: string
  readonly contractorId: string
  readonly addressKey: string
  readonly reported: AddressFields
  readonly proposed: AddressFields
  readonly reasonMatchLevel: string
  /** `numeric` do banco, em texto — nunca float binário. */
  readonly reasonDistanceMetres: string | null
  readonly recipientName: string | null
  readonly status: AddressCorrectionRequestStatus
  readonly threadId: string | null
  readonly actorUserId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly sentAt: Date | null
}

export type AddressCorrectionContractor = {
  readonly id: string
  readonly displayName: string
}

export type FindContractorByTaxIdParams = {
  readonly companyId: string
  readonly taxId: string
}

export type UpsertAddressCorrectionDraftParams = {
  readonly companyId: string
  readonly contractorId: string
  readonly addressKey: string
  readonly reported: AddressFields
  readonly proposed: AddressFields
  readonly reasonMatchLevel: string
  readonly reasonDistanceMetres: string | null
  readonly recipientName: string | null
  readonly actorUserId: string | null
}

export type FindAddressCorrectionsByAddressKeysParams = {
  readonly companyId: string
  readonly addressKeys: readonly string[]
}

export type ListAddressCorrectionDraftsByContractorParams = {
  readonly companyId: string
  readonly contractorId: string
}

/** Toda operação recebe `companyId` do contexto autenticado e filtra por ele. */
export type AddressCorrectionRepositoryPort = {
  findContractorByTaxId(
    params: FindContractorByTaxIdParams,
  ): Promise<AddressCorrectionContractor | undefined>
  /** Salvar de novo atualiza o rascunho da chave; um pedido `sent` nunca é reaberto. */
  upsertDraft(params: UpsertAddressCorrectionDraftParams): Promise<AddressCorrectionRequest>
  findByAddressKeys(
    params: FindAddressCorrectionsByAddressKeysParams,
  ): Promise<readonly AddressCorrectionRequest[]>
  listDraftsByContractor(
    params: ListAddressCorrectionDraftsByContractorParams,
  ): Promise<readonly AddressCorrectionRequest[]>
}
