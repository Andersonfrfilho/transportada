/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteOccurrencePhraseKey } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'

/** Os códigos que o `GET` usa para dizer "este tipo não oferece o botão" (tipo `off`, encaminhamento desligado). */
const HIDDEN_STATUSES: readonly number[] = [403, 404, 409]

/**
 * Spec 279 RF6/RF9: o botão só aparece depois que o boleto da contratante chegou ao motorista — a frase
 * `contractor_reply_delivered` que a lista da rota devolve quando o tipo fecha sozinho com a entrega (spec 276).
 * Quem decide se o *tipo* oferece o envio é a API (`GET` com `409`); aqui só o momento.
 */
export function hasBoletoArrived(phraseKey: RouteOccurrencePhraseKey | null | undefined): boolean {
  return phraseKey === 'contractor_reply_delivered'
}

/** `true` quando a recusa do `GET` quer dizer "sem botão" (e não "tente de novo"). */
export function isButtonHiddenByServer(status: number | undefined): boolean {
  return status !== undefined && HIDDEN_STATUSES.includes(status)
}

/** Só o primeiro endereço válido interessa; a validação final é da API (D4), o front só evita o toque em vão. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u

export function looksLikeEmailAddress(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim())
}
