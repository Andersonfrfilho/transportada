/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gt, isNull } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  identityUserPictures,
  identityUserProfiles,
} from '../../database/invitation-delivery.schema.js'
import { passwordResetRequests } from '../../database/password-reset-delivery.schema.js'
import type {
  PasswordResetContactChannel,
  PasswordResetDeliveryRecord,
} from '../application/deliver-password-reset-code.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const DELIVERABLE_CHANNELS: readonly string[] = ['email', 'sms', 'whatsapp']
const DEFAULT_ACTIVATION_CHANNEL = 'email'

export class DrizzlePasswordResetDeliveryRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * Só pedido vivo é entregável: consumido ou expirado não tem código a entregar, e a mensagem
   * atrasada na fila não pode ressuscitar um código que já não vale.
   */
  async findForDelivery(params: {
    readonly companyId: string
    readonly requestId: string
  }): Promise<PasswordResetDeliveryRecord | undefined> {
    const [row] = await this.#database
      .select({
        companyId: passwordResetRequests.companyId,
        contactAddress: identityUserProfiles.contactAddress,
        recipientName: identityUserProfiles.name,
        recipientPictureToken: identityUserPictures.publicToken,
        contactChannel: companyFiscalProfiles.activationChannel,
        id: passwordResetRequests.id,
        sealedCode: passwordResetRequests.sealedCode,
        userId: passwordResetRequests.userId,
      })
      .from(passwordResetRequests)
      .innerJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, passwordResetRequests.userId),
      )
      .leftJoin(identityUserPictures, eq(identityUserPictures.userId, passwordResetRequests.userId))
      .leftJoin(
        companyFiscalProfiles,
        eq(companyFiscalProfiles.companyId, passwordResetRequests.companyId),
      )
      .where(
        and(
          eq(passwordResetRequests.companyId, params.companyId),
          eq(passwordResetRequests.id, params.requestId),
          isNull(passwordResetRequests.consumedAt),
          gt(passwordResetRequests.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (row === undefined || row.sealedCode === null) return undefined
    const contactChannel = row.contactChannel ?? DEFAULT_ACTIVATION_CHANNEL
    if (!DELIVERABLE_CHANNELS.includes(contactChannel)) {
      throw new Error('Unsupported password reset contact channel')
    }

    return {
      companyId: row.companyId,
      contactAddress: row.contactAddress,
      contactChannel: contactChannel as PasswordResetContactChannel,
      id: row.id,
      recipientName: row.recipientName,
      ...(row.recipientPictureToken === null
        ? {}
        : { recipientPictureToken: row.recipientPictureToken }),
      sealedCode: row.sealedCode,
      userId: row.userId,
    }
  }

  async markDelivered(params: {
    readonly companyId: string
    readonly deliveredAt: Date
    readonly requestId: string
  }): Promise<void> {
    await this.#database
      .update(passwordResetRequests)
      .set({ deliveredAt: params.deliveredAt, updatedAt: params.deliveredAt })
      .where(
        and(
          eq(passwordResetRequests.companyId, params.companyId),
          eq(passwordResetRequests.id, params.requestId),
        ),
      )
  }
}
