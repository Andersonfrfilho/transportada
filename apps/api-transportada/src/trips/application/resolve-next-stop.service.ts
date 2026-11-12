/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveDepartureStop } from '../domain/driver-stop-resolution.policy.js'
import { isStopAddressReliable } from '../domain/stop-address-reliability.policy.js'
import type { DriverNextStop, NextStopCandidates } from './driver-next-stop.types.js'

/** A mesma escolha do "saí" (`resolveDepartureStop`): a primeira pendente do roteiro, ou a que já está a caminho. */
export function resolveNextStop(candidates: NextStopCandidates): DriverNextStop | null {
  const resolution = resolveDepartureStop(candidates.stops)
  if (resolution.kind === 'none') return null
  const stop = resolution.kind === 'choose' ? resolution.suggested : resolution.stop

  return {
    address: stop.address,
    coordinate:
      stop.latitude !== null && stop.longitude !== null
        ? { latitude: stop.latitude, longitude: stop.longitude }
        : null,
    documents: stop.documents.map((document) => ({ id: document.id, number: document.number })),
    id: stop.id,
    isAddressReliable: isStopAddressReliable(stop),
    precision: stop.precision,
    recipientName: stop.recipientName,
    sequence: stop.sequence,
    totalStops: candidates.totalStops,
  }
}
