/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MAX_LOADING_CITIES_PER_MANIFEST,
  type MdfeFiscalEnvironment,
} from '../../database/mdfe.schema.js'
import {
  selectManifestableDocuments,
  type ManifestableDocument,
  type MdfeDocumentBlock,
} from '../domain/mdfe-manifest-eligibility.policy.js'
import {
  distinctStates,
  groupDischargeCities,
  groupLoadingCities,
  resolveOriginState,
  resolveSingleState,
  sumTotals,
  type MdfeManifestCity,
  type MdfeManifestDischargeCity,
  type MdfeManifestTotals,
} from '../domain/mdfe-manifest-grouping.policy.js'
import {
  MdfeFiscalSettingsMissingError,
  MdfeManifestTooManyLoadingCitiesError,
} from '../domain/mdfe-manifest.error.js'
import type {
  MdfeManifestCompanyContext,
  MdfeManifestRepositoryPort,
} from './mdfe-manifest.port.js'

export type PreviewMdfeManifestInput = {
  readonly context: MdfeManifestCompanyContext
  readonly documentIds: readonly string[]
}

export type MdfeManifestPreview = {
  readonly blocked: readonly MdfeDocumentBlock[]
  readonly destinationState: string
  readonly destinationStateOptions: readonly string[]
  readonly dischargeCities: readonly MdfeManifestDischargeCity[]
  readonly documents: readonly ManifestableDocument[]
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly loadingCities: readonly MdfeManifestCity[]
  readonly originState: string
  readonly totals: MdfeManifestTotals
}

export type PreviewMdfeManifestUseCase = {
  execute(input: PreviewMdfeManifestInput): Promise<MdfeManifestPreview>
}

export function createPreviewMdfeManifestUseCase(dependencies: {
  readonly repository: Pick<
    MdfeManifestRepositoryPort,
    'findFiscalSettings' | 'listCandidateDocuments'
  >
}): PreviewMdfeManifestUseCase {
  const { repository } = dependencies

  return {
    async execute(input) {
      const companyId = input.context.companyId
      const settings = await repository.findFiscalSettings({ companyId })
      if (settings === null) throw new MdfeFiscalSettingsMissingError()

      const candidates =
        input.documentIds.length === 0
          ? []
          : await repository.listCandidateDocuments({
              companyId,
              fiscalDocumentIds: input.documentIds,
            })
      const selection = selectManifestableDocuments({
        candidates,
        companyId,
        fiscalEnvironment: settings.environment,
        requestedDocumentIds: input.documentIds,
      })
      const loadingCities = groupLoadingCities(selection.manifestable)
      if (loadingCities.length > MAX_LOADING_CITIES_PER_MANIFEST) {
        throw new MdfeManifestTooManyLoadingCitiesError(MAX_LOADING_CITIES_PER_MANIFEST)
      }

      const destinationStateOptions = distinctStates(
        selection.manifestable.map((document) => document.dischargeState),
      )

      return {
        blocked: selection.blocked,
        destinationState: resolveSingleState(destinationStateOptions),
        destinationStateOptions,
        dischargeCities: groupDischargeCities(selection.manifestable),
        documents: selection.manifestable,
        fiscalEnvironment: settings.environment,
        loadingCities,
        originState: resolveOriginState(selection.manifestable),
        totals: sumTotals(selection.manifestable),
      }
    },
  }
}
