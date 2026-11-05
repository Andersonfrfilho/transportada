/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: as portas do "encerrar a rota" do atendente no grupo. Quem encerra é a função do painel
 * (`POST /trips/:id/close`), com o contexto do atendente resolvido de novo pelo telefone — a permissão é
 * a mesma da rota (`trip.report-on-behalf`) e a trilha de auditoria sai com o canal WhatsApp.
 */
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import type { CloseTripInput } from '../../trips/application/trip.use-case.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from '../../whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import type { GroupTripCloseFlowPorts } from '../application/whatsapp-group-trip-close-flow.service.js'
import type { ResolveWhatsAppSenderRole } from '../application/whatsapp-sender-role.service.js'

/** Preenchida onde a função do painel nasce; antes disso, o encerramento responde que não está disponível. */
export type WhatsAppTripCloseBridge = {
  close?: (input: CloseTripInput) => Promise<unknown>
}

const CLOSE_REASON = 'Encerrada pelo atendente pelo WhatsApp.'
const CLOSE_AUDIT_ORIGIN = 'whatsapp'
const CLOSE_FAILED = 'Não consegui encerrar a rota agora. Confira a viagem no painel.'

const SETTLED_STATUSES = new Set(['delivered', 'returned'])

export function createWhatsAppGroupTripClosePorts(dependencies: {
  readonly bridge: WhatsAppTripCloseBridge
  readonly clock?: () => Date
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: Pick<ApiLogger, 'warn'>
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
  readonly resolveSenderRole: ResolveWhatsAppSenderRole
}): GroupTripCloseFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const clock = dependencies.clock ?? (() => new Date())

  return {
    async close({ companyId, phone, tripId }) {
      const resolved = await dependencies.resolveActor({
        companyId,
        fromPhone: phone,
        now: clock(),
      })
      const close = dependencies.bridge.close
      if (resolved.status === 'denied' || close === undefined) {
        return { kind: 'refused', message: CLOSE_FAILED }
      }
      try {
        await close({
          context: resolved.context.scope,
          correlationId: crypto.randomUUID(),
          ipAddress: CLOSE_AUDIT_ORIGIN,
          reason: CLOSE_REASON,
          tripId,
        })
        return { kind: 'closed' }
      } catch (error) {
        dependencies.logger?.warn('whatsapp_group_request.trip_close_failed', {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return { kind: 'refused', message: CLOSE_FAILED }
      }
    },

    async findActiveTrip({ companyId, driverId }) {
      const trips = (await dependencies.listActiveTrips({ companyId, driverId })).filter(
        (trip) => !terminal.has(trip.status),
      )
      const [only] = trips
      if (only === undefined) return { kind: 'none' }
      if (trips.length > 1) return { kind: 'many' }
      const openDocumentCount = only.stops
        .flatMap((stop) => stop.documents)
        .filter((document) => !SETTLED_STATUSES.has(document.separationStatus)).length
      return { kind: 'one', openDocumentCount, tripId: only.id }
    },

    resolveSenderRole: dependencies.resolveSenderRole,
  }
}
