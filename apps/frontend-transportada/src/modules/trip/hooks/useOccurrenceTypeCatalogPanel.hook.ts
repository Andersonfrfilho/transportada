/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { getTripClient } from '@/modules/trip/hooks/useTripWorkspace.hook'
import { OCCURRENCE_TYPES_QUERY_KEY } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

const NEW_TYPE_QUEUE_KEY = ''

/**
 * Mesmo cliente e mutação de quando o catálogo morava em Viagens: só o endereço da aba mudou. A
 * chave da consulta é a mesma de antes (`['trip', 'occurrence-types']`), para não deixar um cache
 * velho apontando para um lugar que não existe mais.
 */
export function useOccurrenceTypeCatalogPanel(input: Readonly<{ enabled: boolean }>) {
  const client = getTripClient()
  const queryClient = useQueryClient()
  const isSavingRef = useRef(false)
  const queuedByTypeId = useRef(new Map<string, OccurrenceTypeSaveInput>())
  const [hasQueued, setHasQueued] = useState(false)

  const query = useQuery({
    enabled: input.enabled,
    queryFn: () => client.listOccurrenceTypes(),
    queryKey: OCCURRENCE_TYPES_QUERY_KEY,
  })

  /**
   * ⚠️ Invalida em vez de escrever o cache com a resposta: o `PUT` devolve **um** tipo, e a lista
   * inteira mudou de ordem se o nome mudou. Escrever um item sobre a lista a deixaria mentindo.
   */
  const saveMutation = useMutation({
    mutationFn: client.saveOccurrenceType,
    /**
     * Também no erro: um `422` de tipo que mudou em outra aba pede o cadastro como está agora.
     * ⚠️ Devolve a promessa: o salvamento fica pendente até a lista chegar, e o próximo `PUT` sai
     * depois do recarregamento — ele reenvia do tipo da tela os campos que a edição não toca.
     */
    onSettled: () => queryClient.invalidateQueries({ queryKey: OCCURRENCE_TYPES_QUERY_KEY }),
  })

  /** Erro fica em `saveMutation.error`; o que sobrou na fila espera o próximo salvamento, sem se perder. */
  async function drain(first: OccurrenceTypeSaveInput): Promise<void> {
    isSavingRef.current = true
    let next: OccurrenceTypeSaveInput | undefined = first
    try {
      while (next !== undefined) {
        await saveMutation.mutateAsync(next)
        const [queuedKey, queued] = queuedByTypeId.current.entries().next().value ?? []
        if (queuedKey !== undefined) queuedByTypeId.current.delete(queuedKey)
        setHasQueued(queuedByTypeId.current.size > 0)
        next = queued
      }
    } catch {
      next = undefined
    } finally {
      isSavingRef.current = false
    }
  }

  /**
   * Os campos ficam livres durante o salvamento: desabilitar o campo que acaba de receber o foco o faz
   * perder o foco e as teclas seguintes. Quem edita mais de uma vez com um `PUT` pendente manda o
   * conjunto acumulado, então a última entrada de cada tipo contém as anteriores e basta guardá-la.
   */
  function saveType(save: OccurrenceTypeSaveInput): void {
    const queueKey = save.occurrenceTypeId ?? NEW_TYPE_QUEUE_KEY
    if (isSavingRef.current && queueKey !== NEW_TYPE_QUEUE_KEY) {
      queuedByTypeId.current.set(queueKey, save)
      setHasQueued(true)
      return
    }
    queuedByTypeId.current.delete(queueKey)
    void drain(save)
  }

  return { isSaving: saveMutation.isPending || hasQueued, query, saveMutation, saveType }
}
