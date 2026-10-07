/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoDocumentProduct } from '../shared/cargoOccurrence.types'
import {
  toggleOccurrenceItem,
  type OccurrenceDraft,
} from '../shared/cargoOccurrenceForm.validation'
import { useOccurrencePhoto, type OccurrencePhotoFailure } from './useOccurrencePhoto.hook'

const EMPTY_DRAFT: OccurrenceDraft = {
  itemsByCode: new Map(),
  note: '',
  photo: undefined,
  typeId: '',
}

export type OccurrenceDraftController = Readonly<{
  draft: OccurrenceDraft
  isPreparingPhoto: boolean
  /** Falha de ler a foto escolhida: vira erro do campo, e o campo some quando a próxima foto entra. */
  photoFailure: OccurrencePhotoFailure | undefined
  photoPreviewUrl: string | undefined
  setItemQuantity: (input: Readonly<{ code: string; quantity: string }>) => void
  setItemUnit: (input: Readonly<{ code: string; unit: string }>) => void
  setNote: (note: string) => void
  setPhotoFile: (file: File) => void
  setTypeId: (typeId: string) => void
  toggleItem: (
    input: Readonly<{ allowsMultipleItems: boolean; product: CargoDocumentProduct }>,
  ) => void
}>

/**
 * O rascunho do formulário: tipo, itens marcados (na ordem em que foram marcados), observação e a foto já
 * reduzida. A foto preparada guarda o `id` da escolha — é ele que a impressão do envio usa para saber que
 * é a mesma tentativa. A URL de pré-visualização é do hook e é revogada ao trocar e ao fechar.
 */
export function useOccurrenceDraft(): OccurrenceDraftController {
  const [draft, setDraft] = useState<OccurrenceDraft>(EMPTY_DRAFT)
  const photo = useOccurrencePhoto((prepared) =>
    setDraft((current) => ({ ...current, photo: prepared })),
  )

  return {
    draft,
    isPreparingPhoto: photo.isPreparing,
    photoFailure: photo.failure,
    photoPreviewUrl: photo.previewUrl,
    setItemQuantity: ({ code, quantity }) =>
      setDraft((current) => withItem({ code, current, patch: { quantity } })),
    setItemUnit: ({ code, unit }) =>
      setDraft((current) => withItem({ code, current, patch: { unit } })),
    setNote: (note) => setDraft((current) => ({ ...current, note })),
    setPhotoFile: photo.setFile,
    setTypeId: (typeId) => setDraft((current) => ({ ...current, typeId })),
    toggleItem: ({ allowsMultipleItems, product }) =>
      setDraft((current) => ({
        ...current,
        itemsByCode: toggleOccurrenceItem({
          allowsMultipleItems,
          items: current.itemsByCode,
          product,
        }),
      })),
  }
}

function withItem(
  input: Readonly<{
    code: string
    current: OccurrenceDraft
    patch: Partial<{ quantity: string; unit: string }>
  }>,
): OccurrenceDraft {
  const item = input.current.itemsByCode.get(input.code)
  if (item === undefined) return input.current
  return {
    ...input.current,
    itemsByCode: new Map([...input.current.itemsByCode, [input.code, { ...item, ...input.patch }]]),
  }
}
