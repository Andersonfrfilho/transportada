/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationsProps } from '@adatechnology/conversations-ui/participant'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { QUICK_REPLIES_QUERY_KEY } from '../shared/driverConversation.constant'
import { getDriverQuickReplies } from '../shared/driverConversationsApiInstance.service'

/** O pacote não exporta o tipo do chip; ele sai da prop que o recebe. */
type ParticipantQuickReply = NonNullable<ParticipantConversationsProps['quickReplies']>[number]

const CHIP_TITLE_MAX_LENGTH = 40
const QUICK_REPLIES_STALE_TIME_MS = 5 * 60 * 1000

/** Os chips do compositor. Vazio enquanto carrega ou sem lista: o pacote não desenha o grupo. */
export function useDriverQuickReplies(): readonly ParticipantQuickReply[] {
  const { data } = useQuery({
    // A busca cai sozinha na lista guardada quando a rede falha; pausar a consulta offline a esconderia.
    networkMode: 'always',
    queryFn: () => getDriverQuickReplies().fetchQuickReplies(),
    queryKey: QUICK_REPLIES_QUERY_KEY,
    retry: false,
    staleTime: QUICK_REPLIES_STALE_TIME_MS,
  })
  return useMemo(
    () =>
      (data ?? []).map(({ id, text }) => ({
        body: text,
        id,
        // O chip é uma linha de 44 px; o texto inteiro vai ao campo ao tocar.
        shortcut: '',
        title:
          text.length > CHIP_TITLE_MAX_LENGTH
            ? `${text.slice(0, CHIP_TITLE_MAX_LENGTH - 1)}…`
            : text,
      })),
    [data],
  )
}
