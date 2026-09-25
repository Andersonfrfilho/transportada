/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403 (RF7): as portas do e-mail da conversa com a contratante. O trilho continua o da
 * 143 — thread por objeto, token derivado, `contractor_mail_messages` e outbox na mesma transação —;
 * esta porta só acrescenta a conversa e a mensagem de conversa que aponta para a mensagem da 143.
 */
import type { ConversationAttachmentTransactionPort } from './conversation-attachment.port.js'
import type {
  ContractorContactOccurrenceStage,
  ContractorContactType,
} from '../../database/contractor-mail.schema.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'

/** A ocorrência como o e-mail precisa dela: de que tipo, e de qual contratante (pelo emitente). */
export type OccurrenceMailTarget = {
  readonly contractorId: string | null
  readonly contractorName: string
  readonly kind: OccurrenceConversationKind
  /** O grupo da ocorrência nos contatos (RF5): a de parada não tem etapa e é `stop`. */
  readonly stage: ContractorContactOccurrenceStage
}

/** Spec 183 T407: quem o diálogo oferece — ativos da contratante que recebem ocorrências. */
export type OccurrenceMailRecipientCandidate = {
  readonly email: string
  readonly id: string
  readonly name: string
  readonly occurrenceStages: readonly ContractorContactOccurrenceStage[]
  readonly roleLabel: string
  readonly types: readonly ContractorContactType[]
}

export type OccurrenceMailSettings = {
  readonly id: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly sendingVerifiedAt: Date | null
}

export type OccurrenceMailContact = {
  readonly email: string
  readonly id: string
}

export type SendOccurrenceMailResult = {
  readonly conversationId: string
  readonly conversationMessageId: string
  readonly mailMessageId: string
  readonly recipientCount: number
  readonly threadId: string
}

export type OccurrenceMailIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: SendOccurrenceMailResult
}

export type RecordOccurrenceMailInput = {
  readonly actorUserId: string
  readonly bodyHtml: string
  readonly bodyText: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  /** `true` na primeira mensagem: a thread da 143 nasce com o hash do token de resposta. */
  readonly createThread: boolean
  readonly fromAddress: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceConversationKind
  readonly replyTokenHash: string
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
}

export type OccurrenceMailTransactionPort = {
  /** Spec 183 T702e: o anexo do e-mail liga à mensagem da conversa, pela mesma porta do app. */
  readonly attachments: ConversationAttachmentTransactionPort
  findOccurrenceTarget(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceMailTarget | null>
  findIdempotency(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<OccurrenceMailIdempotencyRecord | null>
  saveIdempotency(params: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly response: SendOccurrenceMailResult
  }): Promise<void>
  findMailSettings(params: {
    readonly companyId: string
  }): Promise<OccurrenceMailSettings | undefined>
  /** Os candidatos a destinatário do diálogo, na ordem do cadastro. */
  listOccurrenceRecipients(params: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<readonly OccurrenceMailRecipientCandidate[]>
  /** Contatos **ativos** desta contratante que recebem ocorrências; o resto não é achado. */
  findOccurrenceContacts(params: {
    readonly companyId: string
    readonly contactIds: readonly string[]
    readonly contractorId: string
  }): Promise<readonly OccurrenceMailContact[]>
  findCarrierName(params: { readonly companyId: string }): Promise<string | undefined>
  findOperatorName(params: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined>
  /** A conversa com a contratante desta ocorrência; criada na primeira mensagem. */
  findOrCreateContractorConversation(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
    readonly publicRef: string
  }): Promise<{ readonly id: string }>
  /** A thread da 143 do objeto; `undefined` antes da primeira mensagem. */
  findOccurrenceThread(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }): Promise<{ readonly id: string } | undefined>
  /** Thread (quando nova), mensagem da 143 e o evento de envio no outbox, na mesma transação. */
  recordMail(params: RecordOccurrenceMailInput): Promise<{ readonly messageId: string }>
  /** A mensagem da conversa nasce no status inicial do e-mail (`queued`, T402), com o horário. */
  recordConversationMessage(params: {
    readonly authorUserId: string
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly mailMessageId: string
    readonly queuedAt: string
  }): Promise<{ readonly id: string }>
}

export type OccurrenceMailUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: OccurrenceMailTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O texto que o tipo da ocorrência oferece (spec 079); `null` no tipo sem e-mail. */
export type OccurrenceSuggestedMailPort = {
  readSuggestedMail(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<{ readonly bodyText: string; readonly subject: string } | null>
}
