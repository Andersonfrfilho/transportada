/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.3 (RF12, D8): a manchete do cartão de status por prioridade — desligada na empresa, sem chave, chave ilegível,
 * os três desfechos de fornecedor, orçamento do mês atingido, falha por par, aguardando, em dia. "Sem chave" e "orçamento
 * atingido" vêm da configuração da instalação (o `status` não traz nenhum dos dois); sem ela o cartão é o de antes.
 */
import { describe, expect, test } from 'bun:test'

import english from '@/modules/company-settings/locales/businessCalendar.en.locale.json'
import portuguese from '@/modules/company-settings/locales/businessCalendar.locale.json'
import { HOLIDAY_IMPORT_HEADLINE } from '@/modules/company-settings/shared/holidayImport.constant'
import type { HolidayImportStatus } from '@/modules/company-settings/shared/holidayImport.types'
import { resolveImportStatusView } from '@/modules/company-settings/shared/holidayImportStatus.service'
import type { HolidayProviderSettings } from '@/modules/company-settings/shared/holidayProviderSettings.types'

import { buildImportStatus } from '../fixtures/holidayImport.fixture'
import {
  buildEmptyProviderSettings,
  buildProviderSettings,
} from '../fixtures/holidayProviderSettings.fixture'

const RUN_AT = '2026-10-09T13:00:00.000Z'
const WAITING = {
  lastFetchedAt: null,
  lastRun: null,
  pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
} as const
const FAILURES = {
  failures: [{ errorCode: 'persistence_failed', pairs: 1 }],
  pairs: { done: 5, failed: 1, notCovered: 0, pending: 4, quotaExhausted: 0, total: 10 },
} as const

function headlineOf(
  input: Readonly<{ settings?: HolidayProviderSettings; status?: Partial<HolidayImportStatus> }>,
): string {
  return resolveImportStatusView({
    ...(input.settings === undefined ? {} : { settings: input.settings }),
    status: buildImportStatus(input.status),
  }).headline
}

function outcome(value: string) {
  return { lastRun: { finishedAt: RUN_AT, outcome: value } }
}

describe('manchetes novas do cartão de status (spec 262 T5.3)', () => {
  test('sem chave configurada: "sem chave", mesmo com o resto em dia', () => {
    expect(headlineOf({ settings: buildEmptyProviderSettings() })).toBe('noToken')
  })

  test('com chave e tudo em dia: "em dia"', () => {
    expect(headlineOf({ settings: buildProviderSettings() })).toBe('healthy')
  })

  test('a última execução que não abriu a chave guardada: "chave ilegível"', () => {
    expect(
      headlineOf({
        settings: buildProviderSettings(),
        status: outcome('credential_unreadable'),
      }),
    ).toBe('tokenUnreadable')
  })

  test('"chave ilegível" não depende da configuração: o desfecho sozinho a mostra', () => {
    expect(headlineOf({ status: outcome('credential_unreadable') })).toBe('tokenUnreadable')
  })

  test('orçamento do mês atingido: o uso do mês chegou ao orçamento da configuração (`>=`)', () => {
    const settings = buildProviderSettings({
      budgetOrigin: 'installation',
      monthlyRequestBudget: 42,
    })

    expect(headlineOf({ settings, status: { monthlyRequests: 42 } })).toBe('budgetReached')
    expect(headlineOf({ settings, status: { monthlyRequests: 43 } })).toBe('budgetReached')
    expect(headlineOf({ settings, status: { monthlyRequests: 41 } })).toBe('healthy')
  })

  test('o orçamento é o da configuração, não um número fixo: 4.500 padrão e 100 definido leem diferente', () => {
    const status = { monthlyRequests: 150 }

    expect(headlineOf({ settings: buildProviderSettings(), status })).toBe('healthy')
    expect(
      headlineOf({
        settings: buildProviderSettings({
          budgetOrigin: 'installation',
          monthlyRequestBudget: 100,
        }),
        status,
      }),
    ).toBe('budgetReached')
  })
})

describe('prioridade das manchetes (D8)', () => {
  const unreadable = outcome('credential_unreadable')
  const reached = buildProviderSettings({ monthlyRequestBudget: 42 })

  test('1. desligada na empresa vence tudo, inclusive a falta de chave', () => {
    expect(
      headlineOf({
        settings: buildEmptyProviderSettings(),
        status: { ...unreadable, isEnabled: false, monthlyRequests: 99 },
      }),
    ).toBe('disabled')
  })

  test('2. sem chave vence a chave ilegível, o fornecedor, o orçamento, a falha por par e a espera', () => {
    const empty = buildEmptyProviderSettings({ monthlyRequestBudget: 42 })

    for (const status of [
      unreadable,
      outcome('provider_unauthorized'),
      { ...FAILURES, monthlyRequests: 99 },
      WAITING,
    ]) {
      expect(headlineOf({ settings: empty, status: { monthlyRequests: 99, ...status } })).toBe(
        'noToken',
      )
    }
  })

  test('3. chave ilegível vence o orçamento atingido, a falha por par e a espera', () => {
    expect(
      headlineOf({
        settings: reached,
        status: { ...FAILURES, ...unreadable, monthlyRequests: 99 },
      }),
    ).toBe('tokenUnreadable')
    expect(
      headlineOf({ settings: buildProviderSettings(), status: { ...WAITING, ...unreadable } }),
    ).toBe('tokenUnreadable')
  })

  test('4. cada desfecho de fornecedor vence o orçamento atingido e a falha por par', () => {
    const expected: Readonly<Record<string, string>> = {
      malformed_response: 'malformed',
      provider_unauthorized: 'unauthorized',
      provider_unreachable: 'unreachable',
    }

    for (const [code, headline] of Object.entries(expected)) {
      expect(
        headlineOf({
          settings: reached,
          status: { ...FAILURES, ...outcome(code), monthlyRequests: 99 },
        }),
      ).toBe(headline)
    }
  })

  test('5. orçamento atingido vence a falha por par e a espera', () => {
    expect(headlineOf({ settings: reached, status: { ...FAILURES, monthlyRequests: 99 } })).toBe(
      'budgetReached',
    )
    expect(headlineOf({ settings: reached, status: { ...WAITING, monthlyRequests: 99 } })).toBe(
      'budgetReached',
    )
  })

  test('6. falha por par vence a espera; a espera vence o "em dia"', () => {
    const settings = buildProviderSettings()

    expect(headlineOf({ settings, status: { ...FAILURES, lastFetchedAt: null } })).toBe('failing')
    expect(headlineOf({ settings, status: WAITING })).toBe('waiting')
    expect(headlineOf({ settings })).toBe('healthy')
  })

  test('sem a configuração (o `GET` falhou): nem "sem chave" nem "orçamento atingido" — o cartão é o de antes', () => {
    expect(headlineOf({ status: { monthlyRequests: 999_999 } })).toBe('healthy')
    expect(headlineOf({ status: WAITING })).toBe('waiting')
    expect(headlineOf({ status: outcome('provider_unauthorized') })).toBe('unauthorized')
  })
})

describe('texto da espera e dos textos que citavam "sem token" (spec 262 T5.3)', () => {
  const waiting = { ...buildImportStatus(WAITING) }

  test('"aguardando" com chave manda despausar a rotina em Operações', () => {
    const view = resolveImportStatusView({ settings: buildProviderSettings(), status: waiting })

    expect(view.explainKey).toBe('import.status.explain.waitingWithToken')
    expect(portuguese.import.status.explain.waitingWithToken).toContain('Operações')
    expect(portuguese.import.status.explain.waitingWithToken).toContain('despause')
  })

  test('"aguardando" sem saber da chave mantém o texto geral, que só manda conferir', () => {
    const view = resolveImportStatusView({ status: waiting })

    expect(view.explainKey).toBe('import.status.explain.waiting')
  })

  test('as outras manchetes usam a explicação com o nome delas', () => {
    expect(resolveImportStatusView({ status: buildImportStatus() }).explainKey).toBe(
      'import.status.explain.healthy',
    )
  })

  test('toda manchete tem título e explicação nos dois idiomas', () => {
    for (const headline of Object.values(HOLIDAY_IMPORT_HEADLINE)) {
      for (const messages of [portuguese.import.status, english.import.status]) {
        expect(Object.keys(messages.headline)).toContain(headline)
        expect(Object.keys(messages.explain)).toContain(headline)
      }
    }
  })

  test('as três manchetes novas existem e dizem o que fazer, em pt-BR', () => {
    const headlines: readonly string[] = Object.values(HOLIDAY_IMPORT_HEADLINE)

    for (const added of ['noToken', 'tokenUnreadable', 'budgetReached']) {
      expect(headlines).toContain(added)
    }
    const { explain, headline } = portuguese.import.status as unknown as {
      explain: Record<string, string>
      headline: Record<string, string>
    }

    expect(headline.noToken).toBe('Sem chave da FeriadosAPI')
    expect(explain.noToken).toContain('Chave da FeriadosAPI')
    expect(headline.tokenUnreadable).toBe('A chave guardada não abre')
    expect(explain.tokenUnreadable).toContain('Cole a chave de novo')
    expect(headline.budgetReached).toBe('Orçamento do mês atingido')
    expect(explain.budgetReached).toContain('aumente o orçamento')
  })

  test('nenhum texto do cartão manda olhar "sem token" em Operações: a chave mora no banco', () => {
    for (const [language, messages] of [
      ['pt', portuguese.import.status],
      ['en', english.import.status],
    ] as const) {
      const text = JSON.stringify(messages).toLowerCase()

      expect(text, language).not.toContain('sem token')
      expect(text, language).not.toContain('without a token')
      expect(text, language).not.toContain('no token')
      expect(text, language).not.toContain('token inválido')
      expect(text, language).not.toContain('invalid token')
    }
  })
})
