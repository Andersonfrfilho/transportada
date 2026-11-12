/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As portas do "não entreguei" no grupo, sobre a camada comum dos eventos: a baixa vai pela MESMA função do app
 * (`reportDocumentReturn`, canal `whatsapp`), no nome do motorista do grupo, com o ponto compartilhado há pouco.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import { findStopAwaitingSettlement } from '../../trips/domain/driver-stop-resolution.policy.js'
import { routeContinuationOf } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type WhatsAppBotSpeechPort,
} from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeWhatsAppDriverEventResult,
  WHATSAPP_GROUP_EVENT_FAILED,
} from '../../whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  refuseWhatsAppDriverEvent,
  returnWhatsAppDriverDocument,
  WHATSAPP_DRIVER_EVENT,
  type WhatsAppDriverEventPorts,
} from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import { placeStops } from '../../whatsapp-commands/infrastructure/whatsapp-stop-place.reader.js'
import type { GroupReturnFlowPorts } from '../application/whatsapp-group-return-flow.service.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CLOSED = new Set(['delivered', 'returned'])

export function createGroupReturnPorts(dependencies: {
  readonly consumeLocation?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => null | ReportedLocation
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly ports: Pick<WhatsAppDriverEventPorts, 'reportReturn'>
  readonly resolveSenderRole?: GroupReturnFlowPorts['resolveSenderRole']
  readonly speech?: WhatsAppBotSpeechPort
}): GroupReturnFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const speech = dependencies.speech ?? CATALOG_BOT_SPEECH

  return {
    ...(dependencies.resolveSenderRole === undefined
      ? {}
      : { resolveSenderRole: dependencies.resolveSenderRole }),

    async listOpenDocuments(input) {
      const trips = await dependencies.listActiveTrips(input)
      const activeStops = trips
        .filter((trip) => !terminal.has(trip.status))
        .flatMap((trip) => trip.stops)
      const arrived = findStopAwaitingSettlement(activeStops)
      const stops = await placeStops(dependencies.database, {
        companyId: input.companyId,
        ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
        stops: activeStops,
      })
      return stops.flatMap((stop) =>
        stop.documents
          .filter((document) => !CLOSED.has(document.separationStatus))
          .map((document) => ({
            atArrivedStop: stop.id === arrived?.id,
            city: stop.city,
            clientName: document.recipientDisplayName,
            id: document.id,
            number: document.number,
          })),
      )
    },

    async returnDocument(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      const event = WHATSAPP_DRIVER_EVENT.return
      const documentNumber = input.documentNumber.replace(/^0+(?=\d)/u, '')
      let result
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(event, { code: 'driver_without_access' })
      } else {
        try {
          result = await returnWhatsAppDriverDocument(dependencies.ports, {
            actorUserId,
            companyId: input.companyId,
            documentId: input.documentId,
            driverId: input.driverId,
            idempotencyKey: input.idempotencyKey,
            location: dependencies.consumeLocation?.(input) ?? null,
            reason: input.reason,
          })
        } catch (error) {
          dependencies.logger?.warn('whatsapp_group_request.return_register_failed', {
            companyId: input.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
          return {
            message: await renderBotSpeechLine({
              companyId: input.companyId,
              line: WHATSAPP_GROUP_EVENT_FAILED,
              speech,
            }),
          }
        }
      }
      const message = await renderBotSpeechLine({
        companyId: input.companyId,
        line: describeWhatsAppDriverEventResult(result, {
          documentNumber,
          kind: 'group',
          returnReason: input.reason,
        }),
        speech,
      })
      return { message, ...routeContinuationOf(result) }
    },
  }
}
