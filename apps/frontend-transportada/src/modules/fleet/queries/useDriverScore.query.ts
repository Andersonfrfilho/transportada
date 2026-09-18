/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getFleetClient } from '../hooks/useFleet.hook'
import type { FleetDriverScoreResult } from '../shared/fleet.types'

const DRIVER_SCORE_QUERY_KEY = 'fleet-driver-score'

/**
 * Spec 157 RF10: a nota e as penalidades vigentes de um motorista — a ficha só lê isto quando ela
 * está aberta com um motorista já cadastrado, nunca no formulário de criação.
 */
export function useDriverScoreQuery(input: Readonly<{ driverId: string | undefined }>) {
  return useQuery<FleetDriverScoreResult>({
    enabled: input.driverId !== undefined,
    queryFn: () => getFleetClient().readDriverScore({ driverId: input.driverId ?? '' }),
    queryKey: [DRIVER_SCORE_QUERY_KEY, input.driverId],
  })
}
