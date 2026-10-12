/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AudioTranscriptionSettings } from '../shared/audioTranscription.service'
import { getAudioTranscriptionClient } from '../shared/audioTranscriptionClient.provider'

export const AUDIO_TRANSCRIPTION_QUERY_KEY = [
  'occurrence-conversation',
  'audio-transcription',
] as const

/** `enabled` é aba aberta **e** `settings.manage`: sem a permissão a API recusaria a leitura. */
export function useAudioTranscriptionQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<AudioTranscriptionSettings>({
    enabled: input.enabled,
    queryFn: () => getAudioTranscriptionClient().get(),
    queryKey: AUDIO_TRANSCRIPTION_QUERY_KEY,
    retry: false,
  })
}

/** O valor pedido aparece já; se a API recusar, volta ao anterior e o erro fica na mutação. */
export function useSaveAudioTranscriptionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => getAudioTranscriptionClient().save(enabled),
    onError: (_error, _enabled, previous) => {
      queryClient.setQueryData(AUDIO_TRANSCRIPTION_QUERY_KEY, previous)
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: AUDIO_TRANSCRIPTION_QUERY_KEY })
      const previous = queryClient.getQueryData<AudioTranscriptionSettings>(
        AUDIO_TRANSCRIPTION_QUERY_KEY,
      )
      if (previous !== undefined) {
        queryClient.setQueryData(AUDIO_TRANSCRIPTION_QUERY_KEY, { ...previous, enabled })
      }
      return previous
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(AUDIO_TRANSCRIPTION_QUERY_KEY, settings)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIO_TRANSCRIPTION_QUERY_KEY })
    },
  })
}
