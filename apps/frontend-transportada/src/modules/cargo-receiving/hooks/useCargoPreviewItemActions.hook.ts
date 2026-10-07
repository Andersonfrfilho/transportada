/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useCargoPreviewItemActionMutation } from '../mutations/useCargoPreviewItemAction.mutation'
import type { CargoPreviewItem, CargoPreviewItemAction } from '../shared/cargoPreview.types'

export type CargoPreviewItemActionsController = Readonly<{
  /** O item com o aviso "desvincular age no grupo inteiro" aberto. */
  confirmingUnlinkId: string | undefined
  errorCode: string | undefined
  errorItemId: string | undefined
  /** O item com o seletor de nota (vincular à mão) aberto. */
  linkingItemId: string | undefined
  isPending: boolean
  /** Há algo a mostrar sob a linha: o aviso, o seletor ou o erro de uma ação direta. */
  isExpanded: (itemId: string) => boolean
  cancelUnlink: () => void
  closeLink: () => void
  confirm: (item: CargoPreviewItem) => void
  link: (input: Readonly<{ documentId: string; item: CargoPreviewItem }>) => void
  openLink: (item: CargoPreviewItem) => void
  requestUnlink: (item: CargoPreviewItem) => void
  unlink: (item: CargoPreviewItem) => void
}>

/**
 * As três ações do operador sobre uma linha. Desvincular tem um passo a mais, de propósito: age no grupo
 * inteiro, e o aviso diz isso antes de a ação sair (RF5a item 9).
 */
export function useCargoPreviewItemActions(previewId: string): CargoPreviewItemActionsController {
  const mutation = useCargoPreviewItemActionMutation(previewId)
  const [confirmingUnlinkId, setConfirmingUnlinkId] = useState<string | undefined>(undefined)
  const [linkingItemId, setLinkingItemId] = useState<string | undefined>(undefined)
  const [errorItemId, setErrorItemId] = useState<string | undefined>(undefined)

  function run(
    input: Readonly<{
      action: CargoPreviewItemAction
      documentId?: string
      item: CargoPreviewItem
    }>,
  ): void {
    setErrorItemId(input.item.id)
    mutation.mutate(
      {
        action: input.action,
        ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
        itemId: input.item.id,
      },
      {
        onSuccess: () => {
          setConfirmingUnlinkId(undefined)
          setLinkingItemId(undefined)
          setErrorItemId(undefined)
        },
      },
    )
  }

  return {
    cancelUnlink: () => setConfirmingUnlinkId(undefined),
    closeLink: () => {
      setLinkingItemId(undefined)
      mutation.reset()
    },
    confirm: (item) => run({ action: 'confirm', item }),
    confirmingUnlinkId,
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    errorItemId,
    isExpanded: (itemId) =>
      confirmingUnlinkId === itemId ||
      linkingItemId === itemId ||
      (mutation.isError && errorItemId === itemId),
    isPending: mutation.isPending,
    link: ({ documentId, item }) => run({ action: 'link', documentId, item }),
    linkingItemId,
    openLink: (item) => {
      mutation.reset()
      setLinkingItemId(item.id)
    },
    requestUnlink: (item) => {
      mutation.reset()
      setConfirmingUnlinkId(item.id)
    },
    unlink: (item) => run({ action: 'unlink', item }),
  }
}
