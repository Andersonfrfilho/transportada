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

/** `POST /address-correction-requests/recipients` (revisão final, item de segurança B3). */
export type AddressCorrectionRecipients = Readonly<{
  contacts: readonly AddressCorrectionMailContact[]
  contractor: AddressCorrectionMailContractor
}>

export type AddressCorrectionMailSendResult = Readonly<{
  messageId: string
  recipientCount: number
  sentRequestIds: readonly string[]
  threadId: string
}>

/**
 * Modelo de e-mail do tipo `address_correction` (spec 150, T405). Cópia por valor do que a API
 * devolve (T402, `contractor-mail-templates.routes.ts`) — só os campos que a confirmação usa.
 */
export type AddressCorrectionMailTemplateStatus = 'active' | 'archived'

export type AddressCorrectionMailTemplate = Readonly<{
  id: string
  isDefault: boolean
  name: string
  status: AddressCorrectionMailTemplateStatus
}>

/** `POST /contractor-mail-templates/preview` — sempre dados de exemplo (T402), nunca o envio real. */
export type AddressCorrectionMailTemplatePreview = Readonly<{
  html: string
  subject: string
  text: string
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

function isTemplateStatus(value: unknown): value is AddressCorrectionMailTemplateStatus {
  return value === 'active' || value === 'archived'
}

/** `GET /contractors/by-tax-id/:taxId` — só o `id` importa aqui, o resto é o cadastro do cliente. */
export function mapAddressCorrectionMailContractor(
  value: unknown,
): AddressCorrectionMailContractor | null {
  if (!isRecord(value) || !isString(value.id)) return null
  return { id: value.id }
}

/** Contato que esta versão não reconhece some da lista, não a lista inteira. */
export function mapAddressCorrectionMailContact(
  value: unknown,
): AddressCorrectionMailContact | null {
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

/** `POST /address-correction-requests/recipients` — a resposta única que substitui as duas rotas
 * antigas (`GET /contractors/by-tax-id/:taxId` + `GET /contractors/:id/contacts`). */
export function mapAddressCorrectionRecipients(value: unknown): AddressCorrectionRecipients | null {
  const data = isRecord(value) ? value.data : undefined
  if (!isRecord(data)) return null
  const contractor = mapAddressCorrectionMailContractor(data.contractor)
  if (contractor === null) return null
  const contacts = Array.isArray(data.contacts)
    ? data.contacts
        .map(mapAddressCorrectionMailContact)
        .filter((contact): contact is AddressCorrectionMailContact => contact !== null)
    : []
  return { contacts, contractor }
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

/** Modelo que esta versão não reconhece some da lista, não a lista inteira. */
export function mapAddressCorrectionMailTemplate(
  value: unknown,
): AddressCorrectionMailTemplate | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    typeof value.isDefault !== 'boolean' ||
    !isTemplateStatus(value.status)
  ) {
    return null
  }
  return { id: value.id, isDefault: value.isDefault, name: value.name, status: value.status }
}

/** `GET /contractor-mail-templates?mailType=address_correction`. */
export function mapAddressCorrectionMailTemplateList(
  value: unknown,
): readonly AddressCorrectionMailTemplate[] {
  const data = isRecord(value) ? value.data : undefined
  if (!Array.isArray(data)) return []
  return data
    .map(mapAddressCorrectionMailTemplate)
    .filter((template): template is AddressCorrectionMailTemplate => template !== null)
}

export function mapAddressCorrectionMailTemplatePreview(
  value: unknown,
): AddressCorrectionMailTemplatePreview | null {
  const data = isRecord(value) ? value.data : undefined
  if (!isRecord(data) || !isString(data.html) || !isString(data.subject) || !isString(data.text)) {
    return null
  }
  return { html: data.html, subject: data.subject, text: data.text }
}
