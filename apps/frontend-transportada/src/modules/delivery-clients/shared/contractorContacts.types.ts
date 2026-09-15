/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve — o bundle não carrega código de lá. */
export type ContractorContactStatus = 'active' | 'inactive'

export type ContractorContact = Readonly<{
  canDecide: boolean
  contractorId: string
  email: string
  id: string
  receivesOccurrences: boolean
  status: ContractorContactStatus
}>

export const CONTRACTOR_CONTACT_KEYS = [
  'canDecide',
  'contractorId',
  'email',
  'id',
  'receivesOccurrences',
  'status',
] as const

/** Lista curta — só o necessário para o seletor de contratante deste painel. */
export type ContractorSummary = Readonly<{ displayName: string; id: string; taxId: string }>

/**
 * A resposta de `GET /contractors` traz o agregado inteiro — a guarda de chaves (`security.md` §8)
 * confere a forma completa mesmo que este painel só use três campos dela.
 */
export const CONTRACTOR_KEYS = [
  'closingPeriod',
  'displayName',
  'id',
  'notes',
  'reportEmail',
  'status',
  'taxId',
] as const
