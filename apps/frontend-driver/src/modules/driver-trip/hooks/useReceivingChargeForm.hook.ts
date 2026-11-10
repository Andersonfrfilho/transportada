/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type {
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverPhotoSlot,
  DriverPixKeyType,
  ReceivingChargeMode,
  ReceivingChargePaidBy,
} from '../shared/driverTrip.types'
import { isOccurrencePhotoWithinLimit } from '../shared/notDelivered.service'
import { maskMoneyInput } from '../shared/occurrenceMoneyMask.service'
import { reduceOccurrencePhotoToJpeg } from '../shared/occurrencePhotoImage.service'
import {
  EMPTY_RECEIVING_CHARGE_DRAFT,
  hasDocumentChoice,
  isReceivingChargeType,
  listMissingReceivingCharge,
  listOrderedSlots,
  type ReceivingChargeDraft,
  type ReceivingChargeMissing,
} from '../shared/receivingCharge.service'

/** O que acontece com a foto de uma vaga antes de ela entrar no rascunho. */
export type SlotPhotoState = 'failed' | 'idle' | 'reading' | 'too-large'

export type ReceivingChargeForm = Readonly<{
  documentIds: readonly string[]
  draft: ReceivingChargeDraft
  handleAmountChange: (text: string) => void
  handleDocumentAmountChange: (documentId: string, text: string) => void
  handleDocumentToggle: (documentId: string) => void
  handleModeChange: (mode: ReceivingChargeMode) => void
  handlePaidByChange: (paidBy: ReceivingChargePaidBy) => void
  handlePixKeyChange: (key: string) => void
  handlePixKeyTypeChange: (type: DriverPixKeyType) => void
  handleSlotPhotoSelect: (slotKey: string, file: File) => void
  hasDocumentChoice: boolean
  missing: readonly ReceivingChargeMissing[]
  slotPhotoStates: Readonly<Record<string, SlotPhotoState>>
  slotPreviewUrls: Readonly<Record<string, string>>
  slots: readonly DriverPhotoSlot[]
}>

/** Uma URL `blob:` por foto de vaga: criada no efeito e liberada ao trocar a foto ou sair da tela. */
function useSlotPreviewUrls(
  photos: Readonly<Record<string, DriverOccurrencePhoto>>,
): Readonly<Record<string, string>> {
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({})
  useEffect(() => {
    const created = Object.fromEntries(
      Object.entries(photos).map(([slotKey, photo]) => [slotKey, URL.createObjectURL(photo.blob)]),
    )
    setUrls(created)
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url)
    }
  }, [photos])
  return urls
}

/**
 * Spec 317 (RF9): o estado do formulário da cobrança no recebimento — valor, notas e modo, quem pagou, PIX e **uma foto
 * por vaga** que o servidor mandou. Só existe para o tipo com vagas; o gate (`listMissingReceivingCharge`) lê o que está no
 * aparelho, e a API recobra no registro.
 */
export function useReceivingChargeForm(input: {
  readonly documentIds: readonly string[]
  readonly type: DriverOccurrenceType | undefined
}): ReceivingChargeForm | undefined {
  const [draft, setDraft] = useState<ReceivingChargeDraft>(EMPTY_RECEIVING_CHARGE_DRAFT)
  const [photoStates, setPhotoStates] = useState<Readonly<Record<string, SlotPhotoState>>>({})
  const slotPreviewUrls = useSlotPreviewUrls(draft.slotPhotos)
  const { documentIds, type } = input

  if (type === undefined || !isReceivingChargeType(type)) return undefined
  const slots = listOrderedSlots(type)
  function patch(next: Partial<ReceivingChargeDraft>): void {
    setDraft((current) => ({ ...current, ...next }))
  }

  async function readSlotPhoto(slotKey: string, file: File): Promise<void> {
    setPhotoStates((current) => ({ ...current, [slotKey]: 'reading' }))
    try {
      const reduced = await reduceOccurrencePhotoToJpeg(file)
      if (!isOccurrencePhotoWithinLimit(reduced.blob)) {
        setPhotoStates((current) => ({ ...current, [slotKey]: 'too-large' }))
        return
      }
      setDraft((current) => ({
        ...current,
        slotPhotos: { ...current.slotPhotos, [slotKey]: reduced },
      }))
      setPhotoStates((current) => ({ ...current, [slotKey]: 'idle' }))
    } catch {
      setPhotoStates((current) => ({ ...current, [slotKey]: 'failed' }))
    }
  }

  return {
    documentIds,
    draft,
    handleAmountChange: (text) =>
      patch({ amountText: maskMoneyInput({ previousText: draft.amountText, text }) }),
    handleDocumentAmountChange: (documentId, text) =>
      patch({
        documentAmountTexts: {
          ...draft.documentAmountTexts,
          [documentId]: maskMoneyInput({
            previousText: draft.documentAmountTexts[documentId] ?? '',
            text,
          }),
        },
      }),
    handleDocumentToggle: (documentId) =>
      patch({
        selectedDocumentIds: draft.selectedDocumentIds.includes(documentId)
          ? draft.selectedDocumentIds.filter((id) => id !== documentId)
          : [...draft.selectedDocumentIds, documentId],
      }),
    handleModeChange: (mode) => patch({ mode }),
    handlePaidByChange: (paidBy) => patch({ paidBy }),
    handlePixKeyChange: (pixKey) => patch({ pixKey }),
    handlePixKeyTypeChange: (pixKeyType) => patch({ pixKeyType }),
    handleSlotPhotoSelect: (slotKey, file) => void readSlotPhoto(slotKey, file),
    hasDocumentChoice: hasDocumentChoice({ documentIds }),
    missing: listMissingReceivingCharge({
      context: { documentIds, slots },
      draft,
    }),
    slotPhotoStates: photoStates,
    slotPreviewUrls,
    slots,
  }
}
