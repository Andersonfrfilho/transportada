/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T304 (RF5–RF8): a orquestração fica aqui, nunca no repositório — o que cada leitura significa e
 * qual erro estável ela vira. `execute` do `unitOfWork` é uma transação só (RF6): a conversa, a
 * mensagem, o outbox e o `status = 'sent'` dos pedidos comitam juntos.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import { ContractorMailTemplateNotUsableError } from '../../contractor-mail/domain/contractor-mail-template.error.js'
import { createMailSendReadinessError } from '../../contractor-mail/domain/contractor-mail.error.js'
import { resolveMailSendReadiness } from '../../contractor-mail/domain/mail-send-readiness.policy.js'
import {
  deriveReplyToken,
  hashReplyToken,
} from '../../contractor-mail/domain/reply-token.policy.js'
import { ADDRESS_CORRECTION_SEND_MAIL_OPERATION } from '../domain/address-correction-mail.constant.js'
import { buildAddressCorrectionMail } from '../domain/address-correction-mail.template.js'
import type {
  AddressCorrectionMailItem,
  BuildAddressCorrectionMailParams,
} from '../domain/address-correction-mail.types.js'
import {
  AddressCorrectionContractorNotFoundError,
  AddressCorrectionIdempotencyKeyReusedError,
  AddressCorrectionNoActiveContactError,
  AddressCorrectionNothingToSendError,
  AddressCorrectionRequestNotSendableError,
} from '../domain/address-correction.error.js'
import type {
  AddressCorrectionMailTemplate,
  AddressCorrectionMailTransactionPort,
  AddressCorrectionMailUnitOfWorkPort,
  SendAddressCorrectionMailResult,
} from './address-correction-mail.port.js'
import type { AddressCorrectionRequest } from './address-correction.port.js'

const OPERATION = ADDRESS_CORRECTION_SEND_MAIL_OPERATION
const ENCODER = new TextEncoder()
/** RF12/T302: caractere que injetaria cabeçalho ou trocaria o destinatário no `to` do gateway. */
const UNSAFE_EMAIL_CHARACTERS = /[\r\n,<>]/u
const NO_REQUEST_IDS_MARKER = '__all__'

export type SendAddressCorrectionMailInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly contactIds: readonly string[]
  readonly contractorTaxId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly requestIds: readonly string[] | undefined
  /** Spec 150 T402 (RF15): ausente, vale o modelo padrão do tipo. */
  readonly templateId?: string | undefined
}

export type SendAddressCorrectionMailUseCase = Readonly<{
  send: (input: SendAddressCorrectionMailInput) => Promise<SendAddressCorrectionMailResult>
}>

export function createSendAddressCorrectionMailUseCase(dependencies: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly secretService: ContractorMailCredentialSecretService
  readonly unitOfWork: AddressCorrectionMailUnitOfWorkPort
}): SendAddressCorrectionMailUseCase {
  return {
    send: (input) =>
      dependencies.unitOfWork.execute((transaction) =>
        executeSend({
          fingerprintService: dependencies.fingerprintService,
          input,
          secretService: dependencies.secretService,
          transaction,
        }),
      ),
  }
}

async function executeSend(params: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly input: SendAddressCorrectionMailInput
  readonly secretService: ContractorMailCredentialSecretService
  readonly transaction: AddressCorrectionMailTransactionPort
}): Promise<SendAddressCorrectionMailResult> {
  const { fingerprintService, input, secretService, transaction } = params
  const { companyId } = input

  const contractor = await transaction.findContractorByTaxId({
    companyId,
    taxId: input.contractorTaxId,
  })
  if (contractor === undefined) throw new AddressCorrectionContractorNotFoundError()

  const dedupedContactIds = [...new Set(input.contactIds)]
  const sortedRequestIdsMarker =
    input.requestIds === undefined ? NO_REQUEST_IDS_MARKER : [...input.requestIds].sort().join(',')
  /** O modelo entra no fingerprint só quando escolhido: o envio pelo padrão mantém o de antes. */
  const fingerprint = await fingerprintService.create({
    fields: [
      companyId,
      contractor.id,
      [...dedupedContactIds].sort().join(','),
      sortedRequestIdsMarker,
      ...(input.templateId === undefined ? [] : [`template:${input.templateId}`]),
    ].map((value) => ENCODER.encode(value)),
    operation: OPERATION,
  })

  const replay = await transaction.findIdempotency({
    companyId,
    idempotencyKey: input.idempotencyKey,
  })
  if (replay !== null) {
    if (replay.fingerprint !== fingerprint) throw new AddressCorrectionIdempotencyKeyReusedError()
    return replay.response
  }

  const settingsRow = await transaction.findMailSettings({ companyId })
  const template = await transaction.findMailTemplate({
    companyId,
    ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
  })
  const readiness = resolveMailSendReadiness({ settings: settingsRow, template: template ?? null })
  if (!readiness.ready) {
    /** O modelo escolhido não serve (arquivado, de outro tipo, de outra empresa): código próprio. */
    if (readiness.reason === 'template_missing' && input.templateId !== undefined) {
      throw new ContractorMailTemplateNotUsableError()
    }
    throw createMailSendReadinessError(readiness.reason)
  }
  const { settings } = readiness
  const mailTemplate = template as AddressCorrectionMailTemplate
  const secret = await secretService.decrypt({
    companyId,
    envelope: settings.secretEnvelope as SecretEnvelopeV1,
    settingsId: settings.id,
  })

  const contacts = await transaction.findActiveContactsByIds({
    companyId,
    contactIds: dedupedContactIds,
    contractorId: contractor.id,
  })
  const emailById = new Map(contacts.map((contact) => [contact.id, contact.email]))
  const toAddresses = input.contactIds.map((id) => emailById.get(id))
  if (
    toAddresses.some((email) => email === undefined) ||
    toAddresses.some((email) => email !== undefined && UNSAFE_EMAIL_CHARACTERS.test(email))
  ) {
    throw new AddressCorrectionNoActiveContactError()
  }
  const recipientEmails = deduplicateRecipients(toAddresses as readonly string[])

  const { invalidRequestIds, sendable } = await transaction.findSendableRequests({
    companyId,
    contractorId: contractor.id,
    requestIds: input.requestIds,
  })
  if (invalidRequestIds.length > 0) throw new AddressCorrectionRequestNotSendableError()
  if (sendable.length === 0) throw new AddressCorrectionNothingToSendError()

  const carrierName = (await transaction.findCarrierName({ companyId })) ?? ''
  const operatorName =
    (await transaction.findOperatorName({ companyId, userId: input.actorUserId })) ?? ''

  const mail = buildAddressCorrectionMail(
    buildMailParams({
      carrierName,
      contractorName: contractor.displayName,
      operatorName,
      sendable,
      template: mailTemplate,
    }),
  )

  const threadId = crypto.randomUUID()
  const replyTokenHash = hashReplyToken(
    deriveReplyToken({ companyId, replyTokenSecret: secret.replyTokenSecret, threadId }),
  )

  const recorded = await transaction.recordMail({
    actorUserId: input.actorUserId,
    bodyHtml: mail.html,
    bodyText: mail.text,
    companyId,
    contractorId: contractor.id,
    correlationId: input.correlationId,
    fromAddress: settings.senderAddress,
    replyTokenHash,
    subject: mail.subject,
    templateId: mailTemplate.id,
    threadId,
    toAddresses: recipientEmails,
  })

  const sentRequestIds = sendable.map((request) => request.id)
  await transaction.markRequestsSent({ companyId, requestIds: sentRequestIds, threadId })

  const response: SendAddressCorrectionMailResult = {
    messageId: recorded.messageId,
    recipientCount: recipientEmails.length,
    sentRequestIds,
    threadId,
  }
  await transaction.saveIdempotency({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    response,
  })
  return response
}

function buildMailParams(input: {
  readonly carrierName: string
  readonly contractorName: string
  readonly operatorName: string
  readonly sendable: readonly AddressCorrectionRequest[]
  readonly template: AddressCorrectionMailTemplate
}): BuildAddressCorrectionMailParams {
  const { closing, intro, itemText, subject } = input.template
  return {
    carrierName: input.carrierName,
    contractorName: input.contractorName,
    items: input.sendable.map(toMailItem),
    operatorName: input.operatorName,
    template: { closing, intro, itemText, subject },
  }
}

/**
 * Mesma regra do worker (`send-contractor-mail-outbound-message.use-case.ts`,
 * `deduplicateRecipients`): minúsculas, primeira ocorrência vence — o `to` gravado e o
 * `recipientCount` respondidos batem com o que o gateway do Resend de fato envia.
 */
function deduplicateRecipients(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))]
}

function toMailItem(request: AddressCorrectionRequest): AddressCorrectionMailItem {
  return {
    proposed: request.proposed,
    reason: {
      distanceMetres:
        request.reasonDistanceMetres === null ? null : Number(request.reasonDistanceMetres),
      /** `reasonMatchLevel` é `varchar` no banco (sem ENUM nativo) mas sempre gravado a partir de
       * `ProviderMatchLevel` (`save-address-correction-draft.use-case.ts`, `found.matchLevel`). */
      matchLevel: request.reasonMatchLevel as ProviderMatchLevel,
    },
    recipientName: request.recipientName,
    reported: request.reported,
  }
}
