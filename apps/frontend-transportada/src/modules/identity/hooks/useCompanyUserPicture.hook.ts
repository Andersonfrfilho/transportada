/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const COMPANY_USER_PICTURE_QUERY_KEY = 'company-user-picture'

/**
 * A foto desce como bytes numa rota autenticada — não dá para apontar `<img src>` para ela, porque a
 * tag não manda o `Authorization`. O caminho é buscar o blob e criar uma URL de objeto.
 *
 * Toda URL criada precisa ser revogada: sem isso, cada abertura da ficha deixa um blob preso na
 * memória da aba pelo resto da sessão, e quem administra usuários abre dezenas por dia.
 */
export function useCompanyUserPicture(
  input: Readonly<{ client?: CompanyUsersClient; userId: string | undefined }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const queryClient = useQueryClient()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  const query = useQuery({
    enabled: input.userId !== undefined,
    queryFn: () => client.readPicture({ userId: input.userId ?? '' }),
    queryKey: [COMPANY_USER_PICTURE_QUERY_KEY, input.userId],
    /** A foto muda por ação de quem está na tela: recarregar por foco é gasto sem ganho. */
    staleTime: 300_000,
  })

  const blob = query.data ?? null

  useEffect(() => {
    if (blob === null) {
      setObjectUrl(null)
      return
    }

    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  function invalidate(): void {
    void queryClient.invalidateQueries({
      queryKey: [COMPANY_USER_PICTURE_QUERY_KEY, input.userId],
    })
  }

  const replaceMutation = useMutation({
    mutationFn: (file: Blob) => client.replacePicture({ file, userId: input.userId ?? '' }),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: () => client.removePicture({ userId: input.userId ?? '' }),
    onSuccess: invalidate,
  })

  return { objectUrl, query, removeMutation, replaceMutation }
}

/**
 * A falha do envio e a da remoção vão para o mesmo lugar da tela — só uma delas está em curso por
 * vez, e o campo tem um espaço só para dizer o que houve.
 */
export function readPictureErrorCode(
  picture: ReturnType<typeof useCompanyUserPicture>,
): string | undefined {
  const failure = picture.replaceMutation.error ?? picture.removeMutation.error
  return failure instanceof Error ? failure.message : undefined
}
