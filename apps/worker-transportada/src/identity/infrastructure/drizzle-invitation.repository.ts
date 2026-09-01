/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  identityUserPictures,
  identityUserProfiles,
  userInvitations,
} from '../../database/invitation-delivery.schema.js'
import type {
  InvitationContactChannel,
  InvitationDeliveryRecord,
} from '../application/deliver-invitation-code.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const DELIVERABLE_CHANNELS: readonly string[] = ['email', 'sms', 'whatsapp']
const DEFAULT_ACTIVATION_CHANNEL = 'email'

export class DrizzleInvitationDeliveryRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /** Só convite pendente é entregável: aceito, revogado ou substituído não tem código a entregar. */
  async findForDelivery(params: {
    readonly companyId: string
    readonly invitationId: string
  }): Promise<InvitationDeliveryRecord | undefined> {
    const [row] = await this.#database
      .select({
        companyId: userInvitations.companyId,
        contactAddress: identityUserProfiles.contactAddress,
        recipientName: identityUserProfiles.name,
        recipientPictureToken: identityUserPictures.publicToken,
        // O canal é da empresa; sem configuração fiscal ainda não há escolha e vale o padrão.
        contactChannel: companyFiscalProfiles.activationChannel,
        id: userInvitations.id,
        sealedCode: userInvitations.sealedCode,
        userId: userInvitations.userId,
      })
      .from(userInvitations)
      .innerJoin(identityUserProfiles, eq(identityUserProfiles.userId, userInvitations.userId))
      .leftJoin(identityUserPictures, eq(identityUserPictures.userId, userInvitations.userId))
      .leftJoin(
        companyFiscalProfiles,
        eq(companyFiscalProfiles.companyId, userInvitations.companyId),
      )
      .where(
        and(
          eq(userInvitations.companyId, params.companyId),
          eq(userInvitations.id, params.invitationId),
          eq(userInvitations.status, 'pending'),
        ),
      )
      .limit(1)

    if (row === undefined || row.sealedCode === null) return undefined
    const contactChannel = row.contactChannel ?? DEFAULT_ACTIVATION_CHANNEL
    if (!DELIVERABLE_CHANNELS.includes(contactChannel)) {
      throw new Error('Unsupported invitation contact channel')
    }

    return {
      companyId: row.companyId,
      contactAddress: row.contactAddress,
      contactChannel: contactChannel as InvitationContactChannel,
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
    readonly invitationId: string
  }): Promise<void> {
    await this.#database
      .update(userInvitations)
      .set({ deliveredAt: params.deliveredAt, updatedAt: params.deliveredAt })
      .where(
        and(
          eq(userInvitations.companyId, params.companyId),
          eq(userInvitations.id, params.invitationId),
        ),
      )
  }
}
