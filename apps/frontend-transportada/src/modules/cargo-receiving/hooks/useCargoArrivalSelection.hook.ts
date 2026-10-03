/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoArrivalGroup } from '../shared/cargoArrival.types'

export type CargoArrivalSelectionController = Readonly<{
  clear: () => void
  selected: ReadonlySet<string>
  toggleDocument: (documentId: string) => void
  toggleGroup: (group: CargoArrivalGroup) => void
}>

/** A seleção das notas do escritório atravessa os grupos: marcar o grupo marca (ou desmarca) todas as dele. */
export function useCargoArrivalSelection(): CargoArrivalSelectionController {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  return {
    clear: () => setSelected(new Set()),
    selected,
    toggleDocument: (documentId) =>
      setSelected((current) => {
        const next = new Set(current)
        if (!next.delete(documentId)) next.add(documentId)
        return next
      }),
    toggleGroup: (group) =>
      setSelected((current) => {
        const ids = group.documents.map((document) => document.nfeDocumentId)
        const isWholeGroupSelected = ids.every((id) => current.has(id))
        const next = new Set(current)
        for (const id of ids) {
          if (isWholeGroupSelected) next.delete(id)
          else next.add(id)
        }
        return next
      }),
  }
}
