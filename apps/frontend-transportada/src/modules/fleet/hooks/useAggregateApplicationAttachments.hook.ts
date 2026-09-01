/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createAggregateApplicationClient } from '../shared/aggregateApplicationClient.service'

const ATTACHMENTS_QUERY_KEY = 'aggregate-application-attachments'
/**
 * Aprovar CNH ou CRLV promove o anexo a documento da conta, então a aba de documentos do agregado
 * mostra dado velho até recarregar. As duas chaves são deste módulo (`fleet`), como no hook da
 * candidatura — o registro de efeito entre módulos não se aplica aqui.
 */
const AGGREGATE_DOCUMENTS_QUERY_KEY = 'aggregate-documents'

function getClient() {
  return createAggregateApplicationClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useAggregateApplicationAttachments(
  input: Readonly<{ applicationId: string | null }>,
) {
  const client = getClient()
  const queryClient = useQueryClient()
  const applicationId = input.applicationId

  const query = useQuery({
    // Sem candidatura aberta não há o que buscar — e `enabled` evita a requisição com id vazio.
    enabled: applicationId !== null,
    queryFn: () => client.listAttachments(applicationId ?? ''),
    queryKey: [ATTACHMENTS_QUERY_KEY, applicationId] as const,
  })

  const reviewMutation = useMutation({
    mutationFn: (
      params: Readonly<{
        attachmentId: string
        decision: 'approved' | 'rejected'
        rejectionReason: string
      }>,
    ) => client.reviewAttachment({ applicationId: applicationId ?? '', ...params }),
    /**
     * Sem `await`: `isPending` só cai quando a promise de `onSuccess` resolve, e aguardar a
     * revalidação prenderia o botão muito depois de a decisão ter sido gravada — o operador leria
     * trabalho pendente onde há só cache esfriando, e clicaria de novo.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [AGGREGATE_DOCUMENTS_QUERY_KEY] })
    },
  })

  async function openAttachment(attachmentId: string): Promise<void> {
    const url = await client.attachmentDownloadUrl({
      applicationId: applicationId ?? '',
      attachmentId,
    })
    globalThis.open(url, '_blank', 'noopener')
  }

  return { openAttachment, query, reviewMutation }
}
