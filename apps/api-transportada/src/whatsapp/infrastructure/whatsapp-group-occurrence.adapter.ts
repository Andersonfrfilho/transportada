/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import type { TripOccurrence } from '../../trips/application/register-trip-occurrence.use-case.js'
import { listOccurrenceTypesForNote } from '../../trips/infrastructure/occurrence-types-for-note.query.js'
import {
  type DriverFlowActionDependencies,
  isOfferedToDriver,
} from '../../whatsapp-commands/application/register-driver-flow-actions.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type BotSpeechLine,
  type WhatsAppBotSpeechPort,
} from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeWhatsAppDriverEventResult,
  WHATSAPP_GROUP_EVENT_FAILED,
} from '../../whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  refuseWhatsAppDriverEvent,
  registerWhatsAppDriverOccurrence,
  WHATSAPP_DRIVER_EVENT,
  type WhatsAppDriverEventResult,
} from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import type {
  GroupOccurrenceFlowPorts,
  GroupOccurrenceRegistration,
} from '../application/whatsapp-group-occurrence-flow.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Os padrões das falas de recusa do grupo (spec 293 T11: catálogo `group*` das falas do bot). */
export const GROUP_OCCURRENCE_REFUSAL = {
  documentGone: BOT_SPEECH_DEFAULTS.groupDocumentNotReachable,
  failed: BOT_SPEECH_DEFAULTS.groupRegisterFailed,
  noAccess: BOT_SPEECH_DEFAULTS.groupDriverWithoutAccess,
} as const

/**
 * Spec 292 T5: as portas do fluxo do grupo montadas sobre o que o WhatsApp do motorista já usa —
 * as viagens ativas do motorista, a lista de tipos da nota (`isOfferedToDriver`: só tipo ativo) e o
 * mesmo `registerDriverOccurrence`. A ocorrência fica no nome do motorista do grupo (regra 11): o
 * autor é a conta dele, por isso motorista sem acesso ao app não registra pelo grupo.
 */
export function createGroupOccurrencePorts(dependencies: {
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly registerOccurrence: (
    input: Parameters<DriverFlowActionDependencies['registerOccurrence']>[0],
  ) => Promise<TripOccurrence>
  /** Spec 293 T11: as falas editáveis do grafo; sem isto, o padrão do código. */
  readonly speech?: WhatsAppBotSpeechPort
}): GroupOccurrenceFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const speech = dependencies.speech ?? CATALOG_BOT_SPEECH

  async function refusedWith(
    companyId: string,
    line: BotSpeechLine,
    retry: 'note' | 'type' | null,
  ): Promise<GroupOccurrenceRegistration> {
    return {
      kind: 'refused',
      message: await renderBotSpeechLine({ companyId, line, speech }),
      retry,
    }
  }

  return {
    async listDriverDocuments({ companyId, driverId }) {
      const trips = await dependencies.listActiveTrips({ companyId, driverId })
      const seen = new Map<string, { id: string; number: string }>()
      for (const trip of trips) {
        if (terminal.has(trip.status)) continue
        for (const stop of trip.stops) {
          for (const document of stop.documents) {
            if (!seen.has(document.id))
              seen.set(document.id, { id: document.id, number: document.number })
          }
        }
      }
      return [...seen.values()]
    },

    async listOccurrenceTypes({ companyId, documentId }) {
      const types = await listOccurrenceTypesForNote(dependencies.database, {
        companyId,
        documentId,
      })
      return types.filter(isOfferedToDriver).map((type) => ({ id: type.id, name: type.name }))
    },

    /**
     * Spec 293 T11: pela camada comum dos eventos (a mesma do WhatsApp individual). A ocorrência fica
     * no nome do motorista do grupo: sem conta ativa, recusa com a frase do grupo.
     */
    async register(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      let result: WhatsAppDriverEventResult
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(WHATSAPP_DRIVER_EVENT.occurrence, {
          code: 'driver_without_access',
        })
      } else {
        try {
          result = await registerWhatsAppDriverOccurrence(dependencies, {
            actorUserId,
            companyId: input.companyId,
            documentId: input.documentId,
            driverId: input.driverId,
            idempotencyKey: input.idempotencyKey,
            location: null,
            note: input.note,
            occurrenceTypeId: input.occurrenceTypeId,
          })
        } catch (error) {
          dependencies.logger?.warn('whatsapp_group_request.register_failed', {
            companyId: input.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
          return refusedWith(input.companyId, WHATSAPP_GROUP_EVENT_FAILED, null)
        }
      }
      if (result.kind !== 'refused') return { kind: 'registered' }
      const { refusal } = result
      const retry =
        refusal.code !== 'occurrence_requirement'
          ? null
          : refusal.field === 'note'
            ? 'note'
            : refusal.field === 'contractor_scope'
              ? 'type'
              : null
      return refusedWith(
        input.companyId,
        describeWhatsAppDriverEventResult(result, { kind: 'group' }),
        retry,
      )
    },
  }
}

/** A conta do motorista nesta empresa (vínculo ativo da ficha), ou `null`. */
export async function findDriverUserId(
  database: Database,
  input: { readonly companyId: string; readonly driverId: string },
): Promise<null | string> {
  const [row] = await database
    .select({ userId: userCompanyMemberships.userId })
    .from(fleetDrivers)
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
      ),
    )
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        eq(fleetDrivers.id, input.driverId),
        eq(userCompanyMemberships.status, 'active'),
      ),
    )
    .limit(1)
  return row?.userId ?? null
}
