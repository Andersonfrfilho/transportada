/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, lte, sql } from 'drizzle-orm'

import { whatsappEvolutionSettings } from '../../database/whatsapp-evolution.schema.js'
import {
  WHATSAPP_GROUP_REQUEST_TIMEOUT_RANGE,
  whatsappGroupRequestMessages,
  whatsappGroupRequests,
} from '../../database/whatsapp-group-request.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../application/whatsapp-group-request.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPEN_UNIQUE = 'whatsapp_group_requests_company_group_open_unique'

const COLUMNS = {
  attempts: whatsappGroupRequests.attempts,
  companyId: whatsappGroupRequests.companyId,
  driverId: whatsappGroupRequests.driverId,
  expiresAt: whatsappGroupRequests.expiresAt,
  groupJid: whatsappGroupRequests.groupJid,
  id: whatsappGroupRequests.id,
  ownerNumber: whatsappGroupRequests.ownerNumber,
  state: whatsappGroupRequests.state,
  step: whatsappGroupRequests.step,
  version: whatsappGroupRequests.version,
}

/** Spec 292 T4: o pedido do grupo do motorista e as mensagens aceitas, sempre por empresa. */
export function createDrizzleWhatsAppGroupRequestRepository(
  database: Database,
): GroupRequestRepositoryPort {
  /** O pedido aberto cujo prazo passou vira `expired`: libera o grupo para o próximo. */
  async function expire(input: { companyId: string; groupJid: string; now: Date }) {
    await database
      .update(whatsappGroupRequests)
      .set({
        closedAt: input.now,
        status: 'expired',
        version: sql`${whatsappGroupRequests.version} + 1`,
      })
      .where(
        and(
          eq(whatsappGroupRequests.companyId, input.companyId),
          eq(whatsappGroupRequests.groupJid, input.groupJid),
          eq(whatsappGroupRequests.status, 'open'),
          lte(whatsappGroupRequests.expiresAt, input.now),
        ),
      )
  }

  return {
    async claimMessage(input) {
      const rows = await database
        .insert(whatsappGroupRequestMessages)
        .values({
          companyId: input.companyId,
          providerMessageId: input.providerMessageId,
          senderNumber: input.senderNumber,
          via: input.via,
        })
        .onConflictDoNothing({
          target: [
            whatsappGroupRequestMessages.companyId,
            whatsappGroupRequestMessages.providerMessageId,
          ],
        })
        .returning({ id: whatsappGroupRequestMessages.id })
      return rows.length === 1
    },

    async findOpen(input) {
      await expire(input)
      const [row] = await database
        .select(COLUMNS)
        .from(whatsappGroupRequests)
        .where(
          and(
            eq(whatsappGroupRequests.companyId, input.companyId),
            eq(whatsappGroupRequests.groupJid, input.groupJid),
            eq(whatsappGroupRequests.status, 'open'),
          ),
        )
        .limit(1)
      return row === undefined ? null : toRequest(row)
    },

    async linkMessage(input) {
      await database
        .update(whatsappGroupRequestMessages)
        .set({ requestId: input.requestId, stepBefore: input.stepBefore })
        .where(
          and(
            eq(whatsappGroupRequestMessages.companyId, input.companyId),
            eq(whatsappGroupRequestMessages.providerMessageId, input.providerMessageId),
          ),
        )
    },

    async open(input) {
      await expire(input)
      const [settings] = await database
        .select({ timeout: whatsappEvolutionSettings.groupRequestTimeoutSeconds })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
        .limit(1)
      const timeoutSeconds = settings?.timeout ?? WHATSAPP_GROUP_REQUEST_TIMEOUT_RANGE.default
      try {
        const [row] = await database
          .insert(whatsappGroupRequests)
          .values({
            companyId: input.companyId,
            driverId: input.driverId,
            expiresAt: new Date(input.now.getTime() + timeoutSeconds * 1000),
            groupJid: input.groupJid,
            lastActivityAt: input.now,
            openedAt: input.now,
            ownerNumber: input.ownerNumber,
            state: { ...input.state },
            step: input.step,
            timeoutSeconds,
          })
          .returning(COLUMNS)
        if (row === undefined) throw new Error('whatsapp group request insert returned nothing')
        return toRequest(row)
      } catch (error) {
        if (violatedUniqueConstraint(error) === OPEN_UNIQUE) return null
        throw error
      }
    },

    async update(input) {
      const closing = input.close !== undefined
      const rows = await database
        .update(whatsappGroupRequests)
        .set({
          attempts: input.attempts,
          lastActivityAt: input.now,
          state: { ...input.state },
          step: input.step,
          version: sql`${whatsappGroupRequests.version} + 1`,
          ...(closing
            ? { closedAt: input.now, status: input.close }
            : {
                expiresAt: sql`${input.now.toISOString()}::timestamptz + make_interval(secs => ${whatsappGroupRequests.timeoutSeconds})`,
              }),
        })
        .where(
          and(
            eq(whatsappGroupRequests.companyId, input.companyId),
            eq(whatsappGroupRequests.id, input.id),
            eq(whatsappGroupRequests.status, 'open'),
            eq(whatsappGroupRequests.version, input.version),
          ),
        )
        .returning({ id: whatsappGroupRequests.id })
      return rows.length === 1
    },
  }
}

function toRequest(row: {
  attempts: number
  companyId: string
  driverId: string
  expiresAt: Date
  groupJid: string
  id: string
  ownerNumber: string
  state: Record<string, unknown>
  step: string
  version: bigint
}): GroupRequest {
  return { ...row }
}
