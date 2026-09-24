/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatStoredPhone } from '@/modules/shared/phone.service'

import {
  CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  CONTRACTOR_CONTACT_TYPES,
  type ContractorContact,
  type ContractorContactChannel,
  type ContractorContactOccurrenceStage,
  type ContractorContactType,
} from './contractorContacts.types'

/** Sem zod nesta app: guarda manual, formatada e testada isolada (`*.validation.ts`). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/**
 * ⚠️ Cópia por valor de `toWhatsAppPhone` (API, `whatsapp-commands/domain/whatsapp-phone.policy.ts`):
 * o bundle não carrega código do servidor. Mudou lá, mude aqui — o contrato da validação repete os
 * casos da API.
 */
const BRAZIL_COUNTRY_CODE = '55'
const WHATSAPP_PHONE_PATTERN = /^55[1-9][0-9]{9,10}$/u
const TYPED_PHONE_PATTERN = /^\+?[0-9\s().-]+$/u
const LOCAL_PHONE_LENGTHS: ReadonlySet<number> = new Set([10, 11])

export const CONTRACTOR_CONTACT_VALIDATION_ERROR = {
  EMAIL_REQUIRED: 'emailRequired',
  EMAIL_INVALID: 'emailInvalid',
  OCCURRENCE_STAGES_REQUIRED: 'occurrenceStagesRequired',
  OPT_IN_WITHOUT_PHONE: 'optInWithoutPhone',
  PHONE_INVALID: 'phoneInvalid',
  WHATSAPP_WITHOUT_OPT_IN: 'whatsappWithoutOptIn',
} as const

export type ContractorContactValidationError =
  (typeof CONTRACTOR_CONTACT_VALIDATION_ERROR)[keyof typeof CONTRACTOR_CONTACT_VALIDATION_ERROR]

/**
 * Spec 183 T303: o formulário do contato. `phone` é o que a pessoa digitou (com máscara);
 * `whatsappOptIn` é a marcação "o contato aceitou" — quem carimba data e autor é o servidor (D6).
 */
export type ContractorContactDraft = Readonly<{
  email: string
  name: string
  occurrenceStages: readonly ContractorContactOccurrenceStage[]
  phone: string
  preferredChannel: ContractorContactChannel
  roleLabel: string
  types: readonly ContractorContactType[]
  whatsappOptIn: boolean
}>

export type ContractorContactDraftErrors = Readonly<
  Partial<Record<keyof ContractorContactDraft, ContractorContactValidationError>>
>

/** O corpo de `POST`/`PATCH /contractors/:id/contacts` — só os campos novos (spec 183 T302). */
export type ContractorContactPayload = Readonly<{
  email: string
  name: string
  occurrenceStages: readonly ContractorContactOccurrenceStage[]
  phone: null | string
  preferredChannel: ContractorContactChannel
  roleLabel: string
  types: readonly ContractorContactType[]
  whatsappOptIn: boolean
}>

/** Os padrões de antes da 183: recebe ocorrência dos três grupos, por e-mail. */
export const EMPTY_CONTRACTOR_CONTACT_DRAFT: ContractorContactDraft = {
  email: '',
  name: '',
  occurrenceStages: CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  phone: '',
  preferredChannel: 'email',
  roleLabel: '',
  types: ['occurrences'],
  whatsappOptIn: false,
}

/** `trim` + minúsculas antes de validar: o servidor normaliza igual (spec 150 T301), a tela adianta. */
export function normalizeContractorContactEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateContractorContactEmail(
  email: string,
): ContractorContactValidationError | undefined {
  const normalized = normalizeContractorContactEmail(email)
  if (normalized.length === 0) return CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED
  if (!EMAIL_PATTERN.test(normalized)) return CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_INVALID
  return undefined
}

/** `null` é "sem telefone"; `undefined` é telefone digitado que não serve para o WhatsApp. */
export function normalizeContractorContactPhone(typed: string): null | string | undefined {
  const trimmed = typed.trim()
  if (trimmed === '') return null
  if (!TYPED_PHONE_PATTERN.test(trimmed)) return undefined
  const digits = trimmed.replace(/\D/gu, '')
  const withCountry = LOCAL_PHONE_LENGTHS.has(digits.length)
    ? `${BRAZIL_COUNTRY_CODE}${digits}`
    : digits
  return WHATSAPP_PHONE_PATTERN.test(withCountry) ? withCountry : undefined
}

/** O telefone gravado (`5511999990001`) aparece sem o DDI, com a máscara da casa. */
export function formatContractorContactPhone(phone: null | string): string {
  if (phone === null) return ''
  const local = phone.startsWith(BRAZIL_COUNTRY_CODE)
    ? phone.slice(BRAZIL_COUNTRY_CODE.length)
    : phone
  return formatStoredPhone(local)
}

export function contractorContactDraftFromContact(
  contact: ContractorContact,
): ContractorContactDraft {
  return {
    email: contact.email,
    name: contact.name,
    occurrenceStages: contact.occurrenceStages,
    phone: formatContractorContactPhone(contact.phone),
    preferredChannel: contact.preferredChannel,
    roleLabel: contact.roleLabel,
    types: contact.types,
    whatsappOptIn: contact.whatsappOptInAt !== null,
  }
}

/** Spec 183 RF16: o que a conversa sugere para o cadastro de quem está fora dos contatos. */
export type ContractorSenderSuggestion = Readonly<{
  email: null | string
  name: string
  phone: null | string
}>

/**
 * Spec 183 T406: "Adicionar aos contatos" abre o cadastro com o que a mensagem trouxe; o resto fica
 * no padrão, e o aceite do WhatsApp nunca vem marcado (D6) — quem marca é o operador.
 */
export function contractorContactDraftFromSenderSuggestion(
  suggestion: ContractorSenderSuggestion,
): ContractorContactDraft {
  return {
    ...EMPTY_CONTRACTOR_CONTACT_DRAFT,
    email: suggestion.email ?? '',
    name: suggestion.name,
    phone: formatContractorContactPhone(suggestion.phone),
  }
}

/** Marca ou desmarca uma opção, devolvendo a lista na ordem canônica e sem repetição. */
export function toggleContractorContactOption<TOption extends string>(
  selected: readonly TOption[],
  option: TOption,
  canonical: readonly TOption[],
): readonly TOption[] {
  const next = selected.includes(option)
    ? selected.filter((value) => value !== option)
    : [...selected, option]
  return canonical.filter((value) => next.includes(value))
}

/** As mesmas regras da política da API (T302), para o erro aparecer no campo antes do envio. */
export function validateContractorContactDraft(
  draft: ContractorContactDraft,
): ContractorContactDraftErrors {
  const errors: Partial<Record<keyof ContractorContactDraft, ContractorContactValidationError>> = {}
  const emailError = validateContractorContactEmail(draft.email)
  if (emailError !== undefined) errors.email = emailError

  const phone = normalizeContractorContactPhone(draft.phone)
  if (phone === undefined) errors.phone = CONTRACTOR_CONTACT_VALIDATION_ERROR.PHONE_INVALID
  if (draft.whatsappOptIn && phone === null) {
    errors.whatsappOptIn = CONTRACTOR_CONTACT_VALIDATION_ERROR.OPT_IN_WITHOUT_PHONE
  }
  if (draft.preferredChannel === 'whatsapp' && !draft.whatsappOptIn) {
    errors.preferredChannel = CONTRACTOR_CONTACT_VALIDATION_ERROR.WHATSAPP_WITHOUT_OPT_IN
  }
  if (draft.types.includes('occurrences') && draft.occurrenceStages.length === 0) {
    errors.occurrenceStages = CONTRACTOR_CONTACT_VALIDATION_ERROR.OCCURRENCE_STAGES_REQUIRED
  }
  return errors
}

export function buildContractorContactPayload(
  draft: ContractorContactDraft,
): ContractorContactPayload | undefined {
  if (Object.keys(validateContractorContactDraft(draft)).length > 0) return undefined
  const phone = normalizeContractorContactPhone(draft.phone)
  if (phone === undefined) return undefined
  return {
    email: normalizeContractorContactEmail(draft.email),
    name: draft.name.trim(),
    occurrenceStages: CONTRACTOR_CONTACT_OCCURRENCE_STAGES.filter((stage) =>
      draft.occurrenceStages.includes(stage),
    ),
    phone,
    preferredChannel: draft.preferredChannel,
    roleLabel: draft.roleLabel.trim(),
    types: CONTRACTOR_CONTACT_TYPES.filter((type) => draft.types.includes(type)),
    whatsappOptIn: draft.whatsappOptIn,
  }
}
