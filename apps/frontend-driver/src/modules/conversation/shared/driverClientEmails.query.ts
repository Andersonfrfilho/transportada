/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { readDriverClientEmails } from './driverClientEmails.service'

export const DRIVER_CLIENT_EMAILS_QUERY_KEY = ['driver-conversations', 'client-emails'] as const

/** Sem rede ou com o tipo desligado (`409`) a seção some: o motorista não precisa saber o motivo (T4). */
export function useDriverClientEmailsQuery(input: Readonly<{ canSync: boolean; id: string }>) {
  return useQuery({
    enabled: input.canSync,
    queryFn: () => readDriverClientEmails(input.id),
    queryKey: [...DRIVER_CLIENT_EMAILS_QUERY_KEY, input.id],
    retry: false,
  })
}
