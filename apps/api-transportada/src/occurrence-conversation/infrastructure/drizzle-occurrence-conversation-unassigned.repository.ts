/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): a fila das mensagens sem conversa certa, no Postgres. As candidatas de uma
 * mensagem são as conversas **abertas** com a contratante das contratantes do remetente: o contato
 * gravado na fila quando é um só; senão, todo contato ativo com aquele número (chave do WhatsApp) ou
 * e-mail. A página sai em leituras fixas, sem N+1, e tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  contractorContacts,
  contractors,
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUnassigned,
} from '../../database/database.schema.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import { attributableContractorConversation } from './attributable-conversation.query.js'
import type {
  UnassignedAssignmentTransactionPort,
  UnassignedAssignmentUnitOfWorkPort,
  UnassignedCandidateView,
  UnassignedMessageRecord,
  UnassignedMessageView,
  UnassignedReaderPort,
} from '../application/occurrence-conversation-unassigned.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Queryable = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

const PAGE_LIMIT = 100
const PREVIEW_LENGTH = 140

type PendingRow = {
  readonly channel: 'email' | 'whatsapp'
  readonly contractorContactId: null | string
  readonly senderAddress: string
}

const phoneKeyOf = (address: string): string => toWhatsAppPhoneKey(address.replace(/\D/gu, ''))

/** Contatos (id, contratante, nome) por id gravado ou pelo endereço do remetente. */
async function readSenderContacts(
  queryable: Queryable,
  companyId: string,
  rows: readonly PendingRow[],
) {
  const contactIds = rows.flatMap((row) => row.contractorContactId ?? [])
  const phoneKeys = rows
    .filter((row) => row.contractorContactId === null && row.channel === 'whatsapp')
    .map((row) => phoneKeyOf(row.senderAddress))
  const emails = rows
    .filter((row) => row.contractorContactId === null && row.channel === 'email')
    .map((row) => row.senderAddress.trim().toLowerCase())
  const matchers = [
    ...(contactIds.length === 0 ? [] : [inArray(contractorContacts.id, contactIds)]),
    ...(phoneKeys.length === 0
      ? []
      : [
          sql`left(${contractorContacts.phone}, 4) || right(${contractorContacts.phone}, 8) in ${phoneKeys}`,
        ]),
    ...(emails.length === 0 ? [] : [inArray(sql`lower(${contractorContacts.email})`, emails)]),
  ]
  if (matchers.length === 0) return []
  return queryable
    .select({
      contractorId: contractorContacts.contractorId,
      email: contractorContacts.email,
      id: contractorContacts.id,
      name: contractorContacts.name,
      phone: contractorContacts.phone,
      status: contractorContacts.status,
    })
    .from(contractorContacts)
    .where(
      and(eq(contractorContacts.companyId, companyId), sql`(${sql.join(matchers, sql` or `)})`),
    )
}

type SenderContact = Awaited<ReturnType<typeof readSenderContacts>>[number]

function contractorIdsFor(row: PendingRow, contacts: readonly SenderContact[]): readonly string[] {
  if (row.contractorContactId !== null) {
    return contacts
      .filter((contact) => contact.id === row.contractorContactId)
      .map((contact) => contact.contractorId)
  }
  const key =
    row.channel === 'whatsapp'
      ? phoneKeyOf(row.senderAddress)
      : row.senderAddress.trim().toLowerCase()
  return contacts
    .filter(
      (contact) =>
        contact.status === 'active' &&
        (row.channel === 'whatsapp'
          ? contact.phone !== null && phoneKeyOf(contact.phone) === key
          : contact.email.trim().toLowerCase() === key),
    )
    .map((contact) => contact.contractorId)
}

async function readOpenConversations(
  queryable: Queryable,
  companyId: string,
  contractorIds: readonly string[],
) {
  if (contractorIds.length === 0) return []
  return queryable
    .select({
      contractorId: occurrenceConversations.contractorId,
      contractorName: contractors.displayName,
      contractorTaxId: contractors.taxId,
      conversationId: occurrenceConversations.id,
      occurrenceId: occurrenceConversations.occurrenceId,
      occurrenceKind: occurrenceConversations.occurrenceKind,
    })
    .from(occurrenceConversations)
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, occurrenceConversations.companyId),
        eq(contractors.id, occurrenceConversations.contractorId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversations.companyId, companyId),
        eq(occurrenceConversations.participant, 'contractor'),
        /** T903 (C2): ocorrência com a tratativa encerrada não é mais candidata. */
        attributableContractorConversation({ requireMessage: false }),
        inArray(occurrenceConversations.contractorId, [...new Set(contractorIds)]),
      ),
    )
}

export function createDrizzleOccurrenceConversationUnassignedReader(
  database: Database,
): UnassignedReaderPort {
  return {
    async listPending({ companyId }) {
      const rows = await database
        .select({
          bodyText: occurrenceConversationUnassigned.bodyText,
          channel: occurrenceConversationUnassigned.channel,
          contractorContactId: occurrenceConversationUnassigned.contractorContactId,
          id: occurrenceConversationUnassigned.id,
          receivedAt: occurrenceConversationUnassigned.receivedAt,
          senderAddress: occurrenceConversationUnassigned.senderAddress,
        })
        .from(occurrenceConversationUnassigned)
        .where(
          and(
            eq(occurrenceConversationUnassigned.companyId, companyId),
            isNull(occurrenceConversationUnassigned.assignedAt),
          ),
        )
        .orderBy(desc(occurrenceConversationUnassigned.receivedAt))
        .limit(PAGE_LIMIT)
      if (rows.length === 0) return []

      const contacts = await readSenderContacts(database, companyId, rows)
      const contractorIdsByRow = new Map(
        rows.map((row) => [row.id, contractorIdsFor(row, contacts)]),
      )
      const conversations = await readOpenConversations(
        database,
        companyId,
        [...contractorIdsByRow.values()].flat(),
      )
      const conversationIds = conversations.map((conversation) => conversation.conversationId)
      const lastOutbound =
        conversationIds.length === 0
          ? []
          : await database
              .selectDistinctOn([occurrenceConversationMessages.conversationId], {
                bodyText: occurrenceConversationMessages.bodyText,
                conversationId: occurrenceConversationMessages.conversationId,
                createdAt: occurrenceConversationMessages.createdAt,
              })
              .from(occurrenceConversationMessages)
              .where(
                and(
                  eq(occurrenceConversationMessages.companyId, companyId),
                  eq(occurrenceConversationMessages.direction, 'outbound'),
                  inArray(occurrenceConversationMessages.conversationId, conversationIds),
                ),
              )
              .orderBy(
                occurrenceConversationMessages.conversationId,
                desc(occurrenceConversationMessages.createdAt),
              )
      const lastByConversation = new Map(lastOutbound.map((row) => [row.conversationId, row]))

      return rows.map((row): UnassignedMessageView => {
        const contractorIds = new Set(contractorIdsByRow.get(row.id) ?? [])
        const contact =
          row.contractorContactId === null
            ? undefined
            : contacts.find((candidate) => candidate.id === row.contractorContactId)
        const candidates = conversations
          .filter((conversation) => contractorIds.has(conversation.contractorId ?? ''))
          .map((conversation): UnassignedCandidateView => {
            const last = lastByConversation.get(conversation.conversationId)
            return {
              contractorName:
                conversation.contractorName.trim() === ''
                  ? conversation.contractorTaxId
                  : conversation.contractorName,
              conversationId: conversation.conversationId,
              lastOutbound:
                last === undefined
                  ? null
                  : {
                      at: last.createdAt.toISOString(),
                      preview: last.bodyText.slice(0, PREVIEW_LENGTH),
                    },
              occurrenceId: conversation.occurrenceId,
              occurrenceKind: conversation.occurrenceKind,
            }
          })
        return {
          bodyText: row.bodyText,
          candidates,
          channel: row.channel,
          contact: contact === undefined ? null : { contactId: contact.id, name: contact.name },
          id: row.id,
          receivedAt: row.receivedAt.toISOString(),
          senderAddress: row.senderAddress,
        }
      })
    },
  }
}

function createTransactionPort(
  transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
): UnassignedAssignmentTransactionPort {
  return {
    async insertConversationMessage(input) {
      const [message] = await transaction
        .insert(occurrenceConversationMessages)
        .values({
          bodyText: input.bodyText,
          channel: input.channel,
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: input.createdAt,
          direction: 'inbound',
          mailMessageId: input.mailMessageId,
          providerMessageId: input.providerMessageId,
          senderAddress: input.senderAddress,
        })
        .returning({ id: occurrenceConversationMessages.id })
      if (message === undefined) throw new Error('occurrence conversation message was not inserted')
      return message
    },
    async lockUnassigned({ companyId, unassignedId }): Promise<null | UnassignedMessageRecord> {
      const [row] = await transaction
        .select({
          assignedAt: occurrenceConversationUnassigned.assignedAt,
          bodyText: occurrenceConversationUnassigned.bodyText,
          channel: occurrenceConversationUnassigned.channel,
          contractorContactId: occurrenceConversationUnassigned.contractorContactId,
          id: occurrenceConversationUnassigned.id,
          mailMessageId: occurrenceConversationUnassigned.mailMessageId,
          providerMessageId: occurrenceConversationUnassigned.providerMessageId,
          receivedAt: occurrenceConversationUnassigned.receivedAt,
          senderAddress: occurrenceConversationUnassigned.senderAddress,
        })
        .from(occurrenceConversationUnassigned)
        .where(
          and(
            eq(occurrenceConversationUnassigned.companyId, companyId),
            eq(occurrenceConversationUnassigned.id, unassignedId),
          ),
        )
        .for('update')
        .limit(1)
      if (row === undefined) return null
      const contacts = await readSenderContacts(transaction, companyId, [row])
      const conversations = await readOpenConversations(
        transaction,
        companyId,
        contractorIdsFor(row, contacts),
      )
      return {
        ...row,
        candidateConversationIds: conversations.map((conversation) => conversation.conversationId),
      }
    },
    async markAssigned(input) {
      await transaction
        .update(occurrenceConversationUnassigned)
        .set({
          assignedAt: input.assignedAt,
          assignedByUserId: input.userId,
          assignedMessageId: input.messageId,
        })
        .where(
          and(
            eq(occurrenceConversationUnassigned.companyId, input.companyId),
            eq(occurrenceConversationUnassigned.id, input.unassignedId),
          ),
        )
    },
  }
}

export function createDrizzleOccurrenceConversationUnassignedUnitOfWork(
  database: Database,
): UnassignedAssignmentUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
