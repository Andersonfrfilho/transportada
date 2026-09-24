/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): a conversa com o motorista pelo app, no Postgres. Tudo pela empresa do
 * contexto. O motorista da conversa é o usuário (vínculo ativo) do primeiro condutor da viagem; o que
 * lê pelo `/me` só alcança ocorrência de viagem em que a ficha dele está na tripulação.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  fleetDrivers,
  idempotencyRecords,
  identityUserProfiles,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDrivers,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type {
  DriverConversationTransactionPort,
  DriverConversationUnitOfWorkPort,
} from '../application/driver-conversation.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const authorProfile = alias(identityUserProfiles, 'driver_conversation_author_profile')

async function acquireAdvisoryLock(transaction: Transaction, fields: readonly string[]) {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

/** Como a ocorrência se chama no aviso: a nota, ou o tipo na ocorrência de parada. Nunca PII. */
function describeOccurrence(item: {
  readonly invoiceNumber: null | string
  readonly invoiceSeries: null | string
  readonly typeName: string
}): string {
  if (item.invoiceNumber === null || item.invoiceNumber === '') return item.typeName
  return item.invoiceSeries === null || item.invoiceSeries === ''
    ? `NF ${item.invoiceNumber}`
    : `NF ${item.invoiceNumber}/${item.invoiceSeries}`
}

function createTransactionPort(transaction: Transaction): DriverConversationTransactionPort {
  return {
    async findDriverTarget({ companyId, occurrenceId }) {
      const item = await findTripOccurrenceFeedItem(transaction, { companyId, occurrenceId })
      if (item === null) return null
      const [driver] = await transaction
        .select({ userId: userCompanyMemberships.userId })
        .from(tripDrivers)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, tripDrivers.companyId),
            eq(fleetDrivers.id, tripDrivers.driverId),
          ),
        )
        .innerJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
            eq(userCompanyMemberships.id, fleetDrivers.membershipId),
            eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
          ),
        )
        .where(
          and(
            eq(tripDrivers.companyId, companyId),
            eq(tripDrivers.tripId, item.tripId),
            eq(tripDrivers.position, sql`1`),
          ),
        )
        .limit(1)
      return {
        driverUserId: driver?.userId ?? null,
        occurrenceKind: item.source,
        occurrenceLabel: describeOccurrence(item),
      }
    },

    async findMyOccurrence({ companyId, driverId, occurrenceId }) {
      const item = await findTripOccurrenceFeedItem(transaction, { companyId, occurrenceId })
      if (item === null) return null
      const [crew] = await transaction
        .select({ driverId: tripDrivers.driverId })
        .from(tripDrivers)
        .where(
          and(
            eq(tripDrivers.companyId, companyId),
            eq(tripDrivers.tripId, item.tripId),
            eq(tripDrivers.driverId, driverId),
          ),
        )
        .limit(1)
      return crew === undefined ? null : { occurrenceKind: item.source }
    },

    async findIdempotency({ companyId, idempotencyKey, operation }) {
      await acquireAdvisoryLock(transaction, [operation, companyId, idempotencyKey])
      const [row] = await transaction
        .select({
          fingerprint: idempotencyRecords.requestFingerprint,
          response: idempotencyRecords.response,
        })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.companyId, companyId),
            eq(idempotencyRecords.operation, operation),
            eq(idempotencyRecords.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
      return row === undefined ? null : { fingerprint: row.fingerprint, response: row.response }
    },

    async saveIdempotency({ companyId, fingerprint, idempotencyKey, operation, response }) {
      await transaction.insert(idempotencyRecords).values({
        companyId,
        idempotencyKey,
        operation,
        requestFingerprint: fingerprint,
        response: response as object,
        status: 'succeeded',
      })
    },

    async findOrCreateDriverConversation(input) {
      const where = and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.occurrenceKind, input.occurrenceKind),
        eq(occurrenceConversations.occurrenceId, input.occurrenceId),
        eq(occurrenceConversations.participant, 'driver'),
      )
      await transaction
        .insert(occurrenceConversations)
        .values({
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          occurrenceId: input.occurrenceId,
          occurrenceKind: input.occurrenceKind,
          participant: 'driver',
        })
        .onConflictDoNothing({
          target: [
            occurrenceConversations.companyId,
            occurrenceConversations.occurrenceKind,
            occurrenceConversations.occurrenceId,
            occurrenceConversations.participant,
          ],
        })
      const [conversation] = await transaction
        .select({ id: occurrenceConversations.id })
        .from(occurrenceConversations)
        .where(where)
        .limit(1)
      if (conversation === undefined) throw new Error('driver conversation was not created')
      return conversation
    },

    async insertMessage(input) {
      const [message] = await transaction
        .insert(occurrenceConversationMessages)
        .values({
          authorUserId: input.authorUserId,
          bodyText: input.bodyText,
          channel: 'app',
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: input.createdAt,
          direction: input.direction,
          driverUserId: input.driverUserId,
          status: input.status,
          statusTimes: { ...input.statusTimes },
        })
        .returning({ id: occurrenceConversationMessages.id })
      if (message === undefined) throw new Error('driver conversation message was not inserted')
      return message
    },

    async listDriverMessages(input) {
      return transaction
        .select({
          authorName: authorProfile.name,
          bodyText: occurrenceConversationMessages.bodyText,
          createdAt: occurrenceConversationMessages.createdAt,
          direction: occurrenceConversationMessages.direction,
          id: occurrenceConversationMessages.id,
          status: occurrenceConversationMessages.status,
        })
        .from(occurrenceConversationMessages)
        .innerJoin(
          occurrenceConversations,
          and(
            eq(occurrenceConversations.companyId, occurrenceConversationMessages.companyId),
            eq(occurrenceConversations.id, occurrenceConversationMessages.conversationId),
          ),
        )
        .leftJoin(
          authorProfile,
          eq(authorProfile.userId, occurrenceConversationMessages.authorUserId),
        )
        .where(
          and(
            eq(occurrenceConversations.companyId, input.companyId),
            eq(occurrenceConversations.occurrenceKind, input.occurrenceKind),
            eq(occurrenceConversations.occurrenceId, input.occurrenceId),
            eq(occurrenceConversations.participant, 'driver'),
            eq(occurrenceConversations.driverUserId, input.driverUserId),
          ),
        )
        .orderBy(
          asc(occurrenceConversationMessages.createdAt),
          asc(occurrenceConversationMessages.id),
        )
    },
  }
}

export function createDrizzleDriverConversationUnitOfWork(
  database: Database,
): DriverConversationUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
