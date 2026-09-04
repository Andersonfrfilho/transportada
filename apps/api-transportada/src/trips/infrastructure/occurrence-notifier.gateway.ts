/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import { NOTIFICATION_CATEGORY } from '../../notification/domain/notification-catalog.constant.js'
import { tripDispatchSnapshots } from '../../database/trip.schema.js'
import type { OccurrenceNotifierPort } from '../application/register-trip-occurrence.use-case.js'
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

/**
 * Spec 079: o aviso da ocorrência.
 *
 * ⚠️ **Quem recebe é quem despachou a viagem**, como no aviso de recusa do MDF-e. Não é quem
 * registrou a ocorrência — ele acabou de registrá-la e já sabe —, e não é "todo mundo com
 * `trip.manage`", que transformaria uma nota recusada numa rajada de avisos idênticos no galpão.
 *
 * ⚠️ **Viagem sem despacho não avisa ninguém.** É o caso da ocorrência de separação, que acontece
 * antes de a carga sair: o operador está na frente da tela quando a registra.
 */
export function createOccurrenceNotifier(input: {
  readonly logger: Logger
  readonly queryable: TripQueryable
  readonly send: SendNotification
}): OccurrenceNotifierPort {
  return {
    async notify({ companyId, parameters, templateKey }) {
      const [row] = await input.queryable
        .select({ actorUserId: tripDispatchSnapshots.actorUserId })
        .from(tripDispatchSnapshots)
        .where(
          and(
            eq(tripDispatchSnapshots.companyId, companyId),
            eq(tripDispatchSnapshots.tripId, parameters.tripId),
          ),
        )
        // O último despacho é o que vale: a viagem cancelada e redespachada tem dois.
        .orderBy(desc(tripDispatchSnapshots.dispatchedAt))
        .limit(1)

      if (row === undefined) return

      try {
        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId,
          /**
           * Derivada da nota **e do tipo**: a mesma nota pode ter ocorrências diferentes, e cada
           * uma muda o que a pessoa precisa fazer. Repetir o mesmo tipo na mesma nota não vira
           * segundo aviso.
           */
          dedupeKey: `${templateKey}:${parameters.tripId}:${parameters.documentLabel}:${parameters.occurrenceType}`,
          payload: {
            documentLabel: parameters.documentLabel,
            occurrenceType: parameters.occurrenceType,
            stopLabel: parameters.stopLabel,
          },
          recipientUserId: row.actorUserId,
          templateKey,
        })
      } catch (error) {
        // A ocorrência já foi registrada; o aviso é conveniência (ver o caso de uso).
        input.logger.warn('trip_occurrence_notification_failed', {
          companyId,
          reason: error instanceof Error ? error.message : 'unknown',
          tripId: parameters.tripId,
        })
      }
    },
  }
}
