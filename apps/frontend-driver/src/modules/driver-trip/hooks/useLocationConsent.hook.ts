/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  DriverTripRequestError,
  getDriverTripClient,
  type LocationConsent,
} from '../shared/driverTripClient.service'

/**
 * Code B5 (spec 189 T9.2): sem cadastro de motorista é configuração pendente do escritório, não
 * um problema de rede — tentar de novo sozinho nunca vira `acceptedAt` e só gasta o teto novo do
 * `GET` (segurança M3).
 */
const DRIVER_NOT_REGISTERED_STATUS = 409

export const LOCATION_CONSENT_QUERY_KEY = ['driver-trip', 'location-consent'] as const

export type LocationConsentState = Readonly<{
  /** Ligado só com `acceptedAt` lido do servidor — carregando ou com falha, fica desligado. */
  hasConsent: boolean
  isFailed: boolean
  isLoading: boolean
  /**
   * Segurança L3 (spec 189 T9.2): a última tentativa de desligar não chegou ao servidor. O
   * interruptor mesmo assim mostra desligado (`hasConsent` abaixo já reflete isso) — é o
   * `saveFailed` com esta marca que diferencia "desligado de verdade" de "tentando desligar".
   */
  isRevokeFailed: boolean
  isSaveFailed: boolean
  isSaving: boolean
  setConsent: (accepted: boolean) => void
}>

/**
 * Spec 189 T7.5 (ADR-0075 §8): o interruptor do Perfil e o rastreamento da tela da viagem leem a
 * mesma consulta. Desligar vale **na hora**, antes da resposta do `PUT`: quem acabou de dizer que
 * não quer ser seguido não espera a rede para o GPS parar.
 *
 * Segurança L3/Code M5 (spec 189 T9.2): a versão anterior só otimizava a leitura — se o `PUT` de
 * desligar falhasse, o `onError` invalidava a consulta e o refetch trazia de volta o `acceptedAt`
 * que o servidor nunca apagou, religando o interruptor sozinho sem o motorista tocar em nada.
 * `isLocallyRevoked` fixa "desligado" na tela até um `PUT` **bem-sucedido** confirmar, tentativa
 * falha ou não.
 */
export function useLocationConsent(): LocationConsentState {
  const queryClient = useQueryClient()
  const [isLocallyRevoked, setIsLocallyRevoked] = useState(false)
  const query = useQuery({
    queryFn: () => getDriverTripClient().readLocationConsent(),
    queryKey: LOCATION_CONSENT_QUERY_KEY,
    retry: (failureCount, error) =>
      error instanceof DriverTripRequestError && error.status === DRIVER_NOT_REGISTERED_STATUS
        ? false
        : failureCount < 3,
  })
  const mutation = useMutation({
    mutationFn: (accepted: boolean) => getDriverTripClient().setLocationConsent(accepted),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: LOCATION_CONSENT_QUERY_KEY })
    },
    onMutate: async (accepted) => {
      // Sem isto, um refetch em voo (foco de janela, `invalidateQueries` de uma tentativa anterior)
      // pode chegar depois e sobrescrever o `setQueryData` otimista abaixo com o estado velho.
      await queryClient.cancelQueries({ queryKey: LOCATION_CONSENT_QUERY_KEY })
      if (!accepted) {
        setIsLocallyRevoked(true)
        queryClient.setQueryData<LocationConsent>(LOCATION_CONSENT_QUERY_KEY, { acceptedAt: null })
      }
    },
    onSuccess: (consent) => {
      setIsLocallyRevoked(false)
      queryClient.setQueryData<LocationConsent>(LOCATION_CONSENT_QUERY_KEY, consent)
    },
  })

  return {
    hasConsent: !isLocallyRevoked && query.data !== undefined && query.data.acceptedAt !== null,
    isFailed: query.isError,
    isLoading: query.isLoading,
    isRevokeFailed: mutation.isError && mutation.variables === false,
    isSaveFailed: mutation.isError,
    isSaving: mutation.isPending,
    setConsent: (accepted) => mutation.mutate(accepted),
  }
}
