/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFiscalReadinessSnapshot } from '../../trips/application/read-trip-fiscal-readiness.use-case.js'
import {
  checkTripAcceptsManifest,
  type TripManifestBlock,
} from '../../trips/domain/trip-manifest.policy.js'
import {
  MdfeManifestCrewRequiredError,
  MdfeManifestTripNotReadyError,
} from '../domain/mdfe-manifest.error.js'
import type { MdfeManifestCompanyContext, MdfeManifestDetail } from './mdfe-manifest.port.js'
import type { CreateMdfeManifestFields, MdfeManifestsUseCase } from './mdfe-manifests.use-case.js'

/**
 * ADR-0046 §7 / spec 059 D4: da viagem saem **sem digitação** o veículo, os condutores e os CT-e. O
 * diálogo pede o resto — seguro, tipo de carga ambíguo, produto predominante, vale-pedágio —, não
 * tudo de novo.
 */
export type CreateTripMdfeManifestFields = Omit<
  CreateMdfeManifestFields,
  'documentIds' | 'driverIds' | 'tripId' | 'vehicleId'
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
    readonly requiresMdfe: boolean | null
    readonly status: TripStatus
    readonly vehicleId: string
  }>
}

export type TripReadinessLookupPort = {
  countDischargeCities(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<number>
  read(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripFiscalReadinessSnapshot>
}

export type CreateTripMdfeManifestUseCase = {
  execute(input: CreateTripMdfeManifestInput): Promise<MdfeManifestDetail>
}

export function createTripMdfeManifestUseCase(dependencies: {
  readonly manifests: MdfeManifestsUseCase
  readonly readiness: TripReadinessLookupPort
  readonly trips: TripLookupPort
}): CreateTripMdfeManifestUseCase {
  const { manifests, readiness, trips } = dependencies

  return {
    async execute({ context, correlationId, manifest, tripId }) {
      const trip = await trips.get({ context, tripId })
      // `createTripSchema` já exige mínimo 1 condutor na viagem; aqui é defesa em profundidade,
      // porque `createTripManifestSchema` omite `driverIds` e confia inteiramente em `trip.drivers`.
      if (trip.drivers.length === 0) throw new MdfeManifestCrewRequiredError()

      const snapshot = await readiness.read({ companyId: context.companyId, tripId })
      const block = checkTripAcceptsManifest({
        dischargeCityCount: await readiness.countDischargeCities({
          companyId: context.companyId,
          tripId,
        }),
        readiness: snapshot,
        requiresMdfe: trip.requiresMdfe,
        tripStatus: trip.status,
      })
      if (block !== null) throw toManifestError({ block, snapshot })

      return manifests.create({
        context,
        correlationId,
        manifest: {
          ...manifest,
          documentIds: snapshot.documents
            .map((document) => document.cteFiscalDocumentId)
            .filter((documentId): documentId is string => documentId !== null),
          driverIds: trip.drivers.map((driver) => driver.driverId),
          tripId: trip.id,
          vehicleId: trip.vehicleId,
        },
      })
    },
  }
}

/**
 * A recusa carrega o que falta, por nota. Um `409` mudo mandaria o operador abrir a outra tela — que
 * é exatamente o trabalho que esta spec veio tirar dele.
 */
function toManifestError(input: {
  readonly block: TripManifestBlock
  readonly snapshot: TripFiscalReadinessSnapshot
}): MdfeManifestTripNotReadyError {
  return new MdfeManifestTripNotReadyError({
    block: input.block,
    pending: input.snapshot.documents
      .filter((document) => document.reason !== 'ok')
      .map((document) => ({ reason: document.reason, tripDocumentId: document.tripDocumentId })),
  })
}
