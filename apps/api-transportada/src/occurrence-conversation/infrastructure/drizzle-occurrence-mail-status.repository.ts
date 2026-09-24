/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T405 (RF14): o status que o Resend dá ao e-mail da conversa, vindo do webhook assinado da
 * 143. O id do Resend (`provider_message_id`, gravado pelo worker quando o envio é aceito) acha a
 * mensagem dentro da empresa do webhook; a política decide, e a linha fica travada enquanto isso —
 * dois eventos do mesmo e-mail chegando juntos não se atropelam. Id que não é de conversa (e-mail só
 * da 143) não acha nada e não muda nada.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { occurrenceConversationMessages } from '../../database/database.schema.js'
import type { OccurrenceMailStatusPort } from '../../contractor-mail/application/process-inbound-email-webhook.use-case.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleOccurrenceMailStatusRepository(
  database: Database,
): OccurrenceMailStatusPort {
  return {
    async apply(input) {
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
              eq(occurrenceConversationMessages.channel, 'email'),
              eq(occurrenceConversationMessages.providerMessageId, input.providerEmailId),
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
          .set({ status: result.status, statusTimes: { ...result.statusTimes } })
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, input.companyId),
              eq(occurrenceConversationMessages.id, message.id),
            ),
          )
      })
    },
  }
}
