/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 (ADR-0111, D5/D6/D10/D11): o chat da contratante envia por e-mail. O operador só escreve o texto e os
 * anexos; o servidor resolve o resto: os destinatários (os pré-marcados da prévia), a cópia da 267, o assunto da linha
 * (D6), o assinante (o operador) e o corpo, que é o modelo padrão do módulo de notificação. **Sem modelo do tipo**: o
 * chat nunca é 409 de modelo — o padrão embutido é a rede de segurança. A entrega (prontidão, thread, gravação,
 * idempotência) é a do diálogo (`occurrence-mail-delivery.service.ts`).
 *
 * ⚠️ **A conversa não decide** (183 D4): nada aqui toca a tratativa, a taxa ou o acerto da 164.
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { buildChatMailSubject } from '../domain/occurrence-chat-mail-subject.policy.js'
import { resolveOccurrenceRecipients } from '../domain/occurrence-contractor-recipients.policy.js'
import {
  OCCURRENCE_MAIL_LIMITS,
  SEND_CLIENT_CHAT_MAIL_OPERATION,
  SEND_OCCURRENCE_CHAT_MAIL_OPERATION,
} from '../domain/occurrence-conversation.constant.js'
import {
  OccurrenceChatMailNoRecipientsError,
  OccurrenceChatMailNotConfiguredError,
  OccurrenceChatMailTooLargeError,
  OccurrenceConversationContractorUnknownError,
  OccurrenceConversationMailInvalidError,
} from '../domain/occurrence-conversation.error.js'
import {
  brandChatMail,
  CHAT_MAIL_FOOTER_PLACEHOLDER,
} from '../domain/occurrence-chat-mail-branding.policy.js'
import { buildFooterMarks } from '../domain/occurrence-mail-system-html.policy.js'
import {
  buildPublicMailAssetUrls,
  COMPANY_LOGO_CONTENT_ID,
  OCCURRENCE_MAIL_PRODUCT_SIGNATURE,
  OCCURRENCE_MAIL_REPLY_STRIP,
} from '../domain/occurrence-mail-html.constant.js'
import { buildSenderDisplayName } from '../domain/occurrence-mail-sender-name.policy.js'
import { buildSignerValues } from '../domain/occurrence-mail-signer.policy.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import type { createContractorPortalChatNotice } from './contractor-portal-chat-notice.service.js'
import {
  createMailFingerprint,
  findMailReplay,
  prepareMailDelivery,
  recordMailDelivery,
  resolveMailCc,
  resolveMailReadiness,
  resolveMailRecipients,
  saveMailReplay,
  type OccurrenceMailLogger,
  type OccurrenceMailSandbox,
} from './occurrence-mail-delivery.service.js'
import type {
  OccurrenceMailTarget,
  OccurrenceMailUnitOfWorkPort,
  SendOccurrenceMailResult,
} from './occurrence-mail.port.js'
import type {
  ResolvedStandardEmailTemplate,
  StandardEmailRendererPort,
} from './standard-email-renderer.port.js'

export type SendOccurrenceChatMailInput = {
  readonly actorUserId: string
  readonly attachmentIds?: readonly string[]
  readonly bodyText: string
  readonly companyId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
}

export type SendOccurrenceChatMailUseCase = Readonly<{
  send: (input: SendOccurrenceChatMailInput) => Promise<SendOccurrenceMailResult>
}>

type Executed = {
  /** `To` e `Cc` do e-mail gravado; vazio no replay (o aviso do portal já saiu da primeira vez). */
  readonly mailAddresses: readonly string[]
  readonly response: SendOccurrenceMailResult
}

/** Spec 287: o chat do cliente por e-mail: o mesmo envio, para os e-mails do cliente e na conversa `client_email`. */
export function createSendClientChatMailUseCase(
  dependencies: ChatMailDependencies,
): SendOccurrenceChatMailUseCase {
  return createChatMailUseCase(dependencies, 'client')
}

export function createSendOccurrenceChatMailUseCase(
  dependencies: ChatMailDependencies,
): SendOccurrenceChatMailUseCase {
  return createChatMailUseCase(dependencies, 'contractor')
}

type ChatMailAudience = 'client' | 'contractor'

type ChatMailDependencies = {
  /** A origem pública da API: o logo do cabeçalho vai branco por endereço estável; ausente, por `cid:`. */
  readonly apiPublicUrl?: string
  /** A origem do painel, para as marcas do rodapé; ausente, o rodapé sai só em texto. */
  readonly appBaseUrl?: string
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly logger?: OccurrenceMailLogger
  readonly now?: () => Date
  /** O aviso sem corpo do portal (D2), depois do commit; ausente, sem aviso. */
  readonly portalNotice?: Pick<ReturnType<typeof createContractorPortalChatNotice>, 'notify'>
  /**
   * O modelo padrão do módulo de notificação. Ausente (pacote ainda não ligado neste ambiente), a variante chat
   * responde 503 `OCCURRENCE_CHAT_MAIL_NOT_CONFIGURED` — nunca cai num HTML montado aqui.
   */
  readonly renderer?: StandardEmailRendererPort
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: OccurrenceMailUnitOfWorkPort
}

function createChatMailUseCase(
  dependencies: ChatMailDependencies,
  audience: ChatMailAudience,
): SendOccurrenceChatMailUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    send: async (input) => {
      const { renderer } = dependencies
      if (renderer === undefined) throw new OccurrenceChatMailNotConfiguredError()
      const bodyText = input.bodyText.trim()
      /** O texto só pode ir vazio com anexo (foto, arquivo ou áudio); a conversa grava o vazio como nos outros canais. */
      if (
        (bodyText === '' && (input.attachmentIds?.length ?? 0) === 0) ||
        bodyText.length > OCCURRENCE_MAIL_LIMITS.body ||
        /** Spec 287: o e-mail ao cliente ainda não leva anexo (o upload é da conversa da contratante). */
        (audience === 'client' && (input.attachmentIds?.length ?? 0) > 0)
      ) {
        throw new OccurrenceConversationMailInvalidError()
      }
      /** Fora da transação: a leitura do modelo não segura conexão; dentro dela só o render puro. */
      const template = await renderer.resolve({ companyId: input.companyId })
      const executed = await dependencies.unitOfWork.execute((transaction) =>
        executeChatSend({
          ...dependencies,
          audience,
          bodyText,
          input,
          now: now(),
          renderer,
          template,
          transaction,
        }),
      )
      if (audience === 'contractor' && executed.mailAddresses.length > 0) {
        try {
          await dependencies.portalNotice?.notify({
            companyId: input.companyId,
            mailAddresses: executed.mailAddresses,
            messageId: executed.response.conversationMessageId,
            occurrenceId: input.occurrenceId,
          })
        } catch {
          dependencies.logger?.warn('occurrence_chat_portal_notice_failed', {
            occurrenceId: input.occurrenceId,
          })
        }
      }
      return executed.response
    },
  }
}

async function executeChatSend(params: {
  readonly audience: ChatMailAudience
  readonly apiPublicUrl?: string
  readonly appBaseUrl?: string
  readonly bodyText: string
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly input: SendOccurrenceChatMailInput
  readonly logger?: OccurrenceMailLogger
  readonly now: Date
  readonly renderer: StandardEmailRendererPort
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly template: ResolvedStandardEmailTemplate
  readonly transaction: Parameters<Parameters<OccurrenceMailUnitOfWorkPort['execute']>[0]>[0]
}): Promise<Executed> {
  const { bodyText, input, transaction } = params
  const { companyId } = input
  const attachmentIds = input.attachmentIds ?? []

  const target = await transaction.findOccurrenceTarget({
    companyId,
    occurrenceId: input.occurrenceId,
  })
  if (target === null) throw new TripOccurrenceNotFoundError()
  if (target.contractorId === null) throw new OccurrenceConversationContractorUnknownError()
  const { contractorId } = target
  const isClient = params.audience === 'client'
  const operation = isClient ? SEND_CLIENT_CHAT_MAIL_OPERATION : SEND_OCCURRENCE_CHAT_MAIL_OPERATION
  const clientAudience = isClient
    ? await transaction.findClientEmailAudience({ companyId, occurrenceId: input.occurrenceId })
    : null
  if (isClient && (clientAudience === null || clientAudience.addresses.length === 0)) {
    params.logger?.warn('occurrence_chat_mail_no_recipients', { occurrenceId: input.occurrenceId })
    throw new OccurrenceChatMailNoRecipientsError()
  }

  const fingerprint = await createMailFingerprint({
    fields: [
      companyId,
      input.occurrenceId,
      isClient ? 'client-chat' : 'chat',
      bodyText,
      [...attachmentIds].sort().join(','),
    ],
    fingerprintService: params.fingerprintService,
    operation,
  })
  const replay = await findMailReplay({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    operation,
    transaction,
  })
  if (replay !== null) return { mailAddresses: [], response: replay }

  const readiness = await resolveMailReadiness({
    companyId,
    sandbox: params.contractorMailSandbox,
    transaction,
  })

  const { copy, recipients } =
    clientAudience === null
      ? await resolveContractorRecipients({
          contractorId,
          logger: params.logger,
          target,
          transaction,
          companyId,
          occurrenceId: input.occurrenceId,
        })
      : { copy: [] as readonly string[], recipients: clientAudience.addresses }

  const carrier = await transaction.findCarrierIdentity({ companyId })
  const operator = await transaction.findOperatorSigner({
    companyId,
    userId: input.actorUserId,
  })
  const displayName = carrier?.displayName ?? ''
  const signer =
    operator === undefined
      ? ({ kind: 'team' } as const)
      : ({
          ...(operator.jobTitle === undefined ? {} : { jobTitle: operator.jobTitle }),
          kind: 'operator',
          name: operator.name,
          userId: input.actorUserId,
        } as const)
  const signerValues = buildSignerValues({ companyDisplayName: displayName, signer })

  const uploads =
    attachmentIds.length === 0
      ? []
      : await transaction.attachments.lockPendingUploads({
          ids: attachmentIds,
          target: {
            channel: 'email',
            companyId,
            occurrenceId: input.occurrenceId,
            occurrenceKind: target.kind,
            participant: 'contractor',
            requestedByUserId: input.actorUserId,
          },
        })
  const hasLogo = carrier?.hasLogo === true
  const publicAssets = buildPublicMailAssetUrls({
    apiPublicUrl: params.apiPublicUrl,
    companyId,
  })
  /** Com endereço público o logo vai branco por URL, sem parte inline; sem ele, segue por `cid:`. */
  const logoUrl = hasLogo ? publicAssets?.logoWhite : undefined
  const hasInlineLogo = hasLogo && logoUrl === undefined
  const rendered = params.renderer.render({
    input: {
      attachments: uploads.map((upload) => ({ name: upload.fileName })),
      bodyText,
      footer: {
        platformNote: CHAT_MAIL_FOOTER_PLACEHOLDER,
      },
      identity: {
        displayName,
        logo: hasLogo ? { contentId: COMPANY_LOGO_CONTENT_ID, kind: 'cid' } : { kind: 'initials' },
      },
      ...(readiness.ready ? { replyHint: OCCURRENCE_MAIL_REPLY_STRIP } : {}),
      signer: {
        name: signerValues.assinaturaNome,
        ...(signerValues.assinaturaCargo === '' ? {} : { role: signerValues.assinaturaCargo }),
      },
    },
    template: params.template,
  })
  if (rendered.tooLarge) throw new OccurrenceChatMailTooLargeError()
  const branded = brandChatMail({
    footerHtml: buildFooterMarks(params.appBaseUrl),
    footerText: OCCURRENCE_MAIL_PRODUCT_SIGNATURE,
    html: rendered.html,
    logoUrl,
    text: rendered.text,
  })

  const facts = await transaction.findChatMailSubjectFacts({
    companyId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
  })
  const subject = buildChatMailSubject({ ...facts, carrier })

  const { conversation, delivery, existingThread, threadId } = await prepareMailDelivery({
    ...(clientAudience === null ? {} : { client: { taxId: clientAudience.taxId } }),
    companyId,
    contractorId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    readiness,
    sandbox: params.contractorMailSandbox,
    secretService: params.secretService,
    transaction,
  })
  const fromDisplayName =
    carrier === undefined ? '' : buildSenderDisplayName({ companyDisplayName: displayName, signer })

  const { response } = await recordMailDelivery({
    actorUserId: input.actorUserId,
    attachmentIds,
    automatic: false,
    bodyHtml: branded.html,
    bodyText: branded.text,
    ccAddresses: copy,
    companyId,
    contractorId,
    conversationId: conversation.id,
    correlationId: input.correlationId,
    delivery,
    fingerprint,
    fromDisplayName: fromDisplayName === '' ? null : fromDisplayName,
    hasInlineLogo,
    idempotencyKey: input.idempotencyKey,
    messageText: bodyText,
    notificationTemplate: { key: rendered.template.key, version: rendered.template.version },
    now: params.now,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    recipients,
    storage: params.storage,
    subject,
    ...(isClient ? { threadAudience: 'client' as const } : {}),
    threadExists: existingThread !== undefined,
    threadId,
    transaction,
  })
  await saveMailReplay({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    operation,
    response,
    transaction,
  })
  params.logger?.info?.('occurrence_chat_mail_sent', {
    attachments: attachmentIds.length,
    cc: copy.length,
    recipients: recipients.length,
    transport: delivery.transport,
  })
  return { mailAddresses: [...recipients, ...copy], response }
}

async function resolveContractorRecipients(params: {
  readonly companyId: string
  readonly contractorId: string
  readonly logger: OccurrenceMailLogger | undefined
  readonly occurrenceId: string
  readonly target: OccurrenceMailTarget
  readonly transaction: Parameters<Parameters<OccurrenceMailUnitOfWorkPort['execute']>[0]>[0]
}): Promise<{ readonly copy: readonly string[]; readonly recipients: readonly string[] }> {
  const { companyId, contractorId, target, transaction } = params
  /** Os pré-marcados: a mesma regra da prévia (os escolhidos no tipo; sem escolha, os da etapa). */
  const [candidates, chosenContactIds] = await Promise.all([
    transaction.listOccurrenceRecipients({ companyId, contractorId }),
    target.occurrenceTypeId === null
      ? []
      : transaction.findChosenOccurrenceRecipientIds({
          companyId,
          occurrenceTypeId: target.occurrenceTypeId,
        }),
  ])
  const { contactIds } = resolveOccurrenceRecipients({
    chosenContactIds,
    contacts: candidates.map((candidate) => ({
      email: candidate.email,
      id: candidate.id,
      occurrenceStages: candidate.occurrenceStages,
    })),
    stage: target.stage,
  })
  if (contactIds.length === 0) {
    params.logger?.warn('occurrence_chat_mail_no_recipients', { occurrenceId: params.occurrenceId })
    throw new OccurrenceChatMailNoRecipientsError()
  }
  const recipients = await resolveMailRecipients({
    companyId,
    contactIds,
    contractorId,
    transaction,
  })
  const copy = await resolveMailCc({
    automatic: false,
    companyId,
    contractorId,
    excludedUserIds: [],
    logger: params.logger,
    occurrenceTypeId: target.occurrenceTypeId,
    recipients,
    transaction,
  })

  return { copy, recipients }
}
