/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T405 (RF14): o status que o Resend dá ao e-mail da conversa, vindo do webhook assinado da
 * 143 — pelo id do Resend (`provider_message_id`, gravado pelo worker quando o envio é aceito), na
 * empresa do webhook. A regra é a mesma de todo canal (`applyProviderMessageStatus`).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { OccurrenceMailStatusPort } from '../../contractor-mail/application/process-inbound-email-webhook.use-case.js'
import { applyProviderMessageStatus } from './drizzle-occurrence-message-status.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleOccurrenceMailStatusRepository(
  database: Database,
): OccurrenceMailStatusPort {
  return {
    apply: (input) =>
      applyProviderMessageStatus(database, {
        at: input.at,
        channel: 'email',
        companyId: input.companyId,
        incoming: input.incoming,
        providerMessageId: input.providerEmailId,
      }),
  }
}
