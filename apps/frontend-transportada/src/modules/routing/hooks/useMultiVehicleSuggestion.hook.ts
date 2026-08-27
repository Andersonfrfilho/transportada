/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  AcceptedMultiVehicleSuggestion,
  RouteSuggestionClient,
} from '../shared/routeSuggestionClient.service'
import type { RouteSuggestion } from '../shared/routeSuggestion.types'
import {
  canOpenMultiVehicleSuggestion,
  canRequestMultiVehicle,
} from '../shared/multiVehicleSuggestion.service'
import { getRouteSuggestionClient } from './useRouteSuggestion.hook'

/** Mesmo ritmo do painel da viagem: o worker resolve, e a tela pergunta de novo. */
const POLL_INTERVAL_MILLISECONDS = 2_000
const SETTLED_STATUSES = new Set(['accepted', 'failed', 'ready', 'rejected', 'stale'])

export type MultiVehicleSuggestionController = Readonly<{
  accepted: AcceptedMultiVehicleSuggestion | null
  canOpen: boolean
  canRequest: boolean
  close: () => void
  accept: () => Promise<void>
  errorCode: string | null
  isDeciding: boolean
  isOpen: boolean
  isRequesting: boolean
  open: () => void
  reject: () => Promise<void>
  request: () => Promise<void>
  selectedVehicleIds: readonly string[]
  setSelectedVehicleIds: (vehicleIds: readonly string[]) => void
  suggestion: RouteSuggestion | null
}>

/**
 * Spec 058 P2: o operador seleciona notas na tabela, escolhe a frota e pede a sugestão. O que este
 * hook guarda é **a conversa**, não o roteiro: o roteiro vem do servidor, e a decisão de aceitar
 * cria viagens de verdade — por isso o resultado do aceite fica aqui, para a tela dizer quais
 * viagens nasceram em vez de sumir com o painel.
 */
export function useMultiVehicleSuggestion(input: {
  readonly client?: RouteSuggestionClient
  readonly documentIds: readonly string[]
  readonly onAccepted?: () => void
  readonly permissions: readonly string[]
}): MultiVehicleSuggestionController {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<readonly string[]>([])
  const [suggestion, setSuggestion] = useState<RouteSuggestion | null>(null)
  const [accepted, setAccepted] = useState<AcceptedMultiVehicleSuggestion | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const clientRef = useRef<RouteSuggestionClient | null>(input.client ?? null)

  function resolveClient(): RouteSuggestionClient {
    clientRef.current ??= getRouteSuggestionClient()
    return clientRef.current
  }

  const close = useCallback((): void => {
    setIsOpen(false)
    setSuggestion(null)
    setAccepted(null)
    setErrorCode(null)
  }, [])

  const request = useCallback(async (): Promise<void> => {
    setErrorCode(null)
    setIsRequesting(true)
    try {
      setSuggestion(
        await resolveClient().createMultiVehicle({
          nfeDocumentIds: input.documentIds,
          vehicleIds: selectedVehicleIds,
        }),
      )
    } catch (cause) {
      setErrorCode(toErrorCode(cause))
    } finally {
      setIsRequesting(false)
    }
  }, [input.documentIds, selectedVehicleIds])

  /** O poll para quando a sugestão assenta — depois disso ele seria tráfego por nada. */
  useEffect(() => {
    if (suggestion === null || SETTLED_STATUSES.has(suggestion.status)) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const fresh = await resolveClient().readMultiVehicle({ suggestionId: suggestion.id })
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
  }, [suggestion])

  const accept = useCallback(async (): Promise<void> => {
    if (suggestion === null) return
    setErrorCode(null)
    setIsDeciding(true)
    try {
      const result = await resolveClient().acceptMultiVehicle({ suggestionId: suggestion.id })
      setAccepted(result)
      setSuggestion(result.suggestion)
      /**
       * A seleção da tabela é limpa **depois** do aceite, não antes: as notas viraram viagem, e
       * mantê-las marcadas convidaria a pedir outra sugestão para as mesmas notas — que a API
       * recusaria, agora que elas estão em viagem.
       */
      input.onAccepted?.()
    } catch (cause) {
      setErrorCode(toErrorCode(cause))
    } finally {
      setIsDeciding(false)
    }
  }, [input, suggestion])

  const reject = useCallback(async (): Promise<void> => {
    if (suggestion === null) return
    setErrorCode(null)
    setIsDeciding(true)
    try {
      setSuggestion(await resolveClient().rejectMultiVehicle({ suggestionId: suggestion.id }))
    } catch (cause) {
      setErrorCode(toErrorCode(cause))
    } finally {
      setIsDeciding(false)
    }
  }, [suggestion])

  return {
    accept,
    accepted,
    canOpen: canOpenMultiVehicleSuggestion(input.permissions),
    canRequest: canRequestMultiVehicle({
      documentIds: input.documentIds,
      vehicleIds: selectedVehicleIds,
    }),
    close,
    errorCode,
    isDeciding,
    isOpen,
    isRequesting,
    open: () => setIsOpen(true),
    reject,
    request,
    selectedVehicleIds,
    setSelectedVehicleIds,
    suggestion,
  }
}

/** O código sobe como veio: é ele que a tela traduz — `ROUTE_SUGGESTION_DOCUMENT_UNAVAILABLE` inclusive. */
function toErrorCode(cause: unknown): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : 'REQUEST_FAILED'
}
