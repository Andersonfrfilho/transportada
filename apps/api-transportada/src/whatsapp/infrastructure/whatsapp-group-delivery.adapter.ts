/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { fleetDrivers } from '../../database/database.schema.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type WhatsAppBotSpeechPort,
} from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type { WhatsAppDeliveryPreparations } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type {
  GroupDeliveryDocument,
  GroupDeliveryFlowPorts,
} from '../application/whatsapp-group-delivery-flow.service.js'
import type { ResolveWhatsAppSenderRole } from '../application/whatsapp-sender-role.service.js'
import type { GroupProofIntakePorts } from '../application/whatsapp-group-proof-intake.service.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'
import { sameBrazilianPhone } from './whatsapp-group-sender.adapter.js'
import { downloadEvolutionMedia } from './evolution-media-download.gateway.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** O que o grupo precisa para a entrega em preparo, montado uma vez em `main.ts`. */
export type GroupDeliveryWiring = {
  readonly flow: GroupDeliveryFlowPorts
  /** O que a foto/localização do grupo precisa; a resposta e o pedido saem da sessão do webhook. */
  readonly intake: Omit<GroupProofIntakePorts, 'openAnswerRequest' | 'replies'>
  readonly isGroupDriver: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly sender: string
  }) => Promise<boolean>
}

/**
 * Spec 293 T15: as portas da entrega em preparo no grupo do motorista — as notas abertas das viagens
 * ativas, a conta do motorista (o evento fica no nome dele), o ponto compartilhado no grupo e o download
 * da foto pelo Evolution da empresa.
 */
export function createGroupDeliveryWiring(dependencies: {
  readonly consumeLocation: GroupDeliveryFlowPorts['consumeLocation']
  readonly database: Database
  /** Spec 294 RF18: quem mandou — tripulação, atendente ou ninguém. */
  readonly resolveSenderRole: ResolveWhatsAppSenderRole
  /** Spec 294 RF21: a baixa do atendente pelo escritório (lote, sem prova). */
  readonly deliverAsAttendant: GroupDeliveryFlowPorts['deliverAsAttendant']
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly preparations: WhatsAppDeliveryPreparations
  readonly rememberLocation: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly location: ReportedLocation
  }) => void
  readonly speech?: WhatsAppBotSpeechPort
}): GroupDeliveryWiring {
  const { database } = dependencies
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const speech = dependencies.speech ?? CATALOG_BOT_SPEECH
  const findActorUserId = (input: { readonly companyId: string; readonly driverId: string }) =>
    findDriverUserId(database, input)
  const withoutAccessText = (companyId: string) =>
    renderBotSpeechLine({ companyId, line: { key: 'groupDriverWithoutAccess' }, speech })

  return {
    flow: {
      consumeLocation: dependencies.consumeLocation,
      ...(dependencies.deliverAsAttendant === undefined
        ? {}
        : { deliverAsAttendant: dependencies.deliverAsAttendant }),
      findActorUserId,
      async listOpenDocuments({ companyId, driverId }) {
        const trips = await dependencies.listActiveTrips({ companyId, driverId })
        const seen = new Map<string, GroupDeliveryDocument>()
        for (const trip of trips) {
          if (terminal.has(trip.status)) continue
          for (const stop of trip.stops) {
            for (const document of stop.documents) {
              const open =
                document.separationStatus !== 'delivered' &&
                document.separationStatus !== 'returned'
              if (open && !seen.has(document.id)) {
                seen.set(document.id, {
                  id: document.id,
                  number: document.number,
                  recipientName: document.recipientDisplayName,
                })
              }
            }
          }
        }
        return [...seen.values()]
      },
      preparations: dependencies.preparations,
      resolveSenderRole: dependencies.resolveSenderRole,
      withoutAccessText,
    },
    intake: {
      // O Evolution avisa antes de gravar a mensagem: a foto pedida na hora pode não existir ainda.
      downloadMedia: ({ connection, providerMessageId }) =>
        downloadEvolutionMedia({ connection, providerMessageId }),
      findActorUserId,
      ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
      preparations: dependencies.preparations,
      rememberLocation: dependencies.rememberLocation,
      resolveSenderRole: dependencies.resolveSenderRole,
      withoutAccessText,
    },
    async isGroupDriver({ companyId, driverId, sender }) {
      const [row] = await database
        .select({ phone: fleetDrivers.phone })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.id, driverId)))
        .limit(1)
      if (row !== undefined && sameBrazilianPhone(row.phone, sender)) return true
      // Spec 294 RF18: a mídia do atendente também é prova (baixa pelo escritório).
      return (
        (await dependencies.resolveSenderRole({ companyId, phone: sender })).kind === 'attendant'
      )
    },
  }
}

export { sameBrazilianPhone }
