/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'
import type { HolidayRow } from '../shared/businessCalendarRows.service'

type DeleteInput = Readonly<{
  remove: (row: HolidayRow) => Promise<void>
  rows: readonly HolidayRow[]
}>

/**
 * Excluir é irreversível: pede confirmação que diz o efeito. A falha fica **dentro** do diálogo, que continua aberto
 * para tentar de novo — fechar e sumir com o motivo seria mudez.
 */
export function useHolidayDelete(input: DeleteInput) {
  const [pendingId, setPendingId] = useState<string | undefined>(undefined)
  const [isDeleting, setIsDeleting] = useState(false)
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const target = input.rows.find((row) => row.id === pendingId)

  function request(row: HolidayRow): void {
    setRefusal(undefined)
    setPendingId(row.id)
  }

  function cancel(): void {
    setPendingId(undefined)
    setRefusal(undefined)
  }

  async function confirm(): Promise<void> {
    if (target === undefined || isDeleting) return
    setIsDeleting(true)
    try {
      await input.remove(target)
      setPendingId(undefined)
      setRefusal(undefined)
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    } finally {
      setIsDeleting(false)
    }
  }

  return { cancel, confirm, isDeleting, refusal, request, target }
}

export type HolidayDeleteController = ReturnType<typeof useHolidayDelete>
