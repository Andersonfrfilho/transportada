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
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { contractorMailMessages } from '../../database/contractor-mail.schema.js'
import {
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  occurrenceConversationMessages,
  type OccurrenceConversationMessageStatus,
} from '../../database/occurrence-conversation.schema.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type OccurrenceConversationTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

/** A thread da 143 pertence a uma conversa quando alguma mensagem enviada dela foi da conversa. */
async function findConversationByThread(
  transaction: OccurrenceConversationTransaction,
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
 * Chamada só quando a mensagem da 143 acabou de nascer — a reentrega não chega aqui, e é isso que a
 * torna única. O corpo acima do teto da conversa entra cortado; o inteiro segue na 143 e no MIME.
 */
export async function recordOccurrenceConversationMailReply(
  transaction: OccurrenceConversationTransaction,
  input: {
    readonly bodyText: string
    readonly companyId: string
    readonly fromAddress: string
    readonly mailMessageId: string
    readonly threadId: string
  },
): Promise<void> {
  const conversationId = await findConversationByThread(transaction, input)
  if (conversationId === undefined) return

  await transaction.insert(occurrenceConversationMessages).values({
    bodyText: input.bodyText.slice(0, OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH),
    channel: 'email',
    companyId: input.companyId,
    conversationId,
    direction: 'inbound',
    mailMessageId: input.mailMessageId,
    senderAddress: input.fromAddress,
  })
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
