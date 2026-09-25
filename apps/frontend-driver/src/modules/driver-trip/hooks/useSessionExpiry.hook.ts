/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { captureRegistry, createIdleGate } from '../shared/captureRegistry.service'

/** Um portão para a página inteira: "Entrar de novo" navega, e navegar espera a captura fechar. */
const REAUTHENTICATION_GATE = createIdleGate(captureRegistry)

export type SessionExpiryState = 'active' | 'expired' | 'waiting-capture'

export type SessionExpiry = Readonly<{
  reauthenticate: () => void
  state: SessionExpiryState
}>

/**
 * Spec 189 T9.2 (A1): o provedor avisa quando o refresh é recusado (`400`). A tela mostra "Entrar
 * de novo" em vez de redirecionar sozinha — redirecionar abortaria o `fetch` em voo e jogaria fora
 * a captura aberta. O toque só navega com o registro de capturas ocioso.
 */
export function useSessionExpiry(canSync: boolean): SessionExpiry {
  const [state, setState] = useState<SessionExpiryState>('active')

  useEffect(() => {
    if (!canSync) return undefined
    return getKeycloakAuthProvider().onSessionExpired(() => {
      setState((current) => (current === 'active' ? 'expired' : current))
    })
  }, [canSync])

  function reauthenticate(): void {
    const outcome = REAUTHENTICATION_GATE.request(
      () => void getKeycloakAuthProvider().restartAuthentication(),
    )
    if (outcome === 'deferred') setState('waiting-capture')
  }

  return { reauthenticate, state }
}
