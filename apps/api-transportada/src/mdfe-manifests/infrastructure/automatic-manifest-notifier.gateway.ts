/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { tripDispatchSnapshots, trips } from '../../database/trip.schema.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/domain/notification-catalog.constant.js'
import type { AutomaticManifestNotifierPort } from '../application/issue-trip-manifest-automatically.use-case.js'
import { describeMdfeRefusal } from '../domain/mdfe-refusal-reason.policy.js'
import type { MdfeDatabase } from './mdfe-queryable.type.js'

export type AutomaticManifestNotificationSender = (params: {
  readonly category: string
  readonly companyId: string
  readonly dedupeKey: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly recipientUserId: string
  readonly templateKey: string
}) => Promise<unknown>

export type AutomaticManifestNotifierLogger = {
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void
}

/**
 * **Quem recebe é quem despachou a viagem** — a pessoa que pôs o caminhão na rua, e a única que o
 * sistema sabe estar respondendo por ela. A viagem não guarda autor; o despacho guarda, e é ele que
 * marca o momento a partir do qual o manifesto passou a ser obrigação de alguém.
 *
 * Viagem sem despacho registrado não avisa ninguém: um destinatário inventado é aviso que chega a
 * quem não pode agir.
 */
export function createAutomaticManifestNotifier(input: {
  readonly database: MdfeDatabase
  readonly logger: AutomaticManifestNotifierLogger
  readonly send: AutomaticManifestNotificationSender
}): AutomaticManifestNotifierPort {
  return {
    async notifyRefusal({ companyId, refusalCode, tripId }) {
      const [row] = await input.database
        .select({
          actorUserId: tripDispatchSnapshots.actorUserId,
          plate: fleetVehicles.plate,
        })
        .from(tripDispatchSnapshots)
        .innerJoin(
          trips,
          and(
            eq(trips.companyId, tripDispatchSnapshots.companyId),
            eq(trips.id, tripDispatchSnapshots.tripId),
          ),
        )
        .innerJoin(
          fleetVehicles,
          and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
        )
        .where(
          and(
            eq(tripDispatchSnapshots.companyId, companyId),
            eq(tripDispatchSnapshots.tripId, tripId),
          ),
        )
        // O último despacho é o que vale: a viagem cancelada e redespachada tem dois.
        .orderBy(desc(tripDispatchSnapshots.dispatchedAt))
        .limit(1)

      if (row === undefined) return

      try {
        await input.send({
          category: NOTIFICATION_CATEGORY.MDFE,
          companyId,
          /**
           * Derivada da viagem **e do motivo**: cada CT-e autorizado tenta emitir de novo, e sem
           * isto uma viagem de trinta notas viraria trinta avisos idênticos. Motivo novo é aviso
           * novo — ele mudou o que a pessoa precisa fazer.
           */
          dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.MDFE_MANIFEST_ISSUANCE_FAILED}:${tripId}:${refusalCode}`,
          payload: { plate: row.plate, reason: describeMdfeRefusal(refusalCode) },
          recipientUserId: row.actorUserId,
          templateKey: NOTIFICATION_TEMPLATE_KEY.MDFE_MANIFEST_ISSUANCE_FAILED,
        })
      } catch (error) {
        // O manifesto não sai por causa de um aviso que não saiu: a recusa já foi relatada.
        input.logger.warn('mdfe_manifest_refusal_notification_failed', {
          companyId,
          refusalCode,
          reason: error instanceof Error ? error.message : 'unknown',
          tripId,
        })
      }
    },
  }
}
