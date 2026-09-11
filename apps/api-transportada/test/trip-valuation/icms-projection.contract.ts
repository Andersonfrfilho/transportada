/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { projectIcmsAmount } from '../../src/cte-issuance/domain/cte-icms.policy.js'
import {
  resolveDocumentIcms,
  type IcmsEmissionProfile,
} from '../../src/trips/domain/trip-icms-projection.policy.js'
import { buildTripTaxParcels } from '../../src/trips/domain/trip-tax.policy.js'
import type { TripRevenueLine } from '../../src/trips/domain/trip-valuation.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 125 — **o ICMS se projeta pelo perfil de emissão até o CT-e existir.**
 *
 * A parcela `icms` só existia com CT-e autorizado; na montagem, na prévia e na proposta ela nunca
 * existia. O perfil que vai gerar o CT-e já tem CST, alíquota e redução de base.
 */
const SENDER = '05868574000109'
const RECIPIENT = '11222333000181'

function profile(overrides: Partial<IcmsEmissionProfile> = {}): IcmsEmissionProfile {
  return {
    icmsBaseReductionRate: '0.000000',
    icmsCst: '00',
    icmsRate: '0.120000',
    id: 'p-1',
    matchMode: 'sender_tax_id',
    matchers: [{ matchRole: 'sender', taxId: '05868574' }],
    name: 'Perfil',
    priority: 10n,
    status: 'active',
    ...overrides,
  }
}

function revenue(amount: string, source: TripRevenueLine['source'] = 'estimated'): TripRevenueLine {
  return {
    amount,
    freightRuleId: null,
    freightRuleName: null,
    gap: source === 'missing' ? VALUATION_GAPS.noFreightRule : null,
    nfeDocumentId: 'n-1',
    percentage: null,
    source,
    tripDocumentId: 't-1',
  }
}

function resolve(input: {
  readonly measuredIcms?: null | string
  readonly profiles?: readonly IcmsEmissionProfile[]
  readonly recipientTaxId?: null | string
  readonly revenue?: TripRevenueLine
}) {
  return resolveDocumentIcms({
    measuredIcms: input.measuredIcms ?? null,
    profiles: input.profiles ?? [profile()],
    recipientTaxId: input.recipientTaxId === undefined ? RECIPIENT : input.recipientTaxId,
    revenue: input.revenue ?? revenue('1000.0000'),
    senderTaxId: SENDER,
  })
}

describe('ICMS projected by the emission profile (spec 125)', () => {
  /** D1: a mesma regra de base do CT-e — redução, alíquota, duas casas meio para cima. */
  test('the projection follows the CT-e base rule for each CST', () => {
    const rates = (
      icmsCst: IcmsEmissionProfile['icmsCst'],
      rate = '0.120000',
      reduction = '0',
    ) => ({
      icmsBaseReductionRate: reduction,
      icmsCst,
      icmsRate: rate,
    })

    expect(projectIcmsAmount({ amount: '1000.0000', profile: rates('00') })).toEqual({
      amount: '120.0000',
      status: 'taxed',
    })
    expect(
      projectIcmsAmount({ amount: '1000.0000', profile: rates('20', '0.120000', '0.200000') }),
    ).toEqual({ amount: '96.0000', status: 'taxed' })
    expect(projectIcmsAmount({ amount: '1000.0000', profile: rates('90') })).toEqual({
      amount: '120.0000',
      status: 'taxed',
    })
    expect(projectIcmsAmount({ amount: '1000.0000', profile: rates('90', '0') })).toEqual({
      amount: '0.0000',
      status: 'untaxed',
    })
    for (const cst of ['40', '41', '51'] as const) {
      expect(projectIcmsAmount({ amount: '1000.0000', profile: rates(cst) })).toEqual({
        amount: '0.0000',
        status: 'untaxed',
      })
    }
    expect(projectIcmsAmount({ amount: '1000.0000', profile: rates('60') })).toEqual({
      status: 'unsupported',
    })
  })

  /** O documento é arredondado em duas casas, e a projeção também: 333,33 × 12% = 40,00. */
  test('the base is rounded like the document', () => {
    expect(
      projectIcmsAmount({
        amount: '333.3350',
        profile: { icmsBaseReductionRate: '0', icmsCst: '00', icmsRate: '0.120000' },
      }),
    ).toEqual({ amount: '40.0000', status: 'taxed' })
  })

  test('the builder uses the same computation, never a second one', () => {
    const builder = readFileSync(
      new URL('../../src/cte-issuance/domain/cte-payload.builder.ts', import.meta.url),
      'utf8',
    )

    expect(builder).toContain('computeIcms(')
    expect(builder).not.toContain('icmsBaseReductionRate)')
  })

  test('the authorized document always wins', () => {
    expect(resolve({ measuredIcms: '55.1000' })).toEqual({ amount: '55.1000', status: 'measured' })
  })

  test('without a document the note is projected by its profile', () => {
    expect(resolve({})).toEqual({
      amount: '120.0000',
      baseReductionRate: '0.000000',
      cst: '00',
      profileId: 'p-1',
      rate: '0.120000',
      status: 'projected',
    })
  })

  /** D3: isento é zero **declarado**, não ausência. */
  test('an exempt CST projects a declared zero', () => {
    expect(resolve({ profiles: [profile({ icmsCst: '41' })] })).toMatchObject({
      amount: '0.0000',
      cst: '41',
      status: 'projected',
    })
  })

  test('without a profile, with a tie, or without a tax id the gap is named', () => {
    expect(resolve({ profiles: [] })).toEqual({
      gap: VALUATION_GAPS.noEmissionProfile,
      status: 'missing',
    })
    expect(resolve({ profiles: [profile(), profile({ id: 'p-2' })] })).toEqual({
      gap: VALUATION_GAPS.noEmissionProfile,
      status: 'missing',
    })
    expect(resolve({ recipientTaxId: null })).toEqual({
      gap: VALUATION_GAPS.noEmissionProfile,
      status: 'missing',
    })
  })

  test('CST 60 is never invented', () => {
    expect(resolve({ profiles: [profile({ icmsCst: '60' })] })).toEqual({
      gap: VALUATION_GAPS.icmsCstUnsupported,
      status: 'missing',
    })
  })

  test('a note without revenue has no base', () => {
    expect(resolve({ revenue: revenue('0.0000', 'missing') })).toEqual({
      gap: VALUATION_GAPS.noFreightRule,
      status: 'missing',
    })
  })

  test('the parcel is estimated when a note is projected, with the profile as basis', () => {
    const [icms] = buildTripTaxParcels({
      documents: [{ icms: resolve({}) }, { icms: resolve({ revenue: revenue('500.0000') }) }],
      federalRates: null,
      revenueAmount: '1500.0000',
    })

    expect(icms).toEqual({
      amount: '180.0000',
      basis: { baseReductionRate: '0.000000', cst: '00', of: 'icms', rate: '0.120000' },
      detail: null,
      gap: null,
      kind: 'icms',
      source: 'estimated',
    })
  })

  test('measured and projected sum, and the worst source wins', () => {
    const [icms] = buildTripTaxParcels({
      documents: [{ icms: resolve({ measuredIcms: '10.0000' }) }, { icms: resolve({}) }],
      federalRates: null,
      revenueAmount: '1000.0000',
    })

    expect(icms).toMatchObject({ amount: '130.0000', gap: null, source: 'estimated' })
  })

  test('a missing note keeps the sum of the others and names the gap with the count', () => {
    const [icms] = buildTripTaxParcels({
      documents: [{ icms: resolve({}) }, { icms: resolve({ profiles: [] }) }],
      federalRates: null,
      revenueAmount: '1000.0000',
    })

    expect(icms).toMatchObject({
      amount: '120.0000',
      detail: '1/2',
      gap: VALUATION_GAPS.noEmissionProfile,
      source: 'estimated',
    })
  })

  test('the three surfaces load the profiles and resolve each note', () => {
    const query = readFileSync(
      new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
      'utf8',
    )
    const useCase = readFileSync(
      new URL('../../src/trips/application/read-trip-valuation.use-case.ts', import.meta.url),
      'utf8',
    )

    expect(query.match(/emissionProfiles:/g)?.length).toBe(2)
    expect(query).toContain('recipientTaxId: recipientParticipant.taxId')
    expect(useCase).toContain('resolveDocumentIcms(')
  })
})
