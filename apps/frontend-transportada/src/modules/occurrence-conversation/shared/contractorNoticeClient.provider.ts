/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createContractorNoticeClient,
  type ContractorNoticeClient,
} from './contractorNotice.service'

/** Spec 324 T4: o cliente ligado ao ambiente e ao token; os testes de DOM trocam este módulo. */
export function getContractorNoticeClient(): ContractorNoticeClient {
  return createContractorNoticeClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
