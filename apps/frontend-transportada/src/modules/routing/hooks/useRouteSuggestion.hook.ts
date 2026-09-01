/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type { RefineAddressFeedback } from '../components/RouteSuggestionPanel.component'
import type { RouteSuggestion } from '../shared/routeSuggestion.types'
import {
  createRouteSuggestionClient,
  type RouteSuggestionClient,
} from '../shared/routeSuggestionClient.service'

/** Enquanto o worker resolve, a tela pergunta de novo. Ritmo do humano, não do servidor. */
const POLL_INTERVAL_MILLISECONDS = 2_000
const SETTLED_STATUSES = new Set(['accepted', 'failed', 'ready', 'rejected', 'stale'])

export type RouteSuggestionController = Readonly<{
  accept: () => Promise<void>
  errorCode: string | null
  isDeciding: boolean
  isRequesting: boolean
  /**
   * O degrau 2 da escada (spec 069). Ela **nunca lança**: o conferente já marcou, e um estouro no
   * lugar de um aviso o faria concluir que a marca está quebrada — que é o que a RF5 impede.
   */
  refineAddress: (addressKey: string) => Promise<RefineAddressFeedback>
  reject: () => Promise<void>
  request: () => Promise<void>
  suggestion: RouteSuggestion | null
}>

export function getRouteSuggestionClient(): RouteSuggestionClient {
  return createRouteSuggestionClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * ADR-0044 §7: a sugestão nasce `queued` e o worker a resolve — a tela **acompanha por poll**, não
 * espera a resposta do POST. Um `await` que só voltasse pronto prenderia o conferente numa aba
 * carregando por dezenas de segundos, e é exatamente o que responder `202` evita.
 */
export function useRouteSuggestion(input: {
  readonly client?: RouteSuggestionClient
  readonly tripId: string
}): RouteSuggestionController {
  const [suggestion, setSuggestion] = useState<RouteSuggestion | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const clientRef = useRef<RouteSuggestionClient | null>(input.client ?? null)

  function resolveClient(): RouteSuggestionClient {
    clientRef.current ??= getRouteSuggestionClient()
    return clientRef.current
  }

  const request = useCallback(async (): Promise<void> => {
    setErrorCode(null)
    setIsRequesting(true)
    try {
      setSuggestion(await resolveClient().create({ tripId: input.tripId }))
    } catch (cause) {
      setErrorCode(toErrorCode(cause))
    } finally {
      setIsRequesting(false)
    }
  }, [input.tripId])

  /**
   * O poll para quando a sugestão assenta. Sem esse corte ele seguiria batendo na API depois de o
   * conferente já ter decidido — tráfego por nada, e uma tela que nunca fica quieta.
   */
  useEffect(() => {
    if (suggestion === null || SETTLED_STATUSES.has(suggestion.status)) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const fresh = await resolveClient().read({
            suggestionId: suggestion.id,
            tripId: input.tripId,
          })
          if (!cancelled) setSuggestion(fresh)
        } catch (cause) {
          if (!cancelled) setErrorCode(toErrorCode(cause))
        }
      })()
    }, POLL_INTERVAL_MILLISECONDS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [input.tripId, suggestion])

  const decide = useCallback(
    async (action: 'accept' | 'reject'): Promise<void> => {
      if (suggestion === null) return

      setErrorCode(null)
      setIsDeciding(true)
      try {
        const client = resolveClient()
        const decided =
          action === 'accept'
            ? await client.accept({ suggestionId: suggestion.id, tripId: input.tripId })
            : await client.reject({ suggestionId: suggestion.id, tripId: input.tripId })
        setSuggestion(decided)
      } catch (cause) {
        setErrorCode(toErrorCode(cause))
      } finally {
        setIsDeciding(false)
      }
    },
    [input.tripId, suggestion],
  )

  return {
    accept: () => decide('accept'),
    errorCode,
    isDeciding,
    isRequesting,
    refineAddress: async (addressKey) => {
      try {
        return (await resolveClient().refineAddress({ addressKey })).outcome
      } catch (error) {
        /** `429` é o teto por janela, e ele merece frase própria: tentar de novo agora não resolve. */
        return toErrorCode(error) === 'GEOCODING_REFINEMENT_QUOTA_EXCEEDED'
          ? 'quota_exceeded'
          : 'failed'
      }
    },
    reject: () => decide('reject'),
    request,
    suggestion,
  }
}

/**
 * O código do erro sobe como veio: é ele que a tela traduz. `ROUTING_MATRIX_UNAVAILABLE` vira a
 * frase que manda ordenar à mão, e trocá-lo por um genérico apagaria justamente essa instrução.
 */
function toErrorCode(cause: unknown): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : 'REQUEST_FAILED'
}
