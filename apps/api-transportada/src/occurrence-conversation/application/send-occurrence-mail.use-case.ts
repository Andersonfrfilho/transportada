/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403 (RF7, P4; absorve a 143 T015): o e-mail da conversa com a contratante. Uma transação
 * só grava a conversa (na primeira vez), a thread da 143 com o hash do token de resposta (na primeira
 * vez), a mensagem da 143 com o evento de envio no outbox e a mensagem da conversa `queued` que aponta
 * para ela. A segunda mensagem é resposta: mesma conversa, mesma thread — e o worker já manda
 * `In-Reply-To` pela última recebida, então ela cai na mesma conversa da caixa da contratante.
 *
 * ⚠️ **A conversa não decide** (D4): nada aqui toca a tratativa, a taxa ou o acerto da 164.
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import {
  OCCURRENCE_MAIL_LIMITS,
  SEND_OCCURRENCE_MAIL_OPERATION,
} from '../domain/occurrence-conversation.constant.js'
import {
  ContractorReplyNotResendableError,
  ContractorReplyResendTooSoonError,
  OccurrenceConversationContractorUnknownError,
  OccurrenceConversationMailInvalidError,
  OccurrenceMailTemplateMissingError,
} from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail } from '../domain/occurrence-mail.template.js'
import { composeOccurrenceMailHtml } from '../domain/occurrence-mail-html-compose.policy.js'
import { htmlToPlainText } from '../domain/occurrence-mail-plain-text.policy.js'
import { buildSenderDisplayName } from '../domain/occurrence-mail-sender-name.policy.js'
import type { OccurrenceMailSigner } from '../domain/occurrence-mail-signer.policy.js'
import { applySubjectPrefix } from '../domain/occurrence-mail-subject.policy.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import { openContractorReplyWhenConfigured } from './open-contractor-reply.service.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import {
  createMailFingerprint,
  createPublicRef,
  findMailReplay,
  prepareMailDelivery,
  recordMailDelivery,
  resolveMailCc,
  resolveMailReadiness,
  resolveMailRecipients,
  saveMailReplay,
  type OccurrenceMailDelivery,
  type OccurrenceMailLogger,
  type OccurrenceMailSandbox,
} from './occurrence-mail-delivery.service.js'
import {
  NULL_OCCURRENCE_OWNER_READER,
  type OccurrenceOwnerReader,
} from './occurrence-owner-reader.port.js'
import { resolveAutomaticMailSigner } from './resolve-automatic-mail-signer.service.js'
import type {
  CarrierIdentity,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  OccurrenceMailUnitOfWorkPort,
  OccurrenceNotificationTemplate,
  SendOccurrenceMailResult,
} from './occurrence-mail.port.js'

/** Quem importava daqui continua importando: a entrega mora no serviço (spec 274 T3.5). */
export { createPublicRef }
export type { OccurrenceMailLogger, OccurrenceMailSandbox }

export type SendOccurrenceMailInput = {
  /**
   * Quem escreveu. `null` só com `automatic`: o aviso que o tipo da ocorrência manda sozinho
   * (spec 183 T802), sem autor humano — nunca um envio manual anônimo.
   */
  readonly actorUserId: null | string
  readonly automatic?: boolean
  /** Spec 183 T702e: os arquivos que o operador subiu pelo canal e-mail. */
  readonly attachmentIds?: readonly string[]
  readonly bodyText: string
  readonly companyId: string
  readonly contactIds: readonly string[]
  /**
   * Spec 248 RF6: o reenvio do pedido à contratante. Dentro da transação do e-mail, trava o retorno,
   * confere que ele espera a contratante e que o intervalo do alarme passou, e grava o evento `user`.
   */
  readonly contractorReplyResend?: boolean
  readonly correlationId: string
  /** Spec 267 RF4: quem o operador tirou da cópia neste envio. Só remove: id fora da lista efetiva é ignorado. */
  readonly excludedWatcherUserIds?: readonly string[]
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly subject: string
}

export type SendOccurrenceMailUseCase = Readonly<{
  send: (input: SendOccurrenceMailInput) => Promise<SendOccurrenceMailResult>
}>

function assertMailContent(input: SendOccurrenceMailInput): void {
  const subject = input.subject.trim()
  const body = input.bodyText.trim()
  if (
    subject === '' ||
    body === '' ||
    subject.length > OCCURRENCE_MAIL_LIMITS.subject ||
    body.length > OCCURRENCE_MAIL_LIMITS.body
  ) {
    throw new OccurrenceConversationMailInvalidError()
  }
}

/** Só entra na impressão digital quando alguém saiu da cópia: sem isso, o hash de antes da 267 segue valendo. */
function excludedFingerprintFields(excluded: readonly string[] | undefined): string[] {
  const unique = [...new Set(excluded ?? [])].sort()
  return unique.length === 0 ? [] : [`excluded:${unique.join(',')}`]
}

export function createSendOccurrenceMailUseCase(dependencies: {
  /** A origem pública da API: logo e foto do e-mail vão por endereço estável; ausente, o logo vai por `cid:`. */
  readonly apiPublicUrl?: string
  /** Spec 272 (D5): a origem do painel, para as marcas do rodapé; ausente, o rodapé sai só em texto. */
  readonly appBaseUrl?: string
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly logger?: OccurrenceMailLogger
  readonly now?: () => Date
  /** Spec 272 (D6): o dono que assina o aviso automático; sem a 273, ninguém, e a equipe assina. */
  readonly ownerReader?: OccurrenceOwnerReader
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: OccurrenceMailUnitOfWorkPort
}): SendOccurrenceMailUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    send: async (input) => {
      if ((input.actorUserId === null) !== (input.automatic === true)) {
        throw new Error('OCCURRENCE_MAIL_AUTHOR_REQUIRED')
      }
      if (input.contractorReplyResend === true && input.automatic === true) {
        throw new Error('OCCURRENCE_MAIL_RESEND_IS_NOT_AUTOMATIC')
      }
      assertMailContent(input)
      return dependencies.unitOfWork.execute((transaction) =>
        executeSend({ ...dependencies, input, now: now(), transaction }),
      )
    },
  }
}

async function assertContractorReplyResendRecorded(params: {
  readonly actorUserId: string
  readonly companyId: string
  readonly now: Date
  readonly occurrenceId: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<void> {
  const { transaction, ...rest } = params
  const outcome = await transaction.recordContractorReplyResend(rest)
  if (outcome === 'not_resendable') throw new ContractorReplyNotResendableError()
  if (outcome === 'too_soon') throw new ContractorReplyResendTooSoonError()
}

/**
 * Spec 271 (ADR-0108, D9): o e-mail da ocorrência sai de um modelo do módulo de notificação, o do tipo. Sem modelo
 * utilizável, 409, nem à mão. O reenvio do retorno da contratante (248) não passa por aqui: continua a conversa que
 * já existe e grava o modelo (chave e versão) da mensagem original, ou nulo.
 */
async function resolveNotificationTemplate(params: {
  readonly input: SendOccurrenceMailInput
  readonly target: { readonly kind: OccurrenceConversationKind }
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<null | OccurrenceNotificationTemplate> {
  const { input, target, transaction } = params
  if (input.contractorReplyResend === true) {
    return transaction.findOriginalOccurrenceNotificationTemplate({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      occurrenceKind: target.kind,
    })
  }
  const template = await transaction.findOccurrenceNotificationTemplate({
    companyId: input.companyId,
    occurrenceId: input.occurrenceId,
  })
  if (template === null) throw new OccurrenceMailTemplateMissingError()
  return template
}

/**
 * Spec 272 (ADR-0110 §6): manual → o operador (sem vínculo ativo, a equipe); automático → o dono pela porta, senão a
 * equipe. O assinante só existe até o e-mail ser montado: não é gravado.
 */
async function resolveMailSigner(params: {
  readonly input: SendOccurrenceMailInput
  readonly kind: OccurrenceMailTarget['kind']
  readonly ownerReader: OccurrenceOwnerReader
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<OccurrenceMailSigner> {
  const { input, transaction } = params
  if (input.actorUserId === null) {
    return resolveAutomaticMailSigner({
      companyId: input.companyId,
      kind: params.kind,
      occurrenceId: input.occurrenceId,
      ownerReader: params.ownerReader,
    })
  }
  const operator = await transaction.findOperatorSigner({
    companyId: input.companyId,
    userId: input.actorUserId,
  })
  if (operator === undefined) return { kind: 'team' }
  return {
    ...(operator.hasPicture === true ? { hasPicture: true } : {}),
    ...(operator.jobTitle === undefined ? {} : { jobTitle: operator.jobTitle }),
    kind: 'operator',
    name: operator.name,
    userId: input.actorUserId,
  }
}

type BuiltMail = {
  readonly bodyHtml: string
  readonly bodyText: string
  readonly hasInlineLogo: boolean
  readonly subject: string
}

/**
 * Corpo do modelo com tag → o HTML do modelo (spec 272 D1/D12); sem tag, ou no reenvio do retorno (248), o caminho de
 * texto de hoje. O assunto leva o prefixo da transportadora nos dois (idempotente: o reenvio já o traz).
 */
async function buildMail(params: {
  readonly apiPublicUrl: string | undefined
  readonly appBaseUrl: string | undefined
  readonly carrier: CarrierIdentity | undefined
  readonly delivery: OccurrenceMailDelivery
  readonly input: SendOccurrenceMailInput
  readonly notificationTemplate: null | OccurrenceNotificationTemplate
  readonly signer: OccurrenceMailSigner
  readonly target: OccurrenceMailTarget
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<BuiltMail> {
  const { carrier, input, notificationTemplate, signer } = params
  const source =
    notificationTemplate === null || input.contractorReplyResend === true
      ? null
      : await params.transaction.findOccurrenceMailHtmlSource({
          companyId: input.companyId,
          occurrenceId: input.occurrenceId,
          templateKey: notificationTemplate.key,
        })
  const mail =
    source === null
      ? (() => {
          const text = buildOccurrenceMail({
            bodyText: input.bodyText,
            carrierName: carrier?.displayName ?? '',
            operatorName: signer.kind === 'team' ? '' : signer.name,
            subject: input.subject,
          })
          return {
            bodyHtml: text.html,
            bodyText: text.text,
            hasInlineLogo: false,
            subject: text.subject,
          }
        })()
      : (() => {
          const composed = composeOccurrenceMailHtml({
            apiPublicUrl: params.apiPublicUrl,
            appBaseUrl: params.appBaseUrl,
            companyId: params.input.companyId,
            carrier,
            contractorTaxId: params.target.contractorTaxId,
            hasReplyTo: params.delivery.transport === 'resend',
            ...(input.automatic === true ? {} : { operatorText: input.bodyText }),
            signer,
            source,
          })
          return {
            bodyHtml: composed.html,
            bodyText: htmlToPlainText(composed.html),
            hasInlineLogo: composed.hasInlineLogo,
            subject: input.subject.trim(),
          }
        })()
  return {
    ...mail,
    subject:
      carrier === undefined
        ? mail.subject
        : applySubjectPrefix({
            cnpj: carrier.cnpj,
            companyDisplayName: carrier.displayName,
            subject: mail.subject,
          }),
  }
}

async function executeSend(params: {
  readonly apiPublicUrl?: string
  readonly appBaseUrl?: string
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly input: SendOccurrenceMailInput
  readonly logger?: OccurrenceMailLogger
  readonly now: Date
  readonly ownerReader?: OccurrenceOwnerReader
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<SendOccurrenceMailResult> {
  const { input, transaction } = params
  const { companyId } = input

  const target = await transaction.findOccurrenceTarget({
    companyId,
    occurrenceId: input.occurrenceId,
  })
  if (target === null) throw new TripOccurrenceNotFoundError()
  if (target.contractorId === null) throw new OccurrenceConversationContractorUnknownError()
  const { contractorId } = target

  const contactIds = [...new Set(input.contactIds)]
  const fingerprint = await createMailFingerprint({
    fields: [
      companyId,
      input.occurrenceId,
      [...contactIds].sort().join(','),
      ...excludedFingerprintFields(input.excludedWatcherUserIds),
      input.subject.trim(),
      input.bodyText.trim(),
      (input.attachmentIds ?? []).join(','),
    ],
    fingerprintService: params.fingerprintService,
    operation: SEND_OCCURRENCE_MAIL_OPERATION,
  })
  const replay = await findMailReplay({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    transaction,
  })
  if (replay !== null) return replay

  const readiness = await resolveMailReadiness({
    companyId,
    sandbox: params.contractorMailSandbox,
    transaction,
  })

  const notificationTemplate = await resolveNotificationTemplate({ input, target, transaction })

  if (input.contractorReplyResend === true && input.actorUserId !== null) {
    await assertContractorReplyResendRecorded({
      actorUserId: input.actorUserId,
      companyId,
      now: params.now,
      occurrenceId: input.occurrenceId,
      transaction,
    })
  }

  const recipients = await resolveMailRecipients({
    companyId,
    contactIds,
    contractorId,
    transaction,
  })
  const copy = await resolveMailCc({
    automatic: input.automatic === true,
    companyId,
    contractorId,
    excludedUserIds: input.excludedWatcherUserIds ?? [],
    logger: params.logger,
    occurrenceTypeId: target.occurrenceTypeId,
    recipients,
    transaction,
  })

  const carrier = await transaction.findCarrierIdentity({ companyId })
  const signer = await resolveMailSigner({
    input,
    kind: target.kind,
    ownerReader: params.ownerReader ?? NULL_OCCURRENCE_OWNER_READER,
    transaction,
  })

  const { conversation, delivery, existingThread, threadId } = await prepareMailDelivery({
    companyId,
    contractorId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    readiness,
    sandbox: params.contractorMailSandbox,
    secretService: params.secretService,
    transaction,
  })

  const mail = await buildMail({
    apiPublicUrl: params.apiPublicUrl,
    appBaseUrl: params.appBaseUrl,
    carrier,
    delivery,
    input,
    notificationTemplate,
    signer,
    target,
    transaction,
  })
  const fromDisplayName =
    carrier === undefined
      ? ''
      : buildSenderDisplayName({ companyDisplayName: carrier.displayName, signer })

  const { response } = await recordMailDelivery({
    actorUserId: input.actorUserId,
    attachmentIds: input.attachmentIds ?? [],
    automatic: input.automatic === true,
    bodyHtml: mail.bodyHtml,
    bodyText: mail.bodyText,
    ccAddresses: copy,
    companyId,
    contractorId,
    conversationId: conversation.id,
    correlationId: input.correlationId,
    delivery,
    fingerprint,
    fromDisplayName: fromDisplayName === '' ? null : fromDisplayName,
    hasInlineLogo: mail.hasInlineLogo,
    idempotencyKey: input.idempotencyKey,
    messageText: input.bodyText.trim(),
    notificationTemplate,
    now: params.now,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    recipients,
    storage: params.storage,
    subject: mail.subject,
    threadExists: existingThread !== undefined,
    threadId,
    transaction,
  })

  if (input.automatic === true) {
    await openContractorReplyWhenConfigured({
      companyId,
      contractorId,
      conversationId: conversation.id,
      logger: params.logger,
      now: params.now,
      occurrenceId: input.occurrenceId,
      transaction,
    })
  }

  await saveMailReplay({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    response,
    transaction,
  })
  return response
}
