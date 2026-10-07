/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'

import { CARGO_PREVIEWS_LIST_KEY } from '../queries/useCargoPreviews.query'
import {
  CARGO_ARRIVALS_LIST_KEY,
  cargoArrivalDetailQueryKey,
} from '../queries/useCargoArrivals.query'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'

const CARGO_PREVIEW_DETAILS_KEY = [CARGO_RECEIVING_QUERY_KEY, 'preview'] as const

/**
 * Abrir a avaria e marcar, desfazer ou concluir a devolução mexem em mais de uma tela: a chegada (e a marcação
 * debaixo dela), a lista (contagens e "vencida") e as prévias — a recomendação de viagens e a proposta de
 * chegada deixam de fora a nota a devolver. A chave de cada tela é a dela; aqui só se dispara a releitura.
 */
export function useRefreshCargoOccurrenceEffects(arrivalId: string): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: cargoArrivalDetailQueryKey(arrivalId) })
    void queryClient.invalidateQueries({ queryKey: CARGO_ARRIVALS_LIST_KEY })
    void queryClient.invalidateQueries({ queryKey: CARGO_PREVIEW_DETAILS_KEY })
    void queryClient.invalidateQueries({ queryKey: CARGO_PREVIEWS_LIST_KEY })
  }
}
