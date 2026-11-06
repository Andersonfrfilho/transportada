/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { DfeItem } from '@adatechnology/fiscal-provider'

import { resolveAccessKeyLookupOutcome } from '../../src/nfe-access-key-lookup/domain/access-key-lookup-outcome.policy.js'
import type {
  AccessKeyLookupGatewayResult,
  AccessKeyLookupOutcome,
} from '../../src/nfe-access-key-lookup/domain/nfe-access-key-lookup.types.js'

function documentWithSchema(schema: string): AccessKeyLookupGatewayResult {
  const item: DfeItem = { nsu: '1', schema, xmlComprimido: '' }
  return { kind: 'document', item }
}

function rejection(cStat: string): AccessKeyLookupGatewayResult {
  return { kind: 'sefaz-rejection', cStat }
}

const REFUSED = (reason: string): AccessKeyLookupOutcome =>
  ({ status: 'refused', reason }) as AccessKeyLookupOutcome

const TABLE: ReadonlyArray<readonly [string, AccessKeyLookupGatewayResult, AccessKeyLookupOutcome]> =
  [
    ['procNFe', documentWithSchema('procNFe'), { status: 'imported-candidate' }],
    ['resNFe', documentWithSchema('resNFe'), REFUSED('summary_only')],
    ['empty answer (137)', { kind: 'not-found' }, REFUSED('not_found')],
    ['217', rejection('217'), REFUSED('not_found')],
    ['640', rejection('640'), REFUSED('not_interested')],
    ['632', rejection('632'), REFUSED('expired')],
    ['653', rejection('653'), REFUSED('cancelled')],
    ['654', rejection('654'), REFUSED('denied')],
    ['593', rejection('593'), REFUSED('certificate_mismatch')],
    ['656', rejection('656'), { status: 'waiting' }],
    ['timeout/5xx/network', { kind: 'unavailable' }, { status: 'failed', reason: 'sefaz_unavailable' }],
    [
      'unmapped cStat',
      rejection('999'),
      { status: 'failed', reason: 'sefaz_unavailable', cStat: '999', unmapped: true },
    ],
    [
      'unexpected schema',
      documentWithSchema('procEventoNFe'),
      { status: 'failed', reason: 'sefaz_unavailable', unmapped: true },
    ],
  ]

describe('access key lookup outcome policy contract', () => {
  for (const [name, input, expected] of TABLE) {
    test(`maps ${name}`, () => {
      expect(resolveAccessKeyLookupOutcome(input)).toEqual(expected)
    })
  }
})
