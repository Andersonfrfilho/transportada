/* Cópia por valor de apps/frontend-transportada/src/modules/identity/shared/whatsappPhone.validation.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { WHATSAPP_PHONE_ERROR } from './whatsappPhone.constant'
import type {
  WhatsAppPhoneState,
  WhatsAppPhoneStatus,
  WhatsAppPhoneVerification,
} from './whatsappPhone.types'

const STATUSES: readonly WhatsAppPhoneStatus[] = ['expired', 'none', 'pending', 'verified']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStatus(value: unknown): value is WhatsAppPhoneStatus {
  return isString(value) && STATUSES.includes(value as WhatsAppPhoneStatus)
}

function invalid(): never {
  throw new Error(WHATSAPP_PHONE_ERROR.RESPONSE_INVALID)
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  return isString(source[key]) ? source[key] : undefined
}

/** O código nunca atravessa esta função: quem lê o `GET` não tem como receber o segredo por engano. */
export function toWhatsAppPhoneState(value: unknown): WhatsAppPhoneState {
  if (!isRecord(value) || !isStatus(value.status)) invalid()

  const pendingRequestSource = value.pendingRequest
  const pendingRequest =
    isRecord(pendingRequestSource) && isString(pendingRequestSource.expiresAt)
      ? { expiresAt: pendingRequestSource.expiresAt }
      : undefined

  return {
    expiresAt: readOptionalString(value, 'expiresAt'),
    pendingRequest,
    phone: readOptionalString(value, 'phone'),
    status: value.status,
    verifiedAt: readOptionalString(value, 'verifiedAt'),
  }
}

export function toWhatsAppPhoneVerification(value: unknown): WhatsAppPhoneVerification {
  if (
    !isRecord(value) ||
    !isString(value.code) ||
    !isString(value.companyNumber) ||
    !isString(value.expiresAt)
  ) {
    invalid()
  }

  return { code: value.code, companyNumber: value.companyNumber, expiresAt: value.expiresAt }
}
