/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import {
  CTE_FISCAL_NUMBER_PROBE_LIMIT,
  classifyCteRejection,
} from '../src/cte-issuance/domain/cte-rejection.policy.js'

import {
  CONTENT_REJECTION_CODE,
  DUPLICATE_NUMBER_CODE,
  RESERVED_NUMBER,
  createProbeFixture,
} from './cte-number-probe/fixture.js'

describe('CT-e rejection classification contract', () => {
  it('treats duplicate numbering as a burned number worth probing again', () => {
    expect(classifyCteRejection({ code: DUPLICATE_NUMBER_CODE, probesMade: 0 })).toBe(
      'advance_fiscal_number',
    )
  })

  /** Sondar sem teto viraria martelo no webservice da SEFAZ e queimaria numeração sem limite. */
  it('stops probing once the per-item limit is reached', () => {
    expect(
      classifyCteRejection({
        code: DUPLICATE_NUMBER_CODE,
        probesMade: CTE_FISCAL_NUMBER_PROBE_LIMIT,
      }),
    ).toBe('terminal')
  })

  it('keeps every other rejection terminal', () => {
    expect(classifyCteRejection({ code: CONTENT_REJECTION_CODE, probesMade: 0 })).toBe('terminal')
  })
})

describe('CT-e fiscal number probing contract', () => {
  it('advances the fiscal number and reschedules instead of rejecting the item', async () => {
    const fixture = createProbeFixture({ errorCode: DUPLICATE_NUMBER_CODE })

    await expect(fixture.effect.execute({ envelope: fixture.envelope })).rejects.toBeInstanceOf(
      CteIssuanceRecoverableError,
    )

    expect(fixture.probeCalls).toEqual([
      { burnedNumber: RESERVED_NUMBER, rejectionCode: DUPLICATE_NUMBER_CODE },
    ])
    expect(fixture.rejectedCodes).toEqual([])
    expect(fixture.retryCauses).toEqual([`fiscal_number_burned:${DUPLICATE_NUMBER_CODE}`])
  })

  it('rejects the item for good once the probe budget is exhausted', async () => {
    const fixture = createProbeFixture({
      errorCode: DUPLICATE_NUMBER_CODE,
      probeOutcome: 'exhausted',
    })

    await expect(fixture.effect.execute({ envelope: fixture.envelope })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )

    expect(fixture.rejectedCodes).toEqual([DUPLICATE_NUMBER_CODE])
    expect(fixture.retryCauses).toEqual([])
  })

  /** Rejeição de conteúdo não melhora com número novo: sondar só queimaria numeração à toa. */
  it('never probes a rejection that numbering cannot fix', async () => {
    const fixture = createProbeFixture({ errorCode: CONTENT_REJECTION_CODE })

    await expect(fixture.effect.execute({ envelope: fixture.envelope })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )

    expect(fixture.probeCalls).toEqual([])
    expect(fixture.rejectedCodes).toEqual([CONTENT_REJECTION_CODE])
  })
})
