/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve — o bundle não carrega código de lá. */
export type ContractorContactStatus = 'active' | 'inactive'

/** Spec 183 RF5: o que o contato recebe — conjunto fechado, cópia por valor da API. */
export const CONTRACTOR_CONTACT_TYPES = [
  'occurrences',
  'approves_charges',
  'scheduling',
  'invoices',
  'cte_xml',
] as const
export type ContractorContactType = (typeof CONTRACTOR_CONTACT_TYPES)[number]

export const CONTRACTOR_CONTACT_OCCURRENCE_STAGES = ['separation', 'delivery', 'stop'] as const
export type ContractorContactOccurrenceStage = (typeof CONTRACTOR_CONTACT_OCCURRENCE_STAGES)[number]

export const CONTRACTOR_CONTACT_CHANNELS = ['email', 'whatsapp'] as const
export type ContractorContactChannel = (typeof CONTRACTOR_CONTACT_CHANNELS)[number]

export type ContractorContact = Readonly<{
  canDecide: boolean
  contractorId: string
  email: string
  id: string
  name: string
  occurrenceStages: readonly ContractorContactOccurrenceStage[]
  /** Só dígitos com DDI (`5511999990001`); a máscara é do frontend. */
  phone: null | string
  preferredChannel: ContractorContactChannel
  receivesOccurrences: boolean
  roleLabel: string
  status: ContractorContactStatus
  types: readonly ContractorContactType[]
  /** O aceite do WhatsApp, carimbado pelo servidor (D6). */
  whatsappOptInAt: null | string
  whatsappOptInByUserId: null | string
}>

export const CONTRACTOR_CONTACT_KEYS = [
  'canDecide',
  'contractorId',
  'email',
  'id',
  'name',
  'occurrenceStages',
  'phone',
  'preferredChannel',
  'receivesOccurrences',
  'roleLabel',
  'status',
  'types',
  'whatsappOptInAt',
  'whatsappOptInByUserId',
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
