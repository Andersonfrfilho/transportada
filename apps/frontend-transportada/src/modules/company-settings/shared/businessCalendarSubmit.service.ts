/* Copyright (c) 2026 Ada Technology. MIT License. */
import { HOLIDAY_RECURRENCE } from './businessCalendar.constant'
import type {
  MunicipalHoliday,
  MunicipalHolidayChanges,
  MunicipalHolidayFields,
  MunicipalHolidayRule,
  MunicipalRuleChanges,
  MunicipalRuleFields,
  SavedMunicipalHoliday,
  StateHoliday,
  StateHolidayChanges,
  StateHolidayFields,
} from './businessCalendar.types'
import type { HolidayDraft } from './businessCalendarForm.validation'
import type { HolidayRow } from './businessCalendarRows.service'
import {
  buildHolidayChanges,
  buildHolidayFields,
  buildRuleChanges,
  buildRuleFields,
  buildStateHolidayChanges,
  buildStateHolidayFields,
  draftFromHoliday,
  draftFromRule,
  draftFromStateHoliday,
} from './businessCalendarSubmission.service'

/** O aviso que a tela mostra depois de gravar: a chave do texto e, quando há, o número que ele cita. */
export type HolidayNotice = Readonly<{ count?: number; key: string }>

export type MunicipalActions = Readonly<{
  createRule: (
    fields: MunicipalRuleFields,
  ) => Promise<Readonly<{ created: boolean; rule: MunicipalHolidayRule }>>
  saveHoliday: (fields: MunicipalHolidayFields) => Promise<SavedMunicipalHoliday>
  updateHoliday: (
    input: Readonly<{ changes: MunicipalHolidayChanges; id: string }>,
  ) => Promise<MunicipalHoliday>
  updateRule: (
    input: Readonly<{ changes: MunicipalRuleChanges; id: string }>,
  ) => Promise<MunicipalHolidayRule>
}>

export type StateActions = Readonly<{
  create: (
    fields: StateHolidayFields,
  ) => Promise<Readonly<{ created: boolean; holiday: StateHoliday }>>
  update: (input: Readonly<{ changes: StateHolidayChanges; id: string }>) => Promise<StateHoliday>
}>

type MunicipalSubmit = Readonly<{
  actions: MunicipalActions
  draft: HolidayDraft
  editing: HolidayRow | undefined
}>

const NOTICE = {
  ADOPTED: 'notice.adopted',
  CREATED: 'notice.created',
  HOLIDAY_EXISTS: 'notice.holidayExists',
  RULE_EXISTS: 'notice.ruleExists',
  TYPED_KEPT: 'notice.typedKept',
  UPDATED: 'notice.updated',
} as const

async function createMunicipal(input: Omit<MunicipalSubmit, 'editing'>) {
  const { actions, draft } = input
  if (draft.recurrence === HOLIDAY_RECURRENCE.YEARLY) {
    const { created } = await actions.createRule(buildRuleFields(draft))
    return [{ key: created ? NOTICE.CREATED : NOTICE.RULE_EXISTS }]
  }
  const saved = await actions.saveHoliday(buildHolidayFields(draft))
  return [{ key: saved.adoptedFromRuleId === null ? NOTICE.CREATED : NOTICE.ADOPTED }]
}

/**
 * A data digitada no dia antigo continua valendo depois de a regra mudar de dia (ADR-0096 §6.4): o aviso só faz
 * sentido quando o dia mudou, e a contagem vem da resposta do `PATCH`.
 */
async function updateRule(
  input: Readonly<{ actions: MunicipalActions; draft: HolidayDraft; rule: MunicipalHolidayRule }>,
): Promise<readonly HolidayNotice[]> {
  const changes = buildRuleChanges({ draft: input.draft, rule: input.rule })
  if (changes === undefined) return []
  const updated = await input.actions.updateRule({ changes, id: input.rule.id })
  const kept = updated.typedHolidaysKept ?? 0
  const movedDay = changes.day !== undefined || changes.month !== undefined
  return [
    { key: NOTICE.UPDATED },
    ...(movedDay && kept > 0 ? [{ count: kept, key: NOTICE.TYPED_KEPT }] : []),
  ]
}

async function updateMunicipal(input: MunicipalSubmit & { editing: HolidayRow }) {
  const { actions, draft, editing } = input
  if (editing.source.origin === 'rule') {
    return updateRule({ actions, draft, rule: editing.source.rule })
  }
  if (editing.source.origin !== 'date') return []
  const changes = buildHolidayChanges({ draft, holiday: editing.source.holiday })
  if (changes === undefined) return []
  await actions.updateHoliday({ changes, id: editing.id })
  return [{ key: NOTICE.UPDATED }]
}

export async function submitMunicipalDraft(
  input: MunicipalSubmit,
): Promise<readonly HolidayNotice[]> {
  const { editing, ...rest } = input
  return editing === undefined ? createMunicipal(rest) : updateMunicipal({ ...rest, editing })
}

/** O rascunho que reabre uma linha para editar: o que está gravado, campo a campo. */
export function draftFromRow(row: HolidayRow): HolidayDraft {
  if (row.source.origin === 'rule') return draftFromRule(row.source.rule)
  if (row.source.origin === 'date') return draftFromHoliday(row.source.holiday)
  return draftFromStateHoliday(row.source.holiday)
}

export function hasMunicipalChanges(
  input: Readonly<{ draft: HolidayDraft; editing: HolidayRow }>,
): boolean {
  const { draft, editing } = input
  if (editing.source.origin === 'rule') {
    return buildRuleChanges({ draft, rule: editing.source.rule }) !== undefined
  }
  if (editing.source.origin !== 'date') return false
  return buildHolidayChanges({ draft, holiday: editing.source.holiday }) !== undefined
}

export async function submitStateDraft(
  input: Readonly<{ actions: StateActions; draft: HolidayDraft; editing: HolidayRow | undefined }>,
): Promise<readonly HolidayNotice[]> {
  const { actions, draft, editing } = input
  if (editing === undefined) {
    const { created } = await actions.create(buildStateHolidayFields(draft))
    return [{ key: created ? NOTICE.CREATED : NOTICE.HOLIDAY_EXISTS }]
  }
  if (editing.source.origin !== 'state') return []
  const changes = buildStateHolidayChanges({ draft, holiday: editing.source.holiday })
  if (changes === undefined) return []
  await actions.update({ changes, id: editing.id })
  return [{ key: NOTICE.UPDATED }]
}

export function hasStateChanges(
  input: Readonly<{ draft: HolidayDraft; editing: HolidayRow }>,
): boolean {
  if (input.editing.source.origin !== 'state') return false
  return (
    buildStateHolidayChanges({ draft: input.draft, holiday: input.editing.source.holiday }) !==
    undefined
  )
}
