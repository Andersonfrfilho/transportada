/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'

import type { TripStopDetail } from '../shared/trip.types'

export type TripStopOrderController = ReturnType<typeof useTripStopOrder>

/**
 * A ordem otimista vive aqui: arrastar move a linha na hora, e só depois o `PATCH` confirma. Se o
 * servidor devolver uma ordem diferente da que o dedo acabou de soltar (outra aba reordenou junto),
 * o efeito abaixo resincroniza — o dado do servidor sempre vence.
 */
export function useTripStopOrder(input: {
  readonly onReorder: (stopIds: readonly string[]) => void
  readonly stops: readonly TripStopDetail[]
}) {
  const [orderedIds, setOrderedIds] = useState<readonly string[]>(() =>
    input.stops.map((stop) => stop.id),
  )

  useEffect(() => {
    setOrderedIds(input.stops.map((stop) => stop.id))
  }, [input.stops])

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (over === null || active.id === over.id) return

    const fromIndex = orderedIds.indexOf(String(active.id))
    const toIndex = orderedIds.indexOf(String(over.id))
    if (fromIndex === -1 || toIndex === -1) return

    const next = arrayMove([...orderedIds], fromIndex, toIndex)
    setOrderedIds(next)
    input.onReorder(next)
  }

  return { handleDragEnd, orderedIds }
}
