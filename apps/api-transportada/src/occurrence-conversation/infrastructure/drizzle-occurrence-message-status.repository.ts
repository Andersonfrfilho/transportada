/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF14: o status que o provedor dá à mensagem da conversa — Resend no e-mail (T405), Meta
 * no WhatsApp (T502). O id do provedor acha a mensagem **dentro da empresa** de quem entregou o
 * evento; a política decide (só avança; repetido não muda nada); a linha fica travada enquanto isso,
 * e dois eventos da mesma mensagem chegando juntos não se atropelam. Id que não é de conversa não
 * acha nada e não muda nada.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  type OccurrenceConversationChannel,
  type OccurrenceConversationMessageStatus,
} from '../../database/database.schema.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

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
  })
}
