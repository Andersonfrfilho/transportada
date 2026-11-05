/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
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
import {
  describeOutOfOrderViolation,
  toOrderStopLabel,
} from '../../whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import { WHATSAPP_DRIVER_STOP_COMMAND } from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { GroupStopFlowPorts } from '../application/whatsapp-group-stop-flow.service.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Spec 293 T15: a oferta da localização (pendente da T12), dita quando o evento sai sem ela. */
export const GROUP_STOP_LOCATION_HINT =
  'Dica: compartilhe a localização aqui no grupo antes do próximo "saí", "cheguei" ou "entreguei" e ela entra no registro.'

/**
 * Spec 293 T12: as portas do "saí"/"cheguei" no grupo, sobre a camada comum dos eventos. O evento fica
 * no nome do motorista do grupo (sem conta ativa no app, recusa com a frase do grupo). A hora do toque
 * é a da chegada da mensagem ao servidor.
 *
 * Spec 293 T15: a localização que o motorista compartilhou no grupo há pouco entra no evento; sem ela
 * grava `unavailable` (nunca segura o evento) e o bot oferece a localização para a próxima vez.
 */
export function createGroupStopPorts(dependencies: {
  readonly clock?: () => Date
  /** O ponto compartilhado no grupo, consumido por um evento só; ausente, sempre `null`. */
  readonly consumeLocation?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => null | ReportedLocation
  readonly database: Database
  /** Spec 294 RF24: há ponto compartilhado recente? Ausente, o bot não pede a localização. */
  readonly hasLocation?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => boolean
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

  const listOpenStops = async ({
    companyId,
    driverId,
  }: {
    readonly companyId: string
    readonly driverId: string
  }) => {
    const trips = await dependencies.listActiveTrips({ companyId, driverId })
    return trips.filter((trip) => !terminal.has(trip.status)).flatMap((trip) => trip.stops)
  }

  return {
    ...(dependencies.hasLocation === undefined ? {} : { hasLocation: dependencies.hasLocation }),
    enRouteMessage: ({ companyId, sequence }) =>
      say(
        companyId,
        describeWhatsAppDriverEventRefusal(
          { code: 'stop_en_route', enRouteStopSequence: sequence },
          { kind: 'group' },
        ),
      ),

    listStops: (input) => listOpenStops(input),

    async record(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      let result: WhatsAppDriverEventResult
      const event =
        input.event === WHATSAPP_DRIVER_STOP_COMMAND.depart
          ? WHATSAPP_DRIVER_EVENT.depart
          : WHATSAPP_DRIVER_EVENT.arrive
      let location: null | ReportedLocation = null
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(event, { code: 'driver_without_access' })
      } else {
        location = dependencies.consumeLocation?.(input) ?? null
        const eventInput = {
          actorUserId,
          ...(input.confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}),
          companyId: input.companyId,
          driverId: input.driverId,
          idempotencyKey: input.idempotencyKey,
          location,
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
      if (result.kind === 'refused' && result.refusal.code === 'stop_out_of_order') {
        const stops = await listOpenStops(input)
        return {
          message: describeOutOfOrderViolation({
            event: input.event === WHATSAPP_DRIVER_STOP_COMMAND.depart ? 'depart' : 'arrive',
            labels: new Map(stops.map((stop) => [stop.id, toOrderStopLabel(stop)] as const)),
            violation: result.refusal,
          }),
          outOfOrder: {
            ...(result.refusal.nextStopId === null
              ? {}
              : { nextStopId: result.refusal.nextStopId }),
            stopId: result.refusal.requestedStopId,
          },
        }
      }
      const message = await say(
        input.companyId,
        describeWhatsAppDriverEventResult(result, {
          ...(input.documentNumber === undefined ? {} : { documentNumber: input.documentNumber }),
          kind: 'group',
        }),
      )
      const offerLocation =
        dependencies.consumeLocation !== undefined &&
        result.kind === 'registered' &&
        location === null
      return { message: offerLocation ? `${message}\n${GROUP_STOP_LOCATION_HINT}` : message }
    },
  }
}
