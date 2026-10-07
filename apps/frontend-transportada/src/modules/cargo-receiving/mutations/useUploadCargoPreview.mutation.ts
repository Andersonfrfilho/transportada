/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { CARGO_PREVIEWS_LIST_KEY } from '../queries/useCargoPreviews.query'
import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'
import type { UploadCargoPreviewInput } from '../shared/cargoPreview.types'

export type UploadCargoPreviewVariables = Readonly<{
  idempotencyKey: string
  input: UploadCargoPreviewInput
}>

export function useUploadCargoPreviewMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: UploadCargoPreviewVariables) =>
      getCargoPreviewClient().uploadPreview(variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARGO_PREVIEWS_LIST_KEY })
    },
  })
}
