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
export type AddressCorrectionMailCopyEntry = Readonly<{
  maskedEmail: string
  name: string
  userId: string
}>

export type AddressCorrectionRecipients = Readonly<{
  /** Spec 267 RF4: a cópia efetiva da contratante, mascarada; o operador só tira chips. */
  cc: readonly AddressCorrectionMailCopyEntry[]
  ccSource: 'company' | 'contractor' | null
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
 * Spec 286 (RF6): o estado do modelo do e-mail de correção, que mora no módulo de notificação
 * (`GET /address-correction-requests/mail-template`). `preview` vem com dados de exemplo, nunca do envio real.
 */
export type AddressCorrectionMailTemplatePreview = Readonly<{
  html: string
  subject: string
  text: string
}>

export type AddressCorrectionMailTemplateState = Readonly<{
  preview: AddressCorrectionMailTemplatePreview | null
  /** Códigos dos problemas apontados pela régua do servidor (`not_found`, `unsafe_html`…). */
  problemCodes: readonly string[]
  /** Pode sair e-mail com ele. */
  usable: boolean
  version: number | null
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
  const cc = Array.isArray(data.cc)
    ? data.cc.flatMap((entry): AddressCorrectionMailCopyEntry[] =>
        isRecord(entry) &&
        isString(entry.userId) &&
        isString(entry.name) &&
        isString(entry.maskedEmail)
          ? [{ maskedEmail: entry.maskedEmail, name: entry.name, userId: entry.userId }]
          : [],
      )
    : []
  const ccSource =
    data.ccSource === 'company' || data.ccSource === 'contractor' ? data.ccSource : null
  return { cc, ccSource, contacts, contractor }
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

export function mapAddressCorrectionMailTemplatePreview(
  value: unknown,
): AddressCorrectionMailTemplatePreview | null {
  if (
    !isRecord(value) ||
    !isString(value.html) ||
    !isString(value.subject) ||
    !isString(value.text)
  ) {
    return null
  }
  return { html: value.html, subject: value.subject, text: value.text }
}

/** `GET /address-correction-requests/mail-template`. Resposta que esta versão não reconhece é `null`. */
export function mapAddressCorrectionMailTemplateState(
  value: unknown,
): AddressCorrectionMailTemplateState | null {
  const data = isRecord(value) ? value.data : undefined
  if (!isRecord(data) || typeof data.usable !== 'boolean' || !Array.isArray(data.problems)) {
    return null
  }
  const preview =
    data.preview === null ? null : mapAddressCorrectionMailTemplatePreview(data.preview)
  if (data.preview !== null && preview === null) return null
  return {
    preview,
    problemCodes: data.problems.flatMap((problem) =>
      isRecord(problem) && isString(problem.code) ? [problem.code] : [],
    ),
    usable: data.usable,
    version: isNumber(data.version) ? data.version : null,
  }
}
