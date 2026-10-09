/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2 (ADR-0100 §4): o painel fala o contrato real de `/holiday-imports/*` — guardas de chaves exatas,
 * cliente, recusas novas (409), a origem de cada linha do calendário e a leitura do status que a tela imprime.
 */
import { describe, expect, test } from 'bun:test'

import english from '@/modules/company-settings/locales/businessCalendar.en.locale.json'
import portuguese from '@/modules/company-settings/locales/businessCalendar.locale.json'
import { BUSINESS_CALENDAR_REFUSAL_CODES } from '@/modules/company-settings/shared/businessCalendar.constant'
import {
  isMunicipalHoliday,
  isSavedMunicipalHoliday,
  isStateHoliday,
} from '@/modules/company-settings/shared/businessCalendarGuards.validation'
import { describeBusinessCalendarRefusal } from '@/modules/company-settings/shared/businessCalendarRefusal.service'
import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'
import {
  buildMunicipalRows,
  buildStateRows,
} from '@/modules/company-settings/shared/businessCalendarRows.service'
import { HOLIDAY_FETCH_FAILURE_CODES } from '@/modules/company-settings/shared/holidayImport.constant'
import {
  createHolidayImportClient,
  type HolidayImportClient,
} from '@/modules/company-settings/shared/holidayImportClient.service'
import {
  isHolidayImportStatus,
  isHolidayImportSuppression,
} from '@/modules/company-settings/shared/holidayImportGuards.validation'
import { resolveImportStatusView } from '@/modules/company-settings/shared/holidayImportStatus.service'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildSavedHoliday,
  buildYearlyStateHoliday,
  envelope,
} from '../fixtures/businessCalendar.fixture'
import {
  buildImportStatus,
  buildSuppression,
  pagedEnvelope,
  REMOVED_HOLIDAY_ID,
  SUPPRESSION_ID,
} from '../fixtures/holidayImport.fixture'

type Recorded = { body: string; method: string; url: string }

function setup(response: () => Response): { calls: Recorded[]; client: HolidayImportClient } {
  const calls: Recorded[] = []
  const client = createHolidayImportClient({
    apiBaseUrl: 'http://api.test',
    fetch: async (request) => {
      calls.push({ body: await request.clone().text(), method: request.method, url: request.url })
      return response()
    },
    getAccessToken: () => Promise.resolve('token-123'),
  })
  return { calls, client }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

async function failureOf(run: () => Promise<unknown>): Promise<BusinessCalendarRequestError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof BusinessCalendarRequestError) return error
    throw error
  }
  throw new Error('NOT_REJECTED')
}

describe('guardas da importação de feriados (chaves exatas)', () => {
  test('o status real é aceito, com `removedByProvider` como `{ items, truncated }`', () => {
    const removed = {
      holidayId: REMOVED_HOLIDAY_ID,
      holidayOn: '2026-11-20',
      ibgeCode: '3509502',
      name: 'Consciência Negra',
      scope: 'city',
    }
    const status = buildImportStatus({
      removedByProvider: { items: [{ ...removed, scope: 'city' }], truncated: true },
    })

    expect(isHolidayImportStatus(status)).toBe(true)
  })

  test('recusa o formato antigo de `removedByProvider` (lista solta) e chave a mais', () => {
    const status = buildImportStatus()

    expect(isHolidayImportStatus({ ...status, removedByProvider: [] })).toBe(false)
    expect(isHolidayImportStatus({ ...status, companyId: 'c-1' })).toBe(false)
    expect(isHolidayImportStatus({ ...status, pairs: { ...status.pairs, extra: 1 } })).toBe(false)
  })

  test('recusa data de última busca que não é texto nem nula, e escopo desconhecido', () => {
    const status = buildImportStatus()

    expect(isHolidayImportStatus({ ...status, lastFetchedAt: 123 })).toBe(false)
    expect(isHolidayImportStatus({ ...status, lastFetchedAt: null })).toBe(true)
    expect(
      isHolidayImportStatus({
        ...status,
        removedByProvider: {
          items: [
            {
              holidayId: REMOVED_HOLIDAY_ID,
              holidayOn: '2026-11-20',
              ibgeCode: '35',
              name: 'X',
              scope: 'national',
            },
          ],
          truncated: false,
        },
      }),
    ).toBe(false)
  })

  test('a supressão tem as cinco chaves e escopo `city` ou `state`', () => {
    expect(isHolidayImportSuppression(buildSuppression())).toBe(true)
    expect(isHolidayImportSuppression({ ...buildSuppression(), scope: 'national' })).toBe(false)
    expect(isHolidayImportSuppression({ ...buildSuppression(), companyId: 'c' })).toBe(false)
  })

  test('a linha municipal e a estadual aceitam `origin` opcional (`typed` ou `imported`)', () => {
    expect(isMunicipalHoliday(buildHoliday())).toBe(true)
    expect(isMunicipalHoliday({ ...buildHoliday(), origin: 'imported' })).toBe(true)
    expect(isMunicipalHoliday({ ...buildHoliday(), origin: 'typed' })).toBe(true)
    expect(isMunicipalHoliday({ ...buildHoliday(), origin: 'code' })).toBe(false)
    expect(isMunicipalHoliday({ ...buildHoliday(), provider: 'x' })).toBe(false)
    expect(isSavedMunicipalHoliday({ ...buildSavedHoliday(), origin: 'typed' })).toBe(true)
    expect(isStateHoliday({ ...buildOnceStateHoliday(), origin: 'imported' })).toBe(true)
    expect(isStateHoliday({ ...buildOnceStateHoliday(), origin: 'rule' })).toBe(false)
    expect(isStateHoliday(buildYearlyStateHoliday())).toBe(true)
  })
})

describe('cliente da importação de feriados', () => {
  test('GET /holiday-imports/status lê o status e devolve-o intacto', async () => {
    const status = buildImportStatus({ failures: [{ errorCode: 'provider_unreachable', pairs: 2 }] })
    const { calls, client } = setup(() => json(envelope(status)))

    expect(await client.getStatus()).toEqual(status)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/status')
  })

  test('status com formato inesperado é recusado como resposta inválida', async () => {
    const { client } = setup(() => json(envelope({ ...buildImportStatus(), removedByProvider: [] })))

    const failure = await failureOf(() => client.getStatus())

    expect(failure.code).toBe('BUSINESS_CALENDAR_RESPONSE_INVALID')
  })

  test('GET /holiday-imports/suppressions leva `page` e `perPage` e lê o envelope paginado', async () => {
    const page = { items: [buildSuppression()], page: 2, perPage: 20, total: 21 }
    const { calls, client } = setup(() =>
      json(pagedEnvelope({ data: page.items, page: 2, perPage: 20, total: 21 })),
    )

    expect(await client.listSuppressions({ page: 2, perPage: 20 })).toEqual(page)
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/suppressions?page=2&perPage=20')
  })

  test('lista de supressões sem `pagination` (envelope simples) é recusada', async () => {
    const { client } = setup(() => json(envelope([buildSuppression()])))

    const failure = await failureOf(() => client.listSuppressions({ page: 1, perPage: 20 }))

    expect(failure.code).toBe('BUSINESS_CALENDAR_RESPONSE_INVALID')
  })

  test('POST /holiday-imports/suppressions manda só `holidayId` e `scope` e lê a supressão criada', async () => {
    const created = buildSuppression()
    const { calls, client } = setup(() => json(envelope(created), 201))

    const suppression = await client.disable({ holidayId: REMOVED_HOLIDAY_ID, scope: 'city' })

    expect(suppression).toEqual(created)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/suppressions')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ holidayId: REMOVED_HOLIDAY_ID, scope: 'city' })
  })

  test('DELETE /holiday-imports/suppressions/:id restaura (204 sem corpo)', async () => {
    const { calls, client } = setup(() => new Response(null, { status: 204 }))

    await client.restore(SUPPRESSION_ID)

    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe(`http://api.test/holiday-imports/suppressions/${SUPPRESSION_ID}`)
  })

  test('o 409 do desligar sobe com o código da API, que a tela traduz', async () => {
    const { client } = setup(() =>
      json({ error: { code: 'HOLIDAY_IMPORT_PAST_DATE', message: 'x' } }, 409),
    )

    const failure = await failureOf(() =>
      client.disable({ holidayId: REMOVED_HOLIDAY_ID, scope: 'state' }),
    )

    expect(failure.code).toBe('HOLIDAY_IMPORT_PAST_DATE')
    expect(failure.status).toBe(409)
  })
})

describe('recusas novas da importação (409)', () => {
  test.each(['HOLIDAY_IMPORT_PAST_DATE', 'HOLIDAY_IMPORT_DATE_LOCKED', 'HOLIDAY_NOT_IMPORTED'])(
    '%s é código conhecido com texto próprio nos dois idiomas',
    (code) => {
      expect(BUSINESS_CALENDAR_REFUSAL_CODES).toContain(code)
      const refusal = describeBusinessCalendarRefusal(
        new BusinessCalendarRequestError({ code, status: 409 }),
      )

      expect(refusal.messageKey).toBe(`errors.${code}`)
      expect(Object.keys(portuguese.errors)).toContain(code)
      expect(Object.keys(english.errors)).toContain(code)
    },
  )

  test('a data passada diz que só vale de hoje em diante; a data travada manda desligar e cadastrar', () => {
    expect(portuguese.errors.HOLIDAY_IMPORT_PAST_DATE).toContain('hoje em diante')
    expect(portuguese.errors.HOLIDAY_IMPORT_DATE_LOCKED).toContain('desligue')
    expect(portuguese.errors.HOLIDAY_IMPORT_DATE_LOCKED).toContain('cadastre')
  })
})

describe('origem de cada linha do calendário', () => {
  const labelOf = (code: string): string => code

  test('a regra "todo ano" é `rule`; a data com `origin` informada usa o que a API disse', () => {
    const rows = buildMunicipalRows({
      holidays: [
        buildHoliday({ id: 'a' }),
        { ...buildHoliday({ id: 'b', holidayOn: '2026-11-20' }), origin: 'imported' },
        { ...buildHoliday({ id: 'c', holidayOn: '2026-11-21' }), origin: 'typed' },
      ],
      labelOf,
      rules: [buildRule()],
    })

    expect(rows.map((row) => [row.id, row.provenance])).toEqual([
      [buildRule().id, 'rule'],
      ['a', 'unknown'],
      ['b', 'imported'],
      ['c', 'typed'],
    ])
  })

  test('o estadual "todo ano" é sempre digitado; o de data fixa segue a API', () => {
    const rows = buildStateRows({
      holidays: [
        buildYearlyStateHoliday(),
        { ...buildOnceStateHoliday({ id: 'o1' }), origin: 'imported' },
        buildOnceStateHoliday({ id: 'o2' }),
      ],
      labelOf,
    })

    expect(rows.map((row) => row.provenance)).toEqual(['typed', 'imported', 'unknown'])
  })
})

describe('leitura do status que a tela imprime', () => {
  test('rotina em dia: a maior parte concluída, sem falha, com última busca', () => {
    const view = resolveImportStatusView(buildImportStatus())

    expect(view.headline).toBe('healthy')
    expect(view.progress).toEqual({ done: 8, ratio: 0.8, total: 10 })
    expect(view.failures).toEqual([])
  })

  test('nunca buscou: aguarda a primeira execução da rotina diária', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        lastFetchedAt: null,
        pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
      }),
    )

    expect(view.headline).toBe('waiting')
  })

  test('empresa fora da importação vence qualquer outro estado', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        failures: [{ errorCode: 'provider_unreachable', pairs: 3 }],
        isEnabled: false,
      }),
    )

    expect(view.headline).toBe('disabled')
  })

  test('falha vence cota; cota vence "em dia"', () => {
    const quota = {
      done: 5,
      failed: 0,
      notCovered: 0,
      pending: 0,
      quotaExhausted: 5,
      total: 10,
    }

    expect(resolveImportStatusView(buildImportStatus({ pairs: quota })).headline).toBe('quota')
    expect(
      resolveImportStatusView(
        buildImportStatus({
          failures: [{ errorCode: 'provider_unauthorized', pairs: 2 }],
          pairs: quota,
        }),
      ).headline,
    ).toBe('failing')
  })

  test('total zero não divide por zero', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        pairs: { done: 0, failed: 0, notCovered: 0, pending: 0, quotaExhausted: 0, total: 0 },
      }),
    )

    expect(view.progress.ratio).toBe(0)
  })

  test('cada falha vira texto pelo código; código desconhecido cai no texto genérico', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        failures: [
          { errorCode: 'provider_unreachable', pairs: 2 },
          { errorCode: 'algo_novo', pairs: 1 },
        ],
      }),
    )

    expect(view.failures).toEqual([
      { code: 'provider_unreachable', messageKey: 'import.failures.provider_unreachable', pairs: 2 },
      { code: 'algo_novo', messageKey: 'import.failures.unknown', pairs: 1 },
    ])
  })
})

describe('locale da importação', () => {
  test('todo código de falha da rotina tem texto nos dois idiomas', () => {
    for (const code of HOLIDAY_FETCH_FAILURE_CODES) {
      expect(Object.keys(portuguese.import.failures)).toContain(code)
      expect(Object.keys(english.import.failures)).toContain(code)
    }
    expect(typeof portuguese.import.failures.unknown).toBe('string')
  })

  test('"restaurar" diz que volta na próxima execução diária, e não na hora', () => {
    expect(portuguese.import.suppressions.restoredNotice).toContain('próxima execução diária')
    expect(portuguese.import.suppressions.hint).toContain('próxima execução diária')
    expect(english.import.suppressions.restoredNotice).toContain('next daily run')
  })

  test('apagar um feriado digitado também o suprime: a confirmação avisa', () => {
    expect(portuguese.dialog.suppressionNote).toContain('FeriadosAPI')
    expect(portuguese.dialog.suppressionNote).toContain('Desligados')
  })
})
