/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 Fase 2 (`web.md` §15): a API do calendário dublada para os prints de revisão de design — dados
 * fictícios e as MESMAS transições da T1.3 que a tela exibe (a regra gera datas, a digitada vence a gerada,
 * `POST` numa gerada é adoção). Nada aqui lê um banco. Fora do smoke da CI.
 */
import type { Page, Route } from '@playwright/test'

import { fulfillJson } from './spec-237-prints-smoke.helper'

type Json = Record<string, unknown>

const CAMPINAS = '3509502'
const CURITIBA = '4106902'
const BELO_HORIZONTE = '3106200'
const RULE_CAMPINAS = '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a01'
const RULE_CURITIBA = '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a02'
const RULE_BELO_HORIZONTE = '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a03'
const FIRST_YEAR = 2026
const GENERATED_YEARS = 11

export type CalendarScenario = Readonly<{
  /** `true` deixa a regra de Curitiba só até 2027 — abaixo do ano corrente + 2, dispara o aviso de horizonte. */
  hasShortHorizon: boolean
}>

function rule(
  input: Readonly<{
    id: string
    name: string
    city: string
    day: number
    month: number
    through: number
    kept: number
    kind: string
  }>,
): Json {
  return {
    cityIbgeCode: input.city,
    createdAt: '2026-10-01T12:00:00.000Z',
    day: input.day,
    id: input.id,
    kind: input.kind,
    materializedThroughYear: input.through,
    month: input.month,
    name: input.name,
    typedHolidaysKept: input.kept,
    updatedAt: '2026-10-01T12:00:00.000Z',
  }
}

function generated(
  input: Readonly<{ city: string; month: number; day: number; name: string; ruleId: string }>,
): Json[] {
  return Array.from({ length: GENERATED_YEARS }, (_, index) => ({
    cityIbgeCode: input.city,
    generatedByRuleId: input.ruleId,
    holidayOn: `${String(FIRST_YEAR + index)}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`,
    id: `generated-${input.ruleId.slice(-2)}-${String(index)}`,
    kind: 'city_anniversary',
    name: input.name,
  }))
}

function typed(
  input: Readonly<{ city: string; date: string; id: string; kind: string; name: string }>,
): Json {
  return {
    cityIbgeCode: input.city,
    generatedByRuleId: null,
    holidayOn: input.date,
    id: input.id,
    kind: input.kind,
    name: input.name,
  }
}

function stateHoliday(input: Json): Json {
  return { updatedAt: '2026-10-01T12:00:00.000Z', ...input }
}

export function buildCalendarState(scenario: CalendarScenario): {
  holidays: Json[]
  rules: Json[]
  settings: Json
  stateHolidays: Json[]
} {
  return {
    holidays: [
      ...generated({
        city: CAMPINAS,
        day: 14,
        month: 7,
        name: 'Aniversário de Campinas',
        ruleId: RULE_CAMPINAS,
      }),
      typed({
        city: CAMPINAS,
        date: '2027-07-14',
        id: 'typed-campinas-2027',
        kind: 'holiday',
        name: 'Ponto facultativo do aniversário',
      }),
      typed({
        city: CURITIBA,
        date: '2026-09-08',
        id: 'typed-curitiba',
        kind: 'holiday',
        name: 'Nossa Senhora da Luz',
      }),
    ],
    rules: [
      rule({
        city: CAMPINAS,
        day: 14,
        id: RULE_CAMPINAS,
        kept: 1,
        kind: 'city_anniversary',
        month: 7,
        name: 'Aniversário de Campinas',
        through: 2036,
      }),
      rule({
        city: CURITIBA,
        day: 29,
        id: RULE_CURITIBA,
        kept: 0,
        kind: 'city_anniversary',
        month: 3,
        name: 'Aniversário de Curitiba',
        through: scenario.hasShortHorizon ? 2027 : 2036,
      }),
      rule({
        city: BELO_HORIZONTE,
        day: 12,
        id: RULE_BELO_HORIZONTE,
        kept: 0,
        kind: 'city_anniversary',
        month: 12,
        name: 'Aniversário de Belo Horizonte',
        through: 2036,
      }),
    ],
    settings: { origin: 'default', saturdayIsBusinessDay: false, updatedAt: null },
    stateHolidays: [
      stateHoliday({
        day: 9,
        id: 'state-sp',
        month: 7,
        name: 'Revolução Constitucionalista',
        recurrence: 'yearly',
        stateIbgeCode: '35',
      }),
      stateHoliday({
        holidayOn: '2026-12-19',
        id: 'state-pr',
        name: 'Emancipação Política do Paraná',
        recurrence: 'once',
        stateIbgeCode: '41',
      }),
      stateHoliday({
        day: 23,
        id: 'state-rj',
        month: 4,
        name: 'Dia de São Jorge',
        recurrence: 'yearly',
        stateIbgeCode: '33',
      }),
    ],
  }
}

const MUNICIPALITIES: Readonly<Record<string, readonly Json[]>> = {
  MG: [{ codigo_ibge: BELO_HORIZONTE, nome: 'BELO HORIZONTE' }],
  PR: [{ codigo_ibge: CURITIBA, nome: 'CURITIBA' }],
  SP: [
    { codigo_ibge: CAMPINAS, nome: 'CAMPINAS' },
    { codigo_ibge: '3550308', nome: 'SÃO PAULO' },
    { codigo_ibge: '3543402', nome: 'RIBEIRÃO PRETO' },
  ],
}

const COMPANY_SETTINGS = {
  activation: null,
  billing: null,
  cteRetry: null,
  mdfe: null,
  cte: { environment: 'homologation', nextNumber: '1', series: '1', version: '1' },
  profile: {
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: '12345678000199',
    complement: '',
    district: 'Centro',
    email: 'fiscal@example.test',
    legalName: 'Transportadora Sintética LTDA',
    municipalRegistration: '',
    number: '1',
    phone: '1600000000',
    postalCode: '14000000',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '154336693112',
    street: 'Rua Sintética',
    taxRegime: '3',
    tradeName: 'Transportadora Sintética',
    version: '1',
  },
}

/** O cabeçalho busca a foto da pessoa em toda página: 404 é a resposta de quem não tem foto. */
async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', (route) => fulfillJson(route, {}, 404))
}

/**
 * O que a página de Configurações lê para abrir (identidade só com `settings.manage`, empresa, certificados, foto).
 * Sem `access-control-allow-origin` fixo: o preview dos prints sobe numa porta própria, e o Playwright o acrescenta.
 */
export async function mockSettingsShell(page: Page): Promise<void> {
  const identity = {
    company: { id: '00000000-0000-4000-8000-000000000001' },
    identity: { userId: '00000000-0000-4000-8000-000000000002' },
    permissions: ['settings.manage'],
    roles: ['viewer'],
  }
  // Com `VITE_SMOKE_AUTH_BYPASS` a identidade vem do `sessionStorage`, não da rede.
  await page.addInitScript((value) => {
    window.sessionStorage.setItem('transportada.smoke-auth-me', JSON.stringify({ data: value }))
  }, identity)
  await page.route('**/auth/me', (route) => fulfillJson(route, { data: identity }))
  await registerUserPictureMock(page)
  await page.route(/\/company-settings$/, (route) => fulfillJson(route, { data: COMPANY_SETTINGS }))
  await page.route(/\/digital-certificates(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
}

/** Registra toda rota do calendário; a escrita responde como a API responde e muda o estado que a tela relê. */
export async function mockCalendarApi(
  input: Readonly<{ page: Page; scenario: CalendarScenario }>,
): Promise<ReturnType<typeof buildCalendarState>> {
  const state = buildCalendarState(input.scenario)
  const { page } = input
  await page.route('https://brasilapi.com.br/api/ibge/municipios/v1/*', (route) => {
    const acronym = route.request().url().split('/').pop() ?? ''
    return route.fulfill({
      body: JSON.stringify(MUNICIPALITIES[acronym] ?? []),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.route(/\/company-settings\/business-calendar$/, (route) =>
    fulfillJson(route, { data: state.settings }),
  )
  await page.route(/\/municipal-holiday-rules(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: state.rules }),
  )
  await page.route(/\/municipal-holidays(?:\?.*)?$/, (route) => handleHolidays({ route, state }))
  await page.route(/\/state-holidays(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: state.stateHolidays }),
  )
  return state
}

async function handleHolidays(
  input: Readonly<{ route: Route; state: ReturnType<typeof buildCalendarState> }>,
): Promise<void> {
  const { route, state } = input
  if (route.request().method() !== 'POST') {
    await fulfillJson(route, { data: state.holidays })
    return
  }
  const body = route.request().postDataJSON() as Json
  const stored = state.holidays.find(
    (holiday) => holiday.cityIbgeCode === body.cityIbgeCode && holiday.holidayOn === body.holidayOn,
  )
  const saved = {
    cityIbgeCode: body.cityIbgeCode,
    generatedByRuleId: null,
    holidayOn: body.holidayOn,
    id: stored?.id ?? 'typed-new',
    kind: body.kind ?? 'holiday',
    name: body.name,
  }
  state.holidays = [...state.holidays.filter((holiday) => holiday.id !== saved.id), saved]
  await fulfillJson(
    route,
    { data: { ...saved, adoptedFromRuleId: stored?.generatedByRuleId ?? null } },
    201,
  )
}
