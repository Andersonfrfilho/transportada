/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { USERS_REVEAL_PERMISSION } from '../shared/companyUsers.constant'
import type { RevealedCompanyUser } from '../shared/companyUsers.types'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export type CompanyUserRevealState = {
  readonly canReveal: boolean
  readonly errorCode: string | undefined
  readonly isPending: boolean
  readonly revealed: ReadonlyMap<string, RevealedCompanyUser>
  copy: (value: string) => Promise<boolean>
  hide: () => void
  /** Esconder uma pessoa só. "Esconder tudo" era a única saída, e apagava o que ainda se lia. */
  hideOne: (userId: string) => void
  reveal: (
    userIds: readonly string[],
    options?: Readonly<{ includeRealm: boolean }>,
  ) => Promise<void>
}

/**
 * O que foi revelado vive no estado da tela e morre com ela: guardar em `localStorage` deixaria CPF
 * em claro no navegador depois que a pessoa fechou a página, e a permissão foi dada para ver agora,
 * não para acumular. "Esconder" também é botão, porque revelar é ação com trilha de auditoria.
 */
export function useCompanyUserReveal(
  input: Readonly<{ permissions: readonly string[]; client?: CompanyUsersClient }>,
): CompanyUserRevealState {
  const client = input.client ?? getCompanyUsersClient()
  const canReveal = input.permissions.includes(USERS_REVEAL_PERMISSION)
  const [revealed, setRevealed] = useState<ReadonlyMap<string, RevealedCompanyUser>>(new Map())
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)
  const [isPending, setPending] = useState(false)

  async function reveal(
    userIds: readonly string[],
    options?: Readonly<{ includeRealm: boolean }>,
  ): Promise<void> {
    /**
     * Pedir de novo o que já está na tela gastaria uma linha de auditoria sobre nada — salvo quando
     * se pede o realm e o que está guardado veio sem ele: aí falta metade do que se quer ver.
     */
    const pending = userIds.filter((userId) => {
      const current = revealed.get(userId)
      if (current === undefined) return true
      return options?.includeRealm === true && current.realmEmail === undefined
    })
    if (!canReveal || pending.length === 0) return

    setPending(true)
    setErrorCode(undefined)
    try {
      const users = await client.revealUsers({
        userIds: pending,
        ...(options?.includeRealm === true ? { includeRealm: true } : {}),
      })
      setRevealed((current) => {
        const next = new Map(current)
        for (const user of users) next.set(user.userId, user)
        return next
      })
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : 'UNKNOWN')
    } finally {
      setPending(false)
    }
  }

  return {
    canReveal,
    /** A área de transferência falha em contexto sem permissão; quem chama precisa saber. */
    copy: async (value) => {
      try {
        await navigator.clipboard.writeText(value)
        return true
      } catch {
        return false
      }
    },
    errorCode,
    hide: () => {
      setRevealed(new Map())
      setErrorCode(undefined)
    },
    hideOne: (userId) =>
      setRevealed((current) => {
        const next = new Map(current)
        next.delete(userId)
        return next
      }),
    isPending,
    revealed,
    reveal,
  }
}
