/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

export type TripDocumentSelectionController = ReturnType<typeof useTripDocumentSelection>

/**
 * O maço de seleção some sozinho quando a viagem recarrega (nota entregue, viagem despachada): a
 * seleção é intenção de ação em lote, não estado que sobrevive a uma mudança de dado por baixo.
 */
export function useTripDocumentSelection() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  function toggle(documentId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(documentId)) next.delete(documentId)
      else next.add(documentId)
      return next
    })
  }

  function toggleMany(documentIds: readonly string[], nextChecked: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const documentId of documentIds) {
        if (nextChecked) next.add(documentId)
        else next.delete(documentId)
      }
      return next
    })
  }

  function clear(): void {
    setSelectedIds(new Set())
  }

  /**
   * Spec 156 T8b (revisão): "Devolver" em massa com falha parcial troca a seleção pelas notas que
   * falharam, em vez de limpar tudo — quem tentou de novo continua vendo só o que ainda falta.
   */
  function replace(documentIds: readonly string[]): void {
    setSelectedIds(new Set(documentIds))
  }

  return { clear, replace, selectedIds, toggle, toggleMany }
}
