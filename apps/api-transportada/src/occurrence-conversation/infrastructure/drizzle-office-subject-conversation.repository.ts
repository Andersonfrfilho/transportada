/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (ADR-0101): a transação do escritório na conversa de nota e de viagem. Junta as leituras
 * novas (`office-subject-*.query.ts`) às operações que a conversa de ocorrência já usa — idempotência com
 * trava consultiva, anexo, inserção — e ao find-or-create do assunto: as mesmas implementações, sem cópia.
 * Tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type {
  OfficeSubjectTransactionPort,
  OfficeSubjectUnitOfWorkPort,
} from '../application/office-subject-conversation.port.js'
import { createDriverSubjectTransactionPort } from './drizzle-driver-conversation-subject.repository.js'
import { createTransactionPort as createDriverConversationTransactionPort } from './drizzle-driver-conversation.repository.js'
import { markOccurrenceConversationRead } from './occurrence-conversation.query.js'
import { listTripConversationRows } from './office-subject-list.query.js'
import {
  findOfficeSubject,
  findPrincipalDriverUserId,
  setConversationStoredStatus,
} from './office-subject-lookup.query.js'
import { findOfficeMessage, listOfficeMessages } from './office-subject-message.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

function createOfficeTransactionPort(transaction: Transaction): OfficeSubjectTransactionPort {
  const occurrence = createDriverConversationTransactionPort(transaction)
  const subject = createDriverSubjectTransactionPort(transaction)
  return {
    attachments: occurrence.attachments,
    findIdempotency: occurrence.findIdempotency,
    findOfficeMessage: (input) => findOfficeMessage(transaction, input),
    findOfficeSubject: (input) => findOfficeSubject(transaction, input),
    findOrCreateSubjectConversation: subject.findOrCreateSubjectConversation,
    findPrincipalDriverUserId: (input) => findPrincipalDriverUserId(transaction, input),
    insertMessage: occurrence.insertMessage,
    listAttachments: subject.listAttachments,
    listOfficeMessages: (input) => listOfficeMessages(transaction, input),
    listTripConversations: (input) => listTripConversationRows(transaction, input),
    async markConversationRead(input) {
      await markOccurrenceConversationRead(transaction, input)
    },
    saveIdempotency: occurrence.saveIdempotency,
    setStoredStatus: (input) => setConversationStoredStatus(transaction, input),
  }
}

export function createDrizzleOfficeSubjectUnitOfWork(
  database: Database,
): OfficeSubjectUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createOfficeTransactionPort(transaction))),
  }
}
