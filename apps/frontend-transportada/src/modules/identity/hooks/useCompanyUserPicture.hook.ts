/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { AUTH_ME_QUERY_KEY } from '../queries/useAuthMe.query'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import {
  COMPANY_USERS_ADMINISTRATION_QUERY_KEY,
  getCompanyUsersClient,
} from './useCompanyUsers.hook'

export const COMPANY_USER_PICTURE_QUERY_KEY = 'company-user-picture'

/**
 * A foto desce como bytes numa rota autenticada — não dá para apontar `<img src>` para ela, porque a
 * tag não manda o `Authorization`. O caminho é buscar o blob e criar uma URL de objeto.
 *
 * Toda URL criada precisa ser revogada: sem isso, cada abertura da ficha deixa um blob preso na
 * memória da aba pelo resto da sessão, e quem administra usuários abre dezenas por dia.
 *
 * `hasPicture` vem da API (`/auth/me` ou a linha da listagem). Sem ele a tela pedia a foto de todo
 * mundo, e cada pessoa sem foto era um 404 no console em toda tela.
 */
export function useCompanyUserPicture(
  input: Readonly<{ client?: CompanyUsersClient; hasPicture: boolean; userId: string | undefined }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const queryClient = useQueryClient()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  /**
   * O que o envio ou a remoção acabaram de decidir vale mais que o sinal que veio com a linha: o
   * diálogo guarda a pessoa como estava ao abrir, e sem isto a foto recém-enviada não apareceria.
   */
  const [decided, setDecided] = useState<Readonly<{ exists: boolean; userId: string }> | null>(null)
  const exists =
    decided !== null && decided.userId === input.userId ? decided.exists : input.hasPicture

  const query = useQuery({
    enabled: input.userId !== undefined && exists,
    queryFn: () => client.readPicture({ userId: input.userId ?? '' }),
    queryKey: [COMPANY_USER_PICTURE_QUERY_KEY, input.userId],
    /** A foto muda por ação de quem está na tela: recarregar por foco é gasto sem ganho. */
    staleTime: 300_000,
  })

  const blob = exists ? (query.data ?? null) : null

  useEffect(() => {
    if (blob === null) {
      setObjectUrl(null)
      return
    }

    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  /** O cabeçalho e a listagem leem o sinal da API: sem recarregá-los, ficariam com o anterior. */
  function settle(nextExists: boolean): void {
    if (input.userId !== undefined) setDecided({ exists: nextExists, userId: input.userId })
    void queryClient.invalidateQueries({
      queryKey: [COMPANY_USER_PICTURE_QUERY_KEY, input.userId],
    })
    void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY })
  }

  const replaceMutation = useMutation({
    mutationFn: (file: Blob) => client.replacePicture({ file, userId: input.userId ?? '' }),
    onSuccess: () => settle(true),
  })

  const removeMutation = useMutation({
    mutationFn: () => client.removePicture({ userId: input.userId ?? '' }),
    onSuccess: () => settle(false),
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
