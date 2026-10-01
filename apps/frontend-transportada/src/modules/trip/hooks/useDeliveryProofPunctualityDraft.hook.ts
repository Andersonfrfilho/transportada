/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DELIVERY_PROOF_PUNCTUALITY_FIELDS,
  isDeliveryProofPunctualityValue,
  resolvePunctualityFieldValue,
  type CompanyDeliveryProofSettings,
  type DeliveryProofPunctualityField,
  type DeliveryProofPunctualitySettings,
} from '../shared/deliveryProofSettings.service'

type DeliveryProofPunctualityDraft = Readonly<{
  draft: Partial<Record<DeliveryProofPunctualityField, string>>
  general: DeliveryProofPunctualitySettings
  isValid: boolean
  resolveValue: (field: DeliveryProofPunctualityField) => number
  setField: (field: DeliveryProofPunctualityField, raw: string) => void
}>

export function useDeliveryProofPunctualityDraft(
  settings: CompanyDeliveryProofSettings | undefined,
): DeliveryProofPunctualityDraft {
  /** RF7: os cinco parâmetros da nota — texto no campo, para deixar dígito parcial sem travar. */
  const [draft, setDraft] = useState<Partial<Record<DeliveryProofPunctualityField, string>>>({})
  const general = settings ?? DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS

  function resolveValue(field: DeliveryProofPunctualityField): number {
    return resolvePunctualityFieldValue({ draftValue: draft[field], fallback: general[field] })
  }

  const isValid = DELIVERY_PROOF_PUNCTUALITY_FIELDS.every((field) =>
    isDeliveryProofPunctualityValue(field, resolveValue(field)),
  )

  function setField(field: DeliveryProofPunctualityField, raw: string): void {
    setDraft((current) => ({ ...current, [field]: raw }))
  }

  return { draft, general, isValid, resolveValue, setField }
}
