/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
  type DeliveryClientEmail,
  type DeliveryClientEmailPurpose,
} from './deliveryClientEmails.types'

/** Espelha a guarda de forma da API (spec 279 D4): um endereço só, sem `\r\n,;<>` nem espaço. */
const ADDRESS_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

export type DeliveryClientEmailDraft = Readonly<{
  address: string
  label: string
  purpose: DeliveryClientEmailPurpose
}>

export type DeliveryClientEmailDraftIssue = 'addressInvalid' | 'labelTooLong'

export function validateDeliveryClientEmailDraft(
  draft: DeliveryClientEmailDraft,
): Partial<Record<'address' | 'label', DeliveryClientEmailDraftIssue>> {
  const address = draft.address.trim()
  return {
    ...(address.length === 0 ||
    address.length > DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH ||
    !ADDRESS_PATTERN.test(address)
      ? { address: 'addressInvalid' as const }
      : {}),
    ...(draft.label.trim().length > DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH
      ? { label: 'labelTooLong' as const }
      : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function emailFromApi(value: unknown): DeliveryClientEmail | null {
  if (!isRecord(value)) return null
  const { addressMasked, createdAt, createdByKind, id, label, purpose } = value
  if (
    typeof addressMasked !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof id !== 'string' ||
    typeof label !== 'string' ||
    !isOneOf(DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS, createdByKind) ||
    !isOneOf(DELIVERY_CLIENT_EMAIL_PURPOSES, purpose)
  ) {
    return null
  }
  return { addressMasked, createdAt, createdByKind, id, label, purpose }
}

/** Um item malformado derruba a resposta inteira: lista pela metade esconderia endereço do operador. */
export function deliveryClientEmailsFromApi(payload: unknown): readonly DeliveryClientEmail[] {
  const data = isRecord(payload) ? payload.data : undefined
  if (!Array.isArray(data)) throw new Error('RESPONSE_INVALID')
  return data.map((item) => {
    const email = emailFromApi(item)
    if (email === null) throw new Error('RESPONSE_INVALID')
    return email
  })
}

export function deliveryClientEmailFromApi(payload: unknown): DeliveryClientEmail {
  const email = emailFromApi(isRecord(payload) ? payload.data : undefined)
  if (email === null) throw new Error('RESPONSE_INVALID')
  return email
}

/** Agrupa na ordem do vocabulário (boleto primeiro); tipo sem endereço fica de fora. */
export function groupDeliveryClientEmailsByPurpose(
  emails: readonly DeliveryClientEmail[],
): readonly Readonly<{
  emails: readonly DeliveryClientEmail[]
  purpose: DeliveryClientEmailPurpose
}>[] {
  return DELIVERY_CLIENT_EMAIL_PURPOSES.flatMap((purpose) => {
    const group = emails.filter((email) => email.purpose === purpose)
    return group.length === 0 ? [] : [{ emails: group, purpose }]
  })
}
