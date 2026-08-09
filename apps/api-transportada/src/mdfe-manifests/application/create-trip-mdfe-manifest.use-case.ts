/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { MdfeManifestCrewRequiredError } from '../domain/mdfe-manifest.error.js'
import type { MdfeManifestCompanyContext, MdfeManifestDetail } from './mdfe-manifest.port.js'
import type { CreateMdfeManifestFields, MdfeManifestsUseCase } from './mdfe-manifests.use-case.js'

export type CreateTripMdfeManifestFields = Omit<
  CreateMdfeManifestFields,
  'driverIds' | 'tripId' | 'vehicleId'
>

export type CreateTripMdfeManifestInput = {
  readonly context: MdfeManifestCompanyContext
  readonly correlationId: string
  readonly manifest: CreateTripMdfeManifestFields
  readonly tripId: string
}

export type TripLookupPort = {
  get(input: { readonly context: MdfeManifestCompanyContext; readonly tripId: string }): Promise<{
    readonly drivers: readonly { readonly driverId: string }[]
    readonly id: string
    readonly vehicleId: string
  }>
}

export type CreateTripMdfeManifestUseCase = {
  execute(input: CreateTripMdfeManifestInput): Promise<MdfeManifestDetail>
}

export function createTripMdfeManifestUseCase(dependencies: {
  readonly manifests: MdfeManifestsUseCase
  readonly trips: TripLookupPort
}): CreateTripMdfeManifestUseCase {
  const { manifests, trips } = dependencies

  return {
    async execute({ context, correlationId, manifest, tripId }) {
      const trip = await trips.get({ context, tripId })
      // `createTripSchema` já exige mínimo 1 condutor na viagem; aqui é defesa em profundidade,
      // porque `createTripManifestSchema` omite `driverIds` e confia inteiramente em `trip.drivers`.
      if (trip.drivers.length === 0) throw new MdfeManifestCrewRequiredError()

      return manifests.create({
        context,
        correlationId,
        manifest: {
          ...manifest,
          driverIds: trip.drivers.map((driver) => driver.driverId),
          tripId: trip.id,
          vehicleId: trip.vehicleId,
        },
      })
    },
  }
}
