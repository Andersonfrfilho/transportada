/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { invitationDeliveryOutbox } from '../../database/database.schema.js'
import type { InvitationDeliveryOutboxPort } from '../application/invitation.port.js'

type InvitationDeliveryOutboxDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Só insere: quem publica e reprocessa é o relay, pelo mesmo mecanismo de claim/backoff dos outros
 * trilhos. `next_attempt_at` nasce agora porque a entrega do código não espera janela nenhuma.
 */
export class DrizzleInvitationDeliveryOutboxRepository implements InvitationDeliveryOutboxPort {
  public constructor(private readonly database: InvitationDeliveryOutboxDatabase) {}

  public save: InvitationDeliveryOutboxPort['save'] = async (input) => {
    await this.database.insert(invitationDeliveryOutbox).values({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      correlationId: input.correlationId,
      eventId: input.eventId,
      eventType: input.eventType,
      eventVersion: BigInt(input.eventVersion),
      invitationId: input.invitationId,
      nextAttemptAt: new Date(),
      payload: input.payload,
    })
  }
}
