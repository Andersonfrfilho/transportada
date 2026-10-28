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
  deliveryClientContacts,
  deliveryClients,
  identityUserProfiles,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationAttachments,
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
  type ContractorSenderCompanyUser,
  type ContractorSenderContact,
} from '../domain/contractor-sender.policy.js'
import { systemNoticeField } from '../domain/occurrence-conversation-system-notice.policy.js'
import {
  CLIENT_CONVERSATION_CHANNELS,
  CLIENT_CONVERSATION_PARTICIPANT,
  maskClientAddress,
  resolveClientChannels,
  type ClientConversationChannel,
} from '../domain/client-conversation.policy.js'
import { maskTaxId } from '../../trips/domain/delivery-proof-settings.policy.js'
import { OCCURRENCE_CONVERSATION_PARTICIPANTS } from '../../database/occurrence-conversation.schema.js'
import type {
  OccurrenceConversationMessageAuthor,
  OccurrenceClientView,
  OccurrenceConversationMessageView,
  OccurrenceConversationsView,
} from '../application/occurrence-conversation.port.js'

const authorProfile = alias(identityUserProfiles, 'occurrence_conversation_author_profile')
const driverProfile = alias(identityUserProfiles, 'occurrence_conversation_driver_profile')
const clientDeliveryAttachment = alias(
  occurrenceConversationAttachments,
  'occurrence_conversation_client_delivery_attachment',
)

/** Uma conversa longa ainda cabe numa tela; paginação entra quando alguém chegar perto disto. */
const MESSAGE_LIMIT = 1000

type MessageRow = {
  readonly authorName: null | string
  readonly authorUserId: null | string
  readonly automatic: boolean
  readonly bodyText: string
  readonly ccAddresses: null | readonly string[]
  readonly toAddresses: null | readonly string[]
  readonly channel: OccurrenceConversationMessageView['channel']
  readonly clientDeliveryId: null | string
  readonly clientDocumentName: null | string
  readonly contractorContactId: null | string
  readonly conversationId: string
  readonly createdAt: Date
  readonly direction: OccurrenceConversationMessageView['direction']
  readonly dkimResult: ContractorMailDkimResult | null
  readonly driverName: null | string
  readonly driverUserId: null | string
  readonly fromDisplayName: null | string
  readonly id: string
  readonly mailBodyText: null | string
  readonly recipientAddress: null | string
  readonly senderAddress: null | string
  readonly status: OccurrenceConversationMessageView['status']
  readonly statusTimes: Record<string, string>
  readonly systemNotice: unknown
}

function toAuthor(
  row: MessageRow,
  participant: OccurrenceConversationsView['conversations'][number]['participant'],
  contractorId: null | string,
  contacts: readonly ContractorSenderContact[],
  companyUsers: readonly ContractorSenderCompanyUser[],
): OccurrenceConversationMessageAuthor {
  if (row.direction === 'outbound') {
    if (row.automatic || row.authorUserId === null) return { kind: 'automatic' }
    return { kind: 'operation', name: row.authorName, userId: row.authorUserId }
  }
  if (row.driverUserId !== null) {
    return { kind: 'driver', name: row.driverName, userId: row.driverUserId }
  }
  /** Spec 283 (RF3): na conversa do cliente, quem respondeu é o número — nunca um contato da contratante. */
  if (participant === CLIENT_CONVERSATION_PARTICIPANT) {
    return {
      addressMasked:
        row.senderAddress === null ? '' : maskClientAddress('whatsapp', row.senderAddress),
      kind: 'client',
    }
  }
  const identity =
    row.senderAddress === null || contractorId === null || row.channel === 'portal'
      ? null
      : identifyContractorSender({
          address: row.senderAddress,
          /** T903 (S2): o `From` de e-mail só vale como identidade com DKIM alinhado. */
          authenticated: row.channel !== 'email' || row.dkimResult === 'aligned',
          channel: row.channel === 'whatsapp' ? 'whatsapp' : 'email',
          companyUsers,
          contacts,
          contractorId,
          displayName: row.fromDisplayName,
          receivedAddresses: [...(row.toAddresses ?? []), ...(row.ccAddresses ?? [])],
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
  return (
    queryable
      .select({
        authorName: authorProfile.name,
        authorUserId: occurrenceConversationMessages.authorUserId,
        automatic: occurrenceConversationMessages.automatic,
        bodyText: occurrenceConversationMessages.bodyText,
        ccAddresses: contractorMailMessages.ccAddresses,
        toAddresses: contractorMailMessages.toAddresses,
        channel: occurrenceConversationMessages.channel,
        clientDeliveryId: occurrenceConversationMessages.clientDeliveryId,
        clientDocumentName: clientDeliveryAttachment.fileName,
        contractorContactId: occurrenceConversationMessages.contractorContactId,
        conversationId: occurrenceConversationMessages.conversationId,
        createdAt: occurrenceConversationMessages.createdAt,
        direction: occurrenceConversationMessages.direction,
        dkimResult: contractorMailMessages.dkimResult,
        driverName: driverProfile.name,
        driverUserId: occurrenceConversationMessages.driverUserId,
        fromDisplayName: contractorMailMessages.fromDisplayName,
        id: occurrenceConversationMessages.id,
        mailBodyText: contractorMailMessages.bodyText,
        recipientAddress: occurrenceConversationMessages.recipientAddress,
        senderAddress: occurrenceConversationMessages.senderAddress,
        status: occurrenceConversationMessages.status,
        statusTimes: occurrenceConversationMessages.statusTimes,
        systemNotice: occurrenceConversationMessages.systemNotice,
      })
      .from(occurrenceConversationMessages)
      .leftJoin(
        authorProfile,
        eq(authorProfile.userId, occurrenceConversationMessages.authorUserId),
      )
      .leftJoin(
        driverProfile,
        eq(driverProfile.userId, occurrenceConversationMessages.driverUserId),
      )
      .leftJoin(
        contractorMailMessages,
        and(
          eq(contractorMailMessages.companyId, occurrenceConversationMessages.companyId),
          eq(contractorMailMessages.id, occurrenceConversationMessages.mailMessageId),
        ),
      )
      /** Spec 283: o arquivo que a entrega ao cliente levou, pela entrega da mensagem. */
      .leftJoin(
        occurrenceContractorReplyDeliveries,
        and(
          eq(
            occurrenceContractorReplyDeliveries.companyId,
            occurrenceConversationMessages.companyId,
          ),
          eq(
            occurrenceContractorReplyDeliveries.id,
            occurrenceConversationMessages.clientDeliveryId,
          ),
        ),
      )
      .leftJoin(
        clientDeliveryAttachment,
        and(
          eq(clientDeliveryAttachment.companyId, occurrenceContractorReplyDeliveries.companyId),
          eq(clientDeliveryAttachment.id, occurrenceContractorReplyDeliveries.attachmentId),
        ),
      )
      .where(
        and(
          eq(occurrenceConversationMessages.companyId, companyId),
          inArray(occurrenceConversationMessages.conversationId, [...conversationIds]),
        ),
      )
      .orderBy(
        asc(occurrenceConversationMessages.createdAt),
        asc(occurrenceConversationMessages.id),
      )
      .limit(MESSAGE_LIMIT)
  )
}

/** Spec 267 RF8: a cópia só aparece na mensagem de saída; o do e-mail recebido é do remetente, não nosso. */
/** Teto do e-mail inteiro na resposta: um histórico longo não pesa a leitura da conversa. */
const EMAIL_FULL_TEXT_MAX_LENGTH = 20_000

/**
 * A conversa guarda só o texto novo da resposta; o e-mail inteiro, com o histórico citado, fica no registro da 143.
 * Sai só na mensagem recebida por e-mail e só quando é mais do que o próprio corpo.
 */
function toEmailFullText(
  row: MessageRow,
): Pick<OccurrenceConversationMessageView, 'emailFullText'> {
  if (row.direction !== 'inbound' || row.channel !== 'email' || row.mailBodyText === null) return {}
  const fullText = row.mailBodyText.trim()
  if (fullText === '' || fullText === row.bodyText.trim()) return {}
  return { emailFullText: fullText.slice(0, EMAIL_FULL_TEXT_MAX_LENGTH) }
}

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

/**
 * Spec 267 RF9: quem respondeu por e-mail pode ser usuário da empresa (um responsável que recebeu a cópia). Só os
 * remetentes de e-mail recebido entram, e só com vínculo ativo na empresa do contexto — numa leitura só.
 */
async function readCompanyUsersBySender(
  queryable: TripQueryable,
  companyId: string,
  messages: readonly MessageRow[],
): Promise<readonly ContractorSenderCompanyUser[]> {
  const addresses = [
    ...new Set(
      messages.flatMap((row) =>
        row.direction === 'inbound' && row.channel === 'email' && row.senderAddress !== null
          ? [row.senderAddress.trim().toLowerCase()]
          : [],
      ),
    ),
  ]
  if (addresses.length === 0) return []
  const rows = await queryable
    .select({
      address: identityUserProfiles.contactAddress,
      name: identityUserProfiles.name,
      userId: identityUserProfiles.userId,
    })
    .from(identityUserProfiles)
    .innerJoin(
      userCompanyMemberships,
      eq(userCompanyMemberships.userId, identityUserProfiles.userId),
    )
    .where(
      and(
        eq(userCompanyMemberships.companyId, companyId),
        eq(userCompanyMemberships.status, 'active'),
        eq(identityUserProfiles.contactChannel, 'email'),
        inArray(sql`lower(${identityUserProfiles.contactAddress})`, addresses),
      ),
    )
  return rows.map((row) => ({ emails: [row.address], name: row.name, userId: row.userId }))
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
        row.direction === 'outbound'
          ? (row.ccAddresses ?? []).map((address) => address.toLowerCase())
          : [],
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
        eq(userCompanyMemberships.status, 'active'),
        eq(identityUserProfiles.contactChannel, 'email'),
        inArray(sql`lower(${identityUserProfiles.contactAddress})`, addresses),
      ),
    )
  return new Map(rows.map((row) => [row.address.toLowerCase(), row.name]))
}

/** Spec 283 (RF1): quem enviou ao cliente — o mesmo critério do aviso da 279 (o motorista da conversa dele). */
function toClientDelivery(
  row: MessageRow,
  driverUserIds: ReadonlySet<string>,
): Pick<OccurrenceConversationMessageView, 'clientDelivery' | 'recipientMasked'> {
  if (row.recipientAddress === null) return {}
  const channel: ClientConversationChannel = row.channel === 'email' ? 'email' : 'whatsapp'
  if (row.clientDeliveryId === null) {
    return { recipientMasked: maskClientAddress(channel, row.recipientAddress) }
  }
  return {
    clientDelivery: {
      actorKind:
        row.authorUserId === null
          ? 'system'
          : driverUserIds.has(row.authorUserId)
            ? 'driver'
            : 'office',
      actorName: row.authorUserId === null ? null : row.authorName,
      deliveryId: row.clientDeliveryId,
      documentName: row.clientDocumentName,
      recipientMasked: maskClientAddress(channel, row.recipientAddress),
    },
  }
}

/** Spec 283 (D4): o nome do cliente e a faixa de canais — os contatos de agora, numa leitura só. */
async function readClientView(
  queryable: TripQueryable,
  companyId: string,
  taxId: string,
  messages: readonly MessageRow[],
): Promise<OccurrenceClientView> {
  const [clients, contacts] = await Promise.all([
    queryable
      .select({ name: deliveryClients.displayName })
      .from(deliveryClients)
      .where(and(eq(deliveryClients.companyId, companyId), eq(deliveryClients.taxId, taxId)))
      .limit(1),
    queryable
      .select({ address: deliveryClientContacts.address, channel: deliveryClientContacts.channel })
      .from(deliveryClientContacts)
      .where(
        and(
          eq(deliveryClientContacts.companyId, companyId),
          eq(deliveryClientContacts.taxId, taxId),
          inArray(deliveryClientContacts.channel, [...CLIENT_CONVERSATION_CHANNELS]),
        ),
      ),
  ])
  const name = clients[0]?.name.trim() ?? ''
  return {
    channels: resolveClientChannels({
      contacts,
      messages: messages.flatMap((row) => {
        const address = row.direction === 'outbound' ? row.recipientAddress : row.senderAddress
        if (address === null || (row.channel !== 'email' && row.channel !== 'whatsapp')) return []
        return [
          {
            address,
            channel: row.channel,
            createdAt: row.createdAt.toISOString(),
            deliveryId: row.clientDeliveryId,
            direction: row.direction,
            panelReply:
              row.direction === 'outbound' &&
              row.clientDeliveryId === null &&
              row.authorUserId !== null,
            status: row.status,
          },
        ]
      }),
    }),
    name: name === '' ? null : name,
    taxIdMasked: maskTaxId(taxId),
  }
}

export async function findOccurrenceConversations(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    /** Spec 283 RF7: sem a permissão de enviar ao cliente, a conversa dele não sai. */
    readonly includeClient?: boolean
    readonly occurrenceId: string
    readonly userId: string
  },
): Promise<OccurrenceConversationsView | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  if (item === null) return null

  const conversations = await queryable
    .select({
      clientTaxId: occurrenceConversations.clientTaxId,
      contractorId: occurrenceConversations.contractorId,
      driverUserId: occurrenceConversations.driverUserId,
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
        input.includeClient === true
          ? undefined
          : inArray(occurrenceConversations.participant, [...OCCURRENCE_CONVERSATION_PARTICIPANTS]),
      ),
    )
    .orderBy(asc(occurrenceConversations.participant))
  const conversationIds = conversations.map((conversation) => conversation.id)
  const contractorIds = [
    ...new Set(conversations.flatMap((conversation) => conversation.contractorId ?? [])),
  ]
  const driverUserIds = new Set(
    conversations.flatMap((conversation) => conversation.driverUserId ?? []),
  )
  const [messages, lastReads, contacts, portalAudience] = await Promise.all([
    readMessages(queryable, input.companyId, conversationIds),
    readLastReads(queryable, { ...input, conversationIds }),
    readContractorContacts(queryable, input.companyId, contractorIds),
    item.source === 'document' ? findContractorPortalAudience(queryable, input) : null,
  ])

  const [copyNames, companyUsers, clientViews] = await Promise.all([
    readCopyNames(queryable, input.companyId, messages),
    readCompanyUsersBySender(queryable, input.companyId, messages),
    Promise.all(
      conversations.flatMap((conversation) =>
        conversation.clientTaxId === null
          ? []
          : [
              readClientView(
                queryable,
                input.companyId,
                conversation.clientTaxId,
                messages.filter((message) => message.conversationId === conversation.id),
              ).then((view) => [conversation.id, view] as const),
            ],
      ),
    ).then((entries) => new Map(entries)),
  ])

  return {
    contractorPortal: { available: (portalAudience?.userIds.length ?? 0) > 0 },
    conversations: conversations.map((conversation) => {
      const own = messages.filter((message) => message.conversationId === conversation.id)
      const client = clientViews.get(conversation.id)
      return {
        ...(client === undefined ? {} : { client }),
        id: conversation.id,
        messages: own.map((row) => ({
          attachments: [],
          author: toAuthor(
            row,
            conversation.participant,
            conversation.contractorId,
            contacts,
            companyUsers,
          ),
          bodyText: row.bodyText,
          channel: row.channel,
          ...toClientDelivery(row, driverUserIds),
          ...toCopy(row, copyNames),
          createdAt: row.createdAt.toISOString(),
          direction: row.direction,
          ...toEmailFullText(row),
          id: row.id,
          status: row.status,
          statusTimes: row.statusTimes,
          ...systemNoticeField(row.systemNotice),
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
