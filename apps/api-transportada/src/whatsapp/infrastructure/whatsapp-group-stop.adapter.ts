/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type BotSpeechLine,
  type WhatsAppBotSpeechPort,
} from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeWhatsAppDriverEventRefusal,
  describeWhatsAppDriverEventResult,
  WHATSAPP_GROUP_EVENT_FAILED,
} from '../../whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  arriveWhatsAppDriverStop,
  departWhatsAppDriverStop,
  refuseWhatsAppDriverEvent,
  WHATSAPP_DRIVER_EVENT,
  type WhatsAppDriverEventPorts,
  type WhatsAppDriverEventResult,
} from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import { WHATSAPP_DRIVER_STOP_COMMAND } from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { GroupStopFlowPorts } from '../application/whatsapp-group-stop-flow.service.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 293 T12: as portas do "saí"/"cheguei" no grupo, sobre a camada comum dos eventos. O evento fica
 * no nome do motorista do grupo (sem conta ativa no app, recusa com a frase do grupo). A hora do toque
 * é a da chegada da mensagem ao servidor; a localização vai `null` (grava `unavailable`).
 */
export function createGroupStopPorts(dependencies: {
  readonly clock?: () => Date
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly ports: Pick<WhatsAppDriverEventPorts, 'reportArrival' | 'reportDeparture'>
  readonly speech?: WhatsAppBotSpeechPort
}): GroupStopFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const speech = dependencies.speech ?? CATALOG_BOT_SPEECH
  const clock = dependencies.clock ?? (() => new Date())
  const say = (companyId: string, line: BotSpeechLine) =>
    renderBotSpeechLine({ companyId, line, speech })

  return {
    enRouteMessage: ({ companyId, sequence }) =>
      say(
        companyId,
        describeWhatsAppDriverEventRefusal(
          { code: 'stop_en_route', enRouteStopSequence: sequence },
          { kind: 'group' },
        ),
      ),

    async listStops({ companyId, driverId }) {
      const trips = await dependencies.listActiveTrips({ companyId, driverId })
      return trips.filter((trip) => !terminal.has(trip.status)).flatMap((trip) => trip.stops)
    },

    async record(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      let result: WhatsAppDriverEventResult
      const event =
        input.event === WHATSAPP_DRIVER_STOP_COMMAND.depart
          ? WHATSAPP_DRIVER_EVENT.depart
          : WHATSAPP_DRIVER_EVENT.arrive
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(event, { code: 'driver_without_access' })
      } else {
        const eventInput = {
          actorUserId,
          companyId: input.companyId,
          driverId: input.driverId,
          idempotencyKey: input.idempotencyKey,
          location: null,
          sentAt: clock(),
          stopId: input.stopId,
        }
        try {
          result =
            event === WHATSAPP_DRIVER_EVENT.depart
              ? await departWhatsAppDriverStop(dependencies.ports, eventInput)
              : await arriveWhatsAppDriverStop(dependencies.ports, eventInput)
        } catch (error) {
          dependencies.logger?.warn('whatsapp_group_request.stop_register_failed', {
            companyId: input.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
          return { message: await say(input.companyId, WHATSAPP_GROUP_EVENT_FAILED) }
        }
      }
      return {
        message: await say(
          input.companyId,
          describeWhatsAppDriverEventResult(result, { kind: 'group' }),
        ),
      }
    },
  }
}
