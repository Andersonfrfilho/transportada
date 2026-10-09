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
import {
  HOLIDAY_FETCH_FAILURE_CODES,
  HOLIDAY_IMPORT_HEADLINE,
} from '@/modules/company-settings/shared/holidayImport.constant'
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

  test('os campos novos do status são opcionais: sem `lastRun` nem `planRestricted` (API antiga) o status ainda vale', () => {
    const { lastRun: omittedRun, ...withoutRun } = buildImportStatus()
    const { planRestricted: omittedPlan, ...oldPairs } = buildImportStatus().pairs

    expect(omittedRun).toBeDefined()
    expect(omittedPlan).toBe(0)
    expect(isHolidayImportStatus(withoutRun)).toBe(true)
    expect(isHolidayImportStatus({ ...withoutRun, pairs: oldPairs })).toBe(true)
  })

  test('`lastRun` aceita o ciclo encerrado ou null, e recusa chave a mais ou tipo errado', () => {
    const status = buildImportStatus()
    const run = { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' }

    expect(isHolidayImportStatus({ ...status, lastRun: run })).toBe(true)
    expect(isHolidayImportStatus({ ...status, lastRun: null })).toBe(true)
    expect(isHolidayImportStatus({ ...status, lastRun: { ...run, counters: {} } })).toBe(false)
    expect(isHolidayImportStatus({ ...status, lastRun: { outcome: 'succeeded' } })).toBe(false)
    expect(isHolidayImportStatus({ ...status, lastRun: { ...run, outcome: 7 } })).toBe(false)
    expect(isHolidayImportStatus({ ...status, lastRun: { ...run, finishedAt: null } })).toBe(false)
  })

  test('`pairs.planRestricted` é número; chave desconhecida em `pairs` segue recusada', () => {
    const status = buildImportStatus()

    expect(
      isHolidayImportStatus({ ...status, pairs: { ...status.pairs, planRestricted: 3 } }),
    ).toBe(true)
    expect(
      isHolidayImportStatus({ ...status, pairs: { ...status.pairs, planRestricted: '3' } }),
    ).toBe(false)
    expect(isHolidayImportStatus({ ...status, pairs: { ...status.pairs, extra: 1 } })).toBe(false)
  })

  test('a chave nova não afrouxa a guarda: chave desconhecida no status segue recusada', () => {
    const status = buildImportStatus({
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'succeeded' },
    })

    expect(isHolidayImportStatus({ ...status, budget: 1000 })).toBe(false)
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
    const status = buildImportStatus({
      failures: [{ errorCode: 'provider_unreachable', pairs: 2 }],
    })
    const { calls, client } = setup(() => json(envelope(status)))

    expect(await client.getStatus()).toEqual(status)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/status')
  })

  test('GET /holiday-imports/status devolve intactos `lastRun` e `pairs.planRestricted`', async () => {
    const status = buildImportStatus({
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' },
      pairs: {
        done: 0,
        failed: 2,
        notCovered: 0,
        pending: 8,
        planRestricted: 2,
        quotaExhausted: 0,
        total: 10,
      },
    })
    const { client } = setup(() => json(envelope(status)))

    expect(await client.getStatus()).toEqual(status)
  })

  test('status com formato inesperado é recusado como resposta inválida', async () => {
    const { client } = setup(() =>
      json(envelope({ ...buildImportStatus(), removedByProvider: [] })),
    )

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
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      holidayId: REMOVED_HOLIDAY_ID,
      scope: 'city',
    })
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
    expect(portuguese.errors.HOLIDAY_IMPORT_DATE_LOCKED).toContain('Desligue')
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

  test('a última execução recusada pelo fornecedor vence a espera: token errado não é "aguardando"', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        lastFetchedAt: null,
        lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' },
        pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
      }),
    )

    expect(view.headline).toBe('unauthorized')
  })

  test('cada falha de fornecedor da última execução tem a própria manchete', () => {
    const headlineOf = (outcome: string) =>
      resolveImportStatusView(
        buildImportStatus({ lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome } }),
      ).headline

    expect(headlineOf('provider_unauthorized')).toBe('unauthorized')
    expect(headlineOf('provider_unreachable')).toBe('unreachable')
    expect(headlineOf('malformed_response')).toBe('malformed')
  })

  test('última execução que terminou bem, cancelada ou com desfecho desconhecido não manda na manchete', () => {
    const headlineOf = (outcome: string) =>
      resolveImportStatusView(
        buildImportStatus({ lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome } }),
      ).headline

    for (const outcome of ['succeeded', 'cancelled', 'abandoned', 'unexpected_error', 'novo']) {
      expect(headlineOf(outcome)).toBe('healthy')
    }
  })

  test('`lastRun` ausente (API antiga) ou null mantém o comportamento de antes', () => {
    const { lastRun: omitted, ...withoutRun } = buildImportStatus({ lastFetchedAt: null })
    const withNullRun = buildImportStatus({ lastFetchedAt: null, lastRun: null })

    expect(omitted).toBeDefined()
    expect(resolveImportStatusView(withoutRun).headline).toBe('waiting')
    expect(resolveImportStatusView(withNullRun).headline).toBe('waiting')
  })

  test('empresa desligada vence até a recusa do fornecedor; a recusa vence as falhas por par', () => {
    const run = { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' }
    const failures = [{ errorCode: 'provider_unreachable', pairs: 2 }]

    const disabled = buildImportStatus({ isEnabled: false, lastRun: run })
    const refused = buildImportStatus({ failures, lastRun: run })

    expect(resolveImportStatusView(disabled).headline).toBe('disabled')
    expect(resolveImportStatusView(refused).headline).toBe('unauthorized')
  })

  test('par fora do plano não é falha: o aviso sai à parte e as demais cidades seguem "em dia"', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        failures: [{ errorCode: 'provider_plan_restricted', pairs: 2 }],
        pairs: {
          done: 6,
          failed: 2,
          notCovered: 0,
          pending: 2,
          planRestricted: 2,
          quotaExhausted: 0,
          total: 10,
        },
      }),
    )

    expect(view.headline).toBe('healthy')
    expect(view.planRestrictedPairs).toBe(2)
    expect(view.failures).toEqual([])
    expect(view.failedPairs).toBe(0)
  })

  test('falha real junto do par fora do plano: "com falhas", só com a falha real na lista', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        failures: [
          { errorCode: 'provider_plan_restricted', pairs: 2 },
          { errorCode: 'persistence_failed', pairs: 1 },
        ],
        pairs: {
          done: 5,
          failed: 3,
          notCovered: 0,
          pending: 2,
          planRestricted: 2,
          quotaExhausted: 0,
          total: 10,
        },
      }),
    )

    expect(view.headline).toBe('failing')
    expect(view.failures.map((failure) => failure.code)).toEqual(['persistence_failed'])
    expect(view.failedPairs).toBe(1)
    expect(view.planRestrictedPairs).toBe(2)
  })

  test('API antiga, sem `planRestricted`: o par fora do plano continua falha na lista, como antes', () => {
    const view = resolveImportStatusView(
      buildImportStatus({
        failures: [{ errorCode: 'provider_plan_restricted', pairs: 2 }],
        pairs: { done: 6, failed: 2, notCovered: 0, pending: 2, quotaExhausted: 0, total: 10 },
      }),
    )

    expect(view.headline).toBe('failing')
    expect(view.planRestrictedPairs).toBe(0)
    expect(view.failures.map((failure) => failure.code)).toEqual(['provider_plan_restricted'])
    expect(view.failedPairs).toBe(2)
  })

  test('a data do último ciclo da rotina sai na visão; sem ciclo, null', () => {
    const withoutCycle = buildImportStatus({ lastRun: null })

    expect(resolveImportStatusView(buildImportStatus()).lastRunFinishedAt).toBe(
      '2026-10-09T09:31:00.000Z',
    )
    expect(resolveImportStatusView(withoutCycle).lastRunFinishedAt).toBeNull()
  })

  test('a manchete de cota não existe mais: ninguém a alcançava', () => {
    expect(Object.values(HOLIDAY_IMPORT_HEADLINE)).not.toContain('quota')
    expect(Object.keys(portuguese.import.status.headline)).not.toContain('quota')
    expect(Object.keys(portuguese.import.status.explain)).not.toContain('quota')
    expect(Object.keys(english.import.status.headline)).not.toContain('quota')
    expect(Object.keys(english.import.status.explain)).not.toContain('quota')
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
          { errorCode: 'persistence_failed', pairs: 3 },
          { errorCode: 'algo_novo', pairs: 1 },
        ],
      }),
    )

    expect(view.failures).toEqual([
      {
        code: 'provider_unreachable',
        messageKey: 'import.failures.provider_unreachable',
        pairs: 2,
      },
      {
        code: 'persistence_failed',
        messageKey: 'import.failures.persistence_failed',
        pairs: 3,
      },
      { code: 'algo_novo', messageKey: 'import.failures.unknown', pairs: 1 },
    ])
  })
})

describe('locale da importação', () => {
  test('toda manchete tem título e explicação nos dois idiomas, e os dois idiomas têm as mesmas chaves', () => {
    for (const headline of Object.values(HOLIDAY_IMPORT_HEADLINE)) {
      for (const messages of [portuguese.import.status, english.import.status]) {
        expect(Object.keys(messages.headline)).toContain(headline)
        expect(Object.keys(messages.explain)).toContain(headline)
      }
    }
    expect(Object.keys(english.import.status).sort()).toEqual(
      Object.keys(portuguese.import.status).sort(),
    )
  })

  test('as manchetes de fornecedor dizem o que fazer, em pt-BR', () => {
    const { explain, headline } = portuguese.import.status as unknown as {
      explain: Record<string, string>
      headline: Record<string, string>
    }

    expect(headline.unauthorized).toBe(
      'Fornecedor recusou o acesso: token inválido ou plano sem cobertura',
    )
    expect(explain.unauthorized).toContain('chave')
    expect(explain.unauthorized).toContain('plano')
    expect(explain.unauthorized).toContain('Operações')
    expect(headline.unreachable).toBe('Fornecedor indisponível, tentando de novo')
    expect(headline.malformed).toBe('Resposta inesperada do fornecedor')
    expect(explain.malformed).toContain('suporte')
    expect(explain.waiting).toContain('Operações')
    expect(explain.waiting).toContain('sem token')
  })

  test('o aviso de plano e a data do ciclo têm texto no singular e no plural, nos dois idiomas', () => {
    const statuses = [portuguese.import.status, english.import.status] as unknown as Record<
      string,
      unknown
    >[]

    for (const messages of statuses) {
      expect(typeof messages.planRestricted_one).toBe('string')
      expect(typeof messages.planRestricted_other).toBe('string')
      expect(typeof messages.planRestrictedHint).toBe('string')
      expect(typeof messages.lastRun).toBe('string')
    }
  })

  test('todo código de falha da rotina tem texto nos dois idiomas', () => {
    for (const code of HOLIDAY_FETCH_FAILURE_CODES) {
      expect(Object.keys(portuguese.import.failures)).toContain(code)
      expect(Object.keys(english.import.failures)).toContain(code)
    }
    expect(typeof portuguese.import.failures.unknown).toBe('string')
  })

  test('a falha de gravação da rotina tem texto próprio nos dois idiomas, não o genérico (spec 252 T6.1b)', () => {
    const failures = { en: english.import.failures, pt: portuguese.import.failures } as Record<
      string,
      Record<string, string>
    >

    for (const language of ['en', 'pt'] as const) {
      const messages = failures[language] ?? {}
      expect(typeof messages.persistence_failed).toBe('string')
      expect(messages.persistence_failed).not.toBe(messages.unknown)
    }
    expect(Object.keys(english.import.failures).sort()).toEqual(
      Object.keys(portuguese.import.failures).sort(),
    )
  })

  test('"restaurar" diz que volta na próxima execução diária, e não na hora', () => {
    expect(portuguese.import.suppressions.restoredNotice).toContain('próxima execução diária')
    expect(portuguese.import.suppressions.hint).toContain('próxima execução diária')
    expect(english.import.suppressions.restoredNotice).toContain('next daily run')
  })

  test('apagar um feriado digitado também o suprime: a confirmação avisa', () => {
    expect(portuguese.dialog.suppressionNote).toContain('FeriadosAPI')
    expect(portuguese.dialog.suppressionNote).toContain('Feriados desligados')
  })
})
