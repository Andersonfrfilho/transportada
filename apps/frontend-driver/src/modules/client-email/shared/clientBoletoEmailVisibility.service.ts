/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import type { RouteOccurrencePhraseKey } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'

/** Os códigos que o `GET` usa para dizer "este tipo não oferece o botão" (tipo `off`, encaminhamento desligado). */
const HIDDEN_STATUSES: readonly number[] = [403, 404, 409]

/** ⚠️ Mesma lista do painel (`isContractorReplyBoletoAccepted`): o boleto já foi aceito pelo escritório. */
const BOLETO_ACCEPTED_STATUSES: readonly string[] = [
  'reply_received',
  'awaiting_operator',
  'delivered',
  'handled',
]

/** Os ids das ocorrências com boleto aceito, lidos do estado do retorno que a viagem do motorista já traz. */
export function collectBoletoAcceptedIds(trips: readonly DriverTrip[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const trip of trips) {
    for (const stop of trip.stops) {
      for (const document of stop.documents) {
        for (const occurrence of document.registeredOccurrences ?? []) {
          const status = occurrence.contractorReply?.status
          if (status !== undefined && BOLETO_ACCEPTED_STATUSES.includes(status)) {
            ids.add(occurrence.id)
          }
        }
      }
    }
  }
  return ids
}

/**
 * Spec 279 RF6/RF9: o botão só aparece com o boleto aceito, a mesma regra do painel (T5). A frase
 * `contractor_reply_delivered` da lista da rota também vale (a entrega implica o aceite). Quem decide se o *tipo*
 * oferece o envio é a API (`GET` com `409`); aqui só o momento.
 */
export function hasBoletoArrived(
  phraseKey: RouteOccurrencePhraseKey | null | undefined,
  acceptedIds?: ReadonlySet<string>,
  occurrenceId?: string,
): boolean {
  if (phraseKey === 'contractor_reply_delivered') return true
  return occurrenceId !== undefined && acceptedIds?.has(occurrenceId) === true
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
