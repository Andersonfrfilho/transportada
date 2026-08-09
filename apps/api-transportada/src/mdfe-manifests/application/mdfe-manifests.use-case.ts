/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MAX_LOADING_CITIES_PER_MANIFEST,
  type MdfeCargoType,
  type MdfeCargoUnit,
  type MdfeEmitterType,
  type MdfeTransporterType,
} from '../../database/mdfe.schema.js'
import { normalizeRntrc } from '../../shared/rntrc.service.js'
import { selectManifestableDocuments } from '../domain/mdfe-manifest-eligibility.policy.js'
import { MdfeManifestTransitionBlockedError } from '../domain/mdfe-issuance.error.js'
import {
  distinctStates,
  groupLoadingCities,
  resolveOriginState,
  resolveSingleState,
  sumTotals,
} from '../domain/mdfe-manifest-grouping.policy.js'
import {
  MDFE_TRANSITION_BLOCK,
  checkManifestDiscard,
} from '../domain/mdfe-manifest-state.policy.js'
import {
  MdfeFiscalSettingsMissingError,
  MdfeManifestDestinationStateRequiredError,
  MdfeManifestDocumentsBlockedError,
  MdfeManifestEmptySelectionError,
  MdfeManifestNotFoundError,
  MdfeManifestTooManyLoadingCitiesError,
} from '../domain/mdfe-manifest.error.js'
import { resolveManifestCrew, resolveManifestVehicle } from './mdfe-manifest-crew.service.js'
import type {
  MdfeManifestCompanyContext,
  MdfeManifestDetail,
  MdfeManifestFilters,
  MdfeManifestPage,
  MdfeManifestRepositoryPort,
} from './mdfe-manifest.port.js'

export type CreateMdfeManifestFields = {
  readonly additionalInformation: string
  readonly cargoProduct: string
  readonly cargoProductNcm: string
  readonly cargoType: MdfeCargoType | ''
  readonly cargoUnit: MdfeCargoUnit
  readonly contractorName: string
  readonly contractorTaxId: string
  readonly destinationState: string
  readonly dischargePostalCode: string
  readonly documentIds: readonly string[]
  readonly driverIds: readonly string[]
  readonly emitterType: MdfeEmitterType
  readonly freightValue: string
  readonly insuranceEndorsement: string
  readonly loadingPostalCode: string
  readonly transporterType: MdfeTransporterType | ''
  readonly tripId: string | null
  readonly tripStartedAt: string | null
  readonly vehicleId: string
}

export type CreateMdfeManifestInput = {
  readonly context: MdfeManifestCompanyContext
  readonly correlationId: string
  readonly manifest: CreateMdfeManifestFields
}

export type DiscardMdfeManifestInput = {
  readonly context: MdfeManifestCompanyContext
  readonly manifestId: string
}

export type GetMdfeManifestInput = {
  readonly context: MdfeManifestCompanyContext
  readonly manifestId: string
}

export type ListMdfeManifestsInput = {
  readonly context: MdfeManifestCompanyContext
  readonly cursor: string | null
  readonly filters?: MdfeManifestFilters
  readonly limit: number
}

export type MdfeManifestsUseCase = {
  create(input: CreateMdfeManifestInput): Promise<MdfeManifestDetail>
  discard(input: DiscardMdfeManifestInput): Promise<MdfeManifestDetail>
  get(input: GetMdfeManifestInput): Promise<MdfeManifestDetail>
  list(input: ListMdfeManifestsInput): Promise<MdfeManifestPage>
}

export function createMdfeManifestsUseCase(dependencies: {
  readonly repository: MdfeManifestRepositoryPort
}): MdfeManifestsUseCase {
  const { repository } = dependencies

  return {
    async create({ context, manifest }) {
      const companyId = context.companyId
      const settings = await repository.findFiscalSettings({ companyId })
      if (settings === null) throw new MdfeFiscalSettingsMissingError()

      const vehicle = await resolveManifestVehicle({
        companyId,
        repository,
        vehicleId: manifest.vehicleId,
      })
      const drivers = await resolveManifestCrew({
        companyId,
        driverIds: manifest.driverIds,
        repository,
      })

      const documents = await selectDocuments({ companyId, manifest, repository, settings })
      const loadingCities = groupLoadingCities(documents)
      if (loadingCities.length > MAX_LOADING_CITIES_PER_MANIFEST) {
        throw new MdfeManifestTooManyLoadingCitiesError(MAX_LOADING_CITIES_PER_MANIFEST)
      }
      const totals = sumTotals(documents)

      return repository.create({
        companyId,
        drivers,
        items: documents.map((document) => ({
          accessKey: document.accessKey,
          cargoValue: document.cargoValue,
          cargoWeight: document.cargoWeight,
          cteFiscalDocumentId: document.fiscalDocumentId,
          dischargeCityCode: document.dischargeCityCode,
          dischargeCityName: document.dischargeCityName,
        })),
        loadingCities: loadingCities.map((city, index) => ({
          cityCode: city.cityCode,
          cityName: city.cityName,
          position: index + 1,
        })),
        manifest: {
          additionalInformation: manifest.additionalInformation,
          cargoProduct: manifest.cargoProduct,
          cargoProductNcm: manifest.cargoProductNcm,
          cargoType: manifest.cargoType,
          cargoUnit: manifest.cargoUnit,
          cargoValue: totals.cargoValue,
          cargoWeight: totals.cargoWeight,
          contractorName: manifest.contractorName,
          contractorTaxId: manifest.contractorTaxId,
          cteCount: totals.cteCount,
          destinationState: resolveDestinationState({
            chosen: manifest.destinationState,
            options: distinctStates(documents.map((document) => document.dischargeState)),
          }),
          dischargePostalCode: manifest.dischargePostalCode,
          emitterType: manifest.emitterType,
          fiscalEnvironment: settings.environment,
          freightValue: manifest.freightValue,
          insuranceEndorsement: manifest.insuranceEndorsement,
          loadingPostalCode: manifest.loadingPostalCode,
          originState: resolveOriginState(documents),
          // A tabela do manifesto guarda o valor fiscal de oito posições, não o da folha da ANTT.
          rntrc: normalizeRntrc(settings.rntrc),
          transporterType: manifest.transporterType,
          tripId: manifest.tripId,
          tripStartedAt: manifest.tripStartedAt,
          vehicleId: vehicle.id,
        },
      })
    },

    /** ADR-0017: repetir o descarte responde o mesmo estado — o operador pode reclicar sem medo. */
    async discard({ context, manifestId }) {
      const companyId = context.companyId
      const manifest = await repository.findById({ companyId, manifestId })
      if (manifest === null) throw new MdfeManifestNotFoundError()
      if (manifest.status === 'discarded') return manifest

      const transition = checkManifestDiscard(manifest.status)
      if (!transition.allowed) throw new MdfeManifestTransitionBlockedError(transition.reason)

      const discarded = await repository.discard({ companyId, manifestId })
      if (discarded === null) {
        throw new MdfeManifestTransitionBlockedError(MDFE_TRANSITION_BLOCK.inFlight)
      }
      return discarded
    },

    async get({ context, manifestId }) {
      const manifest = await repository.findById({ companyId: context.companyId, manifestId })
      if (manifest === null) throw new MdfeManifestNotFoundError()
      return manifest
    },

    async list({ context, cursor, filters, limit }) {
      return repository.listManifests({
        companyId: context.companyId,
        cursor,
        ...(filters === undefined ? {} : { filters }),
        limit,
      })
    },
  }
}

type SelectDocumentsParams = {
  readonly companyId: string
  readonly manifest: CreateMdfeManifestFields
  readonly repository: MdfeManifestRepositoryPort
  readonly settings: { readonly environment: 'homologation' | 'production' }
}

async function selectDocuments({
  companyId,
  manifest,
  repository,
  settings,
}: SelectDocumentsParams) {
  if (manifest.documentIds.length === 0) throw new MdfeManifestEmptySelectionError()

  const selection = selectManifestableDocuments({
    candidates: await repository.listCandidateDocuments({
      companyId,
      fiscalDocumentIds: manifest.documentIds,
    }),
    companyId,
    fiscalEnvironment: settings.environment,
    requestedDocumentIds: manifest.documentIds,
  })
  if (selection.blocked.length > 0) throw new MdfeManifestDocumentsBlockedError(selection.blocked)
  if (selection.manifestable.length === 0) throw new MdfeManifestEmptySelectionError()

  return selection.manifestable
}

/** UFFim só é derivada quando a descarga é única; ambígua exige a escolha explícita do operador. */
function resolveDestinationState(input: {
  readonly chosen: string
  readonly options: readonly string[]
}): string {
  if (input.chosen.length === 0) {
    const derived = resolveSingleState(input.options)
    if (derived.length === 0) throw new MdfeManifestDestinationStateRequiredError(input.options)
    return derived
  }
  if (!input.options.includes(input.chosen)) {
    throw new MdfeManifestDestinationStateRequiredError(input.options)
  }
  return input.chosen
}
