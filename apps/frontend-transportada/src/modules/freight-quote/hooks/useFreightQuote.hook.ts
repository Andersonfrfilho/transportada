/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getFreightQuoteClient } from '../shared/freightQuoteClient.service'
import type { FreightQuoteInput, FreightQuoteSettingsValues } from '../shared/freightQuote.types'

const FREIGHT_QUOTE_QUERY_KEY = 'freight-quote-settings'

/** Parâmetros da empresa: lê, grava e volta aos valores iniciais; cada escrita invalida a leitura. */
export function useFreightQuoteSettings(input: Readonly<{ enabled: boolean }>) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [FREIGHT_QUOTE_QUERY_KEY] })
  const query = useQuery({
    enabled: input.enabled,
    queryFn: () => getFreightQuoteClient().getSettings(),
    queryKey: [FREIGHT_QUOTE_QUERY_KEY],
  })
  const save = useMutation({
    mutationFn: (values: FreightQuoteSettingsValues) =>
      getFreightQuoteClient().saveSettings(values),
    onSuccess: invalidate,
  })
  const clear = useMutation({
    mutationFn: () => getFreightQuoteClient().clearSettings(),
    onSuccess: invalidate,
  })
  return { clear, query, save }
}

/** O orçamento é consulta: nada é gravado, então não há o que invalidar. */
export function useCalculateFreightQuote() {
  return useMutation({
    mutationFn: (input: FreightQuoteInput) => getFreightQuoteClient().calculate(input),
  })
}
