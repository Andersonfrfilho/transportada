/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: os fatos crus da linha do tempo de uma ocorrência — o registro, as fotos, a
 * tratativa da spec 164, os e-mails à contratante da spec 143 e o retorno da contratante da 248 (com a
 * conferência do boleto, a entrega ao motorista e a leitura dele, spec 278). Quatro leituras fixas, toda uma com
 * `company_id`: um degrau sem ele é o caminho pelo qual a tratativa de uma empresa aparece na tela
 * de outra.
 *
 * ⚠️ Do e-mail só saem direção, hora, entrega e interpretação — **nunca** endereço, assunto ou
 * corpo. Quem mostra a mensagem é a conversa (Fase 4), com a regra dela.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailThreads,
} from '../../database/contractor-mail.schema.js'
import {
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceContractorReplyEvents,
} from '../../database/occurrence-contractor-reply.schema.js'
import {
  occurrenceConversationMessages,
  occurrenceConversations,
  tripOccurrenceResolutionEvents,
} from '../../database/occurrence-conversation.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripOccurrenceCaseEvents,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import type {
  OccurrenceTimelineActor,
  OccurrenceTimelineDeliveryChannel,
  OccurrenceTimelineDocumentCheckResult,
  OccurrenceTimelineDocumentKind,
  OccurrenceTimelineSource,
} from '../domain/occurrence-timeline.policy.js'
import { resolveSystemResolutionCausePhraseKey } from '../domain/occurrence-resolution.policy.js'
import type { TripOccurrenceFeedItem } from '../application/trip-occurrence-feed.use-case.js'
import { findTripOccurrenceFeedItem } from './trip-occurrence-feed.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Scope = { readonly companyId: string; readonly occurrenceId: string }

/** Canais em que quem registrou foi o próprio motorista; o resto é a operação (spec 156). */
const DRIVER_CHANNELS: ReadonlySet<string> = new Set(['driver_app', 'whatsapp'])

function recordingActor(item: TripOccurrenceFeedItem): OccurrenceTimelineActor {
  if (DRIVER_CHANNELS.has(item.channel)) {
    return {
      kind: 'driver',
      name: item.actorName ?? (item.driverName === '' ? null : item.driverName),
    }
  }
  return { kind: 'operation', name: item.actorName }
}

/**
 * Fotos: a tabela da spec 161 (uma linha por foto, com a hora de cada envio) quando existe; senão a
 * coluna antiga, que só diz que houve foto no registro. A foto não grava quem a mandou — quem a
 * manda é o mesmo fluxo do registro.
 */
async function listPhotoSources(
  queryable: TripQueryable,
  scope: Scope,
  item: TripOccurrenceFeedItem,
): Promise<readonly OccurrenceTimelineSource[]> {
  const actor = recordingActor(item)
  const rows =
    item.source === 'document'
      ? await queryable
          .select({
            createdAt: tripDocumentOccurrenceAttachments.createdAt,
            id: tripDocumentOccurrenceAttachments.id,
          })
          .from(tripDocumentOccurrenceAttachments)
          .where(
            and(
              eq(tripDocumentOccurrenceAttachments.companyId, scope.companyId),
              eq(tripDocumentOccurrenceAttachments.occurrenceId, scope.occurrenceId),
            ),
          )
          .orderBy(asc(tripDocumentOccurrenceAttachments.position))
      : []
  if (rows.length === 0) {
    return item.hasAttachment
      ? [
          {
            actor,
            id: item.id,
            kind: 'occurrence.photo',
            occurredAt: item.createdAt,
            photoCount: 1,
          },
        ]
      : []
  }
  return rows.map((row) => ({
    actor,
    id: row.id,
    kind: 'occurrence.photo',
    occurredAt: row.createdAt.toISOString(),
    photoCount: 1,
  }))
}

async function listCaseSources(
  queryable: TripQueryable,
  scope: Scope,
): Promise<readonly OccurrenceTimelineSource[]> {
  const rows = await queryable
    .select({
      actorKind: tripOccurrenceCaseEvents.actorKind,
      actorName: identityUserProfiles.name,
      fromStatus: tripOccurrenceCaseEvents.fromStatus,
      id: tripOccurrenceCaseEvents.id,
      note: tripOccurrenceCaseEvents.note,
      occurredAt: tripOccurrenceCaseEvents.occurredAt,
      toStatus: tripOccurrenceCaseEvents.toStatus,
    })
    .from(tripOccurrenceCases)
    .innerJoin(
      tripOccurrenceCaseEvents,
      and(
        eq(tripOccurrenceCaseEvents.companyId, tripOccurrenceCases.companyId),
        eq(tripOccurrenceCaseEvents.caseId, tripOccurrenceCases.id),
      ),
    )
    .leftJoin(
      identityUserProfiles,
      eq(identityUserProfiles.userId, tripOccurrenceCaseEvents.actorUserId),
    )
    .where(
      and(
        eq(tripOccurrenceCases.companyId, scope.companyId),
        eq(tripOccurrenceCases.occurrenceId, scope.occurrenceId),
      ),
    )

  return rows.map((row) => ({
    actor:
      row.actorKind === 'contractor'
        ? { kind: 'contractor', name: null }
        : { kind: 'operation', name: row.actorName ?? null },
    fromStatus: row.fromStatus ?? null,
    id: row.id,
    kind: 'case.transition',
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    toStatus: row.toStatus,
  }))
}

/**
 * Spec 266 / ADR-0105: o andamento com o motorista. Uma leitura só, o histórico inteiro; o evento
 * `system` leva a frase fixa do status terminal da tratativa e nunca a nota dela.
 */
async function listResolutionSources(
  queryable: TripQueryable,
  scope: Scope,
  item: TripOccurrenceFeedItem,
): Promise<readonly OccurrenceTimelineSource[]> {
  const ownerColumn =
    item.source === 'document'
      ? tripOccurrenceResolutionEvents.documentOccurrenceId
      : tripOccurrenceResolutionEvents.stopOccurrenceId
  const rows = await queryable
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      actorName: identityUserProfiles.name,
      caseStatus: tripOccurrenceCaseEvents.toStatus,
      contractorReplyId: tripOccurrenceResolutionEvents.contractorReplyId,
      createdAt: tripOccurrenceResolutionEvents.createdAt,
      id: tripOccurrenceResolutionEvents.id,
      kind: tripOccurrenceResolutionEvents.kind,
      messageId: tripOccurrenceResolutionEvents.conversationMessageId,
      note: tripOccurrenceResolutionEvents.note,
    })
    .from(tripOccurrenceResolutionEvents)
    .leftJoin(
      identityUserProfiles,
      eq(identityUserProfiles.userId, tripOccurrenceResolutionEvents.actorUserId),
    )
    .leftJoin(
      tripOccurrenceCaseEvents,
      and(
        eq(tripOccurrenceCaseEvents.companyId, tripOccurrenceResolutionEvents.companyId),
        eq(tripOccurrenceCaseEvents.id, tripOccurrenceResolutionEvents.caseEventId),
      ),
    )
    .where(
      and(
        eq(tripOccurrenceResolutionEvents.companyId, scope.companyId),
        eq(ownerColumn, scope.occurrenceId),
      ),
    )

  return rows.map((row): OccurrenceTimelineSource => {
    const occurredAt = row.createdAt.toISOString()
    if (row.kind === 'reopened') {
      /** O CHECK `reopen_check` da tabela garante a mensagem em todo `reopened`. */
      if (row.messageId === null) throw new Error('OCCURRENCE_REOPENED_EVENT_WITHOUT_MESSAGE')
      return {
        actor: { kind: 'driver', name: row.actorName ?? null },
        id: row.id,
        kind: 'resolution.reopened',
        messageId: row.messageId,
        occurredAt,
      }
    }
    const isSystem = row.actorKind === 'system'
    return {
      actor: isSystem
        ? { kind: 'system', name: null }
        : { kind: 'operation', name: row.actorName ?? null },
      id: row.id,
      kind: 'resolution.resolved',
      note: isSystem ? null : (row.note ?? null),
      occurredAt,
      phraseKey: isSystem
        ? (resolveSystemResolutionCausePhraseKey({
            caseEventStatus: row.caseStatus ?? undefined,
            ...(row.contractorReplyId === null ? {} : { causedByContractorReply: true as const }),
          }) ?? null)
        : null,
    }
  })
}

/** Spec 278 D1: o motivo do evento que diz o resultado da conferência do boleto (276 T2). */
const DOCUMENT_CHECK_RESULT_BY_REASON: Readonly<
  Record<string, OccurrenceTimelineDocumentCheckResult>
> = {
  document_confirmed: 'confirmed',
  document_not_confirmed: 'not_confirmed',
  document_without_text: 'without_text',
}

/** Spec 278 D5: as entregas ao motorista; as por e-mail (cliente da nota, informado) e a resposta à contratante ficam fora. */
const DRIVER_DELIVERY_CHANNEL: Readonly<Record<string, OccurrenceTimelineDeliveryChannel>> = {
  driver_app_chat: 'app_chat',
  driver_whatsapp: 'whatsapp',
}

function documentKindOf(config: Record<string, unknown>): OccurrenceTimelineDocumentKind {
  return config.attachmentKind === 'boleto_pdf' ? 'boleto' : 'document'
}

/**
 * Spec 278 D4/D5: cada tentativa de levar o documento ao motorista, na ordem, com o nome dele (da conversa que a
 * entrega gravou) e a leitura (`status_times.read` da mensagem). Nunca o endereço nem o anexo.
 */
async function listDriverDeliverySources(
  queryable: TripQueryable,
  scope: Scope,
  reply: { readonly documentKind: OccurrenceTimelineDocumentKind; readonly id: string },
): Promise<readonly OccurrenceTimelineSource[]> {
  const rows = await queryable
    .select({
      createdAt: occurrenceContractorReplyDeliveries.createdAt,
      driverName: identityUserProfiles.name,
      id: occurrenceContractorReplyDeliveries.id,
      readAt: sql<null | string>`${occurrenceConversationMessages.statusTimes} ->> 'read'`,
      reason: occurrenceContractorReplyDeliveries.reason,
      status: occurrenceContractorReplyDeliveries.status,
      target: occurrenceContractorReplyDeliveries.target,
    })
    .from(occurrenceContractorReplyDeliveries)
    .leftJoin(
      occurrenceConversationMessages,
      and(
        eq(occurrenceConversationMessages.companyId, occurrenceContractorReplyDeliveries.companyId),
        eq(occurrenceConversationMessages.id, occurrenceContractorReplyDeliveries.driverMessageId),
      ),
    )
    .leftJoin(
      occurrenceConversations,
      and(
        eq(occurrenceConversations.companyId, occurrenceConversationMessages.companyId),
        eq(occurrenceConversations.id, occurrenceConversationMessages.conversationId),
      ),
    )
    .leftJoin(
      identityUserProfiles,
      eq(identityUserProfiles.userId, occurrenceConversations.driverUserId),
    )
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, scope.companyId),
        eq(occurrenceContractorReplyDeliveries.replyId, reply.id),
        inArray(occurrenceContractorReplyDeliveries.target, ['driver_app_chat', 'driver_whatsapp']),
      ),
    )
    .orderBy(
      asc(occurrenceContractorReplyDeliveries.createdAt),
      asc(occurrenceContractorReplyDeliveries.id),
    )

  return rows.flatMap((row, index): OccurrenceTimelineSource[] => {
    const driverName = row.driverName ?? null
    const delivery: OccurrenceTimelineSource = {
      actor: { kind: 'system', name: null },
      attempt: index + 1,
      channel: DRIVER_DELIVERY_CHANNEL[row.target] ?? 'app_chat',
      documentKind: reply.documentKind,
      driverName,
      id: row.id,
      kind: 'contractor.reply.delivery',
      occurredAt: row.createdAt.toISOString(),
      reason: row.reason ?? null,
      status: row.status,
    }
    const readAt = row.status === 'sent' && row.readAt !== null ? Date.parse(row.readAt) : NaN
    if (Number.isNaN(readAt)) return [delivery]
    return [
      delivery,
      {
        actor: { kind: 'driver', name: driverName },
        documentKind: reply.documentKind,
        id: row.id,
        kind: 'contractor.reply.driver_read',
        occurredAt: new Date(readAt).toISOString(),
      },
    ]
  })
}

/**
 * Spec 276 T3: o retorno da contratante (248) — a abertura (`created_at` do retorno, que não grava evento)
 * e cada mudança de status. Só status, motivo e ator; nunca a nota do operador nem o anexo. Só a
 * ocorrência de nota abre retorno. Spec 278: também o resultado da conferência do boleto (o motivo do evento),
 * as entregas ao motorista e a leitura dele.
 */
async function listContractorReplySources(
  queryable: TripQueryable,
  scope: Scope,
  item: TripOccurrenceFeedItem,
): Promise<readonly OccurrenceTimelineSource[]> {
  if (item.source !== 'document') return []
  const replies = await queryable
    .select({
      config: occurrenceContractorReplies.config,
      createdAt: occurrenceContractorReplies.createdAt,
      id: occurrenceContractorReplies.id,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, scope.companyId),
        eq(occurrenceContractorReplies.occurrenceId, scope.occurrenceId),
      ),
    )
  const [reply] = replies
  if (reply === undefined) return []
  const documentKind = documentKindOf(reply.config)
  const deliveries = listDriverDeliverySources(queryable, scope, { documentKind, id: reply.id })
  const rows = await queryable
    .select({
      actorKind: occurrenceContractorReplyEvents.actorKind,
      actorName: identityUserProfiles.name,
      createdAt: occurrenceContractorReplyEvents.createdAt,
      id: occurrenceContractorReplyEvents.id,
      reason: occurrenceContractorReplyEvents.reason,
      toStatus: occurrenceContractorReplyEvents.toStatus,
    })
    .from(occurrenceContractorReplyEvents)
    .leftJoin(
      identityUserProfiles,
      eq(identityUserProfiles.userId, occurrenceContractorReplyEvents.actorUserId),
    )
    .where(
      and(
        eq(occurrenceContractorReplyEvents.companyId, scope.companyId),
        eq(occurrenceContractorReplyEvents.replyId, reply.id),
      ),
    )
  const opened: OccurrenceTimelineSource = {
    actor: { kind: 'system', name: null },
    id: reply.id,
    kind: 'contractor.reply',
    occurredAt: reply.createdAt.toISOString(),
    reason: null,
    toStatus: 'awaiting_contractor',
  }
  const checks = rows.flatMap((row): OccurrenceTimelineSource[] => {
    const result = row.reason === null ? undefined : DOCUMENT_CHECK_RESULT_BY_REASON[row.reason]
    if (result === undefined) return []
    return [
      {
        actor: { kind: 'system', name: null },
        id: row.id,
        invoiceNumber: item.invoiceNumber,
        kind: 'contractor.reply.document',
        occurredAt: row.createdAt.toISOString(),
        result,
        toStatus: row.toStatus,
      },
    ]
  })
  return [
    opened,
    ...rows.map(
      (row): OccurrenceTimelineSource => ({
        actor:
          row.actorKind === 'user'
            ? { kind: 'operation', name: row.actorName ?? null }
            : { kind: 'system', name: null },
        id: row.id,
        kind: 'contractor.reply',
        occurredAt: row.createdAt.toISOString(),
        reason: row.reason ?? null,
        toStatus: row.toStatus,
      }),
    ),
    ...checks,
    ...(await deliveries),
  ]
}

/**
 * E-mails da conversa desta ocorrência (spec 143). O envio sem autor é o aviso automático do tipo
 * que notifica — ator `system`. A resposta é da contratante; o nome de quem respondeu chega com a
 * T405, pelo cadastro de contatos.
 */
async function listMailSources(
  queryable: TripQueryable,
  scope: Scope,
  item: TripOccurrenceFeedItem,
): Promise<readonly OccurrenceTimelineSource[]> {
  const subjectType = item.source === 'document' ? 'document_occurrence' : 'stop_occurrence'
  const rows = await queryable
    .select({
      actorName: identityUserProfiles.name,
      actorUserId: contractorMailMessages.actorUserId,
      /**
       * Spec 278 D6: os anexos da mensagem da conversa (183) que este e-mail virou; `null` sem mensagem ligada.
       * Toda leitura dentro da empresa do e-mail.
       */
      attachmentCount: sql<null | number>`(
        select case when count(message.id) = 0 then null else count(attachment.id)::int end
          from occurrence_conversation_messages message
          left join occurrence_conversation_attachments attachment
            on attachment.company_id = message.company_id and attachment.message_id = message.id
         where message.company_id = ${contractorMailMessages.companyId}
           and message.mail_message_id = ${contractorMailMessages.id}
      )`,
      createdAt: contractorMailMessages.createdAt,
      deliveryStatus: contractorMailMessages.deliveryStatus,
      direction: contractorMailMessages.direction,
      id: contractorMailMessages.id,
      interpretation: contractorMailMessages.interpretation,
    })
    .from(contractorMailThreads)
    .innerJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, contractorMailThreads.companyId),
        eq(contractorMailMessages.threadId, contractorMailThreads.id),
      ),
    )
    .leftJoin(
      identityUserProfiles,
      eq(identityUserProfiles.userId, contractorMailMessages.actorUserId),
    )
    .where(
      and(
        eq(contractorMailThreads.companyId, scope.companyId),
        eq(contractorMailThreads.subjectType, subjectType),
        eq(contractorMailThreads.subjectId, scope.occurrenceId),
      ),
    )

  return rows.map((row): OccurrenceTimelineSource => {
    const outbound = row.direction === 'outbound'
    return {
      actor: outbound
        ? row.actorUserId === null
          ? { kind: 'system', name: null }
          : { kind: 'operation', name: row.actorName ?? null }
        : { kind: 'contractor', name: null },
      ...(outbound ? {} : { attachmentCount: row.attachmentCount ?? null }),
      deliveryStatus: row.deliveryStatus ?? null,
      id: row.id,
      interpretation: row.interpretation ?? null,
      kind: outbound ? 'contractor.mail.sent' : 'contractor.mail.received',
      occurredAt: row.createdAt.toISOString(),
    }
  })
}

export async function findTripOccurrenceTimelineSources(
  queryable: TripQueryable,
  scope: Scope,
): Promise<readonly OccurrenceTimelineSource[] | null> {
  const item = await findTripOccurrenceFeedItem(queryable, scope)
  if (item === null) return null
  const [photos, caseEvents, mails, resolutions, replies] = await Promise.all([
    listPhotoSources(queryable, scope, item),
    listCaseSources(queryable, scope),
    listMailSources(queryable, scope, item),
    listResolutionSources(queryable, scope, item),
    listContractorReplySources(queryable, scope, item),
  ])
  const recorded: OccurrenceTimelineSource = {
    actor: recordingActor(item),
    id: item.id,
    kind: 'occurrence.recorded',
    occurredAt: item.createdAt,
  }
  const cancelled: readonly OccurrenceTimelineSource[] =
    item.cancellation === null
      ? []
      : [
          {
            actor: { kind: 'operation', name: item.cancellation.cancelledByName },
            id: item.id,
            kind: 'occurrence.cancelled',
            occurredAt: item.cancellation.cancelledAt,
            reason: item.cancellation.reason,
          },
        ]
  return [recorded, ...photos, ...caseEvents, ...mails, ...replies, ...cancelled, ...resolutions]
}
