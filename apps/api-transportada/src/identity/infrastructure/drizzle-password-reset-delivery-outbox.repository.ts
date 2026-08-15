/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { passwordResetDeliveryOutbox } from '../../database/database.schema.js'
import type { PasswordResetDeliveryOutboxPort } from '../application/password-reset.port.js'

type PasswordResetDeliveryOutboxDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Só insere: quem publica e reprocessa é o relay, pelo mesmo mecanismo de claim/backoff dos outros
 * trilhos. `next_attempt_at` nasce agora porque o código tem quinze minutos de validade.
 */
export class DrizzlePasswordResetDeliveryOutboxRepository
  implements PasswordResetDeliveryOutboxPort
{
  public constructor(private readonly database: PasswordResetDeliveryOutboxDatabase) {}

  public save: PasswordResetDeliveryOutboxPort['save'] = async (input) => {
    await this.database.insert(passwordResetDeliveryOutbox).values({
      companyId: input.companyId,
      correlationId: input.correlationId,
      eventId: input.eventId,
      eventType: input.eventType,
      eventVersion: BigInt(input.eventVersion),
      nextAttemptAt: new Date(),
      payload: input.payload,
      requestId: input.requestId,
    })
  }
}
