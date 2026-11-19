/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getTripOccurrenceFeedClient } from './tripOccurrenceFeed.query'

/** Spec 343 (T6a): manda o endereço correto ao grupo de WhatsApp do motorista. Não muda o detalhe da ocorrência. */
export function useSendDriverAddressToWhatsAppGroup() {
  const client = getTripOccurrenceFeedClient()
  return useMutation({ mutationFn: client.sendDriverAddressToWhatsAppGroup })
}

/** Spec 343 (T6a): o ponto no mapa do endereço digitado, para o pino. Nada é gravado. */
export function useFindDriverAddressPoint() {
  const client = getTripOccurrenceFeedClient()
  return useMutation({ mutationFn: client.findDriverAddressPoint })
}

/** Spec 343: o resultado da ocorrência ao grupo de WhatsApp do motorista. Não muda o detalhe da ocorrência. */
export function useSendDriverResultToWhatsAppGroup() {
  const client = getTripOccurrenceFeedClient()
  return useMutation({ mutationFn: client.sendDriverResultToWhatsAppGroup })
}
