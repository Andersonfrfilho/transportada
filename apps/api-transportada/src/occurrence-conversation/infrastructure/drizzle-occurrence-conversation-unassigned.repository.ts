/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): a fila das mensagens sem conversa certa, no Postgres. As candidatas de uma
 * mensagem são as conversas **abertas** com a contratante das contratantes do remetente: o contato
 * gravado na fila quando é um só; senão, todo contato ativo com aquele número (chave do WhatsApp) ou
 * e-mail. A página sai em leituras fixas, sem N+1, e tudo pela empresa do contexto.
 *
 * Spec 283 (RF3, "vincular a esta conversa"): o WhatsApp também tem como candidatas as conversas **do cliente** em que o
 * número do remetente recebeu um envio ou é contato de WhatsApp do cliente de agora — a mesma chave do WhatsApp, a
 * mesma regra de "aberta" (a tratativa não encerrou).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import {
  contractorContacts,
  contractors,
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUnassigned,
} from '../../database/database.schema.js'
import { requireOccurrenceSubject } from '../domain/occurrence-subject.policy.js'
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

type ClientCandidate = {
  readonly clientName: string
  readonly clientTaxId: string
  readonly conversationId: string
  readonly occurrenceId: string
  readonly phoneKey: string
}

/** Spec 283: as conversas do cliente abertas por chave do WhatsApp, numa leitura só. */
async function readClientConversations(
  queryable: Queryable,
  companyId: string,
  rows: readonly PendingRow[],
): Promise<readonly ClientCandidate[]> {
  const phoneKeys = [
    ...new Set(
      rows.filter((row) => row.channel === 'whatsapp').map((row) => phoneKeyOf(row.senderAddress)),
    ),
  ]
  if (phoneKeys.length === 0) return []
  const keyOf = (column: SQL) =>
    sql`left(regexp_replace(${column}, '[^0-9]', '', 'g'), 4) || right(regexp_replace(${column}, '[^0-9]', '', 'g'), 8)`
  const found = await queryable.execute<{
    readonly client_name: null | string
    readonly client_tax_id: string
    readonly conversation_id: string
    readonly occurrence_id: string
    readonly phone_key: string
  }>(sql`
    select ${occurrenceConversations.id} as conversation_id,
           ${occurrenceConversations.occurrenceId} as occurrence_id,
           ${occurrenceConversations.clientTaxId} as client_tax_id,
           client.display_name as client_name,
           address.phone_key
      from ${occurrenceConversations}
      join lateral (
        select ${keyOf(sql`message.recipient_address`)} as phone_key
          from occurrence_conversation_messages message
         where message.company_id = ${occurrenceConversations.companyId}
           and message.conversation_id = ${occurrenceConversations.id}
           and message.channel = 'whatsapp'
           and message.recipient_address is not null
        union
        select ${keyOf(sql`contact.address`)}
          from delivery_client_contacts contact
         where contact.company_id = ${occurrenceConversations.companyId}
           and contact.tax_id = ${occurrenceConversations.clientTaxId}
           and contact.channel = 'whatsapp'
      ) address on address.phone_key in ${phoneKeys}
      left join delivery_clients client
        on client.company_id = ${occurrenceConversations.companyId}
       and client.tax_id = ${occurrenceConversations.clientTaxId}
     where ${occurrenceConversations.companyId} = ${companyId}
       and ${occurrenceConversations.participant} = 'client'
       and ${attributableContractorConversation({ requireMessage: false })}
  `)
  return found.map((row) => ({
    clientName: (row.client_name ?? '').trim(),
    clientTaxId: row.client_tax_id,
    conversationId: row.conversation_id,
    occurrenceId: row.occurrence_id,
    phoneKey: row.phone_key,
  }))
}

function clientCandidatesFor(
  row: PendingRow,
  candidates: readonly ClientCandidate[],
): readonly ClientCandidate[] {
  if (row.channel !== 'whatsapp') return []
  const key = phoneKeyOf(row.senderAddress)
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (candidate.phoneKey !== key || seen.has(candidate.conversationId)) return false
    seen.add(candidate.conversationId)
    return true
  })
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

function toLastOutbound(
  last: undefined | { readonly bodyText: string; readonly createdAt: Date },
): UnassignedCandidateView['lastOutbound'] {
  if (last === undefined) return null
  return { at: last.createdAt.toISOString(), preview: last.bodyText.slice(0, PREVIEW_LENGTH) }
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
      const [conversations, clientConversations] = await Promise.all([
        readOpenConversations(database, companyId, [...contractorIdsByRow.values()].flat()),
        readClientConversations(database, companyId, rows),
      ])
      const conversationIds = [
        ...conversations.map((conversation) => conversation.conversationId),
        ...clientConversations.map((conversation) => conversation.conversationId),
      ]
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
          .map((candidate): UnassignedCandidateView => {
            const conversation = requireOccurrenceSubject(candidate)
            return {
              contractorName:
                conversation.contractorName.trim() === ''
                  ? conversation.contractorTaxId
                  : conversation.contractorName,
              conversationId: conversation.conversationId,
              lastOutbound: toLastOutbound(lastByConversation.get(conversation.conversationId)),
              occurrenceId: conversation.occurrenceId,
              occurrenceKind: conversation.occurrenceKind,
              participant: 'contractor',
            }
          })
          .concat(
            clientCandidatesFor(row, clientConversations).map(
              (candidate): UnassignedCandidateView => ({
                /** O painel de hoje lê `contractorName`: na do cliente, leva o nome do cliente. */
                contractorName:
                  candidate.clientName === '' ? candidate.clientTaxId : candidate.clientName,
                conversationId: candidate.conversationId,
                lastOutbound: toLastOutbound(lastByConversation.get(candidate.conversationId)),
                occurrenceId: candidate.occurrenceId,
                occurrenceKind: 'document',
                participant: 'client',
              }),
            ),
          )
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
      const [conversations, clientConversations] = await Promise.all([
        readOpenConversations(transaction, companyId, contractorIdsFor(row, contacts)),
        readClientConversations(transaction, companyId, [row]),
      ])
      return {
        ...row,
        candidateConversationIds: [
          ...conversations.map((conversation) => conversation.conversationId),
          ...clientCandidatesFor(row, clientConversations).map(
            (conversation) => conversation.conversationId,
          ),
        ],
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
