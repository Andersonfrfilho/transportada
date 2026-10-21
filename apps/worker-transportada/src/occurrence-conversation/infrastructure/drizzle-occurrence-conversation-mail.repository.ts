/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T405 (RF7, RF14): a conversa da ocorrência anda sobre o trilho de e-mail da 143. Duas
 * escritas, sempre dentro da transação da 143 que as provoca e sempre pela `company_id` dela:
 *
 * - a resposta recebida numa thread que tem conversa vira mensagem `inbound` dessa conversa — a thread
 *   acha a conversa pelas mensagens enviadas que a T403 ligou a ela (`mail_message_id`);
 * - o status que o Resend dá ao envio chega à mensagem da conversa pela política (RF14), que só
 *   avança e ignora o repetido.
 *
 * Nenhum log aqui: corpo, assunto e endereço nunca saem do banco.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { contractorMailMessages } from '../../database/contractor-mail.schema.js'
import { identityUserProfiles, userCompanyMemberships } from '../../database/identity.schema.js'
import { storedObjects } from '../../database/nfe.schema.js'
import {
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  type OccurrenceConversationMessageStatus,
} from '../../database/occurrence-conversation.schema.js'
import type { StoredInboundAttachment } from '../application/inbound-mail-attachments.service.js'
import type { DriverReplyNotice } from '../application/driver-reply-notice.port.js'
import type { ContractorReplyLogOutcome } from '../application/contractor-reply-log.port.js'
import { applyContractorReplyToMessage } from './drizzle-occurrence-contractor-reply.repository.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'
import { findOccurrenceLabel } from './occurrence-label.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type OccurrenceConversationTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

/** A thread da 143 pertence a uma conversa quando alguma mensagem enviada dela foi da conversa. */
export async function findOccurrenceConversationByThread(
  transaction: Pick<Database, 'select'>,
  input: { readonly companyId: string; readonly threadId: string },
): Promise<string | undefined> {
  const [row] = await transaction
    .select({ conversationId: occurrenceConversationMessages.conversationId })
    .from(occurrenceConversationMessages)
    .innerJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceConversationMessages.companyId),
        eq(contractorMailMessages.id, occurrenceConversationMessages.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(contractorMailMessages.threadId, input.threadId),
      ),
    )
    .limit(1)
  return row?.conversationId
}

/**
 * Spec 267 RF9: o `From` é de um usuário da empresa com vínculo ativo (o responsável que respondeu a todos). Só vale com
 * DKIM alinhado — a mesma regra do contato —, senão um `From` forjado com o endereço dele passaria por interno.

 */
async function isCompanyUserSender(
  transaction: OccurrenceConversationTransaction,
  input: {
    readonly companyId: string
    readonly dkimResult: string
    readonly fromAddress: string
  },
): Promise<boolean> {
  if (input.dkimResult !== 'aligned') return false
  const [row] = await transaction
    .select({ userId: identityUserProfiles.userId })
    .from(identityUserProfiles)
    .innerJoin(
      userCompanyMemberships,
      eq(userCompanyMemberships.userId, identityUserProfiles.userId),
    )
    .where(
      and(
        eq(userCompanyMemberships.companyId, input.companyId),
        eq(userCompanyMemberships.status, 'active'),
        eq(identityUserProfiles.contactChannel, 'email'),
        sql`lower(${identityUserProfiles.contactAddress}) = ${input.fromAddress.trim().toLowerCase()}`,
      ),
    )
    .limit(1)
  return row !== undefined
}

/**
 * Chamada só quando a mensagem da 143 acabou de nascer — a reentrega não chega aqui, e é isso que a
 * torna única. O corpo acima do teto da conversa entra cortado; o inteiro segue na 143 e no MIME.
 */
export async function recordOccurrenceConversationMailReply(
  transaction: OccurrenceConversationTransaction,
  input: {
    /** Spec 183 T702c1: os anexos já no bucket; viram anexo desta mensagem, na mesma transação. */
    readonly attachments: readonly StoredInboundAttachment[]
    readonly bodyText: string
    readonly companyId: string
    readonly dkimResult: string
    readonly fromAddress: string
    readonly mailMessageId: string
    readonly threadId: string
  },
): Promise<{
  /** Spec 276: o que o retorno da contratante fez com esta mensagem, só para o log; ausente sem conversa. */
  readonly contractorReply?: ContractorReplyLogOutcome | undefined
  readonly driverNotice: DriverReplyNotice | undefined
  readonly linkedAttachments: number
}> {
  const conversationId = await findOccurrenceConversationByThread(transaction, input)
  if (conversationId === undefined) return { driverNotice: undefined, linkedAttachments: 0 }

  const [message] = await transaction
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: input.bodyText.slice(0, OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH),
      channel: 'email',
      companyId: input.companyId,
      conversationId,
      direction: 'inbound',
      mailMessageId: input.mailMessageId,
      senderAddress: input.fromAddress,
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (message === undefined) throw new Error('occurrence conversation mail reply was not inserted')

  /** Spec 276 T2: the PDF text read before the transaction, by the stored object it became. */
  const textByStoredObject = new Map<string, string>()
  for (const attachment of input.attachments) {
    const [object] = await transaction
      .insert(storedObjects)
      .values({
        bucket: attachment.bucket,
        companyId: input.companyId,
        mimeType: attachment.contentType,
        objectKey: attachment.key,
        provider: attachment.provider,
        purpose: 'occurrence_conversation_attachment',
        sha256: attachment.sha256,
        sizeBytes: BigInt(attachment.sizeBytes),
        status: 'final',
      })
      .returning({ id: storedObjects.id })
    if (object === undefined) throw new Error('occurrence conversation attachment object missing')
    await transaction.insert(occurrenceConversationAttachments).values({
      companyId: input.companyId,
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      messageId: message.id,
      sha256: attachment.sha256,
      sizeBytes: attachment.sizeBytes,
      storedObjectId: object.id,
    })
    if (attachment.textLayer !== undefined) textByStoredObject.set(object.id, attachment.textLayer)
  }
  /** O responsável não é "a resposta da contratante": não avança o retorno nem chega ao motorista (spec 267 RF9). */
  if (await isCompanyUserSender(transaction, input)) {
    return {
      contractorReply: { kind: 'company_user_sender' },
      driverNotice: undefined,
      linkedAttachments: input.attachments.length,
    }
  }
  let contractorReply: ContractorReplyLogOutcome | undefined
  const delivery = await applyContractorReplyToMessage(transaction, {
    companyId: input.companyId,
    conversationId,
    messageId: message.id,
    now: new Date(),
    readDocumentText: async (storedObjectId) => textByStoredObject.get(storedObjectId) ?? '',
    report: (outcome) => {
      contractorReply = outcome
    },
  })
  const driverNotice =
    delivery === undefined
      ? undefined
      : {
          companyId: input.companyId,
          driverMessageId: delivery.driverMessageId,
          driverUserId: delivery.driverUserId,
          occurrenceId: delivery.occurrenceId,
          occurrenceLabel: await findOccurrenceLabel(transaction, {
            companyId: input.companyId,
            occurrenceId: delivery.occurrenceId,
          }),
          protocol: delivery.protocol,
        }
  return { contractorReply, driverNotice, linkedAttachments: input.attachments.length }
}

export async function applyOccurrenceConversationMailStatus(
  transaction: OccurrenceConversationTransaction,
  input: {
    readonly at: Date
    readonly companyId: string
    readonly incoming: OccurrenceConversationMessageStatus
    readonly mailMessageId: string
    readonly providerMessageId?: string
  },
): Promise<void> {
  const [message] = await transaction
    .select({
      id: occurrenceConversationMessages.id,
      status: occurrenceConversationMessages.status,
      statusTimes: occurrenceConversationMessages.statusTimes,
    })
    .from(occurrenceConversationMessages)
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.mailMessageId, input.mailMessageId),
        eq(occurrenceConversationMessages.direction, 'outbound'),
      ),
    )
    .for('update')
    .limit(1)
  if (message === undefined || message.status === null) return

  const result = applyMessageStatus({
    at: input.at.toISOString(),
    channel: 'email',
    current: { status: message.status, statusTimes: message.statusTimes },
    incoming: input.incoming,
  })
  if (!result.changed) return

  await transaction
    .update(occurrenceConversationMessages)
    .set({
      status: result.status,
      statusTimes: { ...result.statusTimes },
      ...(input.providerMessageId === undefined
        ? {}
        : { providerMessageId: input.providerMessageId }),
    })
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.id, message.id),
      ),
    )
}
