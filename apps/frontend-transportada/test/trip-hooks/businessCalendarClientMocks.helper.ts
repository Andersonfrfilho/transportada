/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: a API do calendário dublada **uma vez** (`mock.module` não se desfaz) e com as MESMAS transições
 * da T1.3 (ADR-0096 §6): a regra gera 11 datas, a digitada vence a gerada, `POST` numa gerada é adoção, a gerada
 * não se edita nem se apaga (409), apagar a regra apaga só as geradas, conflito é 409. Cada teste só
 * reconfigura `businessCalendarDouble`; `calls` é o registro do que a tela pediu.
 */
import { mock } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'
import type { BusinessCalendarClient } from '@/modules/company-settings/shared/businessCalendarClient.service'
import type { HolidayImportClient } from '@/modules/company-settings/shared/holidayImportClient.service'
import type {
  HolidayImportStatus,
  HolidayImportSuppression,
} from '@/modules/company-settings/shared/holidayImport.types'
import type {
  BusinessCalendarSettings,
  MunicipalHoliday,
  MunicipalHolidayRule,
  StateHoliday,
} from '@/modules/company-settings/shared/businessCalendar.types'

import { buildSettings } from '../fixtures/businessCalendar.fixture'
import { buildImportStatus } from '../fixtures/holidayImport.fixture'

export const DOUBLE_CURRENT_YEAR = 2026
const HORIZON_YEARS = 10

export type MunicipalityEntry = Readonly<{ code: string; name: string }>

export const businessCalendarDouble: {
  calls: string[]
  /** Falha o próximo pedido que casar com `"MÉTODO caminho"`; `'hold'` o deixa pendente para sempre. */
  failNext: Map<string, BusinessCalendarRequestError | 'hold'>
  holidays: MunicipalHoliday[]
  importStatus: HolidayImportStatus
  municipalities: Record<string, readonly MunicipalityEntry[] | 'failure'>
  nextId: number
  rules: MunicipalHolidayRule[]
  settings: BusinessCalendarSettings
  stateHolidays: StateHoliday[]
  suppressions: HolidayImportSuppression[]
} = {
  calls: [],
  failNext: new Map(),
  holidays: [],
  importStatus: buildImportStatus(),
  municipalities: {},
  nextId: 1,
  rules: [],
  settings: buildSettings(),
  stateHolidays: [],
  suppressions: [],
}

export function resetBusinessCalendarDouble(): void {
  Object.assign(businessCalendarDouble, {
    calls: [],
    holidays: [],
    importStatus: buildImportStatus(),
    municipalities: {},
    nextId: 1,
    rules: [],
    settings: buildSettings(),
    stateHolidays: [],
    suppressions: [],
  })
  businessCalendarDouble.failNext.clear()
}

function id(prefix: string): string {
  const next = businessCalendarDouble.nextId
  businessCalendarDouble.nextId += 1
  return `${prefix}-${String(next).padStart(4, '0')}`
}

function refuse(code: string, status: number): never {
  throw new BusinessCalendarRequestError({ code, status })
}

/** As chaves em ordem alfabética: o registro compara texto, e a ordem do objeto não é o que se está provando. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
        )
      : entry,
  )
}

async function record<TResult>(
  request: Readonly<{ body?: unknown; key: string; run: () => TResult }>,
): Promise<TResult> {
  const call =
    request.body === undefined ? request.key : `${request.key} ${stableStringify(request.body)}`
  businessCalendarDouble.calls.push(call)
  const failure = businessCalendarDouble.failNext.get(request.key)
  if (failure === 'hold') return new Promise<TResult>(() => undefined)
  if (failure !== undefined) {
    businessCalendarDouble.failNext.delete(request.key)
    throw failure
  }
  return request.run()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function generate(rule: MunicipalHolidayRule): void {
  for (let year = DOUBLE_CURRENT_YEAR; year <= DOUBLE_CURRENT_YEAR + HORIZON_YEARS; year += 1) {
    if (rule.month === 2 && rule.day === 29 && !isLeap(year)) continue
    const holidayOn = `${String(year)}-${pad(rule.month)}-${pad(rule.day)}`
    const exists = businessCalendarDouble.holidays.some(
      (holiday) => holiday.cityIbgeCode === rule.cityIbgeCode && holiday.holidayOn === holidayOn,
    )
    if (exists) continue
    businessCalendarDouble.holidays.push({
      cityIbgeCode: rule.cityIbgeCode,
      generatedByRuleId: rule.id,
      holidayOn,
      id: id('generated'),
      kind: rule.kind,
      name: rule.name,
    })
  }
}

function typedOn(rule: MunicipalHolidayRule): number {
  return businessCalendarDouble.holidays.filter(
    (holiday) =>
      holiday.generatedByRuleId === null &&
      holiday.cityIbgeCode === rule.cityIbgeCode &&
      holiday.holidayOn.slice(5) === `${pad(rule.month)}-${pad(rule.day)}` &&
      Number(holiday.holidayOn.slice(0, 4)) >= DOUBLE_CURRENT_YEAR,
  ).length
}

function withKept(rule: MunicipalHolidayRule): MunicipalHolidayRule {
  return { ...rule, typedHolidaysKept: typedOn(rule) }
}

function findRule(ruleId: string): MunicipalHolidayRule {
  const rule = businessCalendarDouble.rules.find((candidate) => candidate.id === ruleId)
  return rule ?? refuse('MUNICIPAL_HOLIDAY_RULE_NOT_FOUND', 404)
}

function replaceRule(rule: MunicipalHolidayRule): void {
  businessCalendarDouble.rules = businessCalendarDouble.rules.map((candidate) =>
    candidate.id === rule.id ? rule : candidate,
  )
}

const rulesClient: Pick<
  BusinessCalendarClient,
  'createRule' | 'deleteRule' | 'listRules' | 'materialize' | 'updateRule'
> = {
  createRule: (fields) =>
    record({
      body: fields,
      key: 'POST /municipal-holiday-rules',
      run: () => {
        const same = businessCalendarDouble.rules.find(
          (rule) =>
            rule.cityIbgeCode === fields.cityIbgeCode &&
            rule.month === fields.month &&
            rule.day === fields.day,
        )
        if (same !== undefined) {
          if (same.name === fields.name && same.kind === fields.kind) {
            return { created: false, rule: same }
          }
          return refuse('MUNICIPAL_HOLIDAY_RULE_CONFLICT', 409)
        }
        const rule: MunicipalHolidayRule = {
          ...fields,
          createdAt: '2026-10-07T12:00:00.000Z',
          id: id('rule'),
          materializedThroughYear: DOUBLE_CURRENT_YEAR + HORIZON_YEARS,
          updatedAt: '2026-10-07T12:00:00.000Z',
        }
        businessCalendarDouble.rules.push(rule)
        generate(rule)
        return { created: true, rule }
      },
    }),
  deleteRule: (ruleId) =>
    record({
      key: `DELETE /municipal-holiday-rules/${ruleId}`,
      run: () => {
        businessCalendarDouble.rules = businessCalendarDouble.rules.filter(
          (rule) => rule.id !== ruleId,
        )
        businessCalendarDouble.holidays = businessCalendarDouble.holidays.filter(
          (holiday) => holiday.generatedByRuleId !== ruleId,
        )
      },
    }),
  listRules: () =>
    record({
      key: 'GET /municipal-holiday-rules',
      run: () => businessCalendarDouble.rules.map(withKept),
    }),
  materialize: () =>
    record({
      key: 'POST /municipal-holiday-rules/materializations',
      run: () => {
        const before = businessCalendarDouble.holidays.length
        for (const rule of businessCalendarDouble.rules) {
          generate(rule)
          replaceRule({ ...rule, materializedThroughYear: DOUBLE_CURRENT_YEAR + HORIZON_YEARS })
        }
        return {
          holidaysCreated: businessCalendarDouble.holidays.length - before,
          rulesProcessed: businessCalendarDouble.rules.length,
        }
      },
    }),
  updateRule: ({ changes, id: ruleId }) =>
    record({
      body: changes,
      key: `PATCH /municipal-holiday-rules/${ruleId}`,
      run: () => {
        const stored = findRule(ruleId)
        const kept = typedOn(stored)
        const updated = { ...stored, ...changes }
        replaceRule(updated)
        businessCalendarDouble.holidays = businessCalendarDouble.holidays.filter(
          (holiday) => holiday.generatedByRuleId !== ruleId,
        )
        generate(updated)
        return { ...updated, typedHolidaysKept: kept }
      },
    }),
}

/** T4.1: editar nome ou tipo de uma importada a adota — vira digitada. Sem `origin` na linha, nada a adotar. */
function adopt<TRow extends Readonly<{ origin?: 'imported' | 'typed' }>>(row: TRow): TRow {
  return row.origin === 'imported' ? { ...row, origin: 'typed' } : row
}

function findHoliday(holidayId: string): MunicipalHoliday {
  const holiday = businessCalendarDouble.holidays.find((candidate) => candidate.id === holidayId)
  return holiday ?? refuse('MUNICIPAL_HOLIDAY_NOT_FOUND', 404)
}

const holidaysClient: Pick<
  BusinessCalendarClient,
  | 'deleteMunicipalHoliday'
  | 'listMunicipalHolidays'
  | 'saveMunicipalHoliday'
  | 'updateMunicipalHoliday'
> = {
  deleteMunicipalHoliday: (holidayId) =>
    record({
      key: `DELETE /municipal-holidays/${holidayId}`,
      run: () => {
        const holiday = businessCalendarDouble.holidays.find(
          (candidate) => candidate.id === holidayId,
        )
        if (holiday?.generatedByRuleId !== undefined && holiday.generatedByRuleId !== null) {
          return refuse('MUNICIPAL_HOLIDAY_GENERATED_BY_RULE', 409)
        }
        businessCalendarDouble.holidays = businessCalendarDouble.holidays.filter(
          (candidate) => candidate.id !== holidayId,
        )
      },
    }),
  listMunicipalHolidays: () =>
    record({ key: 'GET /municipal-holidays', run: () => [...businessCalendarDouble.holidays] }),
  saveMunicipalHoliday: (fields) =>
    record({
      body: fields,
      key: 'POST /municipal-holidays',
      run: () => {
        const stored = businessCalendarDouble.holidays.find(
          (holiday) =>
            holiday.cityIbgeCode === fields.cityIbgeCode && holiday.holidayOn === fields.holidayOn,
        )
        const next: MunicipalHoliday = {
          cityIbgeCode: fields.cityIbgeCode,
          generatedByRuleId: null,
          holidayOn: fields.holidayOn,
          id: stored?.id ?? id('holiday'),
          kind: fields.kind ?? stored?.kind ?? 'holiday',
          name: fields.name,
        }
        businessCalendarDouble.holidays = [
          ...businessCalendarDouble.holidays.filter((holiday) => holiday.id !== next.id),
          next,
        ]
        return { ...next, adoptedFromRuleId: stored?.generatedByRuleId ?? null }
      },
    }),
  updateMunicipalHoliday: ({ changes, id: holidayId }) =>
    record({
      body: changes,
      key: `PATCH /municipal-holidays/${holidayId}`,
      run: () => {
        const stored = findHoliday(holidayId)
        if (stored.generatedByRuleId !== null)
          return refuse('MUNICIPAL_HOLIDAY_GENERATED_BY_RULE', 409)
        const updated = adopt({ ...stored, ...changes })
        businessCalendarDouble.holidays = businessCalendarDouble.holidays.map((holiday) =>
          holiday.id === holidayId ? updated : holiday,
        )
        return updated
      },
    }),
}

function sameStateDay(left: StateHoliday, right: StateHoliday): boolean {
  if (left.stateIbgeCode !== right.stateIbgeCode || left.recurrence !== right.recurrence)
    return false
  if (left.recurrence === 'once' && right.recurrence === 'once')
    return left.holidayOn === right.holidayOn
  return left.recurrence === 'yearly' && right.recurrence === 'yearly'
    ? left.month === right.month && left.day === right.day
    : false
}

const stateClient: Pick<
  BusinessCalendarClient,
  'createStateHoliday' | 'deleteStateHoliday' | 'listStateHolidays' | 'updateStateHoliday'
> = {
  createStateHoliday: (fields) =>
    record({
      body: fields,
      key: 'POST /state-holidays',
      run: () => {
        const candidate = {
          ...fields,
          id: id('state'),
          updatedAt: '2026-10-07T12:00:00.000Z',
        } as StateHoliday
        const same = businessCalendarDouble.stateHolidays.find((holiday) =>
          sameStateDay(holiday, candidate),
        )
        if (same === undefined) {
          businessCalendarDouble.stateHolidays.push(candidate)
          return { created: true, holiday: candidate }
        }
        return same.name === fields.name
          ? { created: false, holiday: same }
          : refuse('STATE_HOLIDAY_CONFLICT', 409)
      },
    }),
  deleteStateHoliday: (holidayId) =>
    record({
      key: `DELETE /state-holidays/${holidayId}`,
      run: () => {
        businessCalendarDouble.stateHolidays = businessCalendarDouble.stateHolidays.filter(
          (holiday) => holiday.id !== holidayId,
        )
      },
    }),
  listStateHolidays: () =>
    record({ key: 'GET /state-holidays', run: () => [...businessCalendarDouble.stateHolidays] }),
  updateStateHoliday: ({ changes, id: holidayId }) =>
    record({
      body: changes,
      key: `PATCH /state-holidays/${holidayId}`,
      run: () => {
        const stored = businessCalendarDouble.stateHolidays.find(
          (holiday) => holiday.id === holidayId,
        )
        if (stored === undefined) return refuse('STATE_HOLIDAY_NOT_FOUND', 404)
        if (stored.recurrence !== changes.recurrence)
          return refuse('STATE_HOLIDAY_RECURRENCE_MISMATCH', 400)
        const { recurrence: ignored, ...fields } = changes
        void ignored
        const movesDate =
          'holidayOn' in fields &&
          stored.recurrence === 'once' &&
          fields.holidayOn !== undefined &&
          fields.holidayOn !== stored.holidayOn
        if (stored.origin === 'imported' && movesDate) {
          return refuse('HOLIDAY_IMPORT_DATE_LOCKED', 409)
        }
        const updated = adopt({ ...stored, ...fields }) as StateHoliday
        businessCalendarDouble.stateHolidays = businessCalendarDouble.stateHolidays.map(
          (holiday) => (holiday.id === holidayId ? updated : holiday),
        )
        return updated
      },
    }),
}

const settingsClient: Pick<BusinessCalendarClient, 'getSettings' | 'saveSettings'> = {
  getSettings: () =>
    record({
      key: 'GET /company-settings/business-calendar',
      run: () => businessCalendarDouble.settings,
    }),
  saveSettings: (saturdayIsBusinessDay) =>
    record({
      body: { saturdayIsBusinessDay },
      key: 'PUT /company-settings/business-calendar',
      run: () => {
        businessCalendarDouble.settings = {
          origin: 'company',
          saturdayIsBusinessDay,
          updatedAt: '2026-10-07T12:00:00.000Z',
        }
        return businessCalendarDouble.settings
      },
    }),
}

const DOUBLE_TODAY = '2026-10-07'

function takeImported(
  input: Readonly<{ holidayId: string; scope: 'city' | 'state' }>,
): HolidayImportSuppression {
  const row =
    input.scope === 'city'
      ? businessCalendarDouble.holidays.find((holiday) => holiday.id === input.holidayId)
      : businessCalendarDouble.stateHolidays.find((holiday) => holiday.id === input.holidayId)
  if (row === undefined) return refuse('HOLIDAY_NOT_IMPORTED', 409)
  if (row.origin !== 'imported') return refuse('HOLIDAY_NOT_IMPORTED', 409)
  const holidayOn = 'holidayOn' in row ? row.holidayOn : DOUBLE_TODAY
  if (holidayOn < DOUBLE_TODAY) return refuse('HOLIDAY_IMPORT_PAST_DATE', 409)
  const ibgeCode = 'cityIbgeCode' in row ? row.cityIbgeCode : row.stateIbgeCode
  const suppression: HolidayImportSuppression = {
    holidayOn,
    ibgeCode,
    id: id('suppression'),
    scope: input.scope,
    suppressedAt: '2026-10-07T12:00:00.000Z',
  }
  businessCalendarDouble.holidays = businessCalendarDouble.holidays.filter(
    (holiday) => holiday.id !== input.holidayId,
  )
  businessCalendarDouble.stateHolidays = businessCalendarDouble.stateHolidays.filter(
    (holiday) => holiday.id !== input.holidayId,
  )
  const removed = businessCalendarDouble.importStatus.removedByProvider
  businessCalendarDouble.importStatus = {
    ...businessCalendarDouble.importStatus,
    removedByProvider: {
      items: removed.items.filter((item) => item.holidayId !== input.holidayId),
      truncated: removed.truncated,
    },
  }
  businessCalendarDouble.suppressions = [...businessCalendarDouble.suppressions, suppression]
  return suppression
}

const importClient: HolidayImportClient = {
  disable: (input) =>
    record({
      body: input,
      key: 'POST /holiday-imports/suppressions',
      run: () => takeImported(input),
    }),
  getStatus: () =>
    record({ key: 'GET /holiday-imports/status', run: () => businessCalendarDouble.importStatus }),
  listSuppressions: ({ page, perPage }) =>
    record({
      key: `GET /holiday-imports/suppressions?page=${String(page)}&perPage=${String(perPage)}`,
      run: () => ({
        items: businessCalendarDouble.suppressions.slice((page - 1) * perPage, page * perPage),
        page,
        perPage,
        total: businessCalendarDouble.suppressions.length,
      }),
    }),
  restore: (suppressionId) =>
    record({
      key: `DELETE /holiday-imports/suppressions/${suppressionId}`,
      run: () => {
        businessCalendarDouble.suppressions = businessCalendarDouble.suppressions.filter(
          (suppression) => suppression.id !== suppressionId,
        )
      },
    }),
}

const client: BusinessCalendarClient = {
  ...holidaysClient,
  ...rulesClient,
  ...settingsClient,
  ...stateClient,
}

void mock.module('@/modules/company-settings/shared/businessCalendarClient.provider', () => ({
  getBusinessCalendarClient: () => client,
  getHolidayImportClient: () => importClient,
  getMunicipalityDirectory: () => (input: Readonly<{ state: string }>) => {
    businessCalendarDouble.calls.push(`DIRECTORY ${input.state}`)
    const entries = businessCalendarDouble.municipalities[input.state] ?? []
    return entries === 'failure'
      ? Promise.reject(new Error('FLEET_MUNICIPALITY_REQUEST_FAILED'))
      : Promise.resolve(entries)
  },
}))
