/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createAudioTranscriptionSettingsClient,
  type AudioTranscriptionSettings,
  type AudioTranscriptionSettingsClient,
} from '../shared/audioTranscriptionSettings.service'

export const AUDIO_TRANSCRIPTION_SETTINGS_QUERY_KEY = [
  'occurrence-conversation',
  'audio-transcription',
]

function getClient(): AudioTranscriptionSettingsClient {
  return createAudioTranscriptionSettingsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** O `enabled` (aba aberta e `settings.manage`) é o que faz o painel vir preenchido. */
export function useAudioTranscriptionSettingsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<AudioTranscriptionSettings>({
    enabled: input.enabled,
    queryFn: () => getClient().get(),
    queryKey: AUDIO_TRANSCRIPTION_SETTINGS_QUERY_KEY,
  })
}

export function useSaveAudioTranscriptionSettingsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => getClient().save(enabled),
    onSuccess: (saved) => {
      queryClient.setQueryData(AUDIO_TRANSCRIPTION_SETTINGS_QUERY_KEY, saved)
    },
  })
}
