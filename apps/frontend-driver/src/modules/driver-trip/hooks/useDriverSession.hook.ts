/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import type { StoredTripSnapshot } from '../shared/tripSnapshot.service'

/**
 * Quem está usando a app e o que ela pode fazer agora (plan D4/D5). O boot decide e a casca
 * entrega por contexto — o módulo da viagem, copiado do painel, só lê.
 */
export type DriverSession = Readonly<{
  /**
   * `false` no boot sem rede (`offline-snapshot`): a viagem é o snapshot, os toques enfileiram, e
   * a drenagem e a leitura da API esperam o token.
   */
  canSync: boolean
  /** O snapshot guardado do dono da sessão — dado inicial da tela, com a hora em que foi salvo. */
  initialSnapshot: StoredTripSnapshot | undefined
  /** `SHA-256(sub)`: o dono do snapshot e de cada item da fila. */
  subHash: string
}>

export const DriverSessionContext = createContext<DriverSession | undefined>(undefined)

export function useDriverSession(): DriverSession {
  const session = useContext(DriverSessionContext)
  if (session === undefined) throw new Error('DRIVER_SESSION_MISSING')
  return session
}
