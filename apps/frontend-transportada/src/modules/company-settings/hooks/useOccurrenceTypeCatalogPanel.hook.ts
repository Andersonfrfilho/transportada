/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getTripClient } from '@/modules/trip/hooks/useTripWorkspace.hook'

const OCCURRENCE_TYPE_CATALOG_QUERY_KEY = ['trip', 'occurrence-types'] as const

/**
 * Mesmo cliente e mutação de quando o catálogo morava em Viagens: só o endereço da aba mudou. A
 * chave da consulta é a mesma de antes (`['trip', 'occurrence-types']`), para não deixar um cache
 * velho apontando para um lugar que não existe mais.
 */
export function useOccurrenceTypeCatalogPanel(input: Readonly<{ enabled: boolean }>) {
  const client = getTripClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    enabled: input.enabled,
    queryFn: () => client.listOccurrenceTypes(),
    queryKey: OCCURRENCE_TYPE_CATALOG_QUERY_KEY,
  })

  /**
   * ⚠️ Invalida em vez de escrever o cache com a resposta: o `PUT` devolve **um** tipo, e a lista
   * inteira mudou de ordem se o nome mudou. Escrever um item sobre a lista a deixaria mentindo.
   */
  const saveMutation = useMutation({
    mutationFn: client.saveOccurrenceType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OCCURRENCE_TYPE_CATALOG_QUERY_KEY })
    },
  })

  return { query, saveMutation }
}
