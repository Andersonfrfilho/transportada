/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário da API (`delivery-client-email.constant.ts`, spec 279 D1). */
export const DELIVERY_CLIENT_EMAIL_PURPOSES = ['boleto', 'invoice', 'finance', 'general'] as const
export type DeliveryClientEmailPurpose = (typeof DELIVERY_CLIENT_EMAIL_PURPOSES)[number]

export const DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS = ['office', 'driver'] as const
export type DeliveryClientEmailAuthorKind = (typeof DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS)[number]

export const DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE = 10
export const DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH = 254
export const DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH = 60

/** O endereço só chega mascarado: o claro mora no banco e no corpo do POST. */
export type DeliveryClientEmail = Readonly<{
  addressMasked: string
  createdAt: string
  createdByKind: DeliveryClientEmailAuthorKind
  id: string
  label: string
  purpose: DeliveryClientEmailPurpose
}>

export type DeliveryClientEmailCreateBody = Readonly<{
  address: string
  label: string
  purpose: DeliveryClientEmailPurpose
}>
