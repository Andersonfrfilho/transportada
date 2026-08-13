/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  NFSE_EMISSION_PROFILE_OPTION_STATUS,
  buildNfseEmissionProfileOptionFilters,
} from '../../src/nfse-profiles/infrastructure/nfse-emission-profile-options.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'

const dialect = new PgDialect()

describe('nfse emission profile options query tenant safety', () => {
  test('prende a busca de opções à empresa do contexto', () => {
    const query = dialect.sqlToQuery(
      and(...buildNfseEmissionProfileOptionFilters({ companyId: COMPANY_ID }))!,
    )

    expect(query.sql).toContain('"nfse_emission_profiles"."company_id" = $')
    expect(query.params).toContain(COMPANY_ID)
  })

  /** Perfil em rascunho ou desativado não chega ao diálogo: emitir por ele seria nota rejeitada. */
  test('serve apenas perfil ativo', () => {
    const query = dialect.sqlToQuery(
      and(...buildNfseEmissionProfileOptionFilters({ companyId: COMPANY_ID }))!,
    )

    expect(query.sql).toContain('"nfse_emission_profiles"."status" = $')
    expect(query.params).toContain(NFSE_EMISSION_PROFILE_OPTION_STATUS)
    expect(NFSE_EMISSION_PROFILE_OPTION_STATUS).toBe('active')
  })
})
