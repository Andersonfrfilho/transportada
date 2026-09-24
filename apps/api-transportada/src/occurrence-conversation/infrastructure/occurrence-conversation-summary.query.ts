/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF4/RF15: o que a listagem e a leitura dividem — quantas recebidas o usuário ainda não
 * viu, e o resumo da conversa por ocorrência da página. Não importa nada de `trips`: a listagem de
 * ocorrências chama este arquivo, e a volta faria o ciclo.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversationReads,
  occurrenceConversations,
  type OccurrenceConversationKind,
} from '../../database/database.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

/** Recebidas depois da última que o usuário viu; sem registro de leitura, todas as recebidas. */
export function countUnread(
  messages: readonly { readonly direction: string; readonly id: string }[],
  lastReadMessageId: null | string,
): number {
  const lastReadIndex =
    lastReadMessageId === null
      ? -1
      : messages.findIndex((message) => message.id === lastReadMessageId)
  return messages.slice(lastReadIndex + 1).filter((message) => message.direction === 'inbound')
    .length
}

export async function readLastReads(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly conversationIds: readonly string[]
    readonly userId: string
  },
): Promise<ReadonlyMap<string, string>> {
  if (input.conversationIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      conversationId: occurrenceConversationReads.conversationId,
      lastReadMessageId: occurrenceConversationReads.lastReadMessageId,
    })
    .from(occurrenceConversationReads)
    .where(
      and(
        eq(occurrenceConversationReads.companyId, input.companyId),
        eq(occurrenceConversationReads.userId, input.userId),
        inArray(occurrenceConversationReads.conversationId, [...input.conversationIds]),
      ),
    )
  return new Map(rows.map((row) => [row.conversationId, row.lastReadMessageId]))
}

export type OccurrenceConversationSummary = {
  /** RF4: `none` sem mensagem; `awaiting` quando a última é nossa; `replied` quando é dela. */
  readonly contractorState: 'awaiting' | 'none' | 'replied'
  readonly driverUnreadCount: number
}

export const EMPTY_CONVERSATION_SUMMARY: OccurrenceConversationSummary = {
  contractorState: 'none',
  driverUnreadCount: 0,
}

/**
 * O resumo da página da listagem em três leituras fixas (conversas, mensagens, leituras). Sem
 * `viewerUserId`, toda recebida do motorista conta como não lida.
 */
export async function listOccurrenceConversationSummaries(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly occurrences: readonly {
      readonly id: string
      readonly kind: OccurrenceConversationKind
    }[]
    readonly viewerUserId?: string
  },
): Promise<ReadonlyMap<string, OccurrenceConversationSummary>> {
  const summaries = new Map<string, OccurrenceConversationSummary>()
  if (input.occurrences.length === 0) return summaries
  const conversations = await queryable
    .select({
      id: occurrenceConversations.id,
      occurrenceId: occurrenceConversations.occurrenceId,
      occurrenceKind: occurrenceConversations.occurrenceKind,
      participant: occurrenceConversations.participant,
    })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        inArray(occurrenceConversations.occurrenceId, [
          ...new Set(input.occurrences.map((occurrence) => occurrence.id)),
        ]),
      ),
    )
  const wanted = new Set(
    input.occurrences.map((occurrence) => `${occurrence.kind}:${occurrence.id}`),
  )
  const relevant = conversations.filter((conversation) =>
    wanted.has(`${conversation.occurrenceKind}:${conversation.occurrenceId}`),
  )
  if (relevant.length === 0) return summaries

  const conversationIds = relevant.map((conversation) => conversation.id)
  const [messages, lastReads] = await Promise.all([
    queryable
      .select({
        conversationId: occurrenceConversationMessages.conversationId,
        direction: occurrenceConversationMessages.direction,
        id: occurrenceConversationMessages.id,
      })
      .from(occurrenceConversationMessages)
      .where(
        and(
          eq(occurrenceConversationMessages.companyId, input.companyId),
          inArray(occurrenceConversationMessages.conversationId, conversationIds),
        ),
      )
      .orderBy(
        asc(occurrenceConversationMessages.createdAt),
        asc(occurrenceConversationMessages.id),
      ),
    input.viewerUserId === undefined
      ? Promise.resolve(new Map<string, string>())
      : readLastReads(queryable, {
          companyId: input.companyId,
          conversationIds,
          userId: input.viewerUserId,
        }),
  ])

  for (const conversation of relevant) {
    const key = `${conversation.occurrenceKind}:${conversation.occurrenceId}`
    const current = summaries.get(key) ?? EMPTY_CONVERSATION_SUMMARY
    const own = messages.filter((message) => message.conversationId === conversation.id)
    if (conversation.participant === 'contractor') {
      const last = own.at(-1)
      summaries.set(key, {
        ...current,
        contractorState:
          last === undefined ? 'none' : last.direction === 'outbound' ? 'awaiting' : 'replied',
      })
    } else {
      summaries.set(key, {
        ...current,
        driverUnreadCount: countUnread(own, lastReads.get(conversation.id) ?? null),
      })
    }
  }
  return summaries
}
