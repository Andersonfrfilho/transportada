/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (ADR-0101): a conversa por assunto do motorista no Postgres. Tudo pela empresa do
 * contexto; o protocolo vem do trigger do banco — o TypeScript não gera, só repete o INSERT uma vez se o
 * sorteio colidir (23505 no único do protocolo), dentro de um savepoint.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  identityUserProfiles,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
import type {
  DriverSubjectTransactionPort,
  DriverSubjectUnitOfWorkPort,
} from '../application/driver-conversation-subject.port.js'
import {
  CONVERSATION_PROTOCOL_INSERT_ATTEMPTS,
  CONVERSATION_PROTOCOL_UNIQUE_CONSTRAINT,
} from '../domain/driver-subject-conversation.constant.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'
import { listSubjectConversationRows } from './driver-conversation-subject.query.js'
import { findMySubjectByIdentity } from './driver-subject-lookup.query.js'
import { readConversationAttachments } from './drizzle-conversation-attachment.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type OpenInput = Parameters<DriverSubjectTransactionPort['findOrCreateSubjectConversation']>[0]

const authorProfile = alias(identityUserProfiles, 'driver_subject_author_profile')

function subjectFilter(input: OpenInput) {
  const isDocument = input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT
  return and(
    eq(occurrenceConversations.companyId, input.companyId),
    eq(occurrenceConversations.participant, 'driver'),
    eq(occurrenceConversations.subjectType, input.subjectType),
    isDocument
      ? eq(occurrenceConversations.tripDocumentId, input.subjectId)
      : eq(occurrenceConversations.tripId, input.subjectId),
  )
}

async function findExisting(transaction: Transaction, input: OpenInput) {
  const [row] = await transaction
    .select({ driverUserId: occurrenceConversations.driverUserId, id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(subjectFilter(input))
    .limit(1)
  return row
}

async function insertInSavepoint(transaction: Transaction, input: OpenInput) {
  return transaction.transaction(async (savepoint) => {
    const [row] = await savepoint
      .insert(occurrenceConversations)
      .values({
        companyId: input.companyId,
        driverUserId: input.driverUserId,
        participant: 'driver',
        subjectType: input.subjectType,
        tripDocumentId:
          input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT ? input.subjectId : null,
        tripId: input.tripId,
      })
      .returning({ id: occurrenceConversations.id })
    return row
  })
}

async function findOrCreateSubjectConversation(transaction: Transaction, input: OpenInput) {
  const existing = await findExisting(transaction, input)
  if (existing !== undefined) {
    if (input.retarget && existing.driverUserId !== input.driverUserId) {
      await transaction
        .update(occurrenceConversations)
        .set({ driverUserId: input.driverUserId, updatedAt: sql`now()` })
        .where(
          and(
            eq(occurrenceConversations.companyId, input.companyId),
            eq(occurrenceConversations.id, existing.id),
          ),
        )
    }
    return { created: false, id: existing.id }
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      const row = await insertInSavepoint(transaction, input)
      if (row === undefined) throw new Error('subject conversation was not inserted')
      return { created: true, id: row.id }
    } catch (error) {
      const constraint = violatedUniqueConstraint(error)
      if (constraint === undefined) throw error
      if (constraint !== CONVERSATION_PROTOCOL_UNIQUE_CONSTRAINT) {
        const winner = await findExisting(transaction, input)
        if (winner === undefined) throw error
        return { created: false, id: winner.id }
      }
      if (attempt >= CONVERSATION_PROTOCOL_INSERT_ATTEMPTS) throw error
    }
  }
}

async function applySubjectStatus(
  transaction: Transaction,
  input: Parameters<DriverSubjectTransactionPort['applySubjectStatus']>[0],
) {
  if (input.conversationIds.length === 0) return
  const messages = occurrenceConversationMessages
  const rows = await transaction
    .select({ id: messages.id, status: messages.status, statusTimes: messages.statusTimes })
    .from(messages)
    .where(
      and(
        eq(messages.companyId, input.companyId),
        inArray(messages.conversationId, [...input.conversationIds]),
        eq(messages.direction, 'outbound'),
        eq(messages.channel, 'app'),
        isNotNull(messages.status),
        sql`(${messages.statusTimes} ->> ${input.incoming}::text) is null`,
      ),
    )
    .for('update', { of: messages })
  const changes = rows.flatMap((row) => {
    if (row.status === null) return []
    const result = applyMessageStatus({
      at: input.at.toISOString(),
      channel: 'app',
      current: { status: row.status, statusTimes: row.statusTimes },
      incoming: input.incoming,
    })
    return result.changed
      ? [{ id: row.id, status: result.status, statusTimes: result.statusTimes }]
      : []
  })
  if (changes.length === 0) return
  const values = sql.join(
    changes.map(
      (change) =>
        sql`(${change.id}::uuid, ${change.status}::text, ${JSON.stringify(change.statusTimes)}::text)`,
    ),
    sql`, `,
  )
  await transaction.execute(sql`
    update occurrence_conversation_messages as m
    set status = v.status, status_times = v.status_times::jsonb
    from (values ${values}) as v(id, status, status_times)
    where m.company_id = ${input.companyId} and m.id = v.id`)
}

function createTransactionPort(transaction: Transaction): DriverSubjectTransactionPort {
  return {
    applySubjectStatus: (input) => applySubjectStatus(transaction, input),
    findMySubject: (input) => findMySubjectByIdentity(transaction, input),
    findOrCreateSubjectConversation: (input) => findOrCreateSubjectConversation(transaction, input),
    listAttachments: (input) => readConversationAttachments(transaction, input),
    listMySubjects: (input) => listSubjectConversationRows(transaction, input),
    async listSubjectMessages(input) {
      const messages = occurrenceConversationMessages
      const olderThanBefore =
        input.before === null
          ? sql`true`
          : sql`(${messages.createdAt}, ${messages.id}) < (
              select anchor.created_at, anchor.id from occurrence_conversation_messages anchor
              where anchor.company_id = ${input.companyId}
                and anchor.conversation_id = ${input.conversationId}::uuid
                and anchor.id = ${input.before}::uuid)`
      const newestFirst = await transaction
        .select({
          authorName: authorProfile.name,
          bodyText: messages.bodyText,
          channel: messages.channel,
          clientMessageId: messages.clientMessageId,
          createdAt: messages.createdAt,
          direction: messages.direction,
          id: messages.id,
          status: messages.status,
        })
        .from(messages)
        .leftJoin(authorProfile, eq(authorProfile.userId, messages.authorUserId))
        .where(
          and(
            eq(messages.companyId, input.companyId),
            eq(messages.conversationId, input.conversationId),
            olderThanBefore,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(input.limit)
      return newestFirst.toReversed()
    },
  }
}

export function createDrizzleDriverSubjectUnitOfWork(
  database: Database,
): DriverSubjectUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
