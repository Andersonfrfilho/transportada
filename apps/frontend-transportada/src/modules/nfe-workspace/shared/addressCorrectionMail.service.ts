/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O envio do pedido de correção por e-mail (spec 150, T305/T405): montagem do corpo de
 * `POST /address-correction-requests/mail` (unitário vs completo), a regra de habilitação do botão
 * de confirmar, a seleção inicial dos contatos, e o mapa de código de erro do servidor → mensagem.
 * O modelo do e-mail é o do módulo de notificação (spec 286): não se escolhe aqui.
 */
import type { AddressCorrectionMailContact } from './addressCorrectionMail.validation'

/** Cópia por valor de `CONTRACTOR_MAIL_MAX_RECIPIENTS` (T302) — o teto do Resend, 50 por e-mail. */
export const ADDRESS_CORRECTION_MAIL_MAX_CONTACTS = 50

export type AddressCorrectionMailRequestBody = Readonly<{
  contactIds: readonly string[]
  contractorTaxId: string
  /** Spec 267 RF4: quem o operador tirou da cópia neste envio; ausente quando ninguém saiu. */
  excludedWatcherUserIds?: readonly string[]
  requestIds?: readonly string[]
}>

/**
 * Sem `requestIds` é o envio completo (RF6a: todos os rascunhos da contratante); com um ou mais
 * ids é o unitário. A chave nunca entra com `undefined` explícito — o servidor distingue "ausente"
 * de "presente e vazio", e o segundo caso é `ADDRESS_CORRECTION_NOTHING_TO_SEND`, não o completo.
 */
export function buildAddressCorrectionMailRequestBody(
  input: Readonly<{
    contactIds: readonly string[]
    contractorTaxId: string
    excludedWatcherUserIds?: readonly string[]
    requestIds?: readonly string[]
  }>,
): AddressCorrectionMailRequestBody {
  return {
    contactIds: input.contactIds,
    contractorTaxId: input.contractorTaxId,
    ...((input.excludedWatcherUserIds ?? []).length === 0
      ? {}
      : { excludedWatcherUserIds: input.excludedWatcherUserIds }),
    ...(input.requestIds === undefined ? {} : { requestIds: input.requestIds }),
  }
}

/**
 * Botão desabilitado com 0 contatos marcados, acima do teto do Resend (T305), ou sem modelo utilizável
 * no módulo de notificação (spec 286, RF6) — sem modelo o envio não tem o que renderizar.
 */
export function canConfirmAddressCorrectionMail(input: {
  readonly hasTemplate: boolean
  readonly selectedContactCount: number
}): boolean {
  return (
    input.hasTemplate &&
    input.selectedContactCount > 0 &&
    input.selectedContactCount <= ADDRESS_CORRECTION_MAIL_MAX_CONTACTS
  )
}

/** Só o contato ativo entra na lista marcável — inativo nunca alcança o envio (RF5). */
export function activeAddressCorrectionMailContacts(
  contacts: readonly AddressCorrectionMailContact[],
): readonly AddressCorrectionMailContact[] {
  return contacts.filter((contact) => contact.status === 'active')
}

/**
 * Seleção inicial (RF5a: "o operador marca quem recebe", decisão desta task): os contatos ativos
 * que já recebem ocorrência (`receivesOccurrences`) vêm marcados — é o mesmo público que a rotina
 * de e-mail existente já avisa hoje, então começar com eles poupa o clique mais comum. Não é a
 * lista inteira marcada (RF5a: "o operador marca", não "todos por padrão") nem nenhum marcado
 * (o caso comum teria sempre um clique extra) — o operador ainda decide a cada envio, marcando ou
 * desmarcando antes de confirmar.
 */
export function initialAddressCorrectionMailContactIds(
  contacts: readonly AddressCorrectionMailContact[],
): readonly string[] {
  return activeAddressCorrectionMailContacts(contacts)
    .filter((contact) => contact.receivesOccurrences)
    .map((contact) => contact.id)
}

const MAIL_ERROR_MESSAGE_KEY: Readonly<Record<string, string>> = {
  ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND: 'addressReport.correction.mail.error.contractorNotFound',
  ADDRESS_CORRECTION_NOTHING_TO_SEND: 'addressReport.correction.mail.error.nothingToSend',
  ADDRESS_CORRECTION_NO_ACTIVE_CONTACT: 'addressReport.correction.mail.error.noActiveContact',
  ADDRESS_CORRECTION_REQUEST_NOT_SENDABLE: 'addressReport.correction.mail.error.requestNotSendable',
  CONTRACTOR_MAIL_NOT_CONFIGURED: 'addressReport.correction.mail.error.mailNotConfigured',
  /** Spec 267 RF7: To + Cc acima do teto do provedor. */
  CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS: 'addressReport.correction.mail.error.tooManyRecipients',
  /** Spec 150 T401: remetente aceito na chave, mas o domínio ainda não verificou. */
  CONTRACTOR_MAIL_SENDING_NOT_VERIFIED: 'addressReport.correction.mail.error.sendingNotVerified',
  /** Spec 286: o módulo de notificação não tem um modelo utilizável para este e-mail. */
  CONTRACTOR_MAIL_TEMPLATE_MISSING: 'addressReport.correction.mail.error.templateMissing',
  /** `GET /contractors/by-tax-id/:taxId` recusa com este código, diferente do da própria rota de envio. */
  CONTRACTOR_NOT_FOUND: 'addressReport.correction.mail.error.contractorNotFound',
  IDEMPOTENCY_KEY_REUSED: 'addressReport.correction.mail.error.idempotencyReused',
  /** Spec 150, correção Fase 4, item 11: a mensagem interpola `{{minutes}}` do Retry-After. */
  TOO_MANY_REQUESTS: 'addressReport.correction.mail.error.tooManyRequests',
}

/** Código que esta versão não reconhece cai na mensagem genérica, nunca em branco. */
export function addressCorrectionMailErrorMessageKey(code: string): string {
  return MAIL_ERROR_MESSAGE_KEY[code] ?? 'addressReport.correction.mail.error.generic'
}

/**
 * Os motivos de RF16/RF17 pelos quais o envio não está liberado (T401/T402): sem chave
 * aceita, remetente não verificado, ou sem modelo do tipo (arquivado/de fora conta como "não
 * usável"). Nenhum dos quatro se resolve pela própria tela — o atalho leva à página de configuração.
 */
const MAIL_CONFIGURATION_SHORTCUT_CODES: ReadonlySet<string> = new Set([
  'CONTRACTOR_MAIL_NOT_CONFIGURED',
  'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED',
  'CONTRACTOR_MAIL_TEMPLATE_MISSING',
])

export function addressCorrectionMailErrorHasConfigurationShortcut(code: string): boolean {
  return MAIL_CONFIGURATION_SHORTCUT_CODES.has(code)
}

export type ResolveAddressCorrectionMailIdempotencyKeyResult = Readonly<{
  contactIds: readonly string[]
  excludedWatcherIds: readonly string[]
  idempotencyKey: string
}>

/**
 * Revisão final (T305 seguia gerando a chave só em `open()`, fixa até fechar): reusar a mesma
 * `Idempotency-Key` com uma seleção de contatos diferente manda um corpo diferente para o mesmo
 * fingerprint, e o servidor recusa com `IDEMPOTENCY_KEY_REUSED` (409). A chave fica estável
 * enquanto a seleção não muda (retry da mesma tentativa) e muda assim que ela muda — a ordem da
 * seleção não importa, só o conjunto.
 */
export function resolveAddressCorrectionMailIdempotencyKey(input: {
  readonly currentContactIds: readonly string[]
  /** Spec 267: quem saiu da cópia entra na impressão digital do envio; mudar o conjunto pede chave nova. */
  readonly currentExcludedWatcherIds?: readonly string[]
  readonly generateKey: () => string
  readonly previousContactIds: readonly string[] | null
  readonly previousExcludedWatcherIds?: readonly string[]
  readonly previousIdempotencyKey: string
}): ResolveAddressCorrectionMailIdempotencyKeyResult {
  const currentExcluded = input.currentExcludedWatcherIds ?? []
  const previousExcluded = input.previousExcludedWatcherIds ?? []
  if (
    input.previousContactIds !== null &&
    sameContactSelection(input.previousContactIds, input.currentContactIds) &&
    sameContactSelection(previousExcluded, currentExcluded)
  ) {
    return {
      contactIds: input.previousContactIds,
      excludedWatcherIds: previousExcluded,
      idempotencyKey: input.previousIdempotencyKey,
    }
  }
  return {
    contactIds: input.currentContactIds,
    excludedWatcherIds: currentExcluded,
    idempotencyKey: input.generateKey(),
  }
}

function sameContactSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}
