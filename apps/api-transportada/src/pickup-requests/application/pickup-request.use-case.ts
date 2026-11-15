/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PickupRequestAddress,
  PickupRequestKind,
} from '../../database/pickup-request.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import {
  PickupRequestInvalidTransitionError,
  PickupRequestNotFoundError,
  PickupRequestTripNotAvailableError,
  PickupRequestWindowInvalidError,
} from '../domain/pickup-request.error.js'
import {
  canTransitionPickupRequest,
  computePickupRequestExpiry,
  isPickupRequestStale,
  isPickupWindowAcceptable,
  PICKUP_REQUEST_STALE_ALERT_HOURS,
} from '../domain/pickup-request.policy.js'
import type {
  PickupRequestRecord,
  PickupRequestRepositoryPort,
  SuggestedTrip,
} from './pickup-request.port.js'

const LIST_LIMIT = 50
const SUGGESTION_LIMIT = 10

type Clock = () => Date

export type PortalScope = {
  readonly contractorIds: readonly string[]
  readonly taxIds: readonly string[]
}

export type CreatePickupRequestInput = {
  readonly cargoDescription: string
  readonly context: CompanyContext
  readonly correlationId: string
  readonly destination: PickupRequestAddress
  readonly idempotencyKey: string
  readonly kind: PickupRequestKind
  readonly note: string | null
  readonly origin: PickupRequestAddress
  readonly requesterEmail: string | null
  readonly requesterName: string
  readonly requesterPhone: string | null
  readonly volumes: number
  readonly weightKg: string
  readonly windowEnd: string
  readonly windowStart: string
}

/** O pedido da lista do escritório, com a sugestão de encaixe quando já foi aceito. */
export type PickupRequestDetail = {
  readonly record: PickupRequestRecord
  readonly suggestion: PickupRequestSuggestion | null
}

export type PickupRequestSuggestion = {
  /** Sempre oferecida: o despachante pode preferir uma viagem nova. */
  readonly canCreateNewTrip: true
  readonly trips: readonly SuggestedTrip[]
}

type Dependencies = {
  readonly clock?: Clock
  readonly repository: PickupRequestRepositoryPort
  readonly resolveScope: (input: { readonly context: CompanyContext }) => Promise<PortalScope>
}

/** O cliente do portal pede: o servidor resolve o contratante pela sessão, nunca pelo corpo. */
export function createCreatePickupRequestUseCase(dependencies: Dependencies): (
  input: CreatePickupRequestInput,
) => Promise<{
  readonly created: boolean
  readonly record: PickupRequestRecord
}> {
  const now = dependencies.clock ?? (() => new Date())

  return async (input) => {
    const instant = now()
    if (
      !isPickupWindowAcceptable({
        end: input.windowEnd,
        start: input.windowStart,
        today: formatFiscalDay(instant),
      })
    ) {
      throw new PickupRequestWindowInvalidError()
    }

    const scope = await dependencies.resolveScope({ context: input.context })
    const contractorId = scope.contractorIds[0] ?? null
    const requesterTaxId = scope.taxIds[0] ?? ''

    const result = await dependencies.repository.insert({
      cargoDescription: input.cargoDescription,
      companyId: input.context.companyId,
      contractorId,
      destination: input.destination,
      expiresAt: computePickupRequestExpiry(instant),
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      note: input.note,
      origin: input.origin,
      quotedTotalAmount: null,
      quoteValidUntil: null,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      requesterPhone: input.requesterPhone,
      requesterTaxId,
      source: 'portal',
      volumes: input.volumes,
      weightKg: input.weightKg,
      windowEnd: input.windowEnd,
      windowStart: input.windowStart,
    })

    if (result.created) {
      await dependencies.repository.appendAudit({
        action: 'pickup-request.created',
        actorUserId: input.context.userId,
        after: { kind: input.kind, source: 'portal', status: 'requested' },
        before: null,
        companyId: input.context.companyId,
        correlationId: input.correlationId,
        requestId: result.record.id,
      })
    }
    return result
  }
}

export function createListContractorPickupRequestsUseCase(
  dependencies: Dependencies,
): (input: { readonly context: CompanyContext }) => Promise<readonly PickupRequestRecord[]> {
  return async ({ context }) => {
    const scope = await dependencies.resolveScope({ context })
    return dependencies.repository.listForContractor({
      companyId: context.companyId,
      contractorIds: scope.contractorIds,
      limit: LIST_LIMIT,
    })
  }
}

/** Cliente cancela só enquanto `requested`; de outro contratante responde como inexistente. */
export function createCancelPickupRequestUseCase(
  dependencies: Dependencies,
): (input: {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly id: string
}) => Promise<PickupRequestRecord> {
  return async ({ context, correlationId, id }) => {
    const scope = await dependencies.resolveScope({ context })
    const current = await dependencies.repository.find({ companyId: context.companyId, id })
    if (
      current === null ||
      current.contractorId === null ||
      !scope.contractorIds.includes(current.contractorId)
    ) {
      throw new PickupRequestNotFoundError()
    }
    const updated = await dependencies.repository.transition({
      companyId: context.companyId,
      contractorIds: scope.contractorIds,
      from: 'requested',
      id,
      patch: {},
      to: 'canceled',
    })
    if (updated === null) throw new PickupRequestInvalidTransitionError()
    await dependencies.repository.appendAudit({
      action: 'pickup-request.canceled',
      actorUserId: context.userId,
      after: { status: 'canceled' },
      before: { status: current.status },
      companyId: context.companyId,
      correlationId,
      requestId: id,
    })
    return updated
  }
}

export function createListPickupRequestsUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: {
  readonly companyId: string
  readonly status: PickupRequestRecord['status'] | undefined
}) => Promise<readonly PickupRequestRecord[]> {
  return ({ companyId, status }) =>
    dependencies.repository.listForOffice({ companyId, limit: LIST_LIMIT, status })
}

/** O pedido do escritório; aceito, traz a sugestão de encaixe (spec 339 D5). */
export function createGetPickupRequestUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: { readonly companyId: string; readonly id: string }) => Promise<PickupRequestDetail> {
  return async ({ companyId, id }) => {
    const record = await dependencies.repository.find({ companyId, id })
    if (record === null) throw new PickupRequestNotFoundError()
    return {
      record,
      suggestion:
        record.status === 'accepted' ? await suggest(dependencies.repository, companyId) : null,
    }
  }
}

async function suggest(
  repository: PickupRequestRepositoryPort,
  companyId: string,
): Promise<PickupRequestSuggestion> {
  return {
    canCreateNewTrip: true,
    trips: await repository.listOpenTrips({ companyId, limit: SUGGESTION_LIMIT }),
  }
}

export type DecidePickupRequestInput = {
  readonly acceptedTotalAmount: string | null
  readonly acceptedWindowEnd: string | null
  readonly acceptedWindowStart: string | null
  readonly context: CompanyContext
  readonly correlationId: string
  readonly id: string
  readonly note: string | null
}

/** Aceitar grava a decisão e devolve a **sugestão**; a viagem só nasce quando o escritório encaixa. */
export function createAcceptPickupRequestUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: DecidePickupRequestInput) => Promise<PickupRequestDetail> {
  return async (input) => {
    const current = await dependencies.repository.find({
      companyId: input.context.companyId,
      id: input.id,
    })
    if (current === null) throw new PickupRequestNotFoundError()
    if (!canTransitionPickupRequest(current.status, 'accepted'))
      throw new PickupRequestInvalidTransitionError()

    const contractor =
      current.contractorId === null
        ? await dependencies.repository.resolveContractorByTaxId({
            companyId: input.context.companyId,
            displayName: current.requesterName,
            taxId: current.requesterTaxId,
          })
        : null
    const updated = await dependencies.repository.transition({
      companyId: input.context.companyId,
      from: current.status,
      id: input.id,
      patch: {
        ...(contractor === null ? {} : { contractorId: contractor.contractorId }),
        acceptedTotalAmount: input.acceptedTotalAmount,
        acceptedWindowEnd: input.acceptedWindowEnd ?? current.windowEnd,
        acceptedWindowStart: input.acceptedWindowStart ?? current.windowStart,
        decidedByUserId: input.context.userId,
        decisionNote: input.note,
      },
      to: 'accepted',
    })
    if (updated === null) throw new PickupRequestInvalidTransitionError()
    await dependencies.repository.appendAudit({
      action: 'pickup-request.accepted',
      actorUserId: input.context.userId,
      after: {
        acceptedTotalAmount: updated.acceptedTotalAmount,
        contractorCreated: contractor?.created ?? false,
        quotedTotalAmount: updated.quotedTotalAmount,
        status: 'accepted',
      },
      before: { status: current.status },
      companyId: input.context.companyId,
      correlationId: input.correlationId,
      requestId: input.id,
    })
    return {
      record: updated,
      suggestion: await suggest(dependencies.repository, input.context.companyId),
    }
  }
}

export function createRefusePickupRequestUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: DecidePickupRequestInput & { readonly note: string }) => Promise<PickupRequestRecord> {
  return async (input) => {
    const current = await dependencies.repository.find({
      companyId: input.context.companyId,
      id: input.id,
    })
    if (current === null) throw new PickupRequestNotFoundError()
    if (!canTransitionPickupRequest(current.status, 'refused'))
      throw new PickupRequestInvalidTransitionError()

    const updated = await dependencies.repository.transition({
      companyId: input.context.companyId,
      from: current.status,
      id: input.id,
      patch: { decidedByUserId: input.context.userId, decisionNote: input.note },
      to: 'refused',
    })
    if (updated === null) throw new PickupRequestInvalidTransitionError()
    await dependencies.repository.appendAudit({
      action: 'pickup-request.refused',
      actorUserId: input.context.userId,
      after: { status: 'refused' },
      before: { status: current.status },
      companyId: input.context.companyId,
      correlationId: input.correlationId,
      requestId: input.id,
    })
    return updated
  }
}

/**
 * O escritório confirma o encaixe numa viagem aberta. Só `accepted` encaixa, e a viagem tem de ser da
 * empresa e ainda antes do despacho. A parada física entra pela mecânica de parada da viagem (T6b);
 * aqui fica o vínculo e o estado `scheduled`, que é o que o cliente enxerga.
 */
export function createSchedulePickupRequestUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly id: string
  readonly tripId: string
}) => Promise<PickupRequestRecord> {
  return async ({ context, correlationId, id, tripId }) => {
    const current = await dependencies.repository.find({ companyId: context.companyId, id })
    if (current === null) throw new PickupRequestNotFoundError()
    if (!canTransitionPickupRequest(current.status, 'scheduled'))
      throw new PickupRequestInvalidTransitionError()
    if (!(await dependencies.repository.isTripOpen({ companyId: context.companyId, tripId })))
      throw new PickupRequestTripNotAvailableError()

    const updated = await dependencies.repository.transition({
      companyId: context.companyId,
      from: 'accepted',
      id,
      patch: { tripId },
      to: 'scheduled',
    })
    if (updated === null) throw new PickupRequestInvalidTransitionError()
    await dependencies.repository.appendAudit({
      action: 'pickup-request.scheduled',
      actorUserId: context.userId,
      after: { status: 'scheduled', tripId },
      before: { status: current.status },
      companyId: context.companyId,
      correlationId,
      requestId: id,
    })
    return updated
  }
}

/**
 * Rotina do cron (spec 339 D9), idempotente: expira o que passou do prazo e devolve o que precisa de
 * aviso (expirados e parados há mais de 24 h sem alerta). O cron entrega os avisos; aqui só se decide.
 */
export function createSweepPickupRequestsUseCase(
  dependencies: Pick<Dependencies, 'clock' | 'repository'>,
): () => Promise<{
  readonly expired: readonly PickupRequestRecord[]
  readonly stale: readonly PickupRequestRecord[]
}> {
  const clock = dependencies.clock ?? (() => new Date())
  return async () => {
    const now = clock()
    const expired = await dependencies.repository.expireDue({ now })
    const olderThan = new Date(now.getTime() - PICKUP_REQUEST_STALE_ALERT_HOURS * 60 * 60 * 1000)
    const candidates = await dependencies.repository.listStale({ olderThan })
    const stale = candidates.filter((record) =>
      isPickupRequestStale({
        alertedAt: record.staleAlertedAt,
        createdAt: record.createdAt,
        now,
        status: record.status,
      }),
    )
    if (stale.length > 0) {
      await dependencies.repository.markAlerted({ ids: stale.map((record) => record.id), now })
    }
    return { expired, stale }
  }
}
