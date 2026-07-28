/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  type ChargeComponentDefinition,
  composeCharge,
  roundChargeToFiscalScale,
} from '../../src/cte-profiles/domain/charge-composition.service.js'
import { createFreightRuleSnapshot } from '../../src/freight-calculations/domain/freight-calculation-engine.service.js'
import { expectApiErrorCode } from './support.js'

const REFERENCE_DATE = '2026-07-20T13:17:59.000Z'
const REFERENCE_CARGO_AMOUNT = '958.4800'
const REFERENCE_LABEL = 'Frete Spani 4,5'
const ALWAYS_IN_FORCE = {
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
} as const

const buildRuleSnapshot = (
  overrides: {
    readonly maximumAmount?: string | null
    readonly minimumAmount?: string | null
    readonly percentage?: string
  } = {},
) =>
  createFreightRuleSnapshot({
    freightRuleId: 'rule-001',
    freightRuleVersionId: 'rule-version-001',
    maximumAmount: overrides.maximumAmount ?? null,
    minimumAmount: overrides.minimumAmount ?? null,
    percentage: overrides.percentage ?? '0.045000',
    ruleVersion: '1',
    type: 'percentage_of_invoice_total',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  })

const percentageComponent = (
  label: string,
  calculationType: 'percentage_of_cargo' | 'percentage_of_freight',
  rate: string,
  ordinal: bigint,
): ChargeComponentDefinition => ({
  ...ALWAYS_IN_FORCE,
  amount: null,
  calculationType,
  label,
  ordinal,
  rate,
})

const fixedComponent = (
  label: string,
  amount: string,
  ordinal: bigint,
): ChargeComponentDefinition => ({
  ...ALWAYS_IN_FORCE,
  amount,
  calculationType: 'fixed_amount',
  label,
  ordinal,
  rate: null,
})

describe('cte charge composition', () => {
  test('prices the reference invoice at the configured 4.5 percent of the cargo value', () => {
    const composed = composeCharge({
      cargoAmount: REFERENCE_CARGO_AMOUNT,
      components: [],
      mainComponentLabel: REFERENCE_LABEL,
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot(),
    })

    expect(composed.mainAmount).toBe('43.1316')
    expect(composed.totalAmount).toBe('43.1316')
    expect(composed.components).toEqual([
      { amount: '43.1316', calculationType: 'main', label: REFERENCE_LABEL },
    ])
    expect(roundChargeToFiscalScale(composed).totalAmount).toBe('43.13')
  })

  test('applies each component on the base defined for its calculation type', () => {
    const composed = composeCharge({
      cargoAmount: REFERENCE_CARGO_AMOUNT,
      components: [
        fixedComponent('Pedagio', '12.5000', 1n),
        percentageComponent('TDA', 'percentage_of_freight', '0.050000', 2n),
        percentageComponent('GRIS', 'percentage_of_cargo', '0.003000', 3n),
        percentageComponent('Ad Valorem', 'percentage_of_cargo', '0.001000', 4n),
      ],
      mainComponentLabel: REFERENCE_LABEL,
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot(),
    })

    expect(composed.components).toEqual([
      { amount: '43.1316', calculationType: 'main', label: REFERENCE_LABEL },
      { amount: '2.8754', calculationType: 'percentage_of_cargo', label: 'GRIS' },
      { amount: '0.9585', calculationType: 'percentage_of_cargo', label: 'Ad Valorem' },
      { amount: '2.1566', calculationType: 'percentage_of_freight', label: 'TDA' },
      { amount: '12.5000', calculationType: 'fixed_amount', label: 'Pedagio' },
    ])
    expect(composed.totalAmount).toBe('61.6221')
  })

  test('charges the percentage of freight over the floor adjusted main component', () => {
    const composed = composeCharge({
      cargoAmount: '100.0000',
      components: [percentageComponent('TDA', 'percentage_of_freight', '0.100000', 1n)],
      mainComponentLabel: 'Frete',
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot({ minimumAmount: '30.0000' }),
    })

    expect(composed.mainAmount).toBe('30.0000')
    expect(composed.adjustments).toEqual([
      {
        amount: '25.5000',
        description: 'Minimum freight amount applied',
        type: 'minimum_amount',
      },
    ])
    expect(composed.components[1]).toEqual({
      amount: '3.0000',
      calculationType: 'percentage_of_freight',
      label: 'TDA',
    })
    expect(composed.totalAmount).toBe('33.0000')
  })

  test('caps the main component at the ceiling before any additional component', () => {
    const composed = composeCharge({
      cargoAmount: '10000.0000',
      components: [],
      mainComponentLabel: 'Frete',
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot({ maximumAmount: '300.0000' }),
    })

    expect(composed.mainAmount).toBe('300.0000')
    expect(composed.adjustments).toEqual([
      {
        amount: '-150.0000',
        description: 'Maximum freight amount applied',
        type: 'maximum_amount',
      },
    ])
  })

  test('applies only the components in force at the invoice issue date', () => {
    const composed = composeCharge({
      cargoAmount: '1000.0000',
      components: [
        {
          ...fixedComponent('Tabela antiga', '10.0000', 1n),
          validUntil: '2026-06-30T23:59:59.999Z',
        },
        {
          ...fixedComponent('Tabela reajustada', '18.0000', 2n),
          validFrom: '2026-07-01T00:00:00.000Z',
        },
        {
          ...fixedComponent('Reajuste programado', '25.0000', 3n),
          validFrom: '2027-01-01T00:00:00.000Z',
        },
      ],
      mainComponentLabel: 'Frete',
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot(),
    })

    expect(composed.components.map((component) => component.label)).toEqual([
      'Frete',
      'Tabela reajustada',
    ])
    expect(composed.totalAmount).toBe('63.0000')
  })

  test('reconciles the fiscal total with the sum of the rounded components', () => {
    const composed = composeCharge({
      cargoAmount: REFERENCE_CARGO_AMOUNT,
      components: [
        percentageComponent('GRIS', 'percentage_of_cargo', '0.003000', 1n),
        percentageComponent('Ad Valorem', 'percentage_of_cargo', '0.001000', 2n),
      ],
      mainComponentLabel: REFERENCE_LABEL,
      referenceDate: REFERENCE_DATE,
      ruleSnapshot: buildRuleSnapshot(),
    })
    const fiscal = roundChargeToFiscalScale(composed)

    expect(fiscal.components).toEqual([
      { amount: '43.13', calculationType: 'main', label: REFERENCE_LABEL },
      { amount: '2.88', calculationType: 'percentage_of_cargo', label: 'GRIS' },
      { amount: '0.96', calculationType: 'percentage_of_cargo', label: 'Ad Valorem' },
    ])
    expect(fiscal.totalAmount).toBe('46.97')
    expect(composed.totalAmount).toBe('46.9655')
  })

  test('rejects a fixed component that carries no amount', () => {
    const compose = () =>
      composeCharge({
        cargoAmount: '100.0000',
        components: [{ ...fixedComponent('Pedagio', '0.0000', 1n), amount: null }],
        mainComponentLabel: 'Frete',
        referenceDate: REFERENCE_DATE,
        ruleSnapshot: buildRuleSnapshot(),
      })

    expectApiErrorCode(compose, 'CTE_CHARGE_INVALID_COMPONENT')
  })

  test('rejects a percentage component that carries a fixed amount instead of a rate', () => {
    const compose = () =>
      composeCharge({
        cargoAmount: '100.0000',
        components: [
          {
            ...percentageComponent('GRIS', 'percentage_of_cargo', '0.003000', 1n),
            amount: '1.0000',
            rate: null,
          },
        ],
        mainComponentLabel: 'Frete',
        referenceDate: REFERENCE_DATE,
        ruleSnapshot: buildRuleSnapshot(),
      })

    expectApiErrorCode(compose, 'CTE_CHARGE_INVALID_COMPONENT')
  })

  test('rejects a rate that is not a fraction between zero and one', () => {
    const compose = () =>
      composeCharge({
        cargoAmount: '100.0000',
        components: [percentageComponent('GRIS', 'percentage_of_cargo', '1.500000', 1n)],
        mainComponentLabel: 'Frete',
        referenceDate: REFERENCE_DATE,
        ruleSnapshot: buildRuleSnapshot(),
      })

    expectApiErrorCode(compose, 'CTE_CHARGE_RATE_OUT_OF_RANGE')
  })

  test('refuses a charge that would be emitted with a blank component label', () => {
    const compose = () =>
      composeCharge({
        cargoAmount: '100.0000',
        components: [],
        mainComponentLabel: '   ',
        referenceDate: REFERENCE_DATE,
        ruleSnapshot: buildRuleSnapshot(),
      })

    expectApiErrorCode(compose, 'CTE_CHARGE_INVALID_LABEL')
  })
})
