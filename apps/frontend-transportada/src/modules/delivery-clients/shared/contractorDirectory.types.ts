/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve — o bundle não carrega código de lá. */
export const CONTRACTOR_STATUSES = ['active', 'inactive'] as const
export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number]

export const CONTRACTOR_CLOSING_PERIODS = ['fortnightly', 'monthly'] as const
export type ContractorClosingPeriod = (typeof CONTRACTOR_CLOSING_PERIODS)[number]

export type Contractor = Readonly<{
  closingPeriod: ContractorClosingPeriod
  displayName: string
  id: string
  notes: string
  /** Vazio é lote que se exporta à mão — e é o padrão, não erro. */
  reportEmail: string
  status: ContractorStatus
  /** O CNPJ só leitura: é a identidade do contratante, nunca editada aqui. */
  taxId: string
}>

export type ContractorWrite = Readonly<{
  closingPeriod?: ContractorClosingPeriod
  displayName?: string
  notes?: string
  reportEmail?: string
  status?: ContractorStatus
}>

export type ContractorPage = Readonly<{
  items: readonly Contractor[]
  nextCursor: string | null
}>

export const CONTRACTOR_WRITE_LIMITS = {
  displayNameMaxLength: 200,
  notesMaxLength: 2000,
} as const

export const CONTRACTOR_DIRECTORY_PATH = '/contractors'

export const CONTRACTOR_DIRECTORY_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const
