/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

/**
 * Spec 073 RNF1 / CA9 (`security.md` §1): endereço é dado pessoal e **não vai para log em nível
 * nenhum**. A origem que a RF4 exige é o rótulo `delivery`/`recipient` — nunca a rua, nunca o CEP.
 */
const SEAM_FILES = [
  'src/nfe-documents/domain/physical-destination.policy.ts',
  'src/nfe-documents/infrastructure/physical-destination.join.ts',
] as const

const ADDRESS_FIELDS = ['postalCode', 'street', 'district', 'cityCode', 'number', 'city'] as const

const LOG_CALL_PATTERN = /\b(?:logger|log)\s*(?:\?\.)?\.\s*(?:debug|info|warn|error)\s*\(/u

describe('physical destination logging (spec 073 RNF1)', () => {
  for (const file of SEAM_FILES) {
    it(`${file} logs nothing at all`, () => {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')

      expect(LOG_CALL_PATTERN.test(source)).toBe(false)
    })
  }

  /**
   * A varredura só vale enquanto os nomes de campo estiverem certos: se `nfe_addresses` ganhar
   * coluna nova, ela entra aqui — senão o contrato passa a proteger menos do que anuncia.
   */
  it('watches the address fields the stop key is built from', () => {
    const key = readFileSync(
      new URL('../../src/trips/domain/stop-address-key.ts', import.meta.url),
      'utf8',
    )

    for (const field of ['postalCode', 'number', 'cityCode'] as const) {
      expect(ADDRESS_FIELDS).toContain(field)
      expect(key).toInclude(field)
    }
  })
})
