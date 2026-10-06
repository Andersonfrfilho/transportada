/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3 (ADR-0094 §5): ausência de perfil é `null`, contratante fora da empresa do
 * contexto é 404 — a empresa e o ator vêm sempre do contexto autenticado.
 */
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import type { ContractorReceivingProfileRepositoryPort } from './contractor-receiving-profile.port.js'
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfilePage,
  GetContractorReceivingProfileParams,
  ListContractorReceivingProfilesParams,
  SaveContractorReceivingProfileParams,
} from './contractor-receiving-profile.types.js'

type Dependencies = { readonly repository: ContractorReceivingProfileRepositoryPort }

export function createGetContractorReceivingProfileUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: GetContractorReceivingProfileParams,
  ) => Promise<ContractorReceivingProfile | null>
} {
  return {
    async execute({ context, contractorId }) {
      const lookup = await dependencies.repository.find({
        companyId: context.companyId,
        contractorId,
      })
      if (!lookup.isContractorFound) throw new ContractorNotFoundError()
      return lookup.profile
    },
  }
}

export function createSaveContractorReceivingProfileUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SaveContractorReceivingProfileParams,
  ) => Promise<ContractorReceivingProfile>
} {
  return {
    async execute({ context, contractorId, correlationId, rules }) {
      const saved = await dependencies.repository.save({
        actorUserId: context.userId,
        companyId: context.companyId,
        contractorId,
        correlationId,
        rules,
      })
      if (saved === null) throw new ContractorNotFoundError()
      return saved
    },
  }
}

export function createListContractorReceivingProfilesUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: ListContractorReceivingProfilesParams,
  ) => Promise<ContractorReceivingProfilePage>
} {
  return {
    execute({ context, ...filters }) {
      return dependencies.repository.list({ ...filters, companyId: context.companyId })
    },
  }
}
