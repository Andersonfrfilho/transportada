/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, PROFILE_DRAFT } from './cte-profiles.fixture'

describe('cte emission profiles presentation boundary contract', () => {
  test('opens a draft charging 4.5% of the referenced invoice and refuses foreign fields', async () => {
    const { createCteProfileDrafts } = await loadFutureModule<CteProfileDraftModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesDraft.service',
    )
    const drafts = createCteProfileDrafts()

    expect(drafts.createProfileDraft()).toEqual(PROFILE_DRAFT)
    expect(drafts.createProfileDraft().freightRule.percentage).toBe('0.045000')
    expect(drafts.createComponentDraft({ ordinal: '2' })).toEqual({
      amount: null,
      calculationType: 'percentage_of_cargo',
      label: '',
      ordinal: '2',
      rate: '0.000000',
      validFrom: PROFILE_DRAFT.freightRule.validFrom,
      validUntil: null,
    })

    expect(() => drafts.createProfileDraft({ companyId: 'forbidden-company' })).toThrow(
      'CTE_PROFILES_INVALID_DRAFT',
    )
    expect(() => drafts.createProfileDraft({ xml: '<cteProc />' })).toThrow(
      'CTE_PROFILES_INVALID_DRAFT',
    )
  })

  test('only submits pickup details when the profile indicates pickup at the destination', async () => {
    const { toFormState, toProfileBody } = await loadFutureModule<CteProfileFormModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesForm.service',
    )
    const state = toFormState()

    const pickedUp = toProfileBody({
      ...state,
      pickupDetails: 'Retirar na doca 3',
      pickupIndicator: '0',
    })
    expect(pickedUp.settings.pickupDetails).toBe('Retirar na doca 3')
    expect(pickedUp.settings.pickupIndicator).toBe('0')

    const delivered = toProfileBody({
      ...state,
      pickupDetails: 'Retirar na doca 3',
      pickupIndicator: '1',
    })
    expect(delivered.settings.pickupDetails).toBe('')
    expect(delivered.settings.pickupIndicator).toBe('1')
  })

  test('converts typed percentages and amounts without binary float arithmetic', async () => {
    const { fromRateFraction, toMoneyDecimal, toRateFraction } =
      await loadFutureModule<CteProfileDecimalModule>(
        '../../src/modules/cte-profiles/shared/cteProfilesDecimal.service',
      )

    expect(toRateFraction('4,5')).toBe('0.045000')
    expect(toRateFraction('4.5')).toBe('0.045000')
    expect(toRateFraction('0,3')).toBe('0.003000')
    expect(toRateFraction('100')).toBe('1.000000')
    expect(toRateFraction('12')).toBe('0.120000')
    expect(toRateFraction('')).toBe('0.000000')
    expect(fromRateFraction('0.045000')).toBe('4,5')
    expect(fromRateFraction('0.003000')).toBe('0,3')
    expect(fromRateFraction('1.000000')).toBe('100')

    expect(toMoneyDecimal('958,48')).toBe('958.4800')
    expect(toMoneyDecimal('1.234,5')).toBe('1234.5000')
    expect(toMoneyDecimal('')).toBe(null)

    expect(() => toRateFraction('101')).toThrow('CTE_PROFILES_INVALID_RATE')
    expect(() => toRateFraction('0,00001')).toThrow('CTE_PROFILES_INVALID_RATE')
    expect(() => toRateFraction('-1')).toThrow('CTE_PROFILES_INVALID_RATE')
    expect(() => toMoneyDecimal('12,00001')).toThrow('CTE_PROFILES_INVALID_AMOUNT')
    expect(() => toMoneyDecimal('abc')).toThrow('CTE_PROFILES_INVALID_AMOUNT')
  })
})

type CteProfileDraftModule = {
  readonly createCteProfileDrafts: () => {
    readonly createComponentDraft: (input: Record<string, unknown>) => Record<string, unknown>
    readonly createProfileDraft: (input?: Record<string, unknown>) => typeof PROFILE_DRAFT
  }
}

type CteProfileFormState = Record<string, unknown> &
  Readonly<{ pickupDetails: string; pickupIndicator: '0' | '1' }>

type CteProfileFormModule = {
  readonly toFormState: () => CteProfileFormState
  readonly toProfileBody: (state: CteProfileFormState) => {
    readonly settings: Readonly<{ pickupDetails: string; pickupIndicator: string }>
  }
}

type CteProfileDecimalModule = {
  readonly fromRateFraction: (value: string) => string
  readonly toMoneyDecimal: (value: string) => null | string
  readonly toRateFraction: (value: string) => string
}
