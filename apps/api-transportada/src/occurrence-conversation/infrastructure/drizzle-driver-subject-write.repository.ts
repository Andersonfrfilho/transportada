/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (ADR-0101): a transação de escrita da conversa por assunto. Junta, na mesma transação, a
 * porta de leitura do assunto e a porta da resposta do motorista de ocorrência (idempotência com trava
 * consultiva, anexo, inserção) — as mesmas implementações, sem cópia. Tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  identityUserProfiles,
  occurrenceConversationMessages,
} from '../../database/database.schema.js'
import type {
  DriverSubjectWriteTransactionPort,
  DriverSubjectWriteUnitOfWorkPort,
} from '../application/driver-subject-write.port.js'
import { createDriverSubjectTransactionPort } from './drizzle-driver-conversation-subject.repository.js'
import { createTransactionPort as createDriverConversationTransactionPort } from './drizzle-driver-conversation.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const authorProfile = alias(identityUserProfiles, 'driver_subject_write_author_profile')

async function findSubjectMessage(
  transaction: Transaction,
  input: Parameters<DriverSubjectWriteTransactionPort['findSubjectMessage']>[0],
) {
  const messages = occurrenceConversationMessages
  const [row] = await transaction
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
        eq(messages.id, input.messageId),
      ),
    )
    .limit(1)
  return row ?? null
}

function createWriteTransactionPort(transaction: Transaction): DriverSubjectWriteTransactionPort {
  const occurrence = createDriverConversationTransactionPort(transaction)
  return {
    ...createDriverSubjectTransactionPort(transaction),
    attachments: occurrence.attachments,
    findIdempotency: occurrence.findIdempotency,
    findOrCreateDriverConversation: occurrence.findOrCreateDriverConversation,
    findSubjectMessage: (input) => findSubjectMessage(transaction, input),
    insertMessage: occurrence.insertMessage,
    saveIdempotency: occurrence.saveIdempotency,
  }
}

export function createDrizzleDriverSubjectWriteUnitOfWork(
  database: Database,
): DriverSubjectWriteUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createWriteTransactionPort(transaction))),
  }
}
