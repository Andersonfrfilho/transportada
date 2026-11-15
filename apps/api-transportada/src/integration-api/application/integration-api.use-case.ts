/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PickupRequestAddress,
  PickupRequestKind,
} from '../../database/pickup-request.schema.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import {
  PickupRequestInvalidTransitionError,
  PickupRequestNotFoundError,
  PickupRequestWindowInvalidError,
} from '../../pickup-requests/domain/pickup-request.error.js'
import {
  computePickupRequestExpiry,
  isPickupWindowAcceptable,
} from '../../pickup-requests/domain/pickup-request.policy.js'
import type {
  PickupRequestRecord,
  PickupRequestRepositoryPort,
} from '../../pickup-requests/application/pickup-request.port.js'
import type { IntegrationCaller } from './integration-key.use-case.js'

/** Validade da cotação que o parceiro recebe (mesma da pública, spec 338). */
export const INTEGRATION_QUOTE_VALIDITY_DAYS = 7

type Clock = () => Date

export function computeQuoteValidUntil(now: Date): string {
  const limit = new Date(now.getTime())
  limit.setUTCDate(limit.getUTCDate() + INTEGRATION_QUOTE_VALIDITY_DAYS)
  return formatFiscalDay(limit)
}

export type IntegrationPickupInput = {
  readonly caller: IntegrationCaller
  readonly cargoDescription: string
  readonly correlationId: string
  readonly destination: PickupRequestAddress
  readonly idempotencyKey: string
  readonly kind: PickupRequestKind
  readonly note: string | null
  readonly origin: PickupRequestAddress
  readonly quote: { readonly total: string; readonly validUntil: string } | null
  readonly requesterEmail: string | null
  readonly requesterName: string
  readonly requesterPhone: string | null
  readonly requesterTaxId: string
  readonly volumes: number
  readonly weightKg: string
  readonly windowEnd: string
  readonly windowStart: string
}

type Dependencies = {
  readonly clock?: Clock
  readonly repository: PickupRequestRepositoryPort
}

/**
 * Spec 340: o parceiro pede pela chave. É o mesmo pedido da 339, na mesma fila, mas anônimo: o cliente só entra no
 * cadastro quando o escritório aceita (D4), e o pedido guarda a chave que o fez — só ela o lê e o cancela.
 */
export function createCreateIntegrationPickupUseCase(
  dependencies: Dependencies,
): (
  input: IntegrationPickupInput,
) => Promise<{ readonly created: boolean; readonly record: PickupRequestRecord }> {
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
    const result = await dependencies.repository.insert({
      cargoDescription: input.cargoDescription,
      companyId: input.caller.companyId,
      contractorId: null,
      destination: input.destination,
      expiresAt: computePickupRequestExpiry(instant),
      idempotencyKey: input.idempotencyKey,
      integrationKeyId: input.caller.keyId,
      kind: input.kind,
      note: input.note,
      origin: input.origin,
      quotedTotalAmount: input.quote?.total ?? null,
      quoteValidUntil: input.quote?.validUntil ?? null,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      requesterPhone: input.requesterPhone,
      requesterTaxId: input.requesterTaxId,
      source: 'integration',
      volumes: input.volumes,
      weightKg: input.weightKg,
      windowEnd: input.windowEnd,
      windowStart: input.windowStart,
    })
    if (result.created) {
      await dependencies.repository.appendAudit({
        action: 'pickup-request.created',
        actorUserId: input.caller.createdByUserId,
        after: {
          integrationKeyId: input.caller.keyId,
          kind: input.kind,
          source: 'integration',
          status: 'requested',
        },
        before: null,
        companyId: input.caller.companyId,
        correlationId: input.correlationId,
        requestId: result.record.id,
      })
    }
    return result
  }
}

/** Pedido de outra chave (ou de outra porta) responde como inexistente. */
export function createGetIntegrationPickupUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: {
  readonly caller: IntegrationCaller
  readonly id: string
}) => Promise<PickupRequestRecord> {
  return async ({ caller, id }) => {
    const record = await dependencies.repository.find({ companyId: caller.companyId, id })
    if (record === null || record.integrationKeyId !== caller.keyId) {
      throw new PickupRequestNotFoundError()
    }
    return record
  }
}

export function createCancelIntegrationPickupUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: {
  readonly caller: IntegrationCaller
  readonly correlationId: string
  readonly id: string
}) => Promise<PickupRequestRecord> {
  return async ({ caller, correlationId, id }) => {
    const current = await dependencies.repository.find({ companyId: caller.companyId, id })
    if (current === null || current.integrationKeyId !== caller.keyId) {
      throw new PickupRequestNotFoundError()
    }
    const updated = await dependencies.repository.transition({
      companyId: caller.companyId,
      from: 'requested',
      id,
      integrationKeyId: caller.keyId,
      patch: {},
      to: 'canceled',
    })
    if (updated === null) throw new PickupRequestInvalidTransitionError()
    await dependencies.repository.appendAudit({
      action: 'pickup-request.canceled',
      actorUserId: caller.createdByUserId,
      after: { integrationKeyId: caller.keyId, status: 'canceled' },
      before: { status: current.status },
      companyId: caller.companyId,
      correlationId,
      requestId: id,
    })
    return updated
  }
}
