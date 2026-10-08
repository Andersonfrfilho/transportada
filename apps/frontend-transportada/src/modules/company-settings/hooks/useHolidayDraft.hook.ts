/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { HOLIDAY_KINDS, HOLIDAY_RECURRENCES } from '../shared/businessCalendar.constant'
import type { HolidayKind, HolidayRecurrence } from '../shared/businessCalendar.types'
import {
  EMPTY_HOLIDAY_DRAFT,
  maskDayInput,
  validateHolidayDraft,
  type HolidayDraft,
  type HolidayField,
  type HolidayIssues,
  type HolidayScope,
} from '../shared/businessCalendarForm.validation'

type TextField = Extract<
  HolidayField,
  'cityIbgeCode' | 'day' | 'holidayOn' | 'month' | 'name' | 'stateIbgeCode'
>

function toKind(value: string): HolidayKind | '' {
  return HOLIDAY_KINDS.find((kind) => kind === value) ?? ''
}

function toRecurrence(value: string): HolidayRecurrence | '' {
  return HOLIDAY_RECURRENCES.find((recurrence) => recurrence === value) ?? ''
}

const CITY_CODE_LENGTH = 7

function maskText(input: Readonly<{ field: TextField; value: string }>): string {
  if (input.field === 'day') return maskDayInput(input.value)
  if (input.field === 'cityIbgeCode')
    return input.value.replace(/\D/gu, '').slice(0, CITY_CODE_LENGTH)
  return input.value
}

function withoutIssues(issues: HolidayIssues, fields: readonly HolidayField[]): HolidayIssues {
  return Object.fromEntries(
    Object.entries(issues).filter(([field]) => !fields.some((name) => name === field)),
  )
}

/**
 * O rascunho do formulário e as pendências dele. Editar um campo limpa o erro dele (`web.md` §11) — e trocar a UF
 * esvazia o município, porque o código IBGE de uma UF não vale na outra.
 */
export function useHolidayDraft(input: Readonly<{ onEdit: () => void; scope: HolidayScope }>) {
  const { onEdit, scope } = input
  const [draft, setDraft] = useState<HolidayDraft>(EMPTY_HOLIDAY_DRAFT)
  const [issues, setIssues] = useState<HolidayIssues>({})

  function change(
    edit: Readonly<{ cleared: readonly HolidayField[]; patch: Partial<HolidayDraft> }>,
  ) {
    setDraft((current) => ({ ...current, ...edit.patch }))
    setIssues((current) => withoutIssues(current, edit.cleared))
    onEdit()
  }

  function setText(field: TextField, value: string): void {
    const typed = maskText({ field, value })
    const dependent = field === 'stateIbgeCode' && scope === 'municipal' ? { cityIbgeCode: '' } : {}
    const cleared: readonly HolidayField[] =
      field === 'stateIbgeCode' ? ['stateIbgeCode', 'cityIbgeCode'] : [field]
    change({ cleared, patch: { ...dependent, [field]: typed } })
  }

  function setKind(value: string): void {
    change({ cleared: ['kind'], patch: { kind: toKind(value) } })
  }

  function setRecurrence(value: string): void {
    change({
      cleared: ['recurrence', 'month', 'day', 'holidayOn'],
      patch: { recurrence: toRecurrence(value) },
    })
  }

  /** Aponta todas as pendências de uma vez; devolve `true` quando não há nenhuma. */
  function validate(): boolean {
    const found = validateHolidayDraft({ draft, scope })
    setIssues(found)
    return Object.keys(found).length === 0
  }

  function reset(next: HolidayDraft = EMPTY_HOLIDAY_DRAFT): void {
    setDraft(next)
    setIssues({})
  }

  return { draft, issues, reset, setKind, setRecurrence, setText, validate }
}

export type HolidayDraftController = ReturnType<typeof useHolidayDraft>
