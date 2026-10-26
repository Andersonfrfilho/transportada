/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createOccurrenceConversationClient,
  type OccurrenceConversationClient,
} from './occurrenceConversationClient.service'

export type ContractorReplyEmailClient = Pick<
  OccurrenceConversationClient,
  | 'forwardContractorReplyByEmail'
  | 'forwardContractorReplyToClient'
  | 'readContractorReplyEmailOptions'
  | 'retryContractorReplyClientDelivery'
>

/** Spec 248 T4.7: o cliente ligado ao ambiente e ao token; os testes de DOM trocam este módulo. */
export function getContractorReplyEmailClient(): ContractorReplyEmailClient {
  return createOccurrenceConversationClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
