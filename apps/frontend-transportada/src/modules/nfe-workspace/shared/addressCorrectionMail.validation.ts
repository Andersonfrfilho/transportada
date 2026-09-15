/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O contato da contratante e o resultado do envio do e-mail de correção (spec 150, T305).
 *
 * ⚠️ **Cópia por valor da API, não código importado.** Como `addressCorrection.validation.ts`, o
 * bundle não carrega código do servidor — mudou de um lado, mude do outro.
 */
export type AddressCorrectionMailContactStatus = 'active' | 'inactive'

export type AddressCorrectionMailContact = Readonly<{
  email: string
  id: string
  receivesOccurrences: boolean
  status: AddressCorrectionMailContactStatus
}>

export type AddressCorrectionMailContractor = Readonly<{ id: string }>

export type AddressCorrectionMailSendResult = Readonly<{
  messageId: string
  recipientCount: number
  sentRequestIds: readonly string[]
  threadId: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isContactStatus(value: unknown): value is AddressCorrectionMailContactStatus {
  return value === 'active' || value === 'inactive'
}

/** `GET /contractors/by-tax-id/:taxId` — só o `id` importa aqui, o resto é o cadastro do cliente. */
export function mapAddressCorrectionMailContractor(
  value: unknown,
): AddressCorrectionMailContractor | null {
  if (!isRecord(value) || !isString(value.id)) return null
  return { id: value.id }
}

/** Contato que esta versão não reconhece some da lista, não a lista inteira. */
function mapAddressCorrectionMailContact(value: unknown): AddressCorrectionMailContact | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.email) ||
    typeof value.receivesOccurrences !== 'boolean' ||
    !isContactStatus(value.status)
  ) {
    return null
  }
  return {
    email: value.email,
    id: value.id,
    receivesOccurrences: value.receivesOccurrences,
    status: value.status,
  }
}

export function mapAddressCorrectionMailContactList(
  value: unknown,
): readonly AddressCorrectionMailContact[] {
  const data = isRecord(value) ? value.data : undefined
  if (!Array.isArray(data)) return []
  return data
    .map(mapAddressCorrectionMailContact)
    .filter((contact): contact is AddressCorrectionMailContact => contact !== null)
}

export function mapAddressCorrectionMailSendResult(
  value: unknown,
): AddressCorrectionMailSendResult | null {
  const data = isRecord(value) ? value.data : undefined
  if (
    !isRecord(data) ||
    !isString(data.messageId) ||
    !isNumber(data.recipientCount) ||
    !Array.isArray(data.sentRequestIds) ||
    !data.sentRequestIds.every(isString) ||
    !isString(data.threadId)
  ) {
    return null
  }
  return {
    messageId: data.messageId,
    recipientCount: data.recipientCount,
    sentRequestIds: data.sentRequestIds,
    threadId: data.threadId,
  }
}
