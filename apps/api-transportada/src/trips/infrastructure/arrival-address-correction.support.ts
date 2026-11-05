/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF14-RF16 (ADR-0113 §2): o ponto da chegada da tripulação corrige o cadastro do endereço,
 * vira sugestão ao escritório ou nada. A trilha em `geocoded_address_corrections` já é o evento da
 * linha do tempo da parada (228). Roda num savepoint: uma falha aqui nunca derruba a chegada.
 */
import { and, eq, sql } from 'drizzle-orm'

import { applyGeocodedAddressCorrection } from '../../routing/infrastructure/drizzle-geocoded-address-correction.repository.js'
import type { GeocodedAddressCorrectionTransaction } from '../../routing/infrastructure/drizzle-geocoded-address-correction.repository.js'
import { addressCorrectionSuggestions } from '../../database/address-correction-suggestion.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { ARRIVAL_CORRECTION_WRITTEN_PRECISION } from '../domain/address-arrival-correction.constant.js'
import { resolveAddressArrivalCorrection } from '../domain/address-arrival-correction.policy.js'
import type {
  ArrivalAddressCorrectionOutcome,
  ReportedLocation,
} from '../application/driver-field-report.port.js'

type ArrivalAddressCorrectionParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly eventId: string
  readonly isLate: boolean
  readonly location: ReportedLocation
  readonly stopId: string
}

type Outcome = 'applied' | 'ignored' | 'suggested'

const EVENT_PREFIX = 'address_correction'

async function resolveOutcome(
  transaction: GeocodedAddressCorrectionTransaction,
  params: ArrivalAddressCorrectionParams,
): Promise<Outcome> {
  const [stop] = await transaction
    .select({
      addressKey: tripStops.addressKey,
      latitude: geocodedAddresses.latitude,
      longitude: geocodedAddresses.longitude,
      precision: geocodedAddresses.precision,
      source: geocodedAddresses.source,
    })
    .from(tripStops)
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(and(eq(tripStops.companyId, params.companyId), eq(tripStops.id, params.stopId)))
    .limit(1)
  if (stop === undefined || stop.addressKey === '') return 'ignored'

  const currentCoordinate =
    stop.latitude !== null && stop.longitude !== null
      ? { latitude: stop.latitude, longitude: stop.longitude }
      : null
  const accuracy =
    params.location.accuracyMeters === null ? null : Number(params.location.accuracyMeters)
  const { decision, distanceMeters } = resolveAddressArrivalCorrection({
    accuracyMeters: accuracy !== null && Number.isFinite(accuracy) ? accuracy : null,
    currentCoordinate,
    currentPrecision: stop.precision ?? 'city',
    currentSource: stop.source ?? 'city',
    driverPoint: { latitude: params.location.latitude, longitude: params.location.longitude },
    isLate: params.isLate,
  })
  if (decision === 'ignore') return 'ignored'

  if (decision === 'apply') {
    const { applied } = await applyGeocodedAddressCorrection(transaction, {
      actorUserId: params.actorUserId,
      addressKey: stop.addressKey,
      companyId: params.companyId,
      latitude: params.location.latitude,
      longitude: params.location.longitude,
      origin: 'driver',
      precision: ARRIVAL_CORRECTION_WRITTEN_PRECISION,
      source: 'driver',
    })
    return applied ? 'applied' : 'ignored'
  }

  // S9: uma sugestão pendente por endereço da empresa — a chegada nova atualiza a que o escritório ainda não decidiu.
  const suggestion = {
    createdByUserId: params.actorUserId,
    distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
    latitude: params.location.latitude,
    longitude: params.location.longitude,
    tripStopEventId: params.eventId,
    tripStopId: params.stopId,
  }
  await transaction
    .insert(addressCorrectionSuggestions)
    .values({ ...suggestion, addressKey: stop.addressKey, companyId: params.companyId })
    .onConflictDoUpdate({
      set: { ...suggestion, updatedAt: sql`now()` },
      target: [addressCorrectionSuggestions.companyId, addressCorrectionSuggestions.addressKey],
      targetWhere: sql`${addressCorrectionSuggestions.status} = 'pending'`,
    })
  return 'suggested'
}

/** Só ids em log: coordenada e endereço são PII (`security.md` §1). */
export async function correctAddressFromArrival(input: {
  readonly logger: ApiLogger | undefined
  readonly params: ArrivalAddressCorrectionParams
  readonly transaction: GeocodedAddressCorrectionTransaction
}): Promise<ArrivalAddressCorrectionOutcome> {
  const { logger, params, transaction } = input
  const metadata = {
    companyId: params.companyId,
    eventId: params.eventId,
    idempotencyKey: `address-correction:${params.eventId}`,
    stopId: params.stopId,
  }
  try {
    const outcome = await transaction.transaction((savepoint) => resolveOutcome(savepoint, params))
    if (logger !== undefined) {
      safeLogInfo({ logger, message: `${EVENT_PREFIX}.${outcome}`, metadata })
    }
    return outcome
  } catch {
    if (logger !== undefined) {
      safeLogWarn({ logger, message: `${EVENT_PREFIX}.failed`, metadata })
    }
    return 'failed'
  }
}
