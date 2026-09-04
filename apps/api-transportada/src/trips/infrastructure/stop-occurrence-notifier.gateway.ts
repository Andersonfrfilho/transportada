/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import { tripDispatchSnapshots, tripDocuments, tripStops } from '../../database/trip.schema.js'
import { NOTIFICATION_CATEGORY } from '../../notification/domain/notification-catalog.constant.js'
import {
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
} from '../../notification/notification.constant.js'
import { resolveStopOccurrenceTemplateKey } from '../domain/stop-occurrence-notification.policy.js'
import type { StopOccurrenceNotifierPort } from '../application/report-stop-occurrence.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Logger = { warn(event: string, meta?: Record<string, unknown>): void }

type SendNotification = (input: {
  readonly category: string
  readonly companyId: string
  readonly dedupeKey: string
  readonly payload: object
  readonly recipientUserId: string
  readonly templateKey: string
}) => Promise<unknown>

/** A hora que o template imprime — só hora e data, no fuso do produto, nunca o ISO cru. */
const OCCURRED_AT_FORMATTER = new Intl.DateTimeFormat(NOTIFICATION_DEFAULT_LOCALE, {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  timeZone: NOTIFICATION_DEFAULT_TIMEZONE,
  year: 'numeric',
})

/** O template diz "Nota: {{documentLabel}}", e relato sem nota não pode renderizar um buraco. */
const DOCUMENT_LABEL_ABSENT = '—'

/**
 * Spec 082 D8: o aviso do relato de parada do motorista.
 *
 * **Reusa o trilho `notification.v1` existente**: o `send` injetado é o
 * `sendNotification` do notification-module, que enfileira no RabbitMQ quando a fila está
 * configurada — a API produz, o worker consome e renderiza o template semeado no banco. Nenhuma
 * fila nova.
 *
 * ⚠️ **Quem recebe é quem despachou a viagem**, como no aviso de ocorrência de entrega
 * (`occurrence-notifier.gateway.ts`): não é o motorista — ele acabou de relatar — e não é "todo
 * mundo com `trip.manage`". Viagem sem despacho não avisa ninguém; relato de parada só existe
 * com a viagem na rua, então o caso é teórico e silencioso.
 *
 * ⚠️ **Motivo sem template não avisa e não falha**: a ocorrência já está gravada, e o aviso é
 * conveniência — mesma regra do caso de uso da 079.
 */
export function createStopOccurrenceNotifier(input: {
  readonly logger: Logger
  readonly queryable: TripQueryable
  readonly send: SendNotification
}): StopOccurrenceNotifierPort {
  return {
    async notify({ companyId, documentId, kind, occurredAt, occurrenceId, stopId }) {
      const templateKey = resolveStopOccurrenceTemplateKey(kind)
      if (templateKey === null) return

      try {
        const [stop] = await input.queryable
          .select({ label: tripStops.label, tripId: tripStops.tripId })
          .from(tripStops)
          .where(and(eq(tripStops.companyId, companyId), eq(tripStops.id, stopId)))
          .limit(1)
        if (stop === undefined) return

        const [snapshot] = await input.queryable
          .select({ actorUserId: tripDispatchSnapshots.actorUserId })
          .from(tripDispatchSnapshots)
          .where(
            and(
              eq(tripDispatchSnapshots.companyId, companyId),
              eq(tripDispatchSnapshots.tripId, stop.tripId),
            ),
          )
          // O último despacho é o que vale: a viagem cancelada e redespachada tem dois.
          .orderBy(desc(tripDispatchSnapshots.dispatchedAt))
          .limit(1)
        if (snapshot === undefined) return

        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId,
          /**
           * Derivada da **ocorrência**: a idempotência da fila offline converge o reenvio no
           * mesmo registro, e o mesmo registro não vira segundo aviso.
           */
          dedupeKey: `${templateKey}:${occurrenceId}`,
          payload: {
            documentLabel: await readDocumentLabel({
              companyId,
              documentId,
              queryable: input.queryable,
            }),
            occurredAt: OCCURRED_AT_FORMATTER.format(occurredAt),
            stopLabel: stop.label,
          },
          recipientUserId: snapshot.actorUserId,
          templateKey,
        })
      } catch (error) {
        // A ocorrência já foi registrada; o aviso é conveniência (ver o caso de uso).
        input.logger.warn('trip_stop_occurrence_notification_failed', {
          companyId,
          occurrenceId,
          reason: error instanceof Error ? error.message : 'unknown',
        })
      }
    },
  }
}

async function readDocumentLabel(params: {
  readonly companyId: string
  readonly documentId: string | null
  readonly queryable: TripQueryable
}): Promise<string> {
  if (params.documentId === null) return DOCUMENT_LABEL_ABSENT

  const [row] = await params.queryable
    .select({ number: nfeDocuments.number, series: nfeDocuments.series })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, params.companyId), eq(tripDocuments.id, params.documentId)),
    )
    .limit(1)

  const number = row?.number ?? ''
  if (number === '') return DOCUMENT_LABEL_ABSENT
  const series = row?.series ?? ''
  return series === '' ? number : `${number}/${series}`
}
