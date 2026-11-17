/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getTripOccurrenceFeedClient } from './tripOccurrenceFeed.query'

/** Spec 317 (E13): manda o comprovante registrado ao WhatsApp do motorista. Não muda o detalhe da ocorrência. */
export function useSendDriverPayoutReceiptByWhatsApp() {
  const client = getTripOccurrenceFeedClient()
  return useMutation({ mutationFn: client.sendDriverPayoutReceiptByWhatsApp })
}
