/* Copyright (c) 2026 Ada Technology. MIT License. */

export type WhatsAppPhoneStatus = 'expired' | 'none' | 'pending' | 'verified'

export type WhatsAppPhonePendingRequest = Readonly<{
  expiresAt: string
}>

/** Espelha o `GET /me/whatsapp-phone` da API (spec 144 T017 Passo 0) — o código nunca está aqui. */
export type WhatsAppPhoneState = Readonly<{
  expiresAt: string | undefined
  pendingRequest: WhatsAppPhonePendingRequest | undefined
  phone: string | undefined
  status: WhatsAppPhoneStatus
  verifiedAt: string | undefined
}>

/** O que `POST /me/whatsapp-phone/verification` devolve — o código só existe aqui, uma vez. */
export type WhatsAppPhoneVerification = Readonly<{
  code: string
  companyNumber: string
  expiresAt: string
}>
