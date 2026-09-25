/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDriverTripClient, type LocationConsent } from '../shared/driverTripClient.service'

export const LOCATION_CONSENT_QUERY_KEY = ['driver-trip', 'location-consent'] as const

export type LocationConsentState = Readonly<{
  /** Ligado só com `acceptedAt` lido do servidor — carregando ou com falha, fica desligado. */
  hasConsent: boolean
  isFailed: boolean
  isLoading: boolean
  isSaveFailed: boolean
  isSaving: boolean
  setConsent: (accepted: boolean) => void
}>

/**
 * Spec 189 T7.5 (ADR-0075 §8): o interruptor do Perfil e o rastreamento da tela da viagem leem a
 * mesma consulta. Desligar vale **na hora**, antes da resposta do `PUT`: quem acabou de dizer que
 * não quer ser seguido não espera a rede para o GPS parar.
 */
export function useLocationConsent(): LocationConsentState {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryFn: () => getDriverTripClient().readLocationConsent(),
    queryKey: LOCATION_CONSENT_QUERY_KEY,
  })
  const mutation = useMutation({
    mutationFn: (accepted: boolean) => getDriverTripClient().setLocationConsent(accepted),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: LOCATION_CONSENT_QUERY_KEY })
    },
    onMutate: (accepted) => {
      if (!accepted) {
        queryClient.setQueryData<LocationConsent>(LOCATION_CONSENT_QUERY_KEY, { acceptedAt: null })
      }
    },
    onSuccess: (consent) => {
      queryClient.setQueryData<LocationConsent>(LOCATION_CONSENT_QUERY_KEY, consent)
    },
  })

  return {
    hasConsent: query.data !== undefined && query.data.acceptedAt !== null,
    isFailed: query.isError,
    isLoading: query.isLoading,
    isSaveFailed: mutation.isError,
    isSaving: mutation.isPending,
    setConsent: (accepted) => mutation.mutate(accepted),
  }
}
