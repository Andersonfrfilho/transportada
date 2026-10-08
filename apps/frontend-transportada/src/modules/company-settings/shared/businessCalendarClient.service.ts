/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BUSINESS_CALENDAR_ERROR, BUSINESS_CALENDAR_PATH } from './businessCalendar.constant'
import type {
  BusinessCalendarSettings,
  MaterializationSummary,
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
import {
  isBusinessCalendarSettings,
  isDataEnvelope,
  isMaterializationSummary,
  isMunicipalHoliday,
  isMunicipalHolidayRule,
  isSavedMunicipalHoliday,
  isStateHoliday,
} from './businessCalendarGuards.validation'
import {
  BusinessCalendarRequestError,
  requestBusinessCalendar,
  type BusinessCalendarDependencies,
  type BusinessCalendarRequest,
} from './businessCalendarRequest.service'

const PATH = BUSINESS_CALENDAR_PATH
const CREATED_STATUS = 201

type Guard<TData> = (value: unknown) => value is TData
type Call = Omit<BusinessCalendarRequest, 'dependencies'>

export type BusinessCalendarClient = Readonly<{
  createRule: (
    fields: MunicipalRuleFields,
  ) => Promise<Readonly<{ created: boolean; rule: MunicipalHolidayRule }>>
  createStateHoliday: (
    fields: StateHolidayFields,
  ) => Promise<Readonly<{ created: boolean; holiday: StateHoliday }>>
  deleteMunicipalHoliday: (id: string) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  deleteStateHoliday: (id: string) => Promise<void>
  getSettings: () => Promise<BusinessCalendarSettings>
  listMunicipalHolidays: () => Promise<readonly MunicipalHoliday[]>
  listRules: () => Promise<readonly MunicipalHolidayRule[]>
  listStateHolidays: () => Promise<readonly StateHoliday[]>
  materialize: () => Promise<MaterializationSummary>
  saveMunicipalHoliday: (fields: MunicipalHolidayFields) => Promise<SavedMunicipalHoliday>
  saveSettings: (saturdayIsBusinessDay: boolean) => Promise<BusinessCalendarSettings>
  updateMunicipalHoliday: (
    input: Readonly<{ changes: MunicipalHolidayChanges; id: string }>,
  ) => Promise<MunicipalHoliday>
  updateRule: (
    input: Readonly<{ changes: MunicipalRuleChanges; id: string }>,
  ) => Promise<MunicipalHolidayRule>
  updateStateHoliday: (
    input: Readonly<{ changes: StateHolidayChanges; id: string }>,
  ) => Promise<StateHoliday>
}>

function invalidResponse(): BusinessCalendarRequestError {
  return new BusinessCalendarRequestError({
    code: BUSINESS_CALENDAR_ERROR.RESPONSE_INVALID,
    status: 0,
  })
}

function unwrap(body: unknown): unknown {
  if (!isDataEnvelope(body)) throw invalidResponse()
  return body.data
}

function resource(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}`
}

export function createBusinessCalendarClient(
  dependencies: BusinessCalendarDependencies,
): BusinessCalendarClient {
  const call = (input: Call) => requestBusinessCalendar({ ...input, dependencies })

  async function readOne<TData>(
    input: Readonly<{ call: Call; guard: Guard<TData> }>,
  ): Promise<TData> {
    const data = unwrap((await call(input.call)).body)
    if (!input.guard(data)) throw invalidResponse()
    return data
  }

  async function readMany<TItem>(
    input: Readonly<{ call: Call; guard: Guard<TItem> }>,
  ): Promise<readonly TItem[]> {
    const data = unwrap((await call(input.call)).body)
    if (!Array.isArray(data) || !data.every(input.guard)) throw invalidResponse()
    return data
  }

  async function writeOne<TData>(
    input: Readonly<{ call: Call; guard: Guard<TData> }>,
  ): Promise<Readonly<{ created: boolean; data: TData }>> {
    const response = await call(input.call)
    const data = unwrap(response.body)
    if (!input.guard(data)) throw invalidResponse()
    return { created: response.status === CREATED_STATUS, data }
  }

  async function remove(path: string): Promise<void> {
    await call({ method: 'DELETE', path })
  }

  return {
    createRule: async (fields) => {
      const { created, data } = await writeOne({
        call: { body: fields, method: 'POST', path: PATH.MUNICIPAL_RULES },
        guard: isMunicipalHolidayRule,
      })
      return { created, rule: data }
    },
    createStateHoliday: async (fields) => {
      const { created, data } = await writeOne({
        call: { body: fields, method: 'POST', path: PATH.STATE_HOLIDAYS },
        guard: isStateHoliday,
      })
      return { created, holiday: data }
    },
    deleteMunicipalHoliday: (id) => remove(resource(PATH.MUNICIPAL_HOLIDAYS, id)),
    deleteRule: (id) => remove(resource(PATH.MUNICIPAL_RULES, id)),
    deleteStateHoliday: (id) => remove(resource(PATH.STATE_HOLIDAYS, id)),
    getSettings: () =>
      readOne({ call: { method: 'GET', path: PATH.SETTINGS }, guard: isBusinessCalendarSettings }),
    listMunicipalHolidays: () =>
      readMany({
        call: { method: 'GET', path: PATH.MUNICIPAL_HOLIDAYS },
        guard: isMunicipalHoliday,
      }),
    listRules: () =>
      readMany({
        call: { method: 'GET', path: PATH.MUNICIPAL_RULES },
        guard: isMunicipalHolidayRule,
      }),
    listStateHolidays: () =>
      readMany({ call: { method: 'GET', path: PATH.STATE_HOLIDAYS }, guard: isStateHoliday }),
    materialize: () =>
      readOne({
        call: { method: 'POST', path: PATH.MATERIALIZATIONS },
        guard: isMaterializationSummary,
      }),
    saveMunicipalHoliday: (fields) =>
      readOne({
        call: { body: fields, method: 'POST', path: PATH.MUNICIPAL_HOLIDAYS },
        guard: isSavedMunicipalHoliday,
      }),
    saveSettings: (saturdayIsBusinessDay) =>
      readOne({
        call: { body: { saturdayIsBusinessDay }, method: 'PUT', path: PATH.SETTINGS },
        guard: isBusinessCalendarSettings,
      }),
    updateMunicipalHoliday: ({ changes, id }) =>
      readOne({
        call: { body: changes, method: 'PATCH', path: resource(PATH.MUNICIPAL_HOLIDAYS, id) },
        guard: isMunicipalHoliday,
      }),
    updateRule: ({ changes, id }) =>
      readOne({
        call: { body: changes, method: 'PATCH', path: resource(PATH.MUNICIPAL_RULES, id) },
        guard: isMunicipalHolidayRule,
      }),
    updateStateHoliday: ({ changes, id }) =>
      readOne({
        call: { body: changes, method: 'PATCH', path: resource(PATH.STATE_HOLIDAYS, id) },
        guard: isStateHoliday,
      }),
  }
}
