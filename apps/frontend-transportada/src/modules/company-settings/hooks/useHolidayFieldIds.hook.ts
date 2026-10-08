/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'

export type HolidayFieldIds = Readonly<{ errorId: string; labelId: string }>

/** Os dois ids que ligam o campo ao rótulo e à mensagem de erro dele (`aria-labelledby`, `aria-describedby`). */
export function useHolidayFieldIds(): HolidayFieldIds {
  const base = useId()
  return { errorId: `${base}-error`, labelId: `${base}-label` }
}
