/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  cargoPreviewDetailQueryKey,
  CARGO_PREVIEWS_LIST_KEY,
} from '../queries/useCargoPreviews.query'
import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'
import type { CargoPreviewItemAction } from '../shared/cargoPreview.types'

export type CargoPreviewItemActionVariables = Readonly<{
  action: CargoPreviewItemAction
  documentId?: string
  itemId: string
}>

/** Uma ação muda o grupo inteiro (e as contagens): a prévia aberta e a lista são relidas no servidor. */
export function useCargoPreviewItemActionMutation(previewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: CargoPreviewItemActionVariables) =>
      getCargoPreviewClient().itemAction({ ...variables, previewId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cargoPreviewDetailQueryKey(previewId) })
      void queryClient.invalidateQueries({ queryKey: CARGO_PREVIEWS_LIST_KEY })
    },
  })
}
