/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: os fatos crus da linha do tempo de uma ocorrência — o registro, as fotos, a
 * tratativa da spec 164 e os e-mails à contratante da spec 143. Quatro leituras fixas, toda uma com
 * `company_id`: um degrau sem ele é o caminho pelo qual a tratativa de uma empresa aparece na tela
 * de outra.
 *
 * ⚠️ Do e-mail só saem direção, hora, entrega e interpretação — **nunca** endereço, assunto ou
 * corpo. Quem mostra a mensagem é a conversa (Fase 4), com a regra dela.
 */
import { and, asc, eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailThreads,
} from '../../database/contractor-mail.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripOccurrenceCaseEvents,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import type {
  OccurrenceTimelineActor,
  OccurrenceTimelineSource,
} from '../domain/occurrence-timeline.policy.js'
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
    actor: {
      kind: row.actorKind === 'contractor' ? 'contractor' : 'operation',
      name: row.actorName ?? null,
    },
    fromStatus: row.fromStatus ?? null,
    id: row.id,
    kind: 'case.transition',
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    toStatus: row.toStatus,
  }))
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
  const [photos, caseEvents, mails] = await Promise.all([
    listPhotoSources(queryable, scope, item),
    listCaseSources(queryable, scope),
    listMailSources(queryable, scope, item),
  ])
  const recorded: OccurrenceTimelineSource = {
    actor: recordingActor(item),
    id: item.id,
    kind: 'occurrence.recorded',
    occurredAt: item.createdAt,
  }
  return [recorded, ...photos, ...caseEvents, ...mails]
}
