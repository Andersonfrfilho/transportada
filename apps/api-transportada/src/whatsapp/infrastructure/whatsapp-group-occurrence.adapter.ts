/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import type { TripOccurrence } from '../../trips/application/register-trip-occurrence.use-case.js'
import {
  TripDocumentNotReachableError,
  TripStateTransitionNotAllowedError,
} from '../../trips/domain/trip.error.js'
import { listOccurrenceTypesForNote } from '../../trips/infrastructure/occurrence-types-for-note.query.js'
import { describeOccurrenceRequirementRefusal } from '../../whatsapp-commands/application/driver-occurrence-refusal.service.js'
import {
  type DriverFlowActionDependencies,
  isOfferedToDriver,
} from '../../whatsapp-commands/application/register-driver-flow-actions.js'
import {
  DRIVER_FLOW_NODE,
  DRIVER_TRANSITION_BLOCK_MESSAGES,
} from '../../whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import type { GroupOccurrenceFlowPorts } from '../application/whatsapp-group-occurrence-flow.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export const GROUP_OCCURRENCE_REFUSAL = {
  documentGone: 'Essa nota não está mais disponível na viagem do motorista.',
  failed: 'Não consegui registrar agora. Tente de novo em instantes ou registre pelo aplicativo.',
  noAccess:
    'O motorista deste grupo ainda não tem acesso ao aplicativo, e a ocorrência precisa ficar no nome dele. Cadastre o acesso ou registre pelo painel.',
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
}): GroupOccurrenceFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)

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

    async register(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      if (actorUserId === null) {
        return { kind: 'refused', message: GROUP_OCCURRENCE_REFUSAL.noAccess, retry: null }
      }
      try {
        await dependencies.registerOccurrence({
          actorUserId,
          companyId: input.companyId,
          documentId: input.documentId,
          driverId: input.driverId,
          idempotencyKey: input.idempotencyKey,
          location: null,
          note: input.note,
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: '',
        })
        return { kind: 'registered' }
      } catch (error) {
        const refusal = describeOccurrenceRequirementRefusal(error)
        if (refusal !== undefined) {
          return {
            kind: 'refused',
            message: refusal.message,
            retry:
              refusal.next === DRIVER_FLOW_NODE.notePrompt
                ? 'note'
                : refusal.next === DRIVER_FLOW_NODE.listOccurrenceTypes
                  ? 'type'
                  : null,
          }
        }
        if (error instanceof TripStateTransitionNotAllowedError) {
          return {
            kind: 'refused',
            message: DRIVER_TRANSITION_BLOCK_MESSAGES[error.reason],
            retry: null,
          }
        }
        if (error instanceof TripDocumentNotReachableError) {
          return { kind: 'refused', message: GROUP_OCCURRENCE_REFUSAL.documentGone, retry: null }
        }
        dependencies.logger?.warn('whatsapp_group_request.register_failed', {
          companyId: input.companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return { kind: 'refused', message: GROUP_OCCURRENCE_REFUSAL.failed, retry: null }
      }
    },
  }
}

/** A conta do motorista nesta empresa (vínculo ativo da ficha), ou `null`. */
async function findDriverUserId(
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
