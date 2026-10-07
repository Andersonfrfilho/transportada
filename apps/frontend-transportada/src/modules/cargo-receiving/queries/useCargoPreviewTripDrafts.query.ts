/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'
import { resolveCargoPreviewRefetchInterval } from '../shared/cargoPreviewPolling.service'
import { cargoPreviewDetailQueryKey } from './useCargoPreviews.query'

/**
 * Debaixo da chave do detalhe de propósito: confirmar, desvincular ou vincular uma linha invalida o detalhe
 * por prefixo, e os rascunhos (que dependem do vínculo) são relidos junto — nunca ficam velhos na tela.
 */
export function cargoPreviewTripDraftsQueryKey(previewId: string) {
  return [...cargoPreviewDetailQueryKey(previewId), 'trip-drafts'] as const
}

/** Só lê com a recomendação aberta: quem não a pediu não paga a consulta (nem a agregação no servidor). */
export function useCargoPreviewTripDraftsQuery(
  input: Readonly<{ isEnabled: boolean; previewId: string }>,
) {
  return useQuery({
    enabled: input.isEnabled,
    queryFn: () => getCargoPreviewClient().getTripDrafts(input.previewId),
    queryKey: cargoPreviewTripDraftsQueryKey(input.previewId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return resolveCargoPreviewRefetchInterval(status === undefined ? [] : [status])
    },
  })
}
