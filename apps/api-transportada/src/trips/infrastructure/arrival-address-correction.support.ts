/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF14-RF16 (ADR-0113 §2): o ponto da chegada da tripulação corrige o cadastro do endereço,
 * vira sugestão ao escritório ou nada. A trilha em `geocoded_address_corrections` já é o evento da
 * linha do tempo da parada (228). Roda num savepoint: uma falha aqui nunca derruba a chegada.
 */
import { and, eq } from 'drizzle-orm'

import { applyGeocodedAddressCorrection } from '../../routing/infrastructure/drizzle-geocoded-address-correction.repository.js'
import type { GeocodedAddressCorrectionTransaction } from '../../routing/infrastructure/drizzle-geocoded-address-correction.repository.js'
import { addressCorrectionSuggestions } from '../../database/address-correction-suggestion.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { resolveAddressArrivalCorrection } from '../domain/address-arrival-correction.policy.js'
import type {
  ArrivalAddressCorrectionOutcome,
  ReportedLocation,
} from '../application/driver-field-report.port.js'

type ArrivalAddressCorrectionParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly eventId: string
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
  const { decision, distanceMeters } = resolveAddressArrivalCorrection({
    currentCoordinate,
    currentPrecision: stop.precision ?? 'city',
    driverPoint: { latitude: params.location.latitude, longitude: params.location.longitude },
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
      source: 'driver',
    })
    return applied ? 'applied' : 'ignored'
  }

  await transaction
    .insert(addressCorrectionSuggestions)
    .values({
      addressKey: stop.addressKey,
      companyId: params.companyId,
      createdByUserId: params.actorUserId,
      distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
      latitude: params.location.latitude,
      longitude: params.location.longitude,
      tripStopEventId: params.eventId,
      tripStopId: params.stopId,
    })
    .onConflictDoNothing()
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
