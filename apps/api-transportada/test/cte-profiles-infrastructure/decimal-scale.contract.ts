/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  mapComponent,
  mapFreightRule,
  mapProfile,
} from '../../src/cte-profiles/infrastructure/cte-emission-profile.mapper.js'
import {
  buildComponentRecord,
  buildFreightRuleVersionRecord,
  buildProfileRecord,
} from './support.js'

describe('cte emission profile mapper decimal scale contract', () => {
  test('pads rate columns the driver returned without scale', () => {
    const profile = mapProfile({
      components: [],
      freightRule: mapFreightRule(buildFreightRuleVersionRecord()),
      matchers: [],
      record: buildProfileRecord({ icmsBaseReductionRate: '0', icmsRate: '0' }),
    })

    expect(profile.icmsRate).toBe('0.000000')
    expect(profile.icmsBaseReductionRate).toBe('0.000000')
  })

  test('keeps a rate that already carries the contract scale', () => {
    const profile = mapProfile({
      components: [],
      freightRule: mapFreightRule(buildFreightRuleVersionRecord()),
      matchers: [],
      record: buildProfileRecord({ icmsBaseReductionRate: '0.200000', icmsRate: '0.120000' }),
    })

    expect(profile.icmsRate).toBe('0.120000')
    expect(profile.icmsBaseReductionRate).toBe('0.200000')
  })

  test('pads a whole rate of one without inflating it', () => {
    const profile = mapProfile({
      components: [],
      freightRule: mapFreightRule(buildFreightRuleVersionRecord()),
      matchers: [],
      record: buildProfileRecord({ icmsBaseReductionRate: '1', icmsRate: '1' }),
    })

    expect(profile.icmsRate).toBe('1.000000')
    expect(profile.icmsBaseReductionRate).toBe('1.000000')
  })

  test('pads money and rate of a charge component', () => {
    const component = mapComponent(buildComponentRecord({ amount: '12.5', rate: '0.045' }))

    expect(component.amount).toBe('12.5000')
    expect(component.rate).toBe('0.045000')
  })

  test('leaves a null component amount and rate untouched', () => {
    const component = mapComponent(buildComponentRecord({ amount: null, rate: null }))

    expect(component.amount).toBeNull()
    expect(component.rate).toBeNull()
  })

  test('pads the freight rule money and percentage', () => {
    const freightRule = mapFreightRule(
      buildFreightRuleVersionRecord({
        maximumAmount: '900',
        minimumAmount: '35.5',
        percentage: '0.045',
      }),
    )

    expect(freightRule.percentage).toBe('0.045000')
    expect(freightRule.minimumAmount).toBe('35.5000')
    expect(freightRule.maximumAmount).toBe('900.0000')
  })

  test('leaves null freight rule bounds untouched', () => {
    const freightRule = mapFreightRule(
      buildFreightRuleVersionRecord({ maximumAmount: null, minimumAmount: null }),
    )

    expect(freightRule.minimumAmount).toBeNull()
    expect(freightRule.maximumAmount).toBeNull()
  })

  test('refuses a rate carrying more precision than the contract scale', () => {
    expect(() =>
      mapProfile({
        components: [],
        freightRule: mapFreightRule(buildFreightRuleVersionRecord()),
        matchers: [],
        record: buildProfileRecord({ icmsRate: '0.1234567' }),
      }),
    ).toThrow('CTE_PROFILE_INVALID_DECIMAL_SCALE')
  })
})
