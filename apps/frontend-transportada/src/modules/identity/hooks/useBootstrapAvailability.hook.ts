/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

export type BootstrapAvailabilityStatus = 'checking' | 'closed' | 'open'

type UseBootstrapAvailabilityInput = Readonly<{
  checkAvailability: () => Promise<boolean>
}>

/**
 * A página de primeiro acesso é servida para qualquer visitante, inclusive muito depois do arranque.
 * Quem decide se ela ainda faz sentido é a API; aqui só se obedece — e, fechada, sai para o login em
 * vez de oferecer um formulário que não tem como concluir. Isso é conforto de tela, não proteção:
 * a criação do administrador é barrada no `POST`, com token e trava no banco.
 */
export function useBootstrapAvailability({
  checkAvailability,
}: UseBootstrapAvailabilityInput): BootstrapAvailabilityStatus {
  const [status, setStatus] = useState<BootstrapAvailabilityStatus>('checking')

  useEffect(() => {
    let isMounted = true

    void checkAvailability().then((isAvailable) => {
      if (!isMounted) return
      setStatus(isAvailable ? 'open' : 'closed')
      if (!isAvailable) window.location.replace('/')
    })

    return () => {
      isMounted = false
    }
  }, [checkAvailability])

  return status
}
