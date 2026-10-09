/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Respostas fixas no formato que a documentação pública da FeriadosAPI descreve (`id`, `data`
 * `DD/MM/AAAA`, `nome`, `tipo`, `descricao`, `uf`, `codigo_ibge`, `bancario`). Nenhum teste chama a
 * internet: o cliente HTTP é injetado e devolve estas respostas.
 */
export const FERIADOS_API_FIXTURE_TOKEN = 'fixture-token-do-not-leak-0123456789'

export type ProviderHolidayFixture = {
  readonly bancario?: boolean
  readonly codigo_ibge?: string | null
  readonly data: string
  readonly descricao?: string | null
  readonly id?: number | string
  readonly nome: string
  readonly tipo: 'ESTADUAL' | 'FACULTATIVO' | 'MUNICIPAL' | 'NACIONAL'
  readonly uf?: string | null
}

export function buildProviderHoliday(input: ProviderHolidayFixture): ProviderHolidayFixture {
  return { bancario: false, descricao: null, id: 1, ...input }
}

/** Campinas (3509502): o aniversário da cidade, um estadual e um facultativo no mesmo documento. */
export const CAMPINAS_CITY_RESPONSE_2026: readonly ProviderHolidayFixture[] = [
  buildProviderHoliday({
    codigo_ibge: '3509502',
    data: '14/07/2026',
    id: 101,
    nome: 'Aniversário de Campinas',
    tipo: 'MUNICIPAL',
    uf: 'SP',
  }),
  buildProviderHoliday({
    codigo_ibge: null,
    data: '09/07/2026',
    id: 102,
    nome: 'Revolução Constitucionalista',
    tipo: 'ESTADUAL',
    uf: 'SP',
  }),
  buildProviderHoliday({
    data: '17/02/2026',
    id: 103,
    nome: 'Carnaval',
    tipo: 'FACULTATIVO',
    uf: 'SP',
  }),
  buildProviderHoliday({
    data: '25/12/2026',
    id: 104,
    nome: 'Natal',
    tipo: 'NACIONAL',
  }),
]

export const SAO_PAULO_STATE_RESPONSE_2026: readonly ProviderHolidayFixture[] = [
  buildProviderHoliday({
    data: '09/07/2026',
    id: 201,
    nome: 'Revolução Constitucionalista',
    tipo: 'ESTADUAL',
    uf: 'SP',
  }),
]

export const NATIONAL_RESPONSE_2026: readonly ProviderHolidayFixture[] = [
  buildProviderHoliday({
    data: '01/01/2026',
    id: 301,
    nome: 'Confraternização Universal',
    tipo: 'NACIONAL',
  }),
  buildProviderHoliday({ data: '25/12/2026', id: 302, nome: 'Natal', tipo: 'NACIONAL' }),
]

/** Uma página cheia (100): o sinal de que pode haver mais. */
export function buildFullPage(input: { readonly firstDay: number }): ProviderHolidayFixture[] {
  return Array.from({ length: 100 }, (_, index) =>
    buildProviderHoliday({
      data: `${String(((input.firstDay + index) % 28) + 1).padStart(2, '0')}/${String(
        (Math.floor((input.firstDay + index) / 28) % 12) + 1,
      ).padStart(2, '0')}/2026`,
      id: input.firstDay + index,
      nome: `Feriado ${input.firstDay + index}`,
      tipo: 'MUNICIPAL',
    }),
  )
}

export function jsonResponse(
  body: unknown,
  init: { readonly headers?: Record<string, string>; readonly status?: number } = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...init.headers },
    status: init.status ?? 200,
  })
}
