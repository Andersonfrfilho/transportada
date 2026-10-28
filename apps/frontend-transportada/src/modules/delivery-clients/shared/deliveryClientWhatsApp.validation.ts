/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS } from './deliveryClientEmails.types'
import type { DeliveryClientWhatsApp } from './deliveryClientWhatsApp.types'

/**
 * Espelha só o suficiente da API (spec 281 D4) para não mandar lixo: dígitos e a pontuação comum de telefone, com ao
 * menos 10 dígitos (DDD + número). A normalização para E.164 e a validação final são da API.
 */
const NUMBER_CHARACTERS = /^[\d\s+().-]+$/u

export function isDeliveryClientWhatsAppNumberValid(raw: string): boolean {
  const typed = raw.trim()
  if (typed.length === 0 || typed.length > 40 || !NUMBER_CHARACTERS.test(typed)) return false
  const digits = typed.replaceAll(/\D/gu, '').length
  return digits >= 10 && digits <= 15
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function itemFromApi(value: unknown): DeliveryClientWhatsApp | null {
  if (!isRecord(value)) return null
  const { createdAt, createdByKind, id, label, numberMasked } = value
  if (
    typeof createdAt !== 'string' ||
    typeof id !== 'string' ||
    typeof label !== 'string' ||
    typeof numberMasked !== 'string' ||
    typeof createdByKind !== 'string' ||
    !(DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS as readonly string[]).includes(createdByKind)
  ) {
    return null
  }
  return {
    createdAt,
    createdByKind: createdByKind as DeliveryClientWhatsApp['createdByKind'],
    id,
    label,
    numberMasked,
  }
}

/** Um item malformado derruba a resposta inteira: lista pela metade esconderia número do operador. */
export function deliveryClientWhatsAppListFromApi(
  payload: unknown,
): readonly DeliveryClientWhatsApp[] {
  const data = isRecord(payload) ? payload.data : undefined
  if (!Array.isArray(data)) throw new Error('RESPONSE_INVALID')
  return data.map((item) => {
    const parsed = itemFromApi(item)
    if (parsed === null) throw new Error('RESPONSE_INVALID')
    return parsed
  })
}

export function deliveryClientWhatsAppFromApi(payload: unknown): DeliveryClientWhatsApp {
  const parsed = itemFromApi(isRecord(payload) ? payload.data : undefined)
  if (parsed === null) throw new Error('RESPONSE_INVALID')
  return parsed
}
