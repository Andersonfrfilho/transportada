/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O envio do pedido de correção por e-mail (spec 150, T305/T405): montagem do corpo de
 * `POST /address-correction-requests/mail` (unitário vs completo, com ou sem `templateId`), a
 * regra de habilitação do botão de confirmar, a seleção inicial dos contatos e do modelo, e o mapa
 * de código de erro do servidor → mensagem.
 */
import type {
  AddressCorrectionMailContact,
  AddressCorrectionMailTemplate,
} from './addressCorrectionMail.validation'

/** Cópia por valor de `CONTRACTOR_MAIL_MAX_RECIPIENTS` (T302) — o teto do Resend, 50 por e-mail. */
export const ADDRESS_CORRECTION_MAIL_MAX_CONTACTS = 50

export type AddressCorrectionMailRequestBody = Readonly<{
  contactIds: readonly string[]
  contractorTaxId: string
  requestIds?: readonly string[]
  templateId?: string
}>

/**
 * Sem `requestIds` é o envio completo (RF6a: todos os rascunhos da contratante); com um ou mais
 * ids é o unitário. A chave nunca entra com `undefined` explícito — o servidor distingue "ausente"
 * de "presente e vazio", e o segundo caso é `ADDRESS_CORRECTION_NOTHING_TO_SEND`, não o completo.
 * `templateId` segue a mesma regra: ausente é "use o padrão", nunca `undefined` explícito.
 */
export function buildAddressCorrectionMailRequestBody(
  input: Readonly<{
    contactIds: readonly string[]
    contractorTaxId: string
    requestIds?: readonly string[]
    templateId?: string
  }>,
): AddressCorrectionMailRequestBody {
  return {
    contactIds: input.contactIds,
    contractorTaxId: input.contractorTaxId,
    ...(input.requestIds === undefined ? {} : { requestIds: input.requestIds }),
    ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
  }
}

/**
 * Botão desabilitado com 0 contatos marcados, acima do teto do Resend (T305), ou sem nenhum modelo
 * ativo do tipo disponível (T405, RF15/RF17) — sem modelo o envio não tem o que renderizar.
 */
export function canConfirmAddressCorrectionMail(
  selectedContactCount: number,
  hasTemplate: boolean,
): boolean {
  return (
    hasTemplate &&
    selectedContactCount > 0 &&
    selectedContactCount <= ADDRESS_CORRECTION_MAIL_MAX_CONTACTS
  )
}

/** Arquivado nunca aparece no seletor (RF15: arquivado, nunca apagado, mas fora de uso). */
export function activeAddressCorrectionMailTemplates(
  templates: readonly AddressCorrectionMailTemplate[],
): readonly AddressCorrectionMailTemplate[] {
  return templates.filter((template) => template.status === 'active')
}

/** O modelo marcado como padrão do tipo — `null` quando nenhum modelo ativo carrega a marca. */
export function defaultAddressCorrectionMailTemplateId(
  templates: readonly AddressCorrectionMailTemplate[],
): string | null {
  const defaultTemplate = activeAddressCorrectionMailTemplates(templates).find(
    (template) => template.isDefault,
  )
  return defaultTemplate?.id ?? null
}

/**
 * Seleção inicial do modelo (RF15: "o operador usa o padrão ou escolhe outro"): o padrão ativo
 * quando existe. Sem padrão marcado (ex.: o padrão foi arquivado e nenhum outro assumiu a marca
 * ainda), cai no primeiro modelo ativo da lista — nenhum ativo disponível é preferível a obrigar
 * quem confirma a escolher às cegas, e ainda é dentro do que RF15/RF17 liberam (RF17 só bloqueia o
 * envio quando não há nenhum modelo ativo do tipo, não quando não há um marcado como padrão).
 */
export function initialAddressCorrectionMailTemplateId(
  templates: readonly AddressCorrectionMailTemplate[],
): string | null {
  const active = activeAddressCorrectionMailTemplates(templates)
  return active.find((template) => template.isDefault)?.id ?? active[0]?.id ?? null
}

/**
 * O `templateId` só viaja no corpo quando difere do padrão do servidor (T402: "o envio pelo padrão
 * mantém o fingerprint de antes") — inclusive quando não há padrão marcado, porque aí o servidor
 * não tem como resolver um modelo sozinho e precisa do id explícito.
 */
export function addressCorrectionMailTemplateIdForRequest(
  input: Readonly<{ defaultTemplateId: string | null; selectedTemplateId: string | null }>,
): string | undefined {
  if (input.selectedTemplateId === null) return undefined
  if (input.selectedTemplateId === input.defaultTemplateId) return undefined
  return input.selectedTemplateId
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
  /** Spec 150 T401: remetente aceito na chave, mas o domínio ainda não verificou. */
  CONTRACTOR_MAIL_SENDING_NOT_VERIFIED: 'addressReport.correction.mail.error.sendingNotVerified',
  /** Spec 150 T402: sem modelo padrão do tipo, ou o modelo escolhido não serve mais. */
  CONTRACTOR_MAIL_TEMPLATE_MISSING: 'addressReport.correction.mail.error.templateMissing',
  CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE: 'addressReport.correction.mail.error.templateNotUsable',
  /** `GET /contractors/by-tax-id/:taxId` recusa com este código, diferente do da própria rota de envio. */
  CONTRACTOR_NOT_FOUND: 'addressReport.correction.mail.error.contractorNotFound',
  IDEMPOTENCY_KEY_REUSED: 'addressReport.correction.mail.error.idempotencyReused',
}

/** Código que esta versão não reconhece cai na mensagem genérica, nunca em branco. */
export function addressCorrectionMailErrorMessageKey(code: string): string {
  return MAIL_ERROR_MESSAGE_KEY[code] ?? 'addressReport.correction.mail.error.generic'
}

/**
 * Os quatro motivos de RF16/RF17 pelos quais o envio não está liberado (T401/T402): sem chave
 * aceita, remetente não verificado, ou sem modelo do tipo (arquivado/de fora conta como "não
 * usável"). Nenhum dos quatro se resolve pela própria tela — o atalho leva à página de configuração.
 */
const MAIL_CONFIGURATION_SHORTCUT_CODES: ReadonlySet<string> = new Set([
  'CONTRACTOR_MAIL_NOT_CONFIGURED',
  'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED',
  'CONTRACTOR_MAIL_TEMPLATE_MISSING',
  'CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE',
])

export function addressCorrectionMailErrorHasConfigurationShortcut(code: string): boolean {
  return MAIL_CONFIGURATION_SHORTCUT_CODES.has(code)
}

export type ResolveAddressCorrectionMailIdempotencyKeyResult = Readonly<{
  contactIds: readonly string[]
  idempotencyKey: string
  templateId: string | null
}>

/**
 * Revisão final (T305 seguia gerando a chave só em `open()`, fixa até fechar): reusar a mesma
 * `Idempotency-Key` com uma seleção de contatos diferente manda um corpo diferente para o mesmo
 * fingerprint, e o servidor recusa com `IDEMPOTENCY_KEY_REUSED` (409). A chave fica estável
 * enquanto a seleção não muda (retry da mesma tentativa) e muda assim que ela muda — a ordem da
 * seleção não importa, só o conjunto. T405 estende a mesma regra ao modelo: `currentTemplateId` é
 * o valor **efetivo** que vai no corpo (`addressCorrectionMailTemplateIdForRequest`, `null` quando
 * o padrão é usado), então trocar de modelo também gera chave nova, e voltar ao padrão depois de
 * ter trocado gera chave nova de novo (mesmo `null` de antes de qualquer troca, mas é sempre
 * tratado como mudança porque `previousContactIds`/`previousTemplateId` andam juntos).
 */
export function resolveAddressCorrectionMailIdempotencyKey(input: {
  readonly currentContactIds: readonly string[]
  readonly currentTemplateId: string | null
  readonly generateKey: () => string
  readonly previousContactIds: readonly string[] | null
  readonly previousIdempotencyKey: string
  readonly previousTemplateId: string | null
}): ResolveAddressCorrectionMailIdempotencyKeyResult {
  if (
    input.previousContactIds !== null &&
    sameContactSelection(input.previousContactIds, input.currentContactIds) &&
    input.previousTemplateId === input.currentTemplateId
  ) {
    return {
      contactIds: input.previousContactIds,
      idempotencyKey: input.previousIdempotencyKey,
      templateId: input.previousTemplateId,
    }
  }
  return {
    contactIds: input.currentContactIds,
    idempotencyKey: input.generateKey(),
    templateId: input.currentTemplateId,
  }
}

function sameContactSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}
