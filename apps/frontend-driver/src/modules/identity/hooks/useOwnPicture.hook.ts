/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { isSmokeAuthBypassEnabled } from '../shared/smokeAuthBypass.service'
import { createOwnPictureClient } from '../shared/ownPictureClient.service'
import { prepareUserPictureUpload } from '../shared/userPictureCompression.service'

export const OWN_PICTURE_QUERY_KEY = ['identity', 'own-picture'] as const

function getOwnPictureClient() {
  return createOwnPictureClient({
    apiUrl: getDriverEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * A foto vem pela rota autenticada e vira `blob:` (já aceito no `img-src`): o token do realm só
 * traria o claim `picture` depois de um novo login, e a troca precisa aparecer na hora.
 */
export function useOwnPicture() {
  const queryClient = useQueryClient()
  const client = useMemo(getOwnPictureClient, [])
  const query = useQuery({
    enabled: !isSmokeAuthBypassEnabled(),
    queryFn: async () => (await client.read()) ?? null,
    queryKey: OWN_PICTURE_QUERY_KEY,
    staleTime: Infinity,
  })
  const picture = query.data ?? undefined
  const pictureUrl = useMemo(
    () => (picture === undefined ? undefined : URL.createObjectURL(picture)),
    [picture],
  )

  useEffect(
    () => () => {
      if (pictureUrl !== undefined) URL.revokeObjectURL(pictureUrl)
    },
    [pictureUrl],
  )

  const replaceMutation = useMutation({
    mutationFn: async (file: Blob) => {
      const prepared = await prepareUserPictureUpload(file)
      await client.replace(prepared)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OWN_PICTURE_QUERY_KEY }),
  })
  const removeMutation = useMutation({
    mutationFn: () => client.remove(),
    onSuccess: () => queryClient.setQueryData(OWN_PICTURE_QUERY_KEY, null),
  })

  function resetMutations(): void {
    replaceMutation.reset()
    removeMutation.reset()
  }

  return {
    errorCode: (replaceMutation.error ?? removeMutation.error)?.message,
    isBusy: replaceMutation.isPending || removeMutation.isPending,
    pictureUrl,
    remove: () => {
      resetMutations()
      removeMutation.mutate()
    },
    replace: (file: Blob) => {
      resetMutations()
      replaceMutation.mutate(file)
    },
  }
}
