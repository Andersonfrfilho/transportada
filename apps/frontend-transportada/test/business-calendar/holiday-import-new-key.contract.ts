/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): o último ciclo da rotina é ANTERIOR à chave salva depois dele. A falha que ele deixou
 * ("chave não abre", "fornecedor recusou") era da chave velha e não vale para a nova: a manchete diz que a chave nova
 * espera o próximo ciclo, em vez de acusar a chave que o administrador acabou de trocar. Só as manchetes que vêm do
 * desfecho do ciclo são substituídas; "desligada" e "sem chave" continuam vencendo, e o resto do cartão não muda.
 */
import { describe, expect, test } from 'bun:test'

import english from '@/modules/company-settings/locales/businessCalendar.en.locale.json'
import portuguese from '@/modules/company-settings/locales/businessCalendar.locale.json'
import type { HolidayImportStatus } from '@/modules/company-settings/shared/holidayImport.types'
import { resolveImportStatusView } from '@/modules/company-settings/shared/holidayImportStatus.service'
import type { HolidayProviderSettings } from '@/modules/company-settings/shared/holidayProviderSettings.types'

import { buildImportStatus } from '../fixtures/holidayImport.fixture'
import {
  buildEmptyProviderSettings,
  buildProviderSettings,
} from '../fixtures/holidayProviderSettings.fixture'

const RUN_AT = '2026-10-09T13:00:00.000Z'
const KEY_AFTER_RUN = '2026-10-09T13:00:00.001Z'
const KEY_BEFORE_RUN = '2026-10-09T12:59:59.999Z'
const HEADLINE_BY_OUTCOME: Readonly<Record<string, string>> = {
  credential_unreadable: 'tokenUnreadable',
  malformed_response: 'malformed',
  provider_unauthorized: 'unauthorized',
  provider_unreachable: 'unreachable',
}
const RUN_FAILURE_OUTCOMES: string[] = Object.keys(HEADLINE_BY_OUTCOME)

function viewOf(
  settings: HolidayProviderSettings | undefined,
  status: Partial<HolidayImportStatus>,
) {
  return resolveImportStatusView({
    ...(settings === undefined ? {} : { settings }),
    status: buildImportStatus(status),
  })
}

function failedRun(outcome: string): Partial<HolidayImportStatus> {
  return { lastRun: { finishedAt: RUN_AT, outcome } }
}

describe('chave salva depois do último ciclo (spec 262 T6.1b)', () => {
  test.each(RUN_FAILURE_OUTCOMES)(
    'o desfecho "%s" de antes da chave nova não vira manchete: espera o próximo ciclo',
    (outcome) => {
      const settings = buildProviderSettings({ tokenUpdatedAt: KEY_AFTER_RUN })

      const view = viewOf(settings, failedRun(outcome))

      expect(view.headline).toBe('newKeyPending')
      expect(view.explainKey).toBe('import.status.explain.newKeyPending')
    },
  )

  test.each(RUN_FAILURE_OUTCOMES)(
    'o desfecho "%s" de DEPOIS da chave (ou do mesmo instante) continua sendo a manchete',
    (outcome) => {
      const expected = HEADLINE_BY_OUTCOME[outcome]

      for (const tokenUpdatedAt of [KEY_BEFORE_RUN, RUN_AT]) {
        const settings = buildProviderSettings({ tokenUpdatedAt })

        expect<string>(viewOf(settings, failedRun(outcome)).headline).toBe(expected ?? 'missing')
      }
    },
  )

  test('só substitui a manchete que veio do ciclo: ciclo bem-sucedido, sem ciclo ou sem a data da chave seguem como antes', () => {
    const newKey = buildProviderSettings({ tokenUpdatedAt: KEY_AFTER_RUN })

    expect(viewOf(newKey, failedRun('succeeded')).headline).toBe('healthy')
    expect(viewOf(newKey, { lastFetchedAt: null, lastRun: null }).headline).toBe('waiting')
    expect(
      viewOf(buildProviderSettings({ tokenUpdatedAt: null }), failedRun('credential_unreadable'))
        .headline,
    ).toBe('tokenUnreadable')
  })

  test('data ilegível de um dos lados não inventa a manchete nova', () => {
    const brokenKey = buildProviderSettings({ tokenUpdatedAt: 'ontem' })

    expect(viewOf(brokenKey, failedRun('credential_unreadable')).headline).toBe('tokenUnreadable')
    expect(
      viewOf(buildProviderSettings({ tokenUpdatedAt: KEY_AFTER_RUN }), {
        lastRun: { finishedAt: 'ontem', outcome: 'credential_unreadable' },
      }).headline,
    ).toBe('tokenUnreadable')
  })

  test('sem a configuração (o GET falhou) o cartão é o de antes', () => {
    expect(viewOf(undefined, failedRun('provider_unauthorized')).headline).toBe('unauthorized')
  })

  test('a prioridade acima dela é a de sempre: desligada e sem chave vencem a chave nova', () => {
    const newKey = buildProviderSettings({ tokenUpdatedAt: KEY_AFTER_RUN })
    const noKey = buildEmptyProviderSettings({ tokenUpdatedAt: KEY_AFTER_RUN })

    expect(
      viewOf(newKey, { ...failedRun('credential_unreadable'), isEnabled: false }).headline,
    ).toBe('disabled')
    expect(viewOf(noKey, failedRun('credential_unreadable')).headline).toBe('noToken')
  })

  test('vence o orçamento atingido e a falha por par que vieram do ciclo antigo', () => {
    const settings = buildProviderSettings({
      monthlyRequestBudget: 42,
      tokenUpdatedAt: KEY_AFTER_RUN,
    })
    const status = {
      ...failedRun('provider_unauthorized'),
      failures: [{ errorCode: 'persistence_failed', pairs: 1 }],
      monthlyRequests: 99,
      pairs: { done: 5, failed: 1, notCovered: 0, pending: 4, quotaExhausted: 0, total: 10 },
    }

    expect(viewOf(settings, status).headline).toBe('newKeyPending')
  })

  test('toda a explicação nova existe nos dois idiomas e diz o que esperar', () => {
    for (const messages of [portuguese.import.status, english.import.status]) {
      expect(Object.keys(messages.headline)).toContain('newKeyPending')
      expect(Object.keys(messages.explain)).toContain('newKeyPending')
    }
    const { explain, headline } = portuguese.import.status as unknown as {
      explain: Record<string, string>
      headline: Record<string, string>
    }

    expect(headline.newKeyPending).toBe('Chave nova salva, aguardando o próximo ciclo')
    expect(explain.newKeyPending).toContain('próximo ciclo')
    expect(explain.newKeyPending).toContain('Operações')
  })
})
