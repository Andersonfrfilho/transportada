/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF4/RF6/RF15: as leituras da conversa. Toda consulta leva `company_id`, e as três servem
 * a tela sem N+1: as conversas de uma ocorrência com as mensagens em ordem, a marcação de leitura
 * por usuário, e o resumo da página da listagem (estado da conversa com a contratante e mensagens
 * do motorista ainda não lidas por quem está vendo) em leituras fixas por página.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  contractorContacts,
  contractorMailMessages,
  identityUserProfiles,
  occurrenceConversationMessages,
  occurrenceConversationReads,
  occurrenceConversations,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import { findContractorPortalAudience } from '../../contractor-portal/infrastructure/contractor-occurrence.query.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { ContractorMailDkimResult } from '../../database/contractor-mail.schema.js'
import { countUnread, readLastReads } from './occurrence-conversation-summary.query.js'
import {
  identifyContractorSender,
  type ContractorSenderContact,
} from '../domain/contractor-sender.policy.js'
import type {
  OccurrenceConversationMessageAuthor,
  OccurrenceConversationMessageView,
  OccurrenceConversationsView,
} from '../application/occurrence-conversation.port.js'

const authorProfile = alias(identityUserProfiles, 'occurrence_conversation_author_profile')
const driverProfile = alias(identityUserProfiles, 'occurrence_conversation_driver_profile')

/** Uma conversa longa ainda cabe numa tela; paginação entra quando alguém chegar perto disto. */
const MESSAGE_LIMIT = 1000

type MessageRow = {
  readonly authorName: null | string
  readonly authorUserId: null | string
  readonly automatic: boolean
  readonly bodyText: string
  readonly ccAddresses: null | readonly string[]
  readonly channel: OccurrenceConversationMessageView['channel']
  readonly contractorContactId: null | string
  readonly conversationId: string
  readonly createdAt: Date
  readonly direction: OccurrenceConversationMessageView['direction']
  readonly dkimResult: ContractorMailDkimResult | null
  readonly driverName: null | string
  readonly driverUserId: null | string
  readonly fromDisplayName: null | string
  readonly id: string
  readonly senderAddress: null | string
  readonly status: OccurrenceConversationMessageView['status']
  readonly statusTimes: Record<string, string>
}

function toAuthor(
  row: MessageRow,
  contractorId: null | string,
  contacts: readonly ContractorSenderContact[],
): OccurrenceConversationMessageAuthor {
  if (row.direction === 'outbound') {
    if (row.automatic || row.authorUserId === null) return { kind: 'automatic' }
    return { kind: 'operation', name: row.authorName, userId: row.authorUserId }
  }
  if (row.driverUserId !== null) {
    return { kind: 'driver', name: row.driverName, userId: row.driverUserId }
  }
  const identity =
    row.senderAddress === null || contractorId === null || row.channel === 'portal'
      ? null
      : identifyContractorSender({
          address: row.senderAddress,
          /** T903 (S2): o `From` de e-mail só vale como identidade com DKIM alinhado. */
          authenticated: row.channel !== 'email' || row.dkimResult === 'aligned',
          channel: row.channel === 'whatsapp' ? 'whatsapp' : 'email',
          contacts,
          contractorId,
          displayName: row.fromDisplayName,
        })
  return { identity, kind: 'contractor', userId: row.authorUserId }
}

/** RF16: os contatos das contratantes das conversas, numa leitura só — ativos e inativos. */
async function readContractorContacts(
  queryable: TripQueryable,
  companyId: string,
  contractorIds: readonly string[],
): Promise<readonly ContractorSenderContact[]> {
  if (contractorIds.length === 0) return []
  const rows = await queryable
    .select({
      contractorId: contractorContacts.contractorId,
      email: contractorContacts.email,
      id: contractorContacts.id,
      name: contractorContacts.name,
      phone: contractorContacts.phone,
      preferredChannel: contractorContacts.preferredChannel,
      roleLabel: contractorContacts.roleLabel,
      status: contractorContacts.status,
      types: contractorContacts.types,
      whatsappOptInAt: contractorContacts.whatsappOptInAt,
    })
    .from(contractorContacts)
    .where(
      and(
        eq(contractorContacts.companyId, companyId),
        inArray(contractorContacts.contractorId, [...contractorIds]),
      ),
    )
  return rows.map((row) => ({
    ...row,
    whatsappOptInAt: row.whatsappOptInAt?.toISOString() ?? null,
  }))
}

async function readMessages(
  queryable: TripQueryable,
  companyId: string,
  conversationIds: readonly string[],
): Promise<readonly MessageRow[]> {
  if (conversationIds.length === 0) return []
  return queryable
    .select({
      authorName: authorProfile.name,
      authorUserId: occurrenceConversationMessages.authorUserId,
      automatic: occurrenceConversationMessages.automatic,
      bodyText: occurrenceConversationMessages.bodyText,
      ccAddresses: contractorMailMessages.ccAddresses,
      channel: occurrenceConversationMessages.channel,
      contractorContactId: occurrenceConversationMessages.contractorContactId,
      conversationId: occurrenceConversationMessages.conversationId,
      createdAt: occurrenceConversationMessages.createdAt,
      direction: occurrenceConversationMessages.direction,
      dkimResult: contractorMailMessages.dkimResult,
      driverName: driverProfile.name,
      driverUserId: occurrenceConversationMessages.driverUserId,
      fromDisplayName: contractorMailMessages.fromDisplayName,
      id: occurrenceConversationMessages.id,
      senderAddress: occurrenceConversationMessages.senderAddress,
      status: occurrenceConversationMessages.status,
      statusTimes: occurrenceConversationMessages.statusTimes,
    })
    .from(occurrenceConversationMessages)
    .leftJoin(authorProfile, eq(authorProfile.userId, occurrenceConversationMessages.authorUserId))
    .leftJoin(driverProfile, eq(driverProfile.userId, occurrenceConversationMessages.driverUserId))
    .leftJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceConversationMessages.companyId),
        eq(contractorMailMessages.id, occurrenceConversationMessages.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, companyId),
        inArray(occurrenceConversationMessages.conversationId, [...conversationIds]),
      ),
    )
    .orderBy(asc(occurrenceConversationMessages.createdAt), asc(occurrenceConversationMessages.id))
    .limit(MESSAGE_LIMIT)
}

/** Spec 267 RF8: a cópia só aparece na mensagem de saída; o do e-mail recebido é do remetente, não nosso. */
function toCopy(
  row: MessageRow,
  names: ReadonlyMap<string, string>,
): Pick<OccurrenceConversationMessageView, 'copy'> {
  if (row.direction !== 'outbound' || row.ccAddresses === null || row.ccAddresses.length === 0) {
    return {}
  }
  return {
    copy: row.ccAddresses.map((address) => ({
      maskedEmail: maskEmailAddress(address),
      name: names.get(address.toLowerCase()) ?? null,
    })),
  }
}

/** Os responsáveis são usuários da empresa: o nome sai do perfil, pelo endereço, numa leitura só. */
async function readCopyNames(
  queryable: TripQueryable,
  companyId: string,
  messages: readonly MessageRow[],
): Promise<ReadonlyMap<string, string>> {
  const addresses = [
    ...new Set(
      messages.flatMap((row) =>
        row.direction === 'outbound' ? (row.ccAddresses ?? []).map((a) => a.toLowerCase()) : [],
      ),
    ),
  ]
  if (addresses.length === 0) return new Map()
  const rows = await queryable
    .select({ address: identityUserProfiles.contactAddress, name: identityUserProfiles.name })
    .from(identityUserProfiles)
    .innerJoin(
      userCompanyMemberships,
      eq(userCompanyMemberships.userId, identityUserProfiles.userId),
    )
    .where(
      and(
        eq(userCompanyMemberships.companyId, companyId),
        eq(identityUserProfiles.contactChannel, 'email'),
        inArray(sql`lower(${identityUserProfiles.contactAddress})`, addresses),
      ),
    )
  return new Map(rows.map((row) => [row.address.toLowerCase(), row.name]))
}

export async function findOccurrenceConversations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string; readonly userId: string },
): Promise<OccurrenceConversationsView | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  if (item === null) return null

  const conversations = await queryable
    .select({
      contractorId: occurrenceConversations.contractorId,
      id: occurrenceConversations.id,
      participant: occurrenceConversations.participant,
      status: occurrenceConversations.status,
    })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.occurrenceKind, item.source),
        eq(occurrenceConversations.occurrenceId, input.occurrenceId),
      ),
    )
    .orderBy(asc(occurrenceConversations.participant))
  const conversationIds = conversations.map((conversation) => conversation.id)
  const contractorIds = [
    ...new Set(conversations.flatMap((conversation) => conversation.contractorId ?? [])),
  ]
  const [messages, lastReads, contacts, portalAudience] = await Promise.all([
    readMessages(queryable, input.companyId, conversationIds),
    readLastReads(queryable, { ...input, conversationIds }),
    readContractorContacts(queryable, input.companyId, contractorIds),
    item.source === 'document' ? findContractorPortalAudience(queryable, input) : null,
  ])

  const copyNames = await readCopyNames(queryable, input.companyId, messages)

  return {
    contractorPortal: { available: (portalAudience?.userIds.length ?? 0) > 0 },
    conversations: conversations.map((conversation) => {
      const own = messages.filter((message) => message.conversationId === conversation.id)
      return {
        id: conversation.id,
        messages: own.map((row) => ({
          attachments: [],
          author: toAuthor(row, conversation.contractorId, contacts),
          bodyText: row.bodyText,
          channel: row.channel,
          ...toCopy(row, copyNames),
          createdAt: row.createdAt.toISOString(),
          direction: row.direction,
          id: row.id,
          status: row.status,
          statusTimes: row.statusTimes,
        })),
        participant: conversation.participant,
        status: conversation.status,
        unreadCount: countUnread(own, lastReads.get(conversation.id) ?? null),
      }
    }),
  }
}

/** RF15: até a última mensagem da conversa, por usuário; o registro é da empresa do contexto. */
export async function markOccurrenceConversationRead(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly conversationId: string; readonly userId: string },
): Promise<boolean> {
  const [conversation] = await queryable
    .select({ id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.id, input.conversationId),
      ),
    )
    .limit(1)
  if (conversation === undefined) return false

  const [last] = await queryable
    .select({ id: occurrenceConversationMessages.id })
    .from(occurrenceConversationMessages)
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.conversationId, input.conversationId),
      ),
    )
    .orderBy(
      sql`${occurrenceConversationMessages.createdAt} desc`,
      sql`${occurrenceConversationMessages.id} desc`,
    )
    .limit(1)
  if (last === undefined) return true

  await queryable
    .insert(occurrenceConversationReads)
    .values({
      companyId: input.companyId,
      conversationId: input.conversationId,
      lastReadMessageId: last.id,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      set: { lastReadMessageId: last.id, readAt: sql`now()` },
      target: [
        occurrenceConversationReads.companyId,
        occurrenceConversationReads.conversationId,
        occurrenceConversationReads.userId,
      ],
    })
  return true
}
