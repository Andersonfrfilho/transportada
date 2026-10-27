/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryClientEmailAuthorKind } from './deliveryClientEmails.types'

/** O número só chega mascarado: o claro mora no banco e no corpo do POST/PATCH (spec 281 T8b). */
export type DeliveryClientWhatsApp = Readonly<{
  createdAt: string
  createdByKind: DeliveryClientEmailAuthorKind
  id: string
  label: string
  numberMasked: string
}>
