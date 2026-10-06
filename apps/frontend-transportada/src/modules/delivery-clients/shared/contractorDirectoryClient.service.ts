/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  CONTRACTOR_DIRECTORY_PATH,
  type Contractor,
  type ContractorPage,
  type ContractorWrite,
} from './contractorDirectory.types'
import {
  requestContractorApi,
  type ContractorDirectoryDependencies,
} from './contractorDirectoryRequest.service'
import {
  toContractor,
  toContractorPage,
  toReceivingProfile,
  toReceivingProfileListPage,
  toReceivingProfileOrNull,
  type ReceivingProfileListPage,
} from './contractorDirectoryResponse.validation'
import {
  buildReceivingProfilePath,
  RECEIVING_PROFILE_LIST_PATH,
  type ReceivingProfile,
  type ReceivingProfileRules,
} from './receivingProfile.types'

/** O teto da página da API; a lista segue o cursor até o fim, porque a tela filtra e ordena aqui. */
const CONTRACTOR_PAGE_SIZE = 100

export type ContractorDirectoryClient = Readonly<{
  getReceivingProfile: (contractorId: string) => Promise<ReceivingProfile | null>
  listContractors: (input: Readonly<{ cursor: string | null }>) => Promise<ContractorPage>
  /** Todos os perfis que existem, paginados: o selo da lista não lê contratante por contratante. */
  listReceivingProfiles: (
    input: Readonly<{ cursor: string | null }>,
  ) => Promise<ReceivingProfileListPage>
  saveReceivingProfile: (
    input: Readonly<{ contractorId: string; rules: ReceivingProfileRules }>,
  ) => Promise<ReceivingProfile>
  updateContractor: (
    input: Readonly<{ id: string; values: ContractorWrite }>,
  ) => Promise<Contractor>
}>

export function createContractorDirectoryClient(
  dependencies: ContractorDirectoryDependencies,
): ContractorDirectoryClient {
  return {
    async getReceivingProfile(contractorId) {
      return toReceivingProfileOrNull(
        await requestContractorApi({
          dependencies,
          method: 'GET',
          path: buildReceivingProfilePath(contractorId),
        }),
      )
    },
    async listContractors({ cursor }) {
      const parameters = new URLSearchParams({ limit: String(CONTRACTOR_PAGE_SIZE) })
      if (cursor !== null) parameters.set('cursor', cursor)
      return toContractorPage(
        await requestContractorApi({
          dependencies,
          method: 'GET',
          path: `${CONTRACTOR_DIRECTORY_PATH}?${parameters.toString()}`,
        }),
      )
    },
    async listReceivingProfiles({ cursor }) {
      const parameters = new URLSearchParams({ limit: String(CONTRACTOR_PAGE_SIZE) })
      if (cursor !== null) parameters.set('cursor', cursor)
      return toReceivingProfileListPage(
        await requestContractorApi({
          dependencies,
          method: 'GET',
          path: `${RECEIVING_PROFILE_LIST_PATH}?${parameters.toString()}`,
        }),
      )
    },
    async saveReceivingProfile({ contractorId, rules }) {
      return toReceivingProfile(
        await requestContractorApi({
          body: JSON.stringify(rules),
          dependencies,
          method: 'PUT',
          path: buildReceivingProfilePath(contractorId),
        }),
      )
    },
    async updateContractor({ id, values }) {
      return toContractor(
        await requestContractorApi({
          body: JSON.stringify(values),
          dependencies,
          method: 'PATCH',
          path: `${CONTRACTOR_DIRECTORY_PATH}/${id}`,
        }),
      )
    },
  }
}

export function getContractorDirectoryClient(): ContractorDirectoryClient {
  return createContractorDirectoryClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
