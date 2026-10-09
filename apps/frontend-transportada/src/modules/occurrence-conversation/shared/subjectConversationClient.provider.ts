/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createSubjectConversationClient,
  type SubjectConversationClient,
} from './subjectConversationClient.service'

/** Spec 260: o cliente da conversa por assunto ligado ao ambiente e ao token; os testes trocam este módulo. */
export function getSubjectConversationClient(): SubjectConversationClient {
  return createSubjectConversationClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
