/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createDriverAttachmentClient,
  type DriverAttachmentClient,
} from '../shared/driverAttachmentClient.service'
import type {
  DriverAttachmentSuggestionDecision,
  DriverAttachmentType,
} from '../shared/driverAttachment.validation'

const DRIVER_ATTACHMENTS_QUERY_KEY = 'fleet-driver-attachments'

function createClient() {
  return createDriverAttachmentClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Spec 091: os documentos anexados à ficha do motorista. A lista é de `fleet.read`; anexar e remover,
 * de `fleet.manage`; abrir o arquivo, de `fleet.reveal` — a tela só oferece o que a conta pode.
 */
export function useDriverAttachments(
  input: Readonly<{ client?: DriverAttachmentClient; driverId: string }>,
) {
  const queryClient = useQueryClient()
  const client = input.client ?? createClient()
  const listKey = [DRIVER_ATTACHMENTS_QUERY_KEY, input.driverId] as const
  const listQuery = useQuery({
    queryFn: () => client.list(input.driverId),
    queryKey: listKey,
  })
  const uploadMutation = useMutation({
    mutationFn: (value: Readonly<{ file: File; type: DriverAttachmentType }>) =>
      client.upload({ driverId: input.driverId, ...value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
  const removeMutation = useMutation({
    mutationFn: (attachmentId: string) => client.remove({ attachmentId, driverId: input.driverId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
  const revealMutation = useMutation({
    mutationFn: (attachmentId: string) => client.reveal({ attachmentId, driverId: input.driverId }),
    /** O link vale minutos e é aberto na hora, em aba nova e sem ligar a página de origem. */
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })

  return { listQuery, removeMutation, revealMutation, uploadMutation }
}

const DRIVER_ATTACHMENT_SUGGESTION_QUERY_KEY = 'fleet-driver-attachment-suggestion'

/**
 * Spec 091 T018: a leitura da CNH, só para `fleet.manage` (`enabled`). Decidir descarta a leitura no
 * servidor, então as duas chaves são invalidadas: a lista (o aviso some) e a própria sugestão.
 */
export function useDriverAttachmentSuggestion(
  input: Readonly<{
    attachmentId: string
    client?: DriverAttachmentClient
    driverId: string
    enabled: boolean
  }>,
) {
  const queryClient = useQueryClient()
  const client = input.client ?? createClient()
  const suggestionQuery = useQuery({
    enabled: input.enabled,
    queryFn: () =>
      client.readSuggestion({ attachmentId: input.attachmentId, driverId: input.driverId }),
    queryKey: [DRIVER_ATTACHMENT_SUGGESTION_QUERY_KEY, input.driverId, input.attachmentId] as const,
  })
  const decideMutation = useMutation({
    mutationFn: (decision: DriverAttachmentSuggestionDecision) =>
      client.decideSuggestion({
        attachmentId: input.attachmentId,
        decision,
        driverId: input.driverId,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [DRIVER_ATTACHMENT_SUGGESTION_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [DRIVER_ATTACHMENTS_QUERY_KEY, input.driverId] }),
      ]),
  })

  return { decideMutation, suggestionQuery }
}
