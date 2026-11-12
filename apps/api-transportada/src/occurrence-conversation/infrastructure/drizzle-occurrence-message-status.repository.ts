/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF14: o status que o provedor dá à mensagem da conversa — Resend no e-mail (T405), Meta
 * no WhatsApp (T502). O id do provedor acha a mensagem **dentro da empresa** de quem entregou o
 * evento; a política decide (só avança; repetido não muda nada); a linha fica travada enquanto isso,
 * e dois eventos da mesma mensagem chegando juntos não se atropelam. Id que não é de conversa não
 * acha nada e não muda nada. Spec 283: a mensagem da conversa do cliente da mesma entrega avança junto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  type OccurrenceConversationChannel,
  type OccurrenceConversationMessageStatus,
} from '../../database/database.schema.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type LockedMessage = {
  readonly id: string
  readonly status: OccurrenceConversationMessageStatus | null
  readonly statusTimes: Record<string, string>
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function advance(
  transaction: Transaction,
  input: {
    readonly at: Date
    readonly channel: OccurrenceConversationChannel
    readonly companyId: string
    readonly incoming: OccurrenceConversationMessageStatus
  },
  message: LockedMessage | undefined,
): Promise<void> {
  if (message === undefined || message.status === null) return
  const result = applyMessageStatus({
    at: input.at.toISOString(),
    channel: input.channel,
    current: { status: message.status, statusTimes: message.statusTimes },
    incoming: input.incoming,
  })
  if (!result.changed) return
  await transaction
    .update(occurrenceConversationMessages)
    .set({ status: result.status, statusTimes: { ...result.statusTimes } })
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.id, message.id),
      ),
    )
}

/**
 * Spec 283 (RF5): a mensagem da conversa do cliente não guarda o id do provedor (o aviso do motorista já o tem, e o
 * id é único no canal). Ela é achada pela entrega que conta: no WhatsApp pelo `provider_message_id` da entrega, no
 * e-mail pelo id do Resend do e-mail da entrega.
 */
async function findClientMessage(
  transaction: Transaction,
  input: {
    readonly channel: OccurrenceConversationChannel
    readonly companyId: string
    readonly providerMessageId: string
  },
): Promise<LockedMessage | undefined> {
  if (input.channel !== 'whatsapp' && input.channel !== 'email') return undefined
  const [row] = await transaction
    .select({
      id: occurrenceConversationMessages.id,
      status: occurrenceConversationMessages.status,
      statusTimes: occurrenceConversationMessages.statusTimes,
    })
    .from(occurrenceConversationMessages)
    .innerJoin(
      occurrenceContractorReplyDeliveries,
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, occurrenceConversationMessages.companyId),
        eq(occurrenceContractorReplyDeliveries.id, occurrenceConversationMessages.clientDeliveryId),
      ),
    )
    .leftJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceContractorReplyDeliveries.companyId),
        eq(contractorMailMessages.id, occurrenceContractorReplyDeliveries.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.channel, input.channel),
        input.channel === 'whatsapp'
          ? eq(occurrenceContractorReplyDeliveries.providerMessageId, input.providerMessageId)
          : eq(contractorMailMessages.providerEmailId, input.providerMessageId),
      ),
    )
    .for('update', { of: occurrenceConversationMessages })
    .limit(1)
  return row
}

export async function applyProviderMessageStatus(
  database: Database,
  input: {
    readonly at: Date
    readonly channel: OccurrenceConversationChannel
    readonly companyId: string
    readonly incoming: OccurrenceConversationMessageStatus
    readonly providerMessageId: string
  },
): Promise<void> {
  await database.transaction(async (transaction) => {
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
          eq(occurrenceConversationMessages.channel, input.channel),
          eq(occurrenceConversationMessages.providerMessageId, input.providerMessageId),
        ),
      )
      .for('update')
      .limit(1)
    await advance(transaction, input, message)
    await advance(transaction, input, await findClientMessage(transaction, input))
  })
}
