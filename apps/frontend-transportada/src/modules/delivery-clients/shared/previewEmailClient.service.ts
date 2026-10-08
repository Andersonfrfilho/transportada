/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  requestContractorApi,
  type ContractorDirectoryDependencies,
} from './contractorDirectoryRequest.service'
import {
  buildEmailIntakesPath,
  buildInboundTokenPath,
  buildPreviewEmailPath,
  type GeneratedInboundAddress,
  type PreviewEmailIntake,
  type PreviewEmailLists,
  type PreviewEmailSettings,
} from './previewEmail.types'
import {
  toGeneratedInboundAddress,
  toPreviewEmailIntakes,
  toPreviewEmailSettings,
} from './previewEmailResponse.validation'

export type PreviewEmailClient = Readonly<{
  /** O token só existe na resposta deste pedido: gerar de novo troca o endereço e invalida o anterior. */
  generateAddress: (contractorId: string) => Promise<GeneratedInboundAddress>
  getSettings: (contractorId: string) => Promise<PreviewEmailSettings>
  listIntakes: (contractorId: string) => Promise<readonly PreviewEmailIntake[]>
  saveAllowlists: (
    input: Readonly<{ contractorId: string; lists: PreviewEmailLists }>,
  ) => Promise<PreviewEmailSettings>
}>

export function createPreviewEmailClient(
  dependencies: ContractorDirectoryDependencies,
): PreviewEmailClient {
  return {
    async generateAddress(contractorId) {
      return toGeneratedInboundAddress(
        await requestContractorApi({
          dependencies,
          method: 'POST',
          path: buildInboundTokenPath(contractorId),
        }),
      )
    },
    async getSettings(contractorId) {
      return toPreviewEmailSettings(
        await requestContractorApi({
          dependencies,
          method: 'GET',
          path: buildPreviewEmailPath(contractorId),
        }),
      )
    },
    async listIntakes(contractorId) {
      return toPreviewEmailIntakes(
        await requestContractorApi({
          dependencies,
          method: 'GET',
          path: buildEmailIntakesPath(contractorId),
        }),
      )
    },
    async saveAllowlists({ contractorId, lists }) {
      return toPreviewEmailSettings(
        await requestContractorApi({
          body: JSON.stringify({
            forwarderAllowlist: lists.forwarderAllowlist,
            senderAllowlist: lists.senderAllowlist,
          }),
          dependencies,
          method: 'PUT',
          path: buildPreviewEmailPath(contractorId),
        }),
      )
    },
  }
}

export function getPreviewEmailClient(): PreviewEmailClient {
  return createPreviewEmailClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
