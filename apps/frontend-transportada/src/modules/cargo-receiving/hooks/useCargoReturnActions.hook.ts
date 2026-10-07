/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import {
  useChangeCargoReturnMutation,
  type ChangeCargoReturnVariables,
} from '../mutations/useChangeCargoReturn.mutation'

export type CargoReturnActionsController = Readonly<{
  /** O código da recusa do servidor (ou da rede) por nota: fica na linha até a próxima tentativa. */
  errors: ReadonlyMap<string, string>
  pendingIds: ReadonlySet<string>
  retry: (documentId: string) => void
  /** Resolve `true` quando o servidor aceitou: o painel de marcar só fecha com a nota já marcada. */
  run: (input: ChangeCargoReturnVariables) => Promise<boolean>
}>

function without<TValue>(
  input: Readonly<{ key: string; source: ReadonlyMap<string, TValue> }>,
): Map<string, TValue> {
  return new Map([...input.source].filter(([key]) => key !== input.key))
}

/**
 * Marcar, desfazer e concluir: um gesto por nota. O que falha fica na linha com o motivo e com "tentar de
 * novo" (a fila offline é follow-up); o botão de uma nota em voo fica travado para o toque duplo não mandar
 * dois pedidos.
 */
export function useCargoReturnActions(arrivalId: string): CargoReturnActionsController {
  const mutation = useChangeCargoReturnMutation(arrivalId)
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const lastRequests = useRef<ReadonlyMap<string, ChangeCargoReturnVariables>>(new Map())

  async function execute(input: ChangeCargoReturnVariables): Promise<boolean> {
    const { documentId } = input
    lastRequests.current = new Map([...lastRequests.current, [documentId, input]])
    setErrors((current) => without({ key: documentId, source: current }))
    setPendingIds((current) => new Set([...current, documentId]))
    try {
      await mutation.mutateAsync(input)
      return true
    } catch (error) {
      const code = error instanceof Error ? error.message : 'REQUEST_FAILED'
      setErrors((current) => new Map([...current, [documentId, code]]))
      return false
    } finally {
      setPendingIds((current) => new Set([...current].filter((id) => id !== documentId)))
    }
  }

  return {
    errors,
    pendingIds,
    retry: (documentId) => {
      const request = lastRequests.current.get(documentId)
      if (request !== undefined) void execute(request)
    },
    run: execute,
  }
}
