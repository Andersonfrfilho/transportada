/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { useGeneratePreviewEmailAddressMutation } from '../mutations/useGeneratePreviewEmailAddress.mutation'
import type { GeneratedInboundAddress } from '../shared/previewEmail.types'

export type PreviewEmailAddressController = Readonly<{
  cancel: () => void
  confirm: () => void
  dismiss: () => void
  errorCode: string | undefined
  /** O endereço recém-gerado: só existe aqui, na memória do componente, até a pessoa fechar o painel. */
  generated: GeneratedInboundAddress | undefined
  isConfirming: boolean
  isGenerating: boolean
  request: () => void
}>

/**
 * Gerar o primeiro endereço é direto; trocar um que já vale pede confirmação, porque o anterior deixa de
 * valer na hora. Fechar o painel — ou sair da ficha — apaga o resultado da mutação, e com ele o token.
 */
export function usePreviewEmailAddress(
  input: Readonly<{ contractorId: string; hasInboundToken: boolean }>,
): PreviewEmailAddressController {
  const mutation = useGeneratePreviewEmailAddressMutation(input.contractorId)
  const [isConfirming, setIsConfirming] = useState(false)
  const { reset } = mutation

  useEffect(() => reset, [reset])

  function confirm(): void {
    setIsConfirming(false)
    mutation.mutate()
  }

  return {
    cancel: () => setIsConfirming(false),
    confirm,
    dismiss: reset,
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    generated: mutation.data,
    isConfirming,
    isGenerating: mutation.isPending,
    request: () => {
      if (input.hasInboundToken) {
        reset()
        setIsConfirming(true)
        return
      }
      confirm()
    },
  }
}
