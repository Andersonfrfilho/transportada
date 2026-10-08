/* Copyright (c) 2026 Ada Technology. MIT License. */
import { HOLIDAY_RECURRENCE, STATE_CODE_LENGTH } from './businessCalendar.constant'
import type {
  HolidayKind,
  MunicipalHoliday,
  MunicipalHolidayChanges,
  MunicipalHolidayFields,
  MunicipalHolidayRule,
  MunicipalRuleChanges,
  MunicipalRuleFields,
  StateHoliday,
  StateHolidayChanges,
  StateHolidayFields,
} from './businessCalendar.types'
import { EMPTY_HOLIDAY_DRAFT, type HolidayDraft } from './businessCalendarForm.validation'

/** O formulário só envia depois de validado: rascunho sem tipo aqui é defeito, não entrada. */
function requireKind(kind: HolidayDraft['kind']): HolidayKind {
  if (kind === '') throw new Error('HOLIDAY_DRAFT_WITHOUT_KIND')
  return kind
}

export function buildRuleFields(draft: HolidayDraft): MunicipalRuleFields {
  return {
    cityIbgeCode: draft.cityIbgeCode,
    day: Number(draft.day),
    kind: requireKind(draft.kind),
    month: Number(draft.month),
    name: draft.name.trim(),
  }
}

/**
 * Só o que mudou. Mês ou dia mudando manda os dois: o servidor confere o par mesclado (`31` com `abril` só
 * existe depois de mesclar), e a cidade nunca vai — outra cidade é outra regra.
 */
export function buildRuleChanges(
  input: Readonly<{ draft: HolidayDraft; rule: MunicipalHolidayRule }>,
): MunicipalRuleChanges | undefined {
  const { draft, rule } = input
  const [day, month] = [Number(draft.day), Number(draft.month)]
  const changes: MunicipalRuleChanges = {
    ...(day !== rule.day || month !== rule.month ? { day, month } : {}),
    ...(draft.kind !== '' && draft.kind !== rule.kind ? { kind: draft.kind } : {}),
    ...(draft.name.trim() !== rule.name ? { name: draft.name.trim() } : {}),
  }
  return Object.keys(changes).length === 0 ? undefined : changes
}

export function buildHolidayFields(draft: HolidayDraft): MunicipalHolidayFields {
  return {
    cityIbgeCode: draft.cityIbgeCode,
    holidayOn: draft.holidayOn,
    kind: requireKind(draft.kind),
    name: draft.name.trim(),
  }
}

/** A data e a cidade são a identidade da linha: só nome e tipo mudam. */
export function buildHolidayChanges(
  input: Readonly<{ draft: HolidayDraft; holiday: MunicipalHoliday }>,
): MunicipalHolidayChanges | undefined {
  const { draft, holiday } = input
  const changes: MunicipalHolidayChanges = {
    ...(draft.kind !== '' && draft.kind !== holiday.kind ? { kind: draft.kind } : {}),
    ...(draft.name.trim() !== holiday.name ? { name: draft.name.trim() } : {}),
  }
  return Object.keys(changes).length === 0 ? undefined : changes
}

export function buildStateHolidayFields(draft: HolidayDraft): StateHolidayFields {
  const shared = { name: draft.name.trim(), stateIbgeCode: draft.stateIbgeCode }
  if (draft.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    return { ...shared, holidayOn: draft.holidayOn, recurrence: HOLIDAY_RECURRENCE.ONCE }
  }
  return {
    ...shared,
    day: Number(draft.day),
    month: Number(draft.month),
    recurrence: HOLIDAY_RECURRENCE.YEARLY,
  }
}

/** O `PATCH` estadual leva sempre a recorrência; sem mais nada mudado, não há pedido. */
export function buildStateHolidayChanges(
  input: Readonly<{ draft: HolidayDraft; holiday: StateHoliday }>,
): StateHolidayChanges | undefined {
  const { draft, holiday } = input
  const name = draft.name.trim() !== holiday.name ? { name: draft.name.trim() } : {}
  if (holiday.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    const date = draft.holidayOn !== holiday.holidayOn ? { holidayOn: draft.holidayOn } : {}
    return Object.keys({ ...name, ...date }).length === 0
      ? undefined
      : { ...name, ...date, recurrence: HOLIDAY_RECURRENCE.ONCE }
  }
  const [day, month] = [Number(draft.day), Number(draft.month)]
  const when = day !== holiday.day || month !== holiday.month ? { day, month } : {}
  return Object.keys({ ...name, ...when }).length === 0
    ? undefined
    : { ...name, ...when, recurrence: HOLIDAY_RECURRENCE.YEARLY }
}

export function draftFromRule(rule: MunicipalHolidayRule): HolidayDraft {
  return {
    ...EMPTY_HOLIDAY_DRAFT,
    cityIbgeCode: rule.cityIbgeCode,
    day: String(rule.day),
    kind: rule.kind,
    month: String(rule.month),
    name: rule.name,
    recurrence: HOLIDAY_RECURRENCE.YEARLY,
    stateIbgeCode: rule.cityIbgeCode.slice(0, STATE_CODE_LENGTH),
  }
}

export function draftFromHoliday(holiday: MunicipalHoliday): HolidayDraft {
  return {
    ...EMPTY_HOLIDAY_DRAFT,
    cityIbgeCode: holiday.cityIbgeCode,
    holidayOn: holiday.holidayOn,
    kind: holiday.kind,
    name: holiday.name,
    recurrence: HOLIDAY_RECURRENCE.ONCE,
    stateIbgeCode: holiday.cityIbgeCode.slice(0, STATE_CODE_LENGTH),
  }
}

export function draftFromStateHoliday(holiday: StateHoliday): HolidayDraft {
  const base = {
    ...EMPTY_HOLIDAY_DRAFT,
    name: holiday.name,
    stateIbgeCode: holiday.stateIbgeCode,
  }
  if (holiday.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    return { ...base, holidayOn: holiday.holidayOn, recurrence: HOLIDAY_RECURRENCE.ONCE }
  }
  return {
    ...base,
    day: String(holiday.day),
    month: String(holiday.month),
    recurrence: HOLIDAY_RECURRENCE.YEARLY,
  }
}
