/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { addressCorrectionSuggestions } from '../../database/address-correction-suggestion.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { applyGeocodedAddressCorrection } from '../../routing/infrastructure/drizzle-geocoded-address-correction.repository.js'
import type {
  AddressCorrectionSuggestionDecisionPort,
  DecideAddressCorrectionSuggestionParams,
  DecidedAddressCorrectionSuggestion,
} from '../application/address-correction-suggestion.port.js'
import {
  AddressCorrectionSuggestionAlreadyDecidedError,
  AddressCorrectionSuggestionNotFoundError,
} from '../domain/address-correction-suggestion.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Decision = 'applied' | 'dismissed'

/** A mesma permissão do `PATCH /geocoded-addresses/:addressKey` que a decisão de aplicar executa. */
const DECISION_PERMISSION = 'trip.manage'

async function lockPendingSuggestion(
  transaction: Transaction,
  params: DecideAddressCorrectionSuggestionParams,
) {
  const [suggestion] = await transaction
    .select({
      addressKey: addressCorrectionSuggestions.addressKey,
      latitude: addressCorrectionSuggestions.latitude,
      longitude: addressCorrectionSuggestions.longitude,
      status: addressCorrectionSuggestions.status,
      tripStopId: addressCorrectionSuggestions.tripStopId,
    })
    .from(addressCorrectionSuggestions)
    .where(
      and(
        eq(addressCorrectionSuggestions.id, params.suggestionId),
        eq(addressCorrectionSuggestions.companyId, params.companyId),
      ),
    )
    .for('update')
  if (suggestion === undefined) throw new AddressCorrectionSuggestionNotFoundError()
  if (suggestion.status !== 'pending') throw new AddressCorrectionSuggestionAlreadyDecidedError()
  return suggestion
}

async function recordDecision(
  transaction: Transaction,
  input: {
    readonly decision: Decision
    readonly params: DecideAddressCorrectionSuggestionParams
    readonly tripStopId: string | null
  },
): Promise<void> {
  const { decision, params, tripStopId } = input
  const now = new Date()
  await transaction
    .update(addressCorrectionSuggestions)
    .set({ decidedAt: now, decidedByUserId: params.actorUserId, status: decision, updatedAt: now })
    .where(
      and(
        eq(addressCorrectionSuggestions.id, params.suggestionId),
        eq(addressCorrectionSuggestions.companyId, params.companyId),
      ),
    )
  await transaction.insert(auditLogs).values({
    action: `address_correction_suggestion.${decision}`,
    actorUserId: params.actorUserId,
    afterSnapshot: { status: decision },
    beforeSnapshot: { status: 'pending' },
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.suggestionId,
    entityType: 'address_correction_suggestion',
    metadata: { tripStopId },
    permission: DECISION_PERMISSION,
    targetId: params.suggestionId,
    targetType: 'address_correction_suggestion',
  })
}

export function createDrizzleAddressCorrectionSuggestionDecisions(
  database: Database,
): AddressCorrectionSuggestionDecisionPort {
  function decide(
    decision: Decision,
    params: DecideAddressCorrectionSuggestionParams,
  ): Promise<DecidedAddressCorrectionSuggestion> {
    return database.transaction(async (transaction) => {
      const suggestion = await lockPendingSuggestion(transaction, params)
      if (decision === 'applied') {
        await applyGeocodedAddressCorrection(transaction, {
          actorUserId: params.actorUserId,
          addressKey: suggestion.addressKey,
          companyId: params.companyId,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
          origin: 'operator',
          source: 'manual',
        })
      }
      await recordDecision(transaction, { decision, params, tripStopId: suggestion.tripStopId })
      return { id: params.suggestionId, status: decision }
    })
  }

  return {
    apply: (params) => decide('applied', params),
    dismiss: (params) => decide('dismissed', params),
  }
}
