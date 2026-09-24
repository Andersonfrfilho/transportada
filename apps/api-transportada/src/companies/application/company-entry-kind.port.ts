/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyEntryKindSide } from '../../database/trip-financial.schema.js'

export type CompanyEntryKind = {
  readonly active: boolean
  readonly displayOrder: number
  readonly id: string
  readonly name: string
  readonly side: CompanyEntryKindSide
}

export type CompanyEntryKindPort = {
  create(input: {
    readonly companyId: string
    readonly name: string
    readonly side: CompanyEntryKindSide
  }): Promise<CompanyEntryKind>
  /** `null` quando a espécie não existe nesta empresa. */
  deactivate(input: {
    readonly companyId: string
    readonly entryKindId: string
  }): Promise<CompanyEntryKind | null>
  existsByName(input: {
    readonly companyId: string
    readonly name: string
    readonly side: CompanyEntryKindSide
  }): Promise<boolean>
  /** Spec 169 RF5: só as ativas do lado certo, na ordem cadastrada — para o seletor do lançamento. */
  listActiveBySide(input: {
    readonly companyId: string
    readonly side: CompanyEntryKindSide
  }): Promise<readonly CompanyEntryKind[]>
  /** Todas as espécies da empresa (ativas e inativas), para a tela de cadastro. */
  listByCompany(input: { readonly companyId: string }): Promise<readonly CompanyEntryKind[]>
}
