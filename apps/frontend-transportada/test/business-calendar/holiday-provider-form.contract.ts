/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2 (RF4, RF11): o que o formulário da chave manda. A chave só vai quando foi digitada (aparada, na regra da
 * API), o orçamento vazio volta ao padrão (`null`) SÓ quando havia um definido, e a versão lida vai junto quando a linha
 * existe. Pura: o que a tela decide fica num lugar que se prova sem DOM.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildHolidayProviderSubmission,
  isHolidayProviderDraftDirty,
  toInitialHolidayProviderDraft,
} from '@/modules/company-settings/shared/holidayProviderSettingsForm.service'

import {
  buildEmptyProviderSettings,
  buildProviderSettings,
  FAKE_PROVIDER_TOKEN,
  SETTINGS_VERSION,
} from '../fixtures/holidayProviderSettings.fixture'

const OWN_BUDGET = { budgetOrigin: 'installation', monthlyRequestBudget: 2500 } as const

describe('rascunho do formulário da chave da FeriadosAPI (spec 262 T5.2)', () => {
  test('abre sempre sem a chave; o orçamento só abre preenchido quando o administrador o definiu', () => {
    expect(toInitialHolidayProviderDraft(buildProviderSettings())).toEqual({
      budget: '',
      token: '',
    })
    expect(toInitialHolidayProviderDraft(buildEmptyProviderSettings())).toEqual({
      budget: '',
      token: '',
    })
    expect(toInitialHolidayProviderDraft(buildProviderSettings(OWN_BUDGET))).toEqual({
      budget: '2500',
      token: '',
    })
  })

  test('nada digitado não é mudança, e digitar a chave ou mexer no orçamento é', () => {
    const settings = buildProviderSettings(OWN_BUDGET)

    expect(isHolidayProviderDraftDirty({ draft: { budget: '2500', token: '' }, settings })).toBe(
      false,
    )
    expect(isHolidayProviderDraftDirty({ draft: { budget: ' 2500 ', token: ' ' }, settings })).toBe(
      false,
    )
    expect(isHolidayProviderDraftDirty({ draft: { budget: '2500', token: 'x' }, settings })).toBe(
      true,
    )
    expect(isHolidayProviderDraftDirty({ draft: { budget: '', token: '' }, settings })).toBe(true)
    expect(isHolidayProviderDraftDirty({ draft: { budget: '3000', token: '' }, settings })).toBe(
      true,
    )
  })
})

describe('o que o formulário envia (spec 262 T5.2)', () => {
  test('chave nova: aparada, com a versão lida, sem orçamento', () => {
    const submission = buildHolidayProviderSubmission({
      draft: { budget: '', token: `  ${FAKE_PROVIDER_TOKEN}\n` },
      settings: buildProviderSettings(),
    })

    expect(submission).toEqual({
      body: { expectedVersion: SETTINGS_VERSION, token: FAKE_PROVIDER_TOKEN },
      status: 'ready',
    })
  })

  test('sem linha (versão nula) a gravação é de criação: não manda `expectedVersion`', () => {
    const submission = buildHolidayProviderSubmission({
      draft: { budget: '', token: FAKE_PROVIDER_TOKEN },
      settings: buildEmptyProviderSettings(),
    })

    expect(submission).toEqual({ body: { token: FAKE_PROVIDER_TOKEN }, status: 'ready' })
  })

  test('orçamento digitado: manda o número; a chave, vazia, não vai', () => {
    const submission = buildHolidayProviderSubmission({
      draft: { budget: '1000000', token: '' },
      settings: buildProviderSettings(),
    })

    expect(submission).toEqual({
      body: { expectedVersion: SETTINGS_VERSION, monthlyRequestBudget: 1_000_000 },
      status: 'ready',
    })
    expect('token' in (submission.status === 'ready' ? submission.body : {})).toBe(false)
  })

  test('orçamento vazio com valor definido volta ao padrão: `null`', () => {
    const submission = buildHolidayProviderSubmission({
      draft: { budget: '', token: '' },
      settings: buildProviderSettings(OWN_BUDGET),
    })

    expect(submission).toEqual({
      body: { expectedVersion: SETTINGS_VERSION, monthlyRequestBudget: null },
      status: 'ready',
    })
  })

  test('orçamento vazio quando já é o padrão não manda nada: `null` sozinho, sem linha, é 400 na API', () => {
    expect(
      buildHolidayProviderSubmission({
        draft: { budget: '', token: '' },
        settings: buildEmptyProviderSettings(),
      }),
    ).toEqual({ status: 'unchanged' })
    expect(
      buildHolidayProviderSubmission({
        draft: { budget: '', token: '' },
        settings: buildProviderSettings(),
      }),
    ).toEqual({ status: 'unchanged' })
  })

  test('o mesmo orçamento que já está gravado não é reenviado', () => {
    expect(
      buildHolidayProviderSubmission({
        draft: { budget: '2500', token: '' },
        settings: buildProviderSettings(OWN_BUDGET),
      }),
    ).toEqual({ status: 'unchanged' })
  })

  test('chave e orçamento juntos vão no mesmo corpo', () => {
    const submission = buildHolidayProviderSubmission({
      draft: { budget: '900', token: FAKE_PROVIDER_TOKEN },
      settings: buildProviderSettings(),
    })

    expect(submission).toEqual({
      body: {
        expectedVersion: SETTINGS_VERSION,
        monthlyRequestBudget: 900,
        token: FAKE_PROVIDER_TOKEN,
      },
      status: 'ready',
    })
  })

  test.each([
    ['curta', 'abc'],
    ['com espaço no meio', 'FAKE-feriados sentinel-Q7zK-0000'],
    ['com acento', 'FAKE-feriados-sentinéla-Q7zK-0000'],
    ['com 513 caracteres', 'a'.repeat(513)],
    ['com 15 caracteres', 'a'.repeat(15)],
  ])('chave %s é bloqueada no campo da chave, sem corpo', (_label, token) => {
    expect(
      buildHolidayProviderSubmission({
        draft: { budget: '', token },
        settings: buildProviderSettings(),
      }),
    ).toEqual({ fields: ['token'], status: 'blocked' })
  })

  test('as bordas da chave valem: 16 e 512 caracteres', () => {
    for (const token of ['a'.repeat(16), 'a'.repeat(512)]) {
      expect(
        buildHolidayProviderSubmission({
          draft: { budget: '', token },
          settings: buildProviderSettings(),
        }).status,
      ).toBe('ready')
    }
  })

  test.each(['0', '1000001', '-5', '12,5', '1.000', '1e3', 'abc', '99999999'])(
    'orçamento "%s" é bloqueado no campo do orçamento',
    (budget) => {
      expect(
        buildHolidayProviderSubmission({
          draft: { budget, token: '' },
          settings: buildProviderSettings(),
        }),
      ).toEqual({ fields: ['monthlyRequestBudget'], status: 'blocked' })
    },
  )

  test('as duas recusas aparecem de uma vez, na ordem dos campos da tela', () => {
    expect(
      buildHolidayProviderSubmission({
        draft: { budget: '0', token: 'abc' },
        settings: buildProviderSettings(),
      }),
    ).toEqual({ fields: ['token', 'monthlyRequestBudget'], status: 'blocked' })
  })

  test('as bordas do orçamento valem: 1 e 1.000.000', () => {
    for (const budget of ['1', '1000000']) {
      expect(
        buildHolidayProviderSubmission({
          draft: { budget, token: '' },
          settings: buildProviderSettings(),
        }).status,
      ).toBe('ready')
    }
  })
})
