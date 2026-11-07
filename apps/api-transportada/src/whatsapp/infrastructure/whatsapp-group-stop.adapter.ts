/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import { placeStops } from '../../whatsapp-commands/infrastructure/whatsapp-stop-place.reader.js'
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
import {
  describeArrivalDetails,
  describeDepartureDetails,
} from '../../whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import type { WhatsAppStopCardReader } from '../../whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'

export type OfficeStopEventInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly driverId: string
  readonly idempotencyKey: string
  readonly stopId: string
  readonly tappedAt: Date
  readonly tripId: string
}

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
  /**
   * Spec 294 RF19: "saí"/"cheguei" do atendente pelo caminho do escritório (alvo da viagem, autoria `office`, ator = o
   * atendente, em nome do motorista da viagem). Ausente, o atendente cai no caminho da tripulação.
   */
  readonly officeStopEvents?: {
    readonly arrive: (input: OfficeStopEventInput) => Promise<unknown>
    readonly depart: (input: OfficeStopEventInput) => Promise<{ readonly changed: boolean }>
  }
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly ports: Pick<WhatsAppDriverEventPorts, 'reportArrival' | 'reportDeparture'>
  readonly resolveSenderRole?: GroupStopFlowPorts['resolveSenderRole']
  readonly speech?: WhatsAppBotSpeechPort
  /** O bloco da parada nas respostas (saída, chegada, menus); ausente, a resposta é só a frase do registro. */
  readonly stopCards?: WhatsAppStopCardReader
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
    const stops = trips.filter((trip) => !terminal.has(trip.status)).flatMap((trip) => trip.stops)
    return placeStops(dependencies.database, {
      companyId,
      ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
      stops,
    })
  }

  const findTripIdOfStop = async (input: {
    readonly companyId: string
    readonly driverId: string
    readonly stopId: string
  }) => {
    const trips = await dependencies.listActiveTrips(input)
    return trips.find((trip) => trip.stops.some((stop) => stop.id === input.stopId))?.id
  }

  /** O bloco é melhor esforço: o evento já foi gravado, a resposta e o fechamento do pedido nunca falham por ele. */
  async function safeReadStopCard(
    input: Parameters<WhatsAppStopCardReader['read']>[0],
  ): Promise<Awaited<ReturnType<WhatsAppStopCardReader['read']>>> {
    try {
      return (await dependencies.stopCards?.read(input)) ?? null
    } catch (error) {
      dependencies.logger?.warn('whatsapp_group_request.stop_card_failed', {
        companyId: input.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return null
    }
  }

  return {
    ...(dependencies.resolveSenderRole === undefined
      ? {}
      : { resolveSenderRole: dependencies.resolveSenderRole }),
    ...(dependencies.hasLocation === undefined ? {} : { hasLocation: dependencies.hasLocation }),
    ...(dependencies.stopCards === undefined
      ? {}
      : { readStopCard: (input) => safeReadStopCard(input) }),
    clock,
    ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
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
      const attendantTripId =
        input.attendant === undefined || dependencies.officeStopEvents === undefined
          ? undefined
          : await findTripIdOfStop(input)
      const office = dependencies.officeStopEvents
      const attendant = input.attendant
      const isOffice =
        attendantTripId !== undefined && office !== undefined && attendant !== undefined
      const actorUserId = isOffice
        ? attendant.actorUserId
        : await findDriverUserId(dependencies.database, input)
      let result: WhatsAppDriverEventResult
      const event =
        input.event === WHATSAPP_DRIVER_STOP_COMMAND.depart
          ? WHATSAPP_DRIVER_EVENT.depart
          : WHATSAPP_DRIVER_EVENT.arrive
      let location: null | ReportedLocation = null
      const eventPorts = isOffice
        ? {
            reportArrival: (event: Parameters<typeof dependencies.ports.reportArrival>[0]) =>
              office.arrive({ ...event, tripId: attendantTripId }),
            reportDeparture: (event: Parameters<typeof dependencies.ports.reportDeparture>[0]) =>
              office.depart({ ...event, tripId: attendantTripId }),
          }
        : dependencies.ports
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(event, { code: 'driver_without_access' })
      } else {
        location = isOffice
          ? null
          : (dependencies.consumeLocation?.(input) ?? answeredLocation(input.location, clock()))
        const eventInput = {
          actorUserId,
          ...(input.confirmOutOfOrder === true && !isOffice ? { confirmOutOfOrder: true } : {}),
          companyId: input.companyId,
          driverId: input.driverId,
          idempotencyKey: input.idempotencyKey,
          location,
          sentAt: input.sentAt ?? clock(),
          stopId: input.stopId,
        }
        try {
          result =
            event === WHATSAPP_DRIVER_EVENT.depart
              ? await departWhatsAppDriverStop(eventPorts, eventInput)
              : await arriveWhatsAppDriverStop(eventPorts, eventInput)
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
      if (result.kind === 'registered' && dependencies.stopCards !== undefined) {
        const isDeparture = result.event === WHATSAPP_DRIVER_EVENT.depart
        const view = await safeReadStopCard({
          companyId: input.companyId,
          driverId: input.driverId,
          stopId: input.stopId,
          withEta: isDeparture,
        })
        if (view !== null) {
          const details = isDeparture
            ? describeDepartureDetails(view, clock())
            : describeArrivalDetails(view)
          return { message: [message, ...details].join('\n') }
        }
      }
      const offerLocation =
        dependencies.consumeLocation !== undefined &&
        result.kind === 'registered' &&
        location === null
      return { message: offerLocation ? `${message}\n${GROUP_STOP_LOCATION_HINT}` : message }
    },
  }
}

/** O ponto que respondeu ao pedido de localização, no formato das rotas do app (sem precisão: o WhatsApp não diz). */
function answeredLocation(
  point: { readonly latitude: number; readonly longitude: number } | undefined,
  now: Date,
): null | ReportedLocation {
  if (
    point === undefined ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude)
  ) {
    return null
  }
  return {
    accuracyMeters: null,
    capturedAt: now.toISOString(),
    latitude: point.latitude.toFixed(7),
    longitude: point.longitude.toFixed(7),
  }
}
